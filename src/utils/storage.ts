import { normalizePreferences } from './product';
import { Note, AppSettings, Workspace } from '../types';
import { extractTags } from './markdownUtils';

const STORAGE_KEY = 'flovenote_notes_v1';
let storageReadError = false;
export const hasStorageReadError = () => storageReadError;
export const getRawNotesBackup = () => localStorage.getItem(STORAGE_KEY) || '[]';

const THEME_KEY = 'flovenote_theme';

export const DEFAULT_WORKSPACES: Workspace[] = [
  {
    id: 'default',
    name: '默认工作区',
    path: '~/Documents/Stillnote/Default',
    notesPath: '~/Documents/Stillnote/Default/Notes',
    mediaPath: '~/Documents/Stillnote/Default/.src',
    backupPath: '~/Documents/Stillnote/Default/Backups',
    description: '系统主笔记与生活随记库',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
  },
  {
    id: 'work',
    name: '工作与项目',
    path: '~/Documents/Stillnote/Work',
    notesPath: '~/Documents/Stillnote/Work/Notes',
    mediaPath: '~/Documents/Stillnote/Work/.src',
    backupPath: '~/Documents/Stillnote/Work/Backups',
    description: '职业工作纪要、项目待办与架构笔记',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 15,
  },
  {
    id: 'study',
    name: '研习与灵感',
    path: '~/Documents/Stillnote/Study',
    notesPath: '~/Documents/Stillnote/Study/Notes',
    mediaPath: '~/Documents/Stillnote/Study/.src',
    backupPath: '~/Documents/Stillnote/Study/Backups',
    description: '读书笔记、论文摘要与创意灵感',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
  },
];

export const INITIAL_SAMPLE_NOTES: Note[] = [];

export function cleanupExpiredTrashNotes(notes: Note[]): Note[] {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return notes.filter((note) => {
    if (note.deletedAt) {
      if (now - note.deletedAt > SEVEN_DAYS_MS) {
        return false; // Automatically purge note after 7 days
      }
    }
    return true;
  });
}

export function getStoredNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SAMPLE_NOTES));
      return INITIAL_SAMPLE_NOTES;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(note => note && typeof note.content === 'string' && Array.isArray(note.tags))) throw new Error('Invalid notes');
    const loadedNotes = parsed;
    return cleanupExpiredTrashNotes(loadedNotes);
  } catch (err) {
    storageReadError = true;
    console.error('Failed to load notes from localStorage:', err);
    return INITIAL_SAMPLE_NOTES;
  }
}

export function saveNotesToStorage(notes: Note[]): boolean {
  if (storageReadError) return false;
  try {
    const cleanedNotes = cleanupExpiredTrashNotes(notes);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanedNotes));
    return true;
  } catch (err) {
    console.error('Failed to save notes to localStorage:', err);
    return false;
  }
}

const SETTINGS_KEY = 'flovenote_settings_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  defaultEditorMode: 'typora',
  codeBlockTheme: 'light-mac',
  tableTheme: 'border-light',
  fontFamily: 'sans',
  showStatsCard: false,
  autoSaveDelay: 3000,
  sidebarWidth: 260,
  isSidebarCollapsed: false,
  storagePath: '~/Documents/Stillnote/Notes',
  mediaStoragePath: '~/Documents/Stillnote/.src',
  backupPath: '~/Documents/Stillnote/Backups',
  activeWorkspaceId: 'default',
  workspaces: DEFAULT_WORKSPACES,
  themeMode: 'light',
  designVersion: 1,
};

export function getStoredSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return normalizePreferences({ ...DEFAULT_SETTINGS, ...parsed, ...(parsed.designVersion ? {} : { themeMode: 'light', designVersion: 1 }) });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettingsToStorage(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

export function getStoredTheme(): 'light' | 'dark' {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    if (theme === 'dark' || theme === 'light') return theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveThemeToStorage(theme: 'light' | 'dark'): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    console.error('Failed to save theme:', err);
  }
}

/**
 * Renames a tag across all notes
 */
export function renameTagInNotes(notes: Note[], oldTag: string, newTag: string): Note[] {
  const cleanNewTag = newTag.replace(/^#/, '').trim();
  if (!cleanNewTag || oldTag === cleanNewTag) return notes;

  return notes.map((note) => {
    if (!note.tags.includes(oldTag)) return note;

    // Replace #oldTag in text content with #cleanNewTag
    const regex = new RegExp(`(?<=^|\\s)#${escapeRegExp(oldTag)}(?=\\s|$|[.,!?;:])`, 'g');
    const newContent = note.content.replace(regex, `#${cleanNewTag}`);
    
    // Re-extract tags to preserve structure
    const updatedTags = extractTags(newContent);

    return {
      ...note,
      content: newContent,
      tags: updatedTags,
      updatedAt: Date.now(),
    };
  });
}

/**
 * Merges sourceTag into targetTag across all notes
 */
export function mergeTagsInNotes(notes: Note[], sourceTag: string, targetTag: string): Note[] {
  return renameTagInNotes(notes, sourceTag, targetTag);
}

/**
 * Removes a tag reference from all notes
 */
export function deleteTagFromNotes(notes: Note[], tagToDelete: string): Note[] {
  return notes.map((note) => {
    if (!note.tags.includes(tagToDelete)) return note;

    const regex = new RegExp(`(?<=^|\\s)#${escapeRegExp(tagToDelete)}(?=\\s|$|[.,!?;:])`, 'g');
    const newContent = note.content.replace(regex, '').trim();
    const updatedTags = extractTags(newContent);

    return {
      ...note,
      content: newContent,
      tags: updatedTags,
      updatedAt: Date.now(),
    };
  });
}

/**
 * Removes all tags from all notes across the workspace
 */
export function deleteAllTagsFromNotes(notes: Note[]): Note[] {
  return notes.map((note) => {
    if (!note.tags || note.tags.length === 0) return note;

    let newContent = note.content;
    for (const tag of note.tags) {
      const regex = new RegExp(`(?<=^|\\s)#${escapeRegExp(tag)}(?=\\s|$|[.,!?;:])`, 'g');
      newContent = newContent.replace(regex, '');
    }
    newContent = newContent.trim();
    const updatedTags = extractTags(newContent);

    return {
      ...note,
      content: newContent,
      tags: updatedTags,
      updatedAt: Date.now(),
    };
  });
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Commit notes and workspace settings together, rolling back on write failure. */
export function saveLibraryToStorage(notes: Note[], settings: AppSettings): boolean {
  if (storageReadError) return false;
  let oldNotes: string | null, oldSettings: string | null;
  try { oldNotes = localStorage.getItem(STORAGE_KEY); oldSettings = localStorage.getItem(SETTINGS_KEY); }
  catch { return false; }
  try {
    const notesJson = JSON.stringify(cleanupExpiredTrashNotes(notes));
    const settingsJson = JSON.stringify(settings);
    localStorage.setItem(STORAGE_KEY, notesJson);
    localStorage.setItem(SETTINGS_KEY, settingsJson);
    return true;
  } catch {
    try {
      if (oldNotes === null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, oldNotes);
      if (oldSettings === null) localStorage.removeItem(SETTINGS_KEY); else localStorage.setItem(SETTINGS_KEY, oldSettings);
    } catch { console.error('恢复写入失败，请从已导出的备份检查数据。'); }
    return false;
  }
}
