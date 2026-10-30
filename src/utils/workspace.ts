import { Note } from '../types';

export const inWorkspace = (note: Note, workspaceId: string) =>
  (note.workspaceId || 'default') === workspaceId;

export function mergeImportedNotes(current: Note[], imported: Note[], workspaceId: string): Note[] {
  const usedIds = new Set(current.map((note) => note.id));
  return [...imported.map((note) => {
    const id = usedIds.has(note.id) ? crypto.randomUUID() : note.id;
    usedIds.add(id);
    return { ...note, id, workspaceId };
  }), ...current];
}

export function validateBackup(value: unknown): Note[] {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'notes' in value) value = (value as { notes: unknown }).notes;
  if (!Array.isArray(value) || !value.every((note) =>
    note && typeof note.id === 'string' && typeof note.content === 'string' &&
    Array.isArray(note.tags) && note.tags.every((tag: unknown) => typeof tag === 'string') &&
    Number.isFinite(note.createdAt) && Number.isFinite(note.updatedAt) &&
    typeof note.isPinned === 'boolean' && typeof note.isFavorite === 'boolean' &&
    (note.workspaceId === undefined || typeof note.workspaceId === 'string') &&
    (note.deletedAt === undefined || Number.isFinite(note.deletedAt)) &&
    (note.history === undefined || (Array.isArray(note.history) && note.history.every((snapshot: { id?: unknown; content?: unknown; timestamp?: unknown }) =>
      snapshot && typeof snapshot.id === 'string' && typeof snapshot.content === 'string' && Number.isFinite(snapshot.timestamp))))
  )) throw new Error('备份格式不完整，请选择 Stillnote 或旧版 FloveNote JSON 备份。');
  return value;
}
