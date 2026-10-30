import React, { useRef, useState } from 'react';
import { Note, CodeBlockThemeId, TableThemeId } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { exportNotesContent, downloadFile } from '../utils/markdownUtils';
import { highlightParts, searchSnippet } from '../utils/search';
import { Edit3, MoreHorizontal, Star, Pin, Maximize2, Download, Copy, Trash2, RotateCcw, History, Image, ChevronDown } from 'lucide-react';

interface NoteCardProps {
  searchQuery?: string;
  note: Note;
  allNotes?: Note[];
  onEdit: (note: Note) => void;
  onDelete: (id: string) => void;
  onRestore?: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onUpdateContent: (id: string, newContent: string) => void;
  onTagClick: (tag: string) => void;
  onBiLinkClick?: (title: string) => void;
  onShowToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  onFocusMode?: (note: Note) => void;
  onExportImage?: (note: Note) => void;
  onDragStartNote?: (e: React.DragEvent, noteId: string) => void;
  onDragOverNote?: (e: React.DragEvent, noteId: string) => void;
  onDropNote?: (e: React.DragEvent, targetNoteId: string) => void;
  isDragOver?: boolean;
  codeBlockTheme?: CodeBlockThemeId;
  tableTheme?: TableThemeId;
  autoFoldLongNotes?: boolean;
}


export const NoteCard: React.FC<NoteCardProps> = (props) => {
  const { note, searchQuery = '', onEdit, onDelete, onRestore, onPermanentDelete, onTogglePin, onToggleFavorite, onTagClick, onBiLinkClick, onUpdateContent, onShowToast, onFocusMode, onExportImage, autoFoldLongNotes, codeBlockTheme, tableTheme } = props;
  const [expanded, setExpanded] = useState(false);
  const card = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const cursor = useRef(0);
  const folded = autoFoldLongNotes && note.content.length > 500 && !expanded;
  const snippet = searchSnippet(note.content, searchQuery);
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(note.createdAt));
  const closeMenu = () => { if (menu.current) menu.current.open = false; };
  const action = (callback: () => void) => { callback(); closeMenu(); };
  const exportMarkdown = () => { const result = exportNotesContent([note], 'md'); downloadFile(result.filename, result.content, result.mimeType); closeMenu(); };
  return <article ref={card} className={`sn-note ${props.isDragOver ? 'is-drag-over' : ''}`} onDragOver={event => { event.preventDefault(); props.onDragOverNote?.(event, note.id); }} onDrop={event => { event.preventDefault(); props.onDropNote?.(event, note.id); }}>
    <div className="sn-note-meta"><time dateTime={new Date(note.createdAt).toISOString()} title={new Date(note.createdAt).toLocaleString('zh-CN')} draggable onDragStart={event => { event.dataTransfer.setData('text/plain', note.id); props.onDragStartNote?.(event, note.id); }}>{time}</time>{note.isPinned && <Pin size={13} aria-label="已置顶" />}{note.isFavorite && <Star size={13} aria-label="已收藏" />}{!!note.history?.length && <button className="sn-history-link" title={`${note.history.length} 条历史版本`} aria-label="查看历史版本" onClick={() => onEdit(note)}><History size={12} /></button>}</div>
    <div className="sn-note-main">
      <div className="sn-note-actions">{note.deletedAt ? <><button className="sn-icon-button" title="恢复笔记" onClick={() => onRestore?.(note.id)}><RotateCcw size={17} /></button><button className="sn-icon-button" title="永久删除笔记" onClick={() => { if (window.confirm('此笔记将永久删除，是否继续？')) onPermanentDelete?.(note.id); }}><Trash2 size={17} /></button></> : <><button className="sn-icon-button" title="编辑此笔记" aria-label="编辑此笔记" onClick={() => onEdit(note)}><Edit3 size={17} /></button><details ref={menu} className="sn-note-menu" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeMenu(); } }}><summary className="sn-icon-button" aria-label="更多笔记操作"><MoreHorizontal size={18} /></summary><div className="sn-popover">
        <button className="sn-menu-item" onClick={() => action(() => onToggleFavorite(note.id))}><Star size={15} />{note.isFavorite ? '取消收藏' : '收藏笔记'}</button>
        <button className="sn-menu-item" onClick={() => action(() => onTogglePin(note.id))}><Pin size={15} />{note.isPinned ? '取消置顶' : '置顶笔记'}</button>
        {onFocusMode && <button className="sn-menu-item" onClick={() => action(() => onFocusMode(note))}><Maximize2 size={15} />专注阅读</button>}
        {onExportImage && <button className="sn-menu-item" onClick={() => action(() => onExportImage(note))}><Image size={15} />导出图片 / PDF</button>}
        <button className="sn-menu-item" onClick={exportMarkdown}><Download size={15} />导出 Markdown</button>
        <button className="sn-menu-item" onClick={async () => { try { await navigator.clipboard.writeText(note.content); onShowToast('已复制 Markdown 正文', 'success'); closeMenu(); } catch { onShowToast('复制失败，请在编辑器中选择内容复制。', 'error'); } }}><Copy size={15} />复制正文</button>
        <button className="sn-menu-item sn-danger" onClick={() => action(() => onDelete(note.id))}><Trash2 size={15} />移至回收站</button>
      </div></details></>}</div>
      {note.deletedAt && <p className="sn-caption">回收站 · 七天内可恢复</p>}
      {searchQuery.trim() && <div className="sn-note-match"><p>{highlightParts(snippet || '匹配到源码，可在编辑器中查看。', searchQuery).map((part, index) => part.match ? <mark key={index}>{part.text}</mark> : part.text)}</p><button onClick={() => { setExpanded(true); requestAnimationFrame(() => { const marks = card.current?.querySelectorAll<HTMLElement>('[data-search-match]'); if (!marks?.length) { onEdit(note); return; } const target = marks[cursor.current++ % marks.length]; target.scrollIntoView({ block: 'center', behavior: 'smooth' }); target.tabIndex = -1; target.focus({ preventScroll: true }); }); }}>定位 / 下一处匹配</button></div>}
      <div className={`sn-note-body ${folded ? 'is-folded' : ''}`}><MarkdownRenderer content={note.content} searchQuery={searchQuery} onTagClick={onTagClick} onBiLinkClick={onBiLinkClick} onTaskToggle={content => onUpdateContent(note.id, content)} codeBlockTheme={codeBlockTheme} tableTheme={tableTheme} /></div>
      {autoFoldLongNotes && note.content.length > 500 && <button className="sn-text-button" onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : '展开全文'}<ChevronDown size={13} /></button>}
    </div>
  </article>;
};
