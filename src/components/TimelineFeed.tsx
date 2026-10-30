import { SearchTools, BatchTools, BatchAction } from './LibraryTools';
import { NOTE_TEMPLATES } from '../utils/product';
import { rememberSearch } from '../utils/searchPreferences';
import React, { useState } from 'react';
import { Note, FilterState, ViewMode, CodeBlockThemeId, TableThemeId } from '../types';
import { TopComposer } from './TopComposer';
import { NoteCard } from './NoteCard';
import { groupNotesByDate, getIsoWeekString, getMonthString, formatWeekLabel, formatMonthLabel } from '../utils/markdownUtils';
import { Search, X, Menu, CheckCircle2, SlidersHorizontal, ArrowDownWideNarrow, ChevronDown, Download, Command, Plus } from 'lucide-react';

interface TimelineFeedProps {
  workspaces?: import('../types').Workspace[];
  onBatchAction?: (ids:string[],action:BatchAction,value?:string)=>boolean;
  lastWriteAt?: number;
  folderAuthorized?: boolean;
  onOpenStorage?: () => void;
  lastBackupAt?: number;
  backupDue?: boolean;
  saveFailed?: boolean;
  folderSynced?: boolean;
  onRetrySave?: () => void;
  onExportBackup?: () => void;
  workspaceId: string;
  notes: Note[];
  allNotes?: Note[];
  filterState: FilterState;
  viewMode: ViewMode;
  allTags: string[];
  onFilterChange: (updates: Partial<FilterState>) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onPublishNote: (content: string) => boolean;
  onEditNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
  onRestoreNote?: (id: string) => void;
  onPermanentDeleteNote?: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onUpdateContent: (id: string, newContent: string) => void;
  onOpenFullEditor: (initialContent?: string) => void;
  onTagClick: (tag: string) => void;
  onBiLinkClick?: (title: string) => void;
  onShowToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  onOpenMobileMenu: () => void;
  onOpenFocusMode?: (note: Note) => void;
  onExportImage?: (note: Note) => void;
  onOpenCommandPalette?: () => void;
  onReorderNotes?: (draggedId: string, targetId: string) => void;
  onOpenHelpGuide?: () => void;
  onImportAllCaseDocuments?: () => void;
  codeBlockTheme?: CodeBlockThemeId;
  tableTheme?: TableThemeId;
  autoFoldLongNotes?: boolean;
  onToggleAutoFold?: () => void;
}

