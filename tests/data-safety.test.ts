import test from 'node:test';
import assert from 'node:assert/strict';
import { inWorkspace, mergeImportedNotes, validateBackup } from '../src/utils/workspace';
import { getStoredNotes, saveNotesToStorage } from '../src/utils/storage';
import { deriveSubPaths, syncWorkspaceToDirectoryHandle, readNotesFromDirectoryHandle, previewWorkspaceWrite } from '../src/utils/localFileSystem';
import { portableNotes } from '../src/utils/imageStorage';
import type { Note } from '../src/types';

const note: Note = { id: 'one', content: '# 笔记\n正文 #标签', tags: ['标签'], createdAt: 1, updatedAt: 2, isPinned: false, isFavorite: true };
test('empty folder paths derive all children from the same default root', () => {
  const paths = deriveSubPaths('   ');
  assert.equal(paths.rootPath, '~/Documents/Stillnote');
  assert.equal(paths.notesPath, `${paths.rootPath}/Notes`);
  assert.equal(paths.backupPath, `${paths.rootPath}/Backups`);
});
const data = new Map<string, string>();
let quotaExceeded = false;
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { if (quotaExceeded) throw new Error('QuotaExceeded'); data.set(key, value); },
  removeItem: (key: string) => data.delete(key),
} });

test('legacy notes belong only to default workspace, including trash', () => {
  assert.equal(inWorkspace(note, 'default'), true);
  assert.equal(inWorkspace({ ...note, deletedAt: 5 }, 'work'), false);
  assert.equal(inWorkspace({ ...note, workspaceId: 'work' }, 'work'), true);
});
test('import preserves existing notes and avoids duplicate IDs', () => {
  const result = mergeImportedNotes([note], [note, note], 'work');
  assert.equal(result.length, 3);
  assert.equal(new Set(result.map(item => item.id)).size, 3);
  assert.equal(result[2], note);
  assert.ok(result.slice(0, 2).every(item => item.workspaceId === 'work'));
});
test('both downloaded and folder backup formats can be restored', () => {
  assert.deepEqual(validateBackup([note]), [note]);
  assert.deepEqual(validateBackup({ version: '1.0', notes: [note] }), [note]);
  assert.deepEqual(validateBackup([]), []);
  assert.throws(() => validateBackup([{ ...note, tags: [42] }]));
  assert.throws(() => validateBackup([{ ...note, createdAt: 'bad' }]));
});
test('quota errors report failure and preserve the previous persisted version', () => {
  assert.equal(saveNotesToStorage([note]), true);
  quotaExceeded = true;
  assert.equal(saveNotesToStorage([{ ...note, content: 'changed' }]), false);
  quotaExceeded = false;
  assert.equal(getStoredNotes()[0].content, note.content);
});

class Directory {
  kind = 'directory';
  entries = new Map<string, Directory | { kind: 'file'; name: string; getFile: () => Promise<{ text: () => Promise<string>; arrayBuffer:()=>Promise<ArrayBuffer>; lastModified: number }> }>();
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<Directory> {
    if (!this.entries.has(name) && options?.create) this.entries.set(name, new Directory(name));
    const value = this.entries.get(name);
    if (!(value instanceof Directory)) throw new Error('NotFound');
    return value;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.entries.has(name) && !options?.create) throw new Error('NotFound');
    return {
      getFile: async () => {
        const file = this.entries.get(name);
        if (!file || file instanceof Directory) throw new Error('NotFound');
        return file.getFile();
      },
      createWritable: async () => ({ write: async (content: string|Blob) => {
        const blob=content instanceof Blob?content:new Blob([content]);
        this.entries.set(name, { kind: 'file', name, getFile: async () => ({ text: async () => blob.text(), arrayBuffer:()=>blob.arrayBuffer(), lastModified: 2 }) });
      }, close: async () => {} })
    };
  }
  async *values() { yield* this.entries.values(); }
}

