import { portableNotes } from './imageStorage';
import { Note } from '../types';
import { extractTags } from './markdownUtils';

export interface LocalDirectoryPaths {
  rootPath: string;
  notesPath: string;
  mediaPath: string;
  backupPath: string;
}

export interface SyncStats {
  success: boolean;
  notesCount: number;
  imagesCount: number;
  backupFileName: string;
  error?: string;
}

/**
 * Checks if the browser supports the File System Access API
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Normalizes and derives the sub-folder paths (Notes, .src, Backups) from a given root folder path
 */
export function deriveSubPaths(rootPath: string): LocalDirectoryPaths {
  const cleanRoot = rootPath.trim().replace(/[/\\]+$/, '') || '~/Documents/Stillnote';
  const isWindows = cleanRoot.includes('\\') && !cleanRoot.includes('/');
  const sep = isWindows ? '\\' : '/';

  return {
    rootPath: cleanRoot,
    notesPath: `${cleanRoot}${sep}Notes`,
    mediaPath: `${cleanRoot}${sep}.src`,
    backupPath: `${cleanRoot}${sep}Backups`,
  };
}

/**
 * Prompts user to pick a local computer folder using File System Access API
 */
export async function pickLocalDirectory(): Promise<{
  handle: any;
  name: string;
  derivedPaths: LocalDirectoryPaths;
} | null> {
  if (!isFileSystemAccessSupported()) {
    return null;
  }

  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    });

    const folderName = handle.name || 'Stillnote-Vault';
    // Construct friendly default path display
    const simulatedPath = `~/Documents/${folderName}`;
    const derivedPaths = deriveSubPaths(simulatedPath);

    return {
      handle,
      name: folderName,
      derivedPaths,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // User cancelled picker
      return null;
    }
    console.error('Error selecting local directory:', err);
    throw err;
  }
}

/**
 * Sanitizes a string for use as a safe filename
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Helper to write a file inside a directory handle
 */
async function writeFileToHandle(dirHandle: any, fileName: string, content: string | Blob): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Converts a Note to clean standard Markdown with YAML Frontmatter
 */
export function formatNoteToMarkdownWithFrontmatter(note: Note): string {
  const createdIso = new Date(note.createdAt).toISOString();
  const updatedIso = new Date(note.updatedAt).toISOString();
  const tagsYaml = note.tags.length > 0 ? `\ntags:\n${note.tags.map((t) => `  - ${t}`).join('\n')}` : '';

  const frontmatter = `---
id: ${JSON.stringify(note.id)}
created: "${createdIso}"
updated: "${updatedIso}"
pinned: ${note.isPinned}
favorite: ${note.isFavorite}${tagsYaml}
---

`;

  return frontmatter + note.content;
}

