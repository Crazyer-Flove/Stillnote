import React, { useState } from 'react';
import {SidebarMenu} from './SidebarMenu';
import { TagInfo, ViewCategory, ThemeMode, Note, Workspace } from '../types';
import { FileText, Star, Pin, Tag, Hash, Settings, Download, Heart, Trash2, ChevronDown, Plus, X, Search, Sun, Moon, PanelLeftClose, PanelLeft, Folder, BarChart2, Image, Command } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

interface SidebarProps {
  notes: Note[];
  workspaceCounts?: Record<string, number>;
  tags: TagInfo[];
  activeCategory: ViewCategory;
  activeTag: string | null;
  totalNotesCount: number;
  pinnedNotesCount: number;
  favoriteNotesCount: number;
  trashNotesCount?: number;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
  theme: ThemeMode;
  showStatsCard?: boolean;
  selectedDate?: string | null;
  onSelectDate?: (dateStr: string | null) => void;
  onSelectCategory: (category: ViewCategory) => void;
  onSelectTag: (tag: string | null) => void;
  onSelectWorkspace?: (workspaceId: string) => void;
  onOpenWorkspacesManager?: () => void;
  onOpenTagManager: () => void;
  onOpenTagCloud?: () => void;
  onOpenAnalyticsModal?: () => void;
  onOpenExportModal: () => void;
  onOpenResourceManager?: () => void;
  onOpenSettings: () => void;
  onOpenSponsorModal?: () => void;
  onOpenCommandPalette?: () => void;
  onToggleTheme: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onAddTagToNote?: (noteId: string, tagName: string) => void;
}


