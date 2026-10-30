import { initialEditorDraft } from '../src/utils/editorDraft';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryBackup, parseLibraryBackup, planImport } from '../src/utils/backup';
import { searchSnippet, highlightParts, rehypeSearch } from '../src/utils/search';
import { saveLibraryToStorage } from '../src/utils/storage';
import type { Note, AppSettings } from '../src/types';

const note: Note = { id: 'note-one', content: '原文 #标签', tags: ['标签'], createdAt: 1, updatedAt: 2, isPinned: false, isFavorite: false };
const settings: AppSettings = { defaultEditorMode: 'typora', autoSaveDelay: 1000, showStatsCard: false, sidebarWidth: 260, isSidebarCollapsed: false, activeWorkspaceId: 'work', workspaces: [{ id: 'work', name: '工作', path: '/work', createdAt: 1 }] };
const options = { mode: 'current', duplicates: 'skip', conflicts: 'copy' } as const;
const storage = new Map<string, string>();
let failSettings = false;
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { if (failSettings && key === 'flovenote_settings_v1' && value !== 'old-settings') throw new Error('quota'); storage.set(key, value); },
  removeItem: (key: string) => storage.delete(key),
} });

test('full backup round trips workspace metadata and excludes credentials', () => {
  const backup = createLibraryBackup([note], { ...settings, geminiApiKey: 'secret-key', aiBaseUrl: 'private-endpoint' });
  assert.ok(!JSON.stringify(backup).includes('secret-key'));
  assert.ok(!JSON.stringify(backup).includes('private-endpoint'));
  const parsed = parseLibraryBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(parsed.settings?.workspaces, settings.workspaces);
  assert.equal(parsed.settings?.autoSaveDelay, 1000);
  assert.equal(parseLibraryBackup([note]).notes.length, 1);
  assert.throws(() => parseLibraryBackup({ notes: [note], settings: { workspaces: [{}] } }));
});
test('repeated import skips content duplicates, while conflicting IDs become copies', () => {
  const backup = parseLibraryBackup([note, { ...note, content: '冲突正文' }]);
  const first = planImport([], settings, backup, options);
  assert.equal(first.added, 2);
  assert.equal(first.conflictCount, 1);
  assert.equal(new Set(first.notes.map(n => n.id)).size, 2);
  const second = planImport(first.notes, settings, backup, options);
  assert.equal(second.added, 0);
  assert.equal(second.duplicateCount, 2);
  const skip = planImport([{ ...note, workspaceId: 'work' }], settings, backup, { ...options, conflicts: 'skip' });
  assert.equal(skip.added, 0);
});
test('restore original structure preserves unrelated workspaces and maps collisions consistently', () => {
  const source = { ...settings, workspaces: [{ id: 'work', name: '备份的工作', path: '/backup', createdAt: 1 }] };
  const backup = createLibraryBackup([{ ...note, workspaceId: 'work' }], source);
  const plan = planImport([], settings, backup, { ...options, mode: 'structure' });
  assert.equal(plan.settings.workspaces?.length, 2);
  assert.equal(plan.notes[0].workspaceId, 'restored-work');
  assert.equal(plan.settings.activeWorkspaceId, 'restored-work');
  const repeat = planImport(plan.notes, plan.settings, backup, { ...options, mode: 'structure' });
  assert.equal(repeat.settings.workspaces?.length, 2);
  assert.equal(repeat.added, 0);
});
test('failed configuration write rolls back note changes', () => {
  storage.set('flovenote_notes_v1', 'old-notes');
  storage.set('flovenote_settings_v1', 'old-settings');
  failSettings = true;
  assert.equal(saveLibraryToStorage([note], settings), false);
  assert.equal(storage.get('flovenote_notes_v1'), 'old-notes');
  assert.equal(storage.get('flovenote_settings_v1'), 'old-settings');
  failSettings = false;
  assert.equal(saveLibraryToStorage([note], settings), true);
});
test('search snippets find long note matches and highlighting treats query as literal text', () => {
  const content = '前'.repeat(150) + '测试 [a+b]' + '后'.repeat(150);
  const snippet = searchSnippet(content, '[a+b]');
  assert.ok(snippet.startsWith('…') && snippet.endsWith('…'));
  assert.ok(snippet.includes('[a+b]'));
  assert.deepEqual(highlightParts('A+B a+b', 'a+b').filter(part => part.match).map(part => part.text), ['A+B', 'a+b']);
  assert.equal(searchSnippet(content, '不存在'), '');
  assert.equal(highlightParts('<script>x</script>', 'script').map(p => p.text).join(''), '<script>x</script>');
});
test('Markdown highlighting never wraps code or formula nodes', () => {
  const tree: any = { type: 'root', children: [
    { type: 'element', tagName: 'p', children: [{ type: 'text', value: '测试测试' }] },
    { type: 'element', tagName: 'code', children: [{ type: 'text', value: '测试' }] },
  ] };
  rehypeSearch({ query: '测试' })(tree);
  assert.equal(tree.children[0].children.length, 2);
  assert.equal(tree.children[0].children[0].tagName, 'mark');
  assert.equal(tree.children[1].children[0].type, 'text');
});

test('editor starts with saved content before effects and ignores legacy empty drafts', () => {
  const existing = { ...note, content: '正文必须保留' };
  const legacy = JSON.stringify({ content: '', isPinned: false, isFavorite: false });
  assert.equal(initialEditorDraft(existing, '', legacy).content, existing.content);
  assert.equal(initialEditorDraft(existing, '', null).content, existing.content);
  assert.equal(initialEditorDraft(existing, '', '{broken').content, existing.content);
  const recovered = JSON.stringify({ content: '未完成的新正文', isPinned: true, isFavorite: false });
  assert.equal(initialEditorDraft(existing, '', recovered).content, '未完成的新正文');
  assert.equal(initialEditorDraft(null, '从快速记录继续', null).content, '从快速记录继续');
});