export interface DirectoryWriteOptions { notesDirName?: string; mediaDirName?: string; backupDirName?: string }
export interface DirectoryWriteEntry {
  name: string; directory: 'notes' | 'backup' | 'root'; title: string;
  status: 'new' | 'update' | 'unchanged' | 'conflict'; previous: string | null; content: string;
}
export interface DirectoryWritePlan {
  rootName: string; notesDirName: string; backupDirName: string;
  entries: DirectoryWriteEntry[]; backupFileName: string; sourceNotes: Note[];
}
const notFound = (error: any) => error?.name === 'NotFoundError' || error?.message === 'NotFound';
async function optionalDirectory(root: any, name: string) {
  try { return await root.getDirectoryHandle(name); } catch (error) { if (notFound(error)) return null; throw error; }
}
async function readText(directory: any, name: string): Promise<string | null> {
  if (!directory) return null;
  try { return await (await (await directory.getFileHandle(name)).getFile()).text(); }
  catch (error) { if (notFound(error)) return null; throw error; }
}
function directoryName(value: string) {
  if (!value || /[<>:"/\\|?*\x00-\x1F]/.test(value) || value === '.' || value === '..') throw new Error('请使用有效且互不相同的末级目录名称。');
  return value;
}
export function frontmatterId(text: string): string | null {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  const raw = text.slice(3, end).match(/^id:\s*(.+)$/m)?.[1]?.trim();
  if (!raw) return null;
  try { return raw.startsWith('"') ? JSON.parse(raw) : raw.replace(/^'|'$/g, ''); } catch { return null; }
}
/** Read-only: no folders or files are created until the user confirms this plan. */
export async function previewWorkspaceWrite(root: any, notes: Note[], options: DirectoryWriteOptions = {}): Promise<DirectoryWritePlan> {
  const notesDirName = directoryName(options.notesDirName || 'Notes');
  const backupDirName = directoryName(options.backupDirName || 'Backups');
  if (notesDirName === backupDirName) throw new Error('笔记与备份目录不能相同。');
  const notesDirectory = await optionalDirectory(root, notesDirName);
  const backupDirectory = await optionalDirectory(root, backupDirName);
  const portable = portableNotes(notes);
  const entries: DirectoryWriteEntry[] = [];
  const used = new Set<string>();
  for (const note of portable.filter(note => !note.deletedAt)) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(note.id));
    const hash = Array.from(new Uint8Array(digest)).slice(0, 16).map(value => value.toString(16).padStart(2, '0')).join('');
    const name = `note-${hash}.md`;
    if (used.has(name)) throw new Error('笔记 ID 重复，请先处理重复记录。');
    used.add(name);
    const content = formatNoteToMarkdownWithFrontmatter(note);
    const previous = await readText(notesDirectory, name);
    const status = previous === null ? 'new' : frontmatterId(previous) !== note.id ? 'conflict' : previous === content ? 'unchanged' : 'update';
    entries.push({ name, directory: 'notes', title: note.content.split('\n')[0].slice(0, 100) || '空白笔记', status, previous, content });
  }
  const backupFileName = `flovenote_backup_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomUUID().slice(0, 8)}.json`;
  const previousBackup = await readText(backupDirectory, backupFileName);
  entries.push({ name: backupFileName, directory: 'backup', title: '当前工作区 JSON 快照（包含回收站）', status: previousBackup === null ? 'new' : 'conflict', previous: previousBackup, content: JSON.stringify({ version: '1.0', exportedAt: new Date().toISOString(), notes: portable }, null, 2) });
  const docName = 'FloveNote-说明.md';
  const previous = await readText(root, docName);
  entries.push({ name: docName, directory: 'root', title: '目录说明（已有文件保持不变）', status: previous === null ? 'new' : 'unchanged', previous,
    content: previous ?? `# FloveNote 工作区\n\n${notesDirName}/：笔记，图片内嵌在正文中。\n${backupDirName}/：JSON 快照。\n\n文件名按笔记 ID 固定，修改标题不会另建文件。旧文件和其他文件不会被自动删除。\n` });
  return { rootName: root.name || '所选文件夹', notesDirName, backupDirName, entries, backupFileName, sourceNotes: notes.map(note => ({ ...note })) };
}
/** Recheck every previewed file before performing the confirmed writes. */
export async function syncWorkspaceToDirectoryHandle(root: any, notes: Note[], options?: DirectoryWriteOptions, confirmedPlan?: DirectoryWritePlan): Promise<SyncStats> {
  let written = 0;
  try {
    const plan = confirmedPlan || await previewWorkspaceWrite(root, notes, options);
    const directories = { notes: await optionalDirectory(root, plan.notesDirName), backup: await optionalDirectory(root, plan.backupDirName), root };
    for (const entry of plan.entries) {
      if (await readText(directories[entry.directory], entry.name) !== entry.previous) throw new Error(`文件已在预览后发生变化：${entry.name}。请重新预览。`);
    }
    if (plan.entries.find(entry => entry.directory === 'backup')?.status === 'conflict') throw new Error('备份文件名发生冲突，请重新预览。');
    directories.notes ||= await root.getDirectoryHandle(plan.notesDirName, { create: true });
    directories.backup ||= await root.getDirectoryHandle(plan.backupDirName, { create: true });
    // Write a snapshot before updating note files.
    for (const entry of [...plan.entries].sort((a, b) => Number(b.directory === 'backup') - Number(a.directory === 'backup'))) {
      if (entry.status === 'conflict' || entry.status === 'unchanged') continue;
      if (await readText(directories[entry.directory], entry.name) !== entry.previous) throw new Error(`文件在写入前发生变化：${entry.name}`);
      await writeFileToHandle(directories[entry.directory], entry.name, entry.content);
      if (entry.directory === 'notes') written++;
    }
    const conflicts = plan.entries.filter(entry => entry.status === 'conflict').length;
    return { success: conflicts === 0, notesCount: written, imagesCount: 0, backupFileName: plan.backupFileName,
      error: conflicts ? `已写入 ${written} 篇笔记，跳过 ${conflicts} 个冲突文件。完整内容保存在 JSON 快照中。` : undefined };
  } catch (error: any) {
    return { success: false, notesCount: written, imagesCount: 0, backupFileName: '', error: `写入未完成（已写入 ${written} 篇）：${error?.message || '请重试'}` };
  }
}

