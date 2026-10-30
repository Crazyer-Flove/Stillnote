import type { Note } from '../types';

export function initialEditorDraft(note: Note | null, initialContent: string, rawDraft: string | null) {
  const fallback = { content: note?.content ?? initialContent, isPinned: note?.isPinned ?? false, isFavorite: note?.isFavorite ?? false };
  try {
    const draft = JSON.parse(rawDraft || 'null');
    if (!draft || typeof draft.content !== 'string' || typeof draft.isPinned !== 'boolean' || typeof draft.isFavorite !== 'boolean') return fallback;
    // Legacy initialization could persist an accidental empty draft. Never let that overwrite a note.
    if (!draft.content.trim() && note?.content.trim() && !draft.explicitEmpty) return fallback;
    return { content: draft.content as string, isPinned: draft.isPinned as boolean, isFavorite: draft.isFavorite as boolean };
  } catch { return fallback; }
}