export const TimelineFeed: React.FC<TimelineFeedProps> = ({
  workspaceId, workspaces=[], onBatchAction, lastWriteAt, folderAuthorized, onOpenStorage, lastBackupAt, backupDue,
  saveFailed, folderSynced, onRetrySave, onExportBackup,
  notes,
  allNotes = [],
  filterState,
  viewMode,
  allTags,
  onFilterChange,
  onViewModeChange,
  onPublishNote,
  onEditNote,
  onDeleteNote,
  onRestoreNote,
  onPermanentDeleteNote,
  onTogglePin,
  onToggleFavorite,
  onUpdateContent,
  onOpenFullEditor,
  onTagClick,
  onBiLinkClick,
  onShowToast,
  onOpenMobileMenu,
  onOpenFocusMode,
  onExportImage,
  onOpenCommandPalette,
  onReorderNotes,
  onOpenHelpGuide,
  onImportAllCaseDocuments,
  codeBlockTheme,
  tableTheme,
  autoFoldLongNotes = false,
  onToggleAutoFold,
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const groups = groupNotesByDate(notes);
  const weeks = [...new Set(allNotes.map(note => getIsoWeekString(new Date(note.createdAt))))].sort().reverse();
  const months = [...new Set(allNotes.map(note => getMonthString(new Date(note.createdAt))))].sort().reverse();
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date()) + '，' + new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(new Date());
  const reset = () => onFilterChange({ searchKeyword: '', selectedTag: null, dateFilter: null, weekFilter: null, monthFilter: null, category: 'all' });
  const filtered = filterState.searchKeyword || filterState.selectedTag || filterState.dateFilter || filterState.weekFilter || filterState.monthFilter || filterState.category !== 'all';
  const title = filterState.category === 'trash' ? '留一点余地，也留一份安心。' : filterState.category === 'favorites' ? '值得再次翻开的片刻。' : filterState.category === 'pinned' ? '把重要的想法，放在眼前。' : '留住一闪而过的想法。';
  return <div className="sn-journal">
    <header className="sn-topbar">
      <button className="sn-icon-button sn-mobile-menu" aria-label="打开导航菜单" onClick={onOpenMobileMenu}><Menu size={20} /></button>
      <div className="sn-search"><Search size={19} /><input aria-label="搜索笔记正文或标签" placeholder="搜索笔记、标签或内容…" value={filterState.searchKeyword} onBlur={()=>{try{rememberSearch(workspaceId,filterState.searchKeyword);}catch{onShowToast("最近搜索保存失败", "error");}}} onKeyDown={e=>{if(e.key==='Enter'){try{rememberSearch(workspaceId,filterState.searchKeyword);}catch{onShowToast("最近搜索保存失败", "error");}}}} onChange={event => onFilterChange({ searchKeyword: event.target.value })} />{filterState.searchKeyword ? <button className="sn-icon-button" aria-label="清除搜索" onClick={() => onFilterChange({ searchKeyword: '' })}><X size={15} /></button> : <button className="sn-search-shortcut" aria-label="打开命令面板" onClick={onOpenCommandPalette}>⌘ K</button>}</div>
      <details className="sn-save-menu"><summary className={saveFailed ? 'sn-error' : ''}><CheckCircle2 size={16} /><span>{saveFailed ? '保存失败' : '已保存'}</span><ChevronDown size={12} /></summary><div className="sn-popover"><p className="sn-caption" role="status">{saveFailed ? '内容暂留在页面，请重试或导出。' : '笔记已保存在此浏览器。'}<br />{folderAuthorized ? folderSynced ? '文件夹内容已更新' : '文件夹有待写入内容' : '文件夹未授权（仅保存在浏览器）'}<br/>最后成功写入：{lastWriteAt?new Date(lastWriteAt).toLocaleString():'暂无记录'}</p>{saveFailed && <button className="sn-menu-item" onClick={onRetrySave}>重试保存</button>}<button className="sn-menu-item" onClick={onOpenStorage}>管理文件夹存储</button><button className="sn-menu-item" onClick={onExportBackup}><Download size={15} />导出全量备份</button></div></details>
      <time className="sn-current-date">{date}</time>
    </header>
    {saveFailed && <div className="sn-error-banner" role="alert">保存未完成，请保留页面。<button onClick={onRetrySave}>重试</button><button onClick={onExportBackup}>导出备份</button></div>}
    <section className="sn-introduction"><h1>{title}</h1><p>{filterState.category === 'trash' ? '回收站中的笔记保留七天，你可以随时恢复。' : '随手记录，认真生活。'}</p></section>
    {filterState.category !== 'trash' && <TopComposer key={workspaceId} workspaceId={workspaceId} onPublish={onPublishNote} onOpenFullEditor={onOpenFullEditor} allExistingTags={allTags} />}
    <div className="sn-library-actions"><details><summary>从模板开始</summary><div className="sn-setting-card flex gap-3 flex-wrap">{NOTE_TEMPLATES.map(t=><button key={t.name} className="sn-text-button" onClick={()=>onOpenFullEditor(t.content)}>{t.name}</button>)}</div></details><SearchTools key={'search-'+workspaceId} workspace={workspaceId} filter={filterState} onApply={onFilterChange} onError={message=>onShowToast(message,'error')}/>{filterState.category!=='trash'&&onBatchAction&&<BatchTools key={'batch-'+workspaceId} notes={notes} workspaces={workspaces} onAction={onBatchAction}/>}</div>
    {backupDue&&<div className="sn-backup-reminder" role="status">{lastBackupAt?'距上次备份已超过 7 天。':'尚未记录全量备份。'}<button className="sn-text-button" onClick={onExportBackup}>下载备份</button></div>}
    <div className="sn-feed-tools"><span>{filterState.searchKeyword ? `找到 ${notes.length} 条匹配笔记` : filterState.selectedTag ? `# ${filterState.selectedTag}` : '我的随记'}</span><div><button className="sn-text-button" onClick={() => onFilterChange({ sortBy: filterState.sortBy === 'newest' ? 'oldest' : 'newest' })}><ArrowDownWideNarrow size={15} /><span>{filterState.sortBy === 'newest' ? '最新在前' : '最早在前'}</span></button><button className="sn-text-button" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={15} />筛选</button></div></div>
    {showFilters && <div className="sn-filter-panel">
      <label>标签<select value={filterState.selectedTag || ''} onChange={event => onFilterChange({ selectedTag: event.target.value || null })}><option value="">全部标签</option>{allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}</select></label>
      <label>按周<select value={filterState.weekFilter || ''} onChange={event => onFilterChange({ weekFilter: event.target.value || null, monthFilter: null, dateFilter: null })}><option value="">全部周</option>{weeks.map(week => <option key={week} value={week}>{formatWeekLabel(week)}</option>)}</select></label>
      <label>按月<select value={filterState.monthFilter || ''} onChange={event => onFilterChange({ monthFilter: event.target.value || null, weekFilter: null, dateFilter: null })}><option value="">全部月</option>{months.map(month => <option key={month} value={month}>{formatMonthLabel(month)}</option>)}</select></label>
      <label className="sn-check-label"><input type="checkbox" checked={autoFoldLongNotes} onChange={onToggleAutoFold} />折叠长笔记</label>
      {onOpenHelpGuide && <button className="sn-text-button" onClick={onOpenHelpGuide}>使用帮助</button>}
    </div>}
    {filtered && <div className="sn-active-filters" role="status"><span>{filterState.searchKeyword && `搜索「${filterState.searchKeyword}」 `}{filterState.selectedTag && `#${filterState.selectedTag} `}{filterState.dateFilter || filterState.weekFilter || filterState.monthFilter || ''}{filterState.category !== 'all' ? ` · ${filterState.category === 'trash' ? '回收站' : filterState.category === 'favorites' ? '收藏' : '置顶'}` : ''}</span><button onClick={reset}>清除筛选<X size={12} /></button></div>}
    {!notes.length ? <section className="sn-empty"><span className="sn-caption">A LITTLE SPACE FOR YOUR THOUGHTS</span><h2>{filtered ? '这里暂时安静。' : '从一个小小的想法开始。'}</h2><p>{filtered ? '试着换个关键词，或清除筛选看看。' : '写一句话，记一个瞬间。你的灵感会在这里慢慢积累。'}</p>{filtered ? <button className="sn-text-button" onClick={reset}>查看全部笔记</button> : <button className="sn-text-button" onClick={() => onOpenFullEditor()}>打开完整编辑器<Plus size={15} /></button>}</section> : <div className="sn-feed">{groups.map(group => <section key={group.label} className="sn-day-group"><header className="sn-day-heading"><h2>{group.label}</h2><span>{group.label === '今天' ? date : `${group.notes.length} 条随记`}</span></header>{group.notes.map(note => <NoteCard key={note.id} note={note} searchQuery={filterState.searchKeyword} allNotes={allNotes} onEdit={onEditNote} onDelete={onDeleteNote} onRestore={onRestoreNote} onPermanentDelete={onPermanentDeleteNote} onTogglePin={onTogglePin} onToggleFavorite={onToggleFavorite} onUpdateContent={onUpdateContent} onTagClick={onTagClick} onBiLinkClick={onBiLinkClick} onShowToast={onShowToast} onFocusMode={onOpenFocusMode} onExportImage={onExportImage} onDragStartNote={() => setDragged(note.id)} onDragOverNote={() => setOver(note.id)} onDropNote={(event, target) => { const source = event.dataTransfer.getData('text/plain') || dragged; if (source && source !== target) onReorderNotes?.(source, target); setDragged(null); setOver(null); }} isDragOver={over === note.id} codeBlockTheme={codeBlockTheme} tableTheme={tableTheme} autoFoldLongNotes={autoFoldLongNotes} />)}</section>)}</div>}
  </div>;
};