export const Sidebar: React.FC<SidebarProps> = (props) => {
  const { tags, activeCategory, activeTag, workspaces = [], activeWorkspaceId = 'default', workspaceCounts = {}, isMobileOpen, onCloseMobile } = props;
  const [collapsed, setCollapsed] = useState(()=>{try{return localStorage.getItem('stillnote_sidebar_collapsed')==='true';}catch{return false;}});
  React.useEffect(()=>{try{localStorage.setItem('stillnote_sidebar_collapsed',String(collapsed));}catch{}},[collapsed]);
  const [sidebarWidth,setSidebarWidth]=useState(()=>{try{return Math.max(210,Math.min(360,Number(localStorage.getItem('stillnote_sidebar_width'))||260));}catch{return 260;}});
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [tools, setTools] = useState(false);
  const [menuAnchor,setMenuAnchor]=useState<HTMLElement|null>(null);
  const mobileRef = useDialog(isMobileOpen, onCloseMobile);
  const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId);
  const go = (action: () => void) => { action(); onCloseMobile(); };
  const nav = [
    { id: 'all', label: '全部笔记', icon: FileText, count: props.totalNotesCount },
    { id: 'favorites', label: '收藏笔记', icon: Star, count: props.favoriteNotesCount },
    { id: 'pinned', label: '置顶笔记', icon: Pin, count: props.pinnedNotesCount },
  ] as const;
  const content = (mobile = false) => <aside style={!mobile&&!collapsed?{width:sidebarWidth}:undefined} className={`sn-sidebar ${collapsed && !mobile ? 'is-collapsed' : ''}`} aria-label="主导航">
    <div className="sn-brand-row">
      {(!collapsed||mobile)&&<a href="#" onClick={event => { event.preventDefault(); go(() => { props.onSelectCategory('all'); props.onSelectTag(null); }); }} className="sn-brand" aria-label="Stillnote 首页"><FileText size={20}/><span>Stillnote</span></a>}
      <button className="sn-icon-button sn-collapse" aria-label={mobile ? '关闭导航' : collapsed ? '展开导航' : '收起导航'} onClick={() => mobile ? onCloseMobile() : setCollapsed(!collapsed)}>{mobile ? <X size={17} /> : collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}</button>
    </div>
    <div className="sn-workspace">
      <button className="sn-workspace-trigger" aria-label={`工作区：${activeWorkspace?.name||'默认工作区'}`} aria-expanded={workspaceMenu} onClick={event => {setMenuAnchor(event.currentTarget);setTools(false);setWorkspaceMenu(!workspaceMenu);}} title={`当前工作区：${activeWorkspace?.name || '个人空间'}`}><Folder size={18} />{(!collapsed || mobile) && <><span>{activeWorkspace?.name === '默认工作区' ? '个人空间' : activeWorkspace?.name || '个人空间'}</span><ChevronDown size={14} /></>}</button>
      {workspaceMenu && menuAnchor && <SidebarMenu anchor={menuAnchor} label="切换工作区" onClose={()=>setWorkspaceMenu(false)}>
        <p className="sn-caption">切换工作区</p>
        {workspaces.map(workspace => <button key={workspace.id} className="sn-menu-item" onClick={() => { props.onSelectWorkspace?.(workspace.id); setWorkspaceMenu(false); onCloseMobile(); }}><span>{workspace.name}</span><small>{workspaceCounts[workspace.id] || 0}</small></button>)}
        <button className="sn-menu-item" onClick={() => go(() => { setWorkspaceMenu(false); props.onOpenWorkspacesManager?.(); })}><Plus size={15} />管理工作区</button>
      </SidebarMenu>}
    </div>
    <nav className="sn-nav">
      {nav.map(item => <button key={item.id} onClick={() => go(() => { props.onSelectCategory(item.id); props.onSelectTag(null); })} className={`sn-nav-item ${activeCategory === item.id && !activeTag ? 'is-active' : ''}`} aria-current={activeCategory === item.id && !activeTag ? 'page' : undefined} title={item.label}><item.icon size={19} />{(!collapsed || mobile) && <><span>{item.label}</span><small>{item.count || ''}</small></>}</button>)}
    </nav>
    <div className="sn-sidebar-spacer" />
    <footer className="sn-sidebar-footer">
      <button className="sn-nav-item" title="导出笔记" onClick={() => go(props.onOpenExportModal)}><Download size={18} />{(!collapsed || mobile) && <span>导出笔记</span>}</button>
      <button className="sn-nav-item" title="更多工具" aria-label="更多工具" aria-expanded={tools} onClick={event => {setMenuAnchor(event.currentTarget);setWorkspaceMenu(false);setTools(!tools);}}><Command size={18} />{(!collapsed || mobile) && <><span>更多工具</span><ChevronDown size={13} /></>}</button>
      {tools && menuAnchor && <SidebarMenu anchor={menuAnchor} label="更多工具" onClose={()=>setTools(false)}><div className="sn-tool-menu" onClick={()=>setTools(false)}>
        <button onClick={() => go(() => props.onOpenAnalyticsModal?.())}><BarChart2 size={15} />创作回顾</button>
        <button onClick={() => go(() => props.onOpenResourceManager?.())}><Image size={15} />图片资源</button>

        <button onClick={() => go(() => props.onSelectCategory('trash'))}><Trash2 size={15} />回收站 {props.trashNotesCount || ''}</button>
        <button onClick={() => go(() => props.onOpenSponsorModal?.())}><Heart size={15} />支持作者</button>
        <button onClick={props.onToggleTheme}>{props.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}切换{props.theme === 'dark' ? '浅色' : '深色'}</button>
      </div></SidebarMenu>}
      <button className="sn-nav-item sn-settings-link" title="系统设置" onClick={() => go(props.onOpenSettings)}><Settings size={18} />{(!collapsed || mobile) && <span>系统设置</span>}</button>
    </footer>
    {!mobile&&!collapsed&&<div role="separator" aria-label="调整侧边栏宽度" aria-orientation="vertical" tabIndex={0} className="sn-sidebar-resize" onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const width=Math.max(210,Math.min(360,sidebarWidth+(e.key==='ArrowRight'?10:-10)));setSidebarWidth(width);try{localStorage.setItem('stillnote_sidebar_width',String(width));}catch{}}}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){const width=Math.max(210,Math.min(360,e.clientX-e.currentTarget.parentElement!.getBoundingClientRect().left));setSidebarWidth(width);try{localStorage.setItem('stillnote_sidebar_width',String(width));}catch{}}}} onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)} />}
  </aside>;
  return <><div className="sn-desktop-sidebar">{content()}</div>{isMobileOpen && <div className="sn-mobile-overlay"><button aria-label="关闭导航遮罩" className="sn-mobile-backdrop" onClick={onCloseMobile} /><div ref={mobileRef} role="dialog" aria-modal="true" aria-label="导航菜单" tabIndex={-1}>{content(true)}</div></div>}</>;
};