/**
 * Reads all Markdown (.md) notes from a local directory handle and returns parsed Notes
 */
export async function readNotesFromDirectoryHandle(rootHandle: any, workspaceId: string = 'default', notesDirName = 'Notes'): Promise<Note[]> {
  const importedNotes: Note[] = [];

  async function processDirectory(dirHandle: any) {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
        if (entry.name.toLowerCase() === 'readme.md') continue;
        try {
          const file = await entry.getFile();
          const text = await file.text();

          let content = text;
          const originalId = frontmatterId(text);
          let createdAt = file.lastModified || Date.now();
          let updatedAt = file.lastModified || Date.now();
          let isPinned = false;
          let isFavorite = false;

          // Parse YAML Frontmatter if present
          if (text.startsWith('---')) {
            const endMatch = text.indexOf('---', 3);
            if (endMatch !== -1) {
              const frontmatterRaw = text.substring(3, endMatch);
              content = text.substring(endMatch + 3).trim();

              const createdMatch = frontmatterRaw.match(/created:\s*["']?([^"'\n]+)/i);
              if (createdMatch && createdMatch[1]) {
                const parsedDate = Date.parse(createdMatch[1]);
                if (!isNaN(parsedDate)) createdAt = parsedDate;
              }

              const updatedMatch = frontmatterRaw.match(/updated:\s*["']?([^"'\n]+)/i);
              if (updatedMatch && updatedMatch[1]) {
                const parsedDate = Date.parse(updatedMatch[1]);
                if (!isNaN(parsedDate)) updatedAt = parsedDate;
              }

              if (/pinned:\s*true/i.test(frontmatterRaw)) isPinned = true;
              if (/favorite:\s*true/i.test(frontmatterRaw)) isFavorite = true;
            }
          }

          const tags = extractTags(content);

          importedNotes.push({
            id: originalId || `local_${crypto.randomUUID()}`,
            content,
            tags,
            createdAt,
            updatedAt,
            isPinned,
            isFavorite,
            workspaceId,
            history: [],
          });
        } catch (e) {
          console.warn(`Could not read file ${entry.name}:`, e);
        }
      } else if (entry.kind === 'directory' && entry.name === 'Notes') {
        // Recurse into Notes subfolder
        await processDirectory(entry);
      }
    }
  }

  let sourceHandle = rootHandle;
  try { sourceHandle = await rootHandle.getDirectoryHandle(notesDirName); } catch { /* A plain Markdown folder is also supported. */ }
  await processDirectory(sourceHandle);
  return importedNotes;
}
