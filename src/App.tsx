import { sessionHistory, applyBatchChange } from './utils/product';
import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { Note, FilterState, ViewMode, ThemeMode, ToastMessage, NoteHistory, AppSettings } from './types';
import {
  getStoredNotes,
  hasStorageReadError,
  getRawNotesBackup,
  saveNotesToStorage,
  saveLibraryToStorage,
  getStoredTheme,
  saveThemeToStorage,
  getStoredSettings,
  saveSettingsToStorage,
  INITIAL_SAMPLE_NOTES,
  renameTagInNotes,
  mergeTagsInNotes,
  deleteTagFromNotes,
  deleteAllTagsFromNotes,
} from './utils/storage';
import { extractTags, getIsoWeekString, getMonthString, exportNotesContent, downloadFile } from './utils/markdownUtils';
import { createLibraryBackup, parseLibraryBackup, LibraryBackup } from './utils/backup';
import { inWorkspace } from './utils/workspace';
import { Sidebar } from './components/Sidebar';
import { TimelineFeed } from './components/TimelineFeed';
const ImportBackupModal = lazy(() => import('./components/ImportBackupModal').then(module => ({ default: module.ImportBackupModal })));
const NoteEditorModal = lazy(() => import('./components/NoteEditorModal').then(module => ({ default: module.NoteEditorModal })));
const TagManagerModal = lazy(() => import('./components/TagManagerModal').then(module => ({ default: module.TagManagerModal })));
const TagCloudModal = lazy(() => import('./components/TagCloudModal').then(module => ({ default: module.TagCloudModal })));
const BatchExportModal = lazy(() => import('./components/BatchExportModal').then(module => ({ default: module.BatchExportModal })));
const ResourceManagerModal = lazy(() => import('./components/ResourceManagerModal').then(module => ({ default: module.ResourceManagerModal })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(module => ({ default: module.SettingsModal })));
const FocusModeModal = lazy(() => import('./components/FocusModeModal').then(module => ({ default: module.FocusModeModal })));
const NoteExportCardModal = lazy(() => import('./components/NoteExportCardModal').then(module => ({ default: module.NoteExportCardModal })));
const AnalyticsModal = lazy(() => import('./components/AnalyticsModal').then(module => ({ default: module.AnalyticsModal })));
const SponsorAuthorModal = lazy(() => import('./components/SponsorAuthorModal').then(module => ({ default: module.SponsorAuthorModal })));
const CommandPaletteModal = lazy(() => import('./components/CommandPaletteModal').then(module => ({ default: module.CommandPaletteModal })));
import { ToastContainer } from './components/Toast';

export default function App() {
  const [notes, setNotes] = useState<Note[]>(() => getStoredNotes());
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [settings, setSettings] = useState<AppSettings>(() => getStoredSettings());

  const [pendingBackup, setPendingBackup] = useState<LibraryBackup | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveFailedRef = useRef(false);
  const activeWorkspaceId = settings.activeWorkspaceId || 'default';
  const workspaceNotes = useMemo(() => notes.filter(note => inWorkspace(note, activeWorkspaceId)), [notes, activeWorkspaceId]);
  const activeNotes = useMemo(() => workspaceNotes.filter(note => !note.deletedAt), [workspaceNotes]);
  const workspaceCounts = useMemo(() => Object.fromEntries((settings.workspaces || []).map(workspace => [workspace.id, notes.filter(note => !note.deletedAt && inWorkspace(note, workspace.id)).length])), [notes, settings.workspaces]);
  const [directoryHandles, setDirectoryHandles] = useState<Record<string, any>>({});
  const [syncedContents, setSyncedContents] = useState<Record<string, string>>({});
  const appSession = useRef(crypto.randomUUID());
  const [lastBackupAt, setLastBackupAt] = useState(() => { try { const n=Number(localStorage.getItem('stillnote_last_backup'));return Number.isFinite(n)&&n>0?n:0;}catch{return 0;} });
  const [writeTimes,setWriteTimes] = useState<Record<string,number>>(() => {try{const v=JSON.parse(localStorage.getItem('stillnote_write_times')||'{}');return Object.fromEntries(Object.entries(v).filter((entry): entry is [string,number]=>typeof entry[1]==='number'&&Number.isFinite(entry[1])));}catch{return {};}});


  // Notes Operation History Stack (Undo / Redo)
  const [undoStack, setUndoStack] = useState<Note[][]>([]);
  const [redoStack, setRedoStack] = useState<Note[][]>([]);

  // Ref to always access latest notes state without stale closures in keydown listeners
  const notesRef = useRef<Note[]>(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const [filterState, setFilterState] = useState<FilterState>({
    searchKeyword: '',
    selectedTag: null,
    category: 'all',
    sortBy: 'newest',
  });

  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

  // Modal states
  const [editorSession, setEditorSession] = useState(0);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [initialComposerContent, setInitialComposerContent] = useState('');

  const [focusedNote, setFocusedNote] = useState<Note | null>(null);

  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isTagCloudModalOpen, setIsTagCloudModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [exportingCardNote, setExportingCardNote] = useState<Note | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isResourceManagerOpen, setIsResourceManagerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'editor' | 'analytics' | 'batch_export' | 'appearance' | 'paths' | 'workspaces' | 'trash' | 'help' | 'backups'>('editor');
  const [isSponsorModalOpen, setIsSponsorModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Helper to apply state changes while pushing previous snapshot to history stack
  const updateNotesWithHistory = (
    updater: Note[] | ((prev: Note[]) => Note[])
  ) => {
    const prevNotes = notesRef.current;
    const nextNotes = typeof updater === 'function' ? updater(prevNotes) : updater;
    if (JSON.stringify(prevNotes) !== JSON.stringify(nextNotes)) {
      setUndoStack(stack => [prevNotes, ...stack].slice(0, 30));
      setRedoStack([]);
    }
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    const saved = saveNotesToStorage(nextNotes);
    saveFailedRef.current = !saved;
    setSaveFailed(!saved);
    return saved;
  };

  // Undo Handler
  const handleUndo = () => {
    if (undoStack.length === 0) {
      addToast('没有可撤销的笔记操作', 'info');
      return;
    }
    const previousSnapshot = undoStack[0];
    const newUndoStack = undoStack.slice(1);

    setRedoStack((stack) => [notesRef.current, ...stack].slice(0, 30));
    setUndoStack(newUndoStack);
    notesRef.current=previousSnapshot;
    setNotes(previousSnapshot);
    const saved=saveNotesToStorage(previousSnapshot);saveFailedRef.current=!saved;setSaveFailed(!saved);
    addToast('已撤销上一步笔记变动 (Command+Z)', 'success');
  };

  // Redo Handler
  const handleRedo = () => {
    if (redoStack.length === 0) {
      addToast('没有可重做的笔记操作', 'info');
      return;
    }
    const nextSnapshot = redoStack[0];
    const newRedoStack = redoStack.slice(1);

    setUndoStack((stack) => [notesRef.current, ...stack].slice(0, 30));
    setRedoStack(newRedoStack);
    notesRef.current=nextSnapshot;
    setNotes(nextSnapshot);
    const saved=saveNotesToStorage(nextSnapshot);saveFailedRef.current=!saved;setSaveFailed(!saved);
    addToast('已重做笔记变动 (Shift+Command+Z)', 'success');
  };

  // Global Keyboard Listener for Cmd+K (Command Palette) and Cmd+Z / Ctrl+Z (Undo / Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K for Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Cmd+Z or Ctrl+Z (Undo / Redo)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        const activeEl = document.activeElement;
        const isEditingInInput =
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            (activeEl as HTMLElement).isContentEditable);

        // If user is NOT actively typing in an input field, OR if Shift key is pressed (Redo), run Note Undo/Redo
        if (!isEditingInInput) {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        }
      }

      // Ctrl+Y for Redo on Windows
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        const activeEl = document.activeElement;
        const isEditingInInput =
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            (activeEl as HTMLElement).isContentEditable);
        if (!isEditingInInput) {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack]);

  // Handle Bi-Link Navigation
  const handleBiLinkClick = (title: string) => {
    // Find matching note
    const target = activeNotes.find((n) => {
      const firstLine = n.content.trim().split('\n')[0].replace(/^#+\s*/, '').trim();
      return firstLine.toLowerCase() === title.toLowerCase();
    });

    if (target) {
      setFocusedNote(target);
      addToast(`跳转至双链引用随记: ${title}`, 'success');
    } else {
      // Filter by keyword
      setFilterState((prev) => ({ ...prev, searchKeyword: title }));
      addToast(`未找到精确定名笔记，已搜索关键词: ${title}`, 'info');
    }
  };

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (text: string, type: 'success' | 'info' | 'error' = 'info') => {
    if (type === 'success' && saveFailedRef.current) return;
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Persist undo/redo too; ordinary mutations persist synchronously before reporting success.
  useEffect(() => {
    const saved = saveNotesToStorage(notes);
    saveFailedRef.current = !saved;
    setSaveFailed(!saved);
  }, [notes]);
  useEffect(() => {
    if (!saveFailed) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveFailed]);
  useEffect(() => {
    setFilterState({ searchKeyword: '', selectedTag: null, category: 'all', sortBy: 'newest' });
    setIsEditorOpen(false); setEditingNote(null); setFocusedNote(null);
  }, [activeWorkspaceId]);

  // Sync Theme with Document Class & System Mode
  useEffect(() => {
    if (settings.themeMode !== 'system') { setTheme(settings.themeMode === 'dark' ? 'dark' : 'light'); return; }
    if (settings.themeMode === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const updateSystemTheme = (e: MediaQueryListEvent | MediaQueryList) => {
        const isDark = e.matches;
        setTheme(isDark ? 'dark' : 'light');
      };
      updateSystemTheme(media);
      const listener = (e: MediaQueryListEvent) => updateSystemTheme(e);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [settings.themeMode]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
    saveThemeToStorage(theme);
  }, [theme]);

  // Sync Settings to LocalStorage
  useEffect(() => {
    saveSettingsToStorage(settings);
  }, [settings]);

  const handleResetSampleData = () => {
    updateNotesWithHistory(notes.filter(note => !inWorkspace(note, activeWorkspaceId)));
    addToast('已重置并清空所有笔记内容', 'info');
  };

  const toggleTheme = () => {
    setTheme((prev) => {
      const nextTheme = prev === 'light' ? 'dark' : 'light';
      setSettings((s) => ({ ...s, themeMode: nextTheme }));
      return nextTheme;
    });
  };

  // Compute all unique tags with count (excluding trash)
  const allTagInfos = useMemo(() => {
    const tagCountMap = new Map<string, number>();
    workspaceNotes.forEach((note) => {
      if (!note.deletedAt) {
        note.tags.forEach((tag) => {
          tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + 1);
        });
      }
    });
    return Array.from(tagCountMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [workspaceNotes]);

  const allTagNames = useMemo(() => allTagInfos.map((t) => t.name), [allTagInfos]);

  // Filter and Sort Notes
  const filteredNotes = useMemo(() => {
    const activeWsId = settings.activeWorkspaceId || 'default';

    return workspaceNotes
      .filter((note) => {
        // Trash category handling
        if (filterState.category === 'trash') {
          return Boolean(note.deletedAt);
        }

        // Non-trash categories exclude trash notes
        if (note.deletedAt) return false;

        // Workspace filter
        const noteWs = note.workspaceId || 'default';
        if (noteWs !== activeWsId) return false;

        // Category filter
        if (filterState.category === 'pinned' && !note.isPinned) return false;
        if (filterState.category === 'favorites' && !note.isFavorite) return false;

        // Tag filter
        if (filterState.selectedTag && !note.tags.includes(filterState.selectedTag)) {
          return false;
        }

        // Date Filter (YYYY-MM-DD)
        if (filterState.dateFilter) {
          const d = new Date(note.createdAt);
          const noteDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (noteDateStr !== filterState.dateFilter) return false;
        }

        // Week Filter (YYYY-Www)
        if (filterState.weekFilter) {
          const noteWeekStr = getIsoWeekString(new Date(note.createdAt));
          if (noteWeekStr !== filterState.weekFilter) return false;
        }

        // Month Filter (YYYY-MM)
        if (filterState.monthFilter) {
          const noteMonthStr = getMonthString(new Date(note.createdAt));
          if (noteMonthStr !== filterState.monthFilter) return false;
        }

        // Keyword Search
        if (filterState.searchKeyword.trim()) {
          const kw = filterState.searchKeyword.toLowerCase().trim();
          const matchContent = note.content.toLowerCase().includes(kw);
          const matchTags = note.tags.some((t) => t.toLowerCase().includes(kw));
          if (!matchContent && !matchTags) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Pinned notes always on top if viewing all
        if (filterState.category === 'all' && a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        return filterState.sortBy === 'newest'
          ? b.createdAt - a.createdAt
          : a.createdAt - b.createdAt;
      });
  }, [workspaceNotes, filterState, settings.activeWorkspaceId]);

  // CRUD Operations
  const handleCreateNote = (content: string) => {
    const extractedTags = extractTags(content);
    const newNote: Note = {
      id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      content,
      tags: extractedTags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false,
      isFavorite: false,
      workspaceId: settings.activeWorkspaceId || 'default',
      history: [],
    };

    updateNotesWithHistory((prev) => [newNote, ...prev]);
    if (!saveFailedRef.current) addToast('已保存到浏览器', 'success');
    return !saveFailedRef.current;
  };

  const handleSaveEditorNote = (
    content: string,
    isPinned: boolean,
    isFavorite: boolean,
    isAutoSave: boolean = false
  ) => {
    const extractedTags = extractTags(content);

    if (editingNote?.id) {
      // Update existing & create a history snapshot if content changed
      updateNotesWithHistory((prev) =>
        prev.map((n) => {
          if (n.id !== editingNote.id) return n;

          const updatedHistory = sessionHistory(n, content, `session-${appSession.current}-${editorSession}`);

          return {
            ...n,
            content,
            tags: extractedTags,
            isPinned,
            isFavorite,
            history: updatedHistory,
            updatedAt: Date.now(),
          };
        })
      );
      if (!isAutoSave) {
        addToast('笔记修改已更新（已存为快照）', 'success');
        if (!saveFailedRef.current) setEditingNote(null);
      }
    } else {
      // Create new
      const newNote: Note = {
        id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        content,
        tags: extractedTags,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isPinned,
        isFavorite,
        workspaceId: settings.activeWorkspaceId || 'default',
        history: [],
      };
      updateNotesWithHistory((prev) => [newNote, ...prev]);
      setEditingNote(newNote);
      if (!isAutoSave) {
        addToast('笔记保存成功！', 'success');
        if (!saveFailedRef.current) setEditingNote(null);
      }
    }
    if (!saveFailedRef.current && initialComposerContent) {
      try { localStorage.removeItem(`flovenote_draft_${activeWorkspaceId}`); } catch {}
      window.dispatchEvent(new CustomEvent('flovenote-composer-saved', { detail: activeWorkspaceId }));
      setInitialComposerContent('');
    }
    return !saveFailedRef.current;
  };

  // Move to Trash (Soft Delete)
  const handleDeleteNote = (id: string) => {
    updateNotesWithHistory((prev) =>
      prev.map((n) => (n.id === id ? { ...n, deletedAt: Date.now() } : n))
    );
    addToast('已移至回收站（可存留7天并支持随时恢复）', 'info');
  };

  // Restore Note from Trash
  const handleRestoreNote = (id: string) => {
    updateNotesWithHistory((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        const { deletedAt, ...rest } = n;
        return rest as Note;
      })
    );
    addToast('已从回收站恢复随记笔记！', 'success');
  };

  // Permanently Delete Note
  const handlePermanentDeleteNote = (id: string) => {
    updateNotesWithHistory((prev) => prev.filter((n) => n.id !== id));
    addToast('已彻底删除该条笔记', 'info');
  };

  // Empty Trash
  const handleEmptyTrash = () => {
    updateNotesWithHistory((prev) => prev.filter((n) => !inWorkspace(n, activeWorkspaceId) || !n.deletedAt));
    addToast('已彻底清空回收站所有笔记', 'info');
  };

  const handleTogglePin = (id: string) => {
    updateNotesWithHistory((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isPinned: !n.isPinned } : n))
    );
  };

  const handleToggleFavorite = (id: string) => {
    updateNotesWithHistory((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isFavorite: !n.isFavorite } : n))
    );
  };

  const handleUpdateContentInline = (id: string, newContent: string) => {
    const updatedTags = extractTags(newContent);
    updateNotesWithHistory((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;

        let updatedHistory = n.history || [];
        if (n.content !== newContent) {
          const newSnapshot: NoteHistory = {
            id: `snap-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            content: n.content,
            timestamp: Date.now(),
          };
          updatedHistory = [newSnapshot, ...updatedHistory].slice(0, 20);
        }

        return {
          ...n,
          content: newContent,
          tags: updatedTags,
          history: updatedHistory,
          updatedAt: Date.now(),
        };
      })
    );
  };

  // Drag & Drop Operations
  const handleReorderNotes = (draggedId: string, targetId: string) => {
    updateNotesWithHistory((prev) => {
      const draggedIndex = prev.findIndex((n) => n.id === draggedId);
      const targetIndex = prev.findIndex((n) => n.id === targetId);
      if (draggedIndex === -1 || targetIndex === -1) return prev;

      const updated = [...prev];
      const [moved] = updated.splice(draggedIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return updated;
    });
    addToast('已调整笔记显示顺序', 'info');
  };

  const handleAddTagToNote = (noteId: string, tagName: string) => {
    updateNotesWithHistory((prev) =>
      prev.map((n) => {
        if (n.id !== noteId) return n;
        const tagFormatted = `#${tagName}`;
        if (n.tags.includes(tagName) || n.content.includes(tagFormatted)) {
          return n;
        }
        const updatedContent = `${n.content}\n\n${tagFormatted}`;
        const updatedTags = extractTags(updatedContent);
        return {
          ...n,
          content: updatedContent,
          tags: updatedTags,
          updatedAt: Date.now(),
        };
      })
    );
    addToast(`已成功为笔记归类至标签 #${tagName}`, 'success');
  };

  // Tag Operations
  const handleRenameTag = (oldTag: string, newTag: string) => {
    const updated = notes.map(note => inWorkspace(note, activeWorkspaceId) && !note.deletedAt ? renameTagInNotes([note], oldTag, newTag)[0] : note);
    updateNotesWithHistory(updated);
    addToast(`已重命名标签 #${oldTag} -> #${newTag}`, 'success');
  };

  const handleMergeTags = (sourceTag: string, targetTag: string) => {
    const updated = notes.map(note => inWorkspace(note, activeWorkspaceId) && !note.deletedAt ? mergeTagsInNotes([note], sourceTag, targetTag)[0] : note);
    updateNotesWithHistory(updated);
    addToast(`已合并标签 #${sourceTag} 到 #${targetTag}`, 'success');
  };

  const handleDeleteTag = (tag: string) => {
    const updated = notes.map(note => inWorkspace(note, activeWorkspaceId) && !note.deletedAt ? deleteTagFromNotes([note], tag)[0] : note);
    updateNotesWithHistory(updated);
    if (filterState.selectedTag === tag) {
      setFilterState((prev) => ({ ...prev, selectedTag: null }));
    }
    addToast(`已从所有笔记中移除标签 #${tag}`, 'info');
  };

  const handleDeleteAllTags = () => {
    const updated = notes.map(note => inWorkspace(note, activeWorkspaceId) && !note.deletedAt ? deleteAllTagsFromNotes([note])[0] : note);
    updateNotesWithHistory(updated);
    if (filterState.selectedTag) {
      setFilterState((prev) => ({ ...prev, selectedTag: null }));
    }
    addToast('已成功一键移除所有笔记中的全部标签！', 'info');
  };

  // Backup Export & Import
  const handleRestoreNotes = (value: unknown) => {
    try { setPendingBackup(parseLibraryBackup(value)); }
    catch (error) { addToast((error as Error).message, 'error'); }
  };

  const handleExportBackup = () => {
    if (hasStorageReadError()) { downloadFile('Stillnote_原始数据.json', getRawNotesBackup(), 'application/json'); return; }
    const backup = createLibraryBackup(notesRef.current, settings);
    downloadFile(`Stillnote_FullBackup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), 'application/json');
    const initiated=Date.now();setLastBackupAt(initiated);try{localStorage.setItem('stillnote_last_backup',String(initiated));}catch{addToast('备份已发起，但备份时间记录保存失败','info');}
    addToast('已导出 JSON 数据全量备份！', 'success');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        handleRestoreNotes(parsed);
      } catch (err) {
        addToast('读取 JSON 备份文件失败', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Open Editor
  const handleOpenFullEditor = (initialContent?: string) => {
    try { const pending=JSON.parse(localStorage.getItem(`flovenote_editor_draft_${activeWorkspaceId}_new`)||'null');if(initialContent&&pending?.content?.trim()&&pending.content!==initialContent)addToast('已优先恢复未完成草稿；保存后可再选择新模板。','info'); } catch {}

    setEditorSession(value => value + 1);
    setEditingNote(null);
    setInitialComposerContent(initialContent || '');
    setIsEditorOpen(true);
  };

  const handleEditNoteCard = (note: Note) => {
    setEditorSession(value => value + 1);
    setEditingNote(note);
    setIsEditorOpen(true);
  };

  const fontFamilyClass =
    settings.fontFamily === 'serif'
      ? 'font-serif'
      : settings.fontFamily === 'mono'
      ? 'font-mono'
      : 'font-sans';

  return (
    <div className={`stillnote-app min-h-screen bg-slate-100/70 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 flex ${fontFamilyClass} ${settings.fontFamily==='serif'?'sn-reading-serif':'sn-reading-standard'} selection:bg-indigo-500/20 selection:text-indigo-600 dark:selection:text-indigo-300`}>
      {/* Sidebar Navigation */}
      <Sidebar
        workspaceCounts={workspaceCounts}
        notes={workspaceNotes}
        tags={allTagInfos}
        activeCategory={filterState.category}
        activeTag={filterState.selectedTag}
        totalNotesCount={workspaceNotes.filter((n) => !n.deletedAt).length}
        pinnedNotesCount={workspaceNotes.filter((n) => !n.deletedAt && n.isPinned).length}
        favoriteNotesCount={workspaceNotes.filter((n) => !n.deletedAt && n.isFavorite).length}
        trashNotesCount={workspaceNotes.filter((n) => Boolean(n.deletedAt)).length}
        workspaces={settings.workspaces || []}
        activeWorkspaceId={settings.activeWorkspaceId || 'default'}
        theme={theme}
        showStatsCard={settings.showStatsCard}
        selectedDate={filterState.dateFilter}
        onSelectDate={(dateStr) => setFilterState((prev) => ({ ...prev, dateFilter: dateStr }))}
        onSelectCategory={(cat) => setFilterState((prev) => ({ ...prev, category: cat }))}
        onSelectTag={(tag) => setFilterState((prev) => ({ ...prev, selectedTag: tag }))}
        onSelectWorkspace={(wsId) => setSettings((prev) => ({ ...prev, activeWorkspaceId: wsId }))}
        onOpenWorkspacesManager={() => {
          setSettingsTab('workspaces');
          setIsSettingsOpen(true);
        }}
        onOpenTagManager={() => setIsTagManagerOpen(true)}
        onOpenTagCloud={() => setIsTagCloudModalOpen(true)}
        onOpenAnalyticsModal={() => setIsAnalyticsModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenResourceManager={() => setIsResourceManagerOpen(true)}
        onOpenSettings={() => {
          setSettingsTab('editor');
          setIsSettingsOpen(true);
        }}
        onOpenSponsorModal={() => setIsSponsorModalOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onToggleTheme={toggleTheme}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onAddTagToNote={handleAddTagToNote}
      />

      {/* Main Timeline View */}
      <main className="flex-1 min-w-0">
      <TimelineFeed
        saveFailed={saveFailed}
        workspaces={settings.workspaces} lastWriteAt={writeTimes[activeWorkspaceId]} folderAuthorized={!!directoryHandles[activeWorkspaceId]}
        onOpenStorage={()=>{setSettingsTab('paths');setIsSettingsOpen(true);}} lastBackupAt={lastBackupAt}
        backupDue={notes.some(n=>!n.deletedAt)&&(!lastBackupAt||Date.now()-lastBackupAt>7*86400000)}
        onBatchAction={(ids,action,value)=>{try{const next=applyBatchChange(notesRef.current,ids,activeWorkspaceId,action,value,(settings.workspaces||[]).map(w=>w.id));const ok=updateNotesWithHistory(next);if(ok)addToast('批量操作已保存，可使用撤销恢复','success');return ok;}catch(error){addToast((error as Error).message,'error');return false;}}}
        folderSynced={syncedContents[activeWorkspaceId] === JSON.stringify(workspaceNotes)}
        onRetrySave={() => updateNotesWithHistory(notesRef.current)}
        onExportBackup={handleExportBackup}
        workspaceId={activeWorkspaceId}
        notes={filteredNotes}
        allNotes={activeNotes}
        filterState={filterState}
        viewMode={viewMode}
        allTags={allTagNames}
        onFilterChange={(updates) => setFilterState((prev) => ({ ...prev, ...updates }))}
        onViewModeChange={setViewMode}
        onPublishNote={handleCreateNote}
        onEditNote={handleEditNoteCard}
        onDeleteNote={handleDeleteNote}
        onRestoreNote={handleRestoreNote}
        onPermanentDeleteNote={handlePermanentDeleteNote}
        onTogglePin={handleTogglePin}
        onToggleFavorite={handleToggleFavorite}
        onUpdateContent={handleUpdateContentInline}
        onOpenFullEditor={handleOpenFullEditor}
        onTagClick={(tag) => setFilterState((prev) => ({ ...prev, selectedTag: tag }))}
        onBiLinkClick={handleBiLinkClick}
        onShowToast={addToast}
        onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
        onOpenFocusMode={(note) => setFocusedNote(note)}
        onExportImage={(note) => setExportingCardNote(note)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onReorderNotes={handleReorderNotes}
        onOpenHelpGuide={() => {
          setSettingsTab('help');
          setIsSettingsOpen(true);
        }}
        codeBlockTheme={settings.codeBlockTheme}
        tableTheme={settings.tableTheme}
        autoFoldLongNotes={settings.autoFoldLongNotes}
        onToggleAutoFold={() => setSettings((prev) => ({ ...prev, autoFoldLongNotes: !prev.autoFoldLongNotes }))}
      />

      </main>
      <Suspense fallback={<div role="status" className="fixed bottom-4 right-4 bg-white dark:bg-zinc-800 p-4 rounded-xl shadow-lg">正在打开…</div>}>
      {pendingBackup && <ImportBackupModal backup={pendingBackup} notes={notes} settings={settings} onClose={() => setPendingBackup(null)} onConfirm={plan => {
        if (!saveLibraryToStorage(plan.notes, plan.settings)) return false;
        updateNotesWithHistory(plan.notes);
        setSettings(plan.settings);
        setDirectoryHandles({}); setSyncedContents({});
        setPendingBackup(null);
        addToast(`导入完成：加入 ${plan.added} 条笔记`, 'success');
        return true;
      }} />}
      {/* Focus Mode Overlay */}
      {focusedNote && (
        <FocusModeModal
          note={notes.find((n) => n.id === focusedNote.id) || focusedNote}
          allNotes={filteredNotes}
          onClose={() => setFocusedNote(null)}
          onEditNote={handleEditNoteCard}
          onDeleteNote={(id) => {
            handleDeleteNote(id);
            setFocusedNote(null);
          }}
          onTogglePin={handleTogglePin}
          onToggleFavorite={handleToggleFavorite}
          onUpdateContent={(id, newContent) => {
            handleUpdateContentInline(id, newContent);
            setFocusedNote((prev) => (prev && prev.id === id ? { ...prev, content: newContent } : prev));
          }}
          onSelectNote={(n) => setFocusedNote(n)}
          onTagClick={(tag) => setFilterState((prev) => ({ ...prev, selectedTag: tag }))}
          onBiLinkClick={handleBiLinkClick}
          onShowToast={addToast}
        />
      )}

      {/* Modals & Popups */}
      {isEditorOpen && (
      <NoteEditorModal key={editorSession}
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingNote(null);
        }}
        note={notes.find(n=>n.id===editingNote?.id)||editingNote}
        initialContent={initialComposerContent}
        workspaceId={activeWorkspaceId}
        allNotes={activeNotes}
        onSave={handleSaveEditorNote}
        allExistingTags={allTagNames}
        onShowToast={addToast}
        onBiLinkClick={handleBiLinkClick}
        editorFontSize={settings.editorFontSize}
        autoSaveEnabled={settings.autoSaveEnabled}
        autoSaveDelay={settings.autoSaveDelay}
      />
      )}

      {!!exportingCardNote && (
      <NoteExportCardModal
        isOpen={!!exportingCardNote}
        onClose={() => setExportingCardNote(null)}
        note={exportingCardNote}
        onShowToast={addToast}
        codeBlockTheme={settings.codeBlockTheme}
        tableTheme={settings.tableTheme}
      />
      )}

      {isAnalyticsModalOpen && (
      <AnalyticsModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => setIsAnalyticsModalOpen(false)}
        notes={workspaceNotes}
        selectedDate={filterState.dateFilter}
        onSelectDate={(dateStr) => setFilterState((prev) => ({ ...prev, dateFilter: dateStr }))}
      />
      )}

      {isTagManagerOpen && (
      <TagManagerModal
        isOpen={isTagManagerOpen}
        onClose={() => setIsTagManagerOpen(false)}
        tags={allTagInfos}
        onRenameTag={handleRenameTag}
        onMergeTags={handleMergeTags}
        onDeleteTag={handleDeleteTag}
        onDeleteAllTags={handleDeleteAllTags}
        onOpenTagCloud={() => setIsTagCloudModalOpen(true)}
      />
      )}

      {isTagCloudModalOpen && (
      <TagCloudModal
        isOpen={isTagCloudModalOpen}
        onClose={() => setIsTagCloudModalOpen(false)}
        tags={allTagInfos}
        notes={workspaceNotes}
        activeTag={filterState.selectedTag}
        onSelectTag={(tag) => setFilterState((prev) => ({ ...prev, selectedTag: tag }))}
        onOpenTagManager={() => setIsTagManagerOpen(true)}
        onShowToast={addToast}
      />
      )}

      {isExportModalOpen && (
      <BatchExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        notes={filteredNotes.filter(n=>!n.deletedAt)}
        onOpenBackups={()=>{setSettingsTab('backups');setIsSettingsOpen(true);}}
        onImportBackup={handleRestoreNotes}
      />
      )}

      {isResourceManagerOpen && (
        <ResourceManagerModal
          notes={notes}
          onClose={() => setIsResourceManagerOpen(false)}
          onCreateNoteWithImage={(imageUrl, altText) => {
            setEditorSession(value => value + 1);
            setInitialComposerContent(`![${altText || '图片资源'}](${imageUrl})\n\n`);
            setEditingNote(null);
            setIsEditorOpen(true);
            addToast('已将图片代入新建笔记编辑器', 'success');
          }}
          onShowToast={addToast}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          notes={workspaceNotes}
          key={activeWorkspaceId}
          activeDirHandle={directoryHandles[activeWorkspaceId]}
          onSaveDirHandle={handle => { setDirectoryHandles(prev => ({ ...prev, [activeWorkspaceId]: handle })); setSyncedContents(prev => ({ ...prev, [activeWorkspaceId]: "" })); }}
          onImportNotes={handleRestoreNotes}
          workspaceCounts={workspaceCounts}
          lastBackupAt={lastBackupAt} lastWriteAt={writeTimes[activeWorkspaceId]} onOpenTemplate={handleOpenFullEditor}
          onWorkspaceSynced={() => {setSyncedContents(prev => ({ ...prev, [activeWorkspaceId]: JSON.stringify(workspaceNotes) }));const next={...writeTimes,[activeWorkspaceId]:Date.now()};setWriteTimes(next);try{localStorage.setItem('stillnote_write_times',JSON.stringify(next));}catch{addToast('文件夹写入成功，但时间记录保存失败','info');}}}
          initialTab={settingsTab}
          onUpdateSettings={setSettings}
          theme={theme}
          onToggleTheme={toggleTheme}
          onClose={() => setIsSettingsOpen(false)}
          onResetSampleData={handleResetSampleData}
          onShowToast={addToast}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          onSelectDateFilter={(date) => {
            setFilterState((prev) => ({ ...prev, dateFilter: date }));
            setIsSettingsOpen(false);
          }}
          onRestoreNote={handleRestoreNote}
          onPermanentDeleteNote={handlePermanentDeleteNote}
          onEmptyTrash={handleEmptyTrash}
          onSwitchWorkspace={(wsId) => setSettings((s) => ({ ...s, activeWorkspaceId: wsId }))}
          onAddWorkspace={(ws) =>
            setSettings((s) => ({
              ...s,
              workspaces: [...(s.workspaces || []), ws],
              activeWorkspaceId: ws.id,
            }))
          }
          onDeleteWorkspace={wsId => {
            if (notes.some(note => inWorkspace(note, wsId))) { addToast('此工作区仍有笔记或回收站记录，请先处理后再移除。', 'info'); return; }
            setSettings(previous => ({ ...previous, workspaces: (previous.workspaces || []).filter(workspace => workspace.id !== wsId), activeWorkspaceId: previous.activeWorkspaceId === wsId ? 'default' : previous.activeWorkspaceId }));
          }}
          />
      )}

      {isSponsorModalOpen && (
      <SponsorAuthorModal
        isOpen={isSponsorModalOpen}
        onClose={() => setIsSponsorModalOpen(false)}
        onShowToast={addToast}
      />
      )}

      {isCommandPaletteOpen && (
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        notes={workspaceNotes}
        onSelectNote={handleEditNoteCard}
        onCreateNewNote={() => handleOpenFullEditor()}
        onSetSearchKeyword={(kw) => setFilterState((prev) => ({ ...prev, searchKeyword: kw }))}
        onSetViewMode={(mode) => setViewMode(mode)}
        onSetCategoryFilter={(cat) => setFilterState((prev) => ({ ...prev, category: cat }))}
        onResetFilters={() =>
          setFilterState({ searchKeyword: '', selectedTag: null, category: 'all', sortBy: 'newest' })
        }
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAnalytics={() => setIsAnalyticsModalOpen(true)}
        onOpenResourceManager={() => setIsResourceManagerOpen(true)}
        onOpenTagCloud={() => setIsTagCloudModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenSponsorModal={() => setIsSponsorModalOpen(true)}
        onToggleTheme={toggleTheme}
        theme={theme}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onShowToast={addToast}
      />
      )}

      </Suspense>
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
