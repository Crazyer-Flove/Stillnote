import { normalizePreferences } from './product';
import type { AppSettings, Note, Workspace } from '../types';
import { portableNotes } from './imageStorage';
import { inWorkspace, validateBackup } from './workspace';

export interface LibraryBackup { version: 2; exportedAt: string; notes: Note[]; settings?: Partial<AppSettings> }
// Allowlist prevents credentials and future private settings from leaking into backups.
export function backupSettings(settings: AppSettings): Partial<AppSettings> {
  return {
    workspaces: settings.workspaces?.map(({ id, name, path, notesPath, mediaPath, backupPath, description, createdAt }) => ({ id, name, path, notesPath, mediaPath, backupPath, description, createdAt })),
    activeWorkspaceId: settings.activeWorkspaceId,
    defaultEditorMode: settings.defaultEditorMode, autoSaveDelay: settings.autoSaveDelay,
    autoSaveEnabled: settings.autoSaveEnabled, editorFontSize: settings.editorFontSize,
    showStatsCard: settings.showStatsCard, sidebarWidth: settings.sidebarWidth,
    isSidebarCollapsed: settings.isSidebarCollapsed, themeMode: settings.themeMode,
    fontFamily: settings.fontFamily, cardDensity: settings.cardDensity, codeBlockTheme: settings.codeBlockTheme,
    tableTheme: settings.tableTheme, autoFoldLongNotes: settings.autoFoldLongNotes,
  };
}
export function createLibraryBackup(notes: Note[], settings: AppSettings): LibraryBackup {
  return { version: 2, exportedAt: new Date().toISOString(), notes: portableNotes(notes), settings: backupSettings(settings) };
}
export function parseLibraryBackup(value: unknown): LibraryBackup {
  const notes = validateBackup(value);
  const result: LibraryBackup = { version: 2, exportedAt: '', notes };
  if (!value || typeof value !== 'object' || !('settings' in value) || !value.settings) return result;
  const input = value.settings as Partial<AppSettings>;
  if (!Array.isArray(input.workspaces) || !input.workspaces.every(w => w && typeof w.id === 'string' && w.id && typeof w.name === 'string' && typeof w.path === 'string' && Number.isFinite(w.createdAt))) {
    throw new Error('工作区配置格式不正确，未修改现有数据。');
  }
  if (new Set(input.workspaces.map(w => w.id)).size !== input.workspaces.length) throw new Error('备份中的工作区 ID 重复。');
  const clean: Partial<AppSettings> = { workspaces: input.workspaces.map(w => ({
    id: w.id, name: w.name, path: w.path, createdAt: w.createdAt,
    ...Object.fromEntries(['notesPath', 'mediaPath', 'backupPath', 'description'].filter(key => typeof w[key as keyof Workspace] === 'string').map(key => [key, w[key as keyof Workspace]])),
  })) };
  if (typeof input.activeWorkspaceId === 'string') clean.activeWorkspaceId = input.activeWorkspaceId;
  if (typeof input.autoSaveDelay === 'number' && Number.isFinite(input.autoSaveDelay)) clean.autoSaveDelay = Math.min(30000, Math.max(500, input.autoSaveDelay));
  if (typeof input.sidebarWidth === 'number') clean.sidebarWidth = Math.min(420, Math.max(180, input.sidebarWidth));
  for (const key of ['autoSaveEnabled', 'showStatsCard', 'isSidebarCollapsed', 'autoFoldLongNotes'] as const) if (typeof input[key] === 'boolean') clean[key] = input[key];
  const choices = { defaultEditorMode: ['typora', 'split', 'preview'], editorFontSize: ['sm', 'base', 'lg', 'xl'], themeMode: ['light', 'dark', 'system'], fontFamily: ['sans', 'serif', 'mono'], cardDensity: ['comfortable', 'compact'], codeBlockTheme: ['light-mac', 'dark-mac', 'dracula', 'monokai', 'nord'], tableTheme: ['modern-indigo', 'zebra-stripe', 'minimal-dark', 'border-light', 'emerald-fresh', 'amber-warm'] };
  for (const [key, allowed] of Object.entries(choices)) {
    const field = input[key as keyof AppSettings];
    if (typeof field === 'string' && allowed.includes(field)) Object.assign(clean, { [key]: field });
  }
  result.settings = normalizePreferences(clean);
  return result;
}

export interface ImportOptions { mode: 'current' | 'structure'; duplicates: 'skip' | 'copy'; conflicts: 'skip' | 'copy' }
export function planImport(current: Note[], settings: AppSettings, backup: LibraryBackup, options: ImportOptions) {
  const workspaces = [...(settings.workspaces || [])];
  const map = new Map<string, string>();
  if (options.mode === 'structure') {
    const sources = [...(backup.settings?.workspaces || [])];
    for (const note of backup.notes) {
      const id = note.workspaceId || 'default';
      if (!sources.some(w => w.id === id)) sources.push({ id, name: `恢复的工作区 ${id}`, path: '', createdAt: Date.now() });
    }
    for (const source of sources) {
      const existing = workspaces.find(w => w.id === source.id);
      if (!existing) { workspaces.push(source); map.set(source.id, source.id); }
      else if (existing.name === source.name && existing.path === source.path) map.set(source.id, existing.id);
      else {
        // A deterministic destination makes preview and repeated imports stable.
        let id = `restored-${source.id}`, index = 1;
        while (workspaces.some(w => w.id === id && (w.name !== source.name || w.path !== source.path))) id = `restored-${source.id}-${index++}`;
        if (!workspaces.some(w => w.id === id)) workspaces.push({ ...source, id });
        map.set(source.id, id);
      }
    }
  }
  const destination = settings.activeWorkspaceId || 'default';
  const pool = [...current];
  const rows: { note: Note; kind: 'new' | 'duplicate' | 'conflict'; destination: string; skipped: boolean }[] = [];
  const normalize = (text: string) => text.replace(/\r\n/g, '\n').trim();
  const fingerprint = (note: Note, workspaceId: string) => JSON.stringify([workspaceId, Boolean(note.deletedAt), normalize(note.content)]);
  const fingerprints = new Set(portableNotes(current).map(note => fingerprint(note, note.workspaceId || 'default')));
  const ids = new Set(current.map(note => note.id));
  for (const source of backup.notes) {
    const target = options.mode === 'current' ? destination : map.get(source.workspaceId || 'default')!;
    const duplicate = fingerprints.has(fingerprint(source, target));
    const collision = ids.has(source.id);
    const kind = duplicate ? 'duplicate' : collision ? 'conflict' : 'new';
    const skipped = kind === 'duplicate' ? options.duplicates === 'skip' : kind === 'conflict' && options.conflicts === 'skip';
    rows.push({ note: source, kind, destination: target, skipped });
    if (!skipped) {
      const id = collision ? crypto.randomUUID() : source.id;
      // Restored trash gets a fresh recovery window instead of expiring immediately on save.
      const restored = { ...source, workspaceId: target, id, ...(source.deletedAt ? { deletedAt: Date.now() } : {}) };
      pool.push(restored); ids.add(id); fingerprints.add(fingerprint(restored, target));
    }
  }
  return {
    rows, notes: pool,
    settings: options.mode === 'structure' ? { ...settings, ...backup.settings, workspaces, activeWorkspaceId: map.get(backup.settings?.activeWorkspaceId || 'default') || destination } as AppSettings : settings,
    added: pool.length - current.length,
    duplicateCount: rows.filter(r => r.kind === 'duplicate').length,
    conflictCount: rows.filter(r => r.kind === 'conflict').length,
  };
}