test('one root holds Notes Images and Backups and imported images remain portable',async()=>{
 const root=new Directory('vault');const source={...note,content:'![tiny](data:image/png;base64,AQID)'};
 const plan=await previewWorkspaceWrite(root,[source]);assert.equal(root.entries.size,0);
 const result=await syncWorkspaceToDirectoryHandle(root,[source],undefined,plan);assert.equal(result.success,true);assert.equal(result.imagesCount,1);
 assert.ok(root.entries.has('Notes'));assert.ok(root.entries.has('Images'));assert.ok(root.entries.has('Backups'));
 const imported=await readNotesFromDirectoryHandle(root);assert.equal(imported[0].content,source.content);
 const again=await previewWorkspaceWrite(root,[source]);assert.equal(again.entries.find(e=>e.directory==='images')?.status,'unchanged');
});
test('directory write produces a restorable backup and scans only note files', async () => {
  const root = new Directory('test');
  const result = await syncWorkspaceToDirectoryHandle(root, [note]);
  assert.equal(result.success, true);
  const backup = (await root.getDirectoryHandle('Backups')).entries.get(result.backupFileName)!;
  assert.ok(!(backup instanceof Directory));
  assert.deepEqual(validateBackup(JSON.parse(await (await backup.getFile()).text())), [note]);
  const imported = await readNotesFromDirectoryHandle(root, 'work');
  assert.equal(imported.length, 1);
  assert.equal(imported[0].content, note.content);
  assert.equal(imported[0].workspaceId, 'work');
});
test('backup embeds browser images in both notes and history', () => {
  const url = 'data:image/png;base64,AAAA';
  data.set('flovenote_local_src_folder', JSON.stringify({ '.src/test.png': url }));
  const [portable] = portableNotes([{ ...note, content: '![图](.src/test.png)', history: [{ id: 'h', content: '![旧图](.src/test.png)', timestamp: 1 }] }]);
  assert.ok(portable.content.includes(url));
  assert.ok(portable.history![0].content.includes(url));
});
test('preview performs no mutations and stable file names survive title edits', async () => {
  const root = new Directory('test');
  const plan = await previewWorkspaceWrite(root, [note]);
  assert.equal(root.entries.size, 0);
  assert.ok(plan.entries.every(entry => entry.status === 'new'));
  await syncWorkspaceToDirectoryHandle(root, [note], undefined, plan);
  const changed = { ...note, content: '# 改过标题\n新正文' };
  const next = await previewWorkspaceWrite(root, [changed]);
  assert.equal(next.entries[0].name, plan.entries[0].name);
  assert.equal(next.entries[0].status, 'update');
  const before = (await root.getDirectoryHandle('Notes')).entries.size;
  await syncWorkspaceToDirectoryHandle(root, [changed], undefined, next);
  assert.equal((await root.getDirectoryHandle('Notes')).entries.size, before);
});
test('post-preview edits abort before writing; unowned files are never overwritten', async () => {
  const root = new Directory('test');
  await syncWorkspaceToDirectoryHandle(root, [note]);
  const plan = await previewWorkspaceWrite(root, [{ ...note, content: 'update' }]);
  const directory = await root.getDirectoryHandle('Notes');
  const writer = await (await directory.getFileHandle(plan.entries[0].name)).createWritable();
  await writer.write('user edited file');
  const result = await syncWorkspaceToDirectoryHandle(root, [note], undefined, plan);
  assert.equal(result.success, false);
  assert.equal(result.notesCount, 0);
  const conflict = await previewWorkspaceWrite(root, [note]);
  assert.equal(conflict.entries[0].status, 'conflict');
  await syncWorkspaceToDirectoryHandle(root, [note], undefined, conflict);
  assert.equal(await (await (await directory.getFileHandle(plan.entries[0].name)).getFile()).text(), 'user edited file');
});
test('unreadable original data is never overwritten by an empty library', () => {
  data.set('flovenote_notes_v1', '{broken');
  assert.deepEqual(getStoredNotes(), []);
  assert.equal(saveNotesToStorage([]), false);
  assert.equal(data.get('flovenote_notes_v1'), '{broken');
});
