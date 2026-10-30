import { desktopDirectory } from '../utils/desktopDirectory';
import { NOTE_TEMPLATES } from '../utils/product';
import { WritePreviewModal } from './WritePreviewModal';
import { useDialog } from '../hooks/useDialog';
import React, { useState } from 'react';
import type { AppSettings, ThemeMode, Note, Workspace } from '../types';
import type { CaseDocumentItem } from '../utils/caseDocuments';
import { exportNotesContent, downloadFile } from '../utils/markdownUtils';
import { isFileSystemAccessSupported, previewWorkspaceWrite, DirectoryWritePlan, deriveSubPaths, syncWorkspaceToDirectoryHandle, readNotesFromDirectoryHandle, pickLocalDirectory } from '../utils/localFileSystem';
import { X } from 'lucide-react';

interface SettingsModalProps {
  lastBackupAt?: number;
  lastWriteAt?: number;
  onOpenTemplate?: (content: string) => void;
  workspaceCounts?: Record<string, number>;
  onImportNotes?: (notes: Note[]) => void;
  onWorkspaceSynced?: () => void;
  settings: AppSettings;
  notes?: Note[];
  onUpdateSettings: (newSettings: AppSettings) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onClose: () => void;
  onResetSampleData: () => void;
  onShowToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  onExportBackup?: () => void;
  onImportBackup?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectDateFilter?: (date: string | null) => void;
  onRestoreNote?: (id: string) => void;
  onPermanentDeleteNote?: (id: string) => void;
  onEmptyTrash?: () => void;
  onSwitchWorkspace?: (id: string) => void;
  onAddWorkspace?: (ws: Workspace) => void;
  onDeleteWorkspace?: (id: string) => void;
  onImportCaseDocument?: (item: CaseDocumentItem) => void;
  onImportAllCaseDocuments?: () => void;
  onSyncToLocalDirectory?: (dirHandle?: any) => Promise<void>;
  onImportFromLocalDirectory?: (dirHandle?: any) => Promise<void>;
  activeDirHandle?: any;
  onSaveDirHandle?: (handle: any) => void;
  initialTab?: 'editor' | 'analytics' | 'batch_export' | 'appearance' | 'paths' | 'workspaces' | 'trash' | 'help' | 'backups';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  lastBackupAt, lastWriteAt, onOpenTemplate,
  notes = [],
  onUpdateSettings,
  theme,
  onToggleTheme,
  onClose,
  onResetSampleData,
  onShowToast,
  onExportBackup,
  onImportBackup,
  onSelectDateFilter,
  onRestoreNote,
  onPermanentDeleteNote,
  onEmptyTrash,
  onSwitchWorkspace,
  onAddWorkspace,
  onDeleteWorkspace,
  onImportCaseDocument,
  onImportAllCaseDocuments,
  onSyncToLocalDirectory,
  onImportFromLocalDirectory,
  activeDirHandle,
  onSaveDirHandle,
  initialTab = 'editor',
  onWorkspaceSynced,
  workspaceCounts = {},
  onImportNotes,
}) => {
  const dialogRef = useDialog(true, onClose);
  const [shortcutBusy,setShortcutBusy]=useState(false);
  const [desktopInfo,setDesktopInfo]=useState<{version:string;dataPath:string}|null>(null);
  React.useEffect(()=>{let active=true;window.stillnoteDesktop?.getInfo().then(info=>{if(active)setDesktopInfo(info);}).catch(()=>{});return()=>{active=false;};},[]);
  const createShortcut=async()=>{setShortcutBusy(true);try{const result=await window.stillnoteDesktop!.createDesktopShortcut();onShowToast(result.ok?'桌面快捷方式已创建':result.error||'创建失败',result.ok?'success':'error');}catch{onShowToast('创建快捷方式失败，请检查系统权限','error');}finally{setShortcutBusy(false);}};

  const [activeTab, setActiveTab] = useState<
    'editor' | 'analytics' | 'batch_export' | 'appearance' | 'paths' | 'workspaces' | 'trash' | 'help' | 'backups'
  >(initialTab);

  // Active Workspace
  const activeWorkspace =
    (settings.workspaces || []).find((w) => w.id === (settings.activeWorkspaceId || 'default')) ||
    (settings.workspaces || [])[0] || {
      id: 'default',
      name: '默认工作区',
      path: '~/Documents/Stillnote/Default',
      notesPath: '~/Documents/Stillnote/Default/Notes',
      mediaPath: '~/Documents/Stillnote/Default/.src',
      backupPath: '~/Documents/Stillnote/Default/Backups',
      createdAt: Date.now(),
    };

  // Root Working Folder for Paths Tab
  const [rootWorkingFolder, setRootWorkingFolder] = useState(
    activeWorkspace.path || '~/Documents/Stillnote'
  );

  // Storage Paths state
  const [storagePath, setStoragePath] = useState(
    activeWorkspace.notesPath || `${rootWorkingFolder}/Notes`
  );
  const [mediaStoragePath, setMediaStoragePath] = useState(
    activeWorkspace.mediaPath || `${rootWorkingFolder}/.src`
  );
  const [backupPath, setBackupPath] = useState(
    activeWorkspace.backupPath || `${rootWorkingFolder}/Backups`
  );

  // Directory Handle in state
  const [currentDirHandle, setCurrentDirHandle] = useState<any>(activeDirHandle || null);
  React.useEffect(()=>{let active=true;setCurrentDirHandle(activeDirHandle||null);const initialPaths=deriveSubPaths(activeWorkspace.path||'');setStoragePath(initialPaths.notesPath);setMediaStoragePath(initialPaths.mediaPath);setBackupPath(initialPaths.backupPath);window.stillnoteDesktop?.getFolder(activeWorkspace.id).then(folder=>{if(active&&folder){const handle=desktopDirectory(folder);setCurrentDirHandle(handle);onSaveDirHandle?.(handle);const paths=deriveSubPaths(folder.path);setRootWorkingFolder(paths.rootPath);setStoragePath(paths.notesPath);setMediaStoragePath(paths.mediaPath);setBackupPath(paths.backupPath);}}).catch(()=>onShowToast('存储文件夹暂时不可用，请重新选择','info'));return()=>{active=false;};},[activeWorkspace.id]);
  const [writePreview, setWritePreview] = useState<{ handle: any; plan: DirectoryWritePlan } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImportingFromDir, setIsImportingFromDir] = useState(false);

  // New Workspace Input state
  const [newWsName, setNewWsName] = useState('');
  // Trash Notes
  const trashNotes = notes.filter((n) => Boolean(n.deletedAt));

  // Root Working Folder picker & auto-configuration
  const handlePickRootWorkingFolder = async () => {
    try {
      const result = await pickLocalDirectory(activeWorkspace.id);
      if (result) {
        setRootWorkingFolder(result.derivedPaths.rootPath);
        setStoragePath(result.derivedPaths.notesPath);
        setMediaStoragePath(result.derivedPaths.mediaPath);
        setBackupPath(result.derivedPaths.backupPath);
        setCurrentDirHandle(result.handle);
        if (onSaveDirHandle) onSaveDirHandle(result.handle);

        // Update active workspace and global settings
        const updatedWorkspaces = (settings.workspaces || []).map((w) => {
          if (w.id === activeWorkspace.id) {
            return {
              ...w,
              path: result.derivedPaths.rootPath,
              notesPath: result.derivedPaths.notesPath,
              mediaPath: result.derivedPaths.mediaPath,
              backupPath: result.derivedPaths.backupPath,
              localFolderName: result.name,
            };
          }
          return w;
        });

        onUpdateSettings({
          ...settings,
          storagePath: result.derivedPaths.notesPath,
          mediaStoragePath: result.derivedPaths.mediaPath,
          backupPath: result.derivedPaths.backupPath,
          workspaces: updatedWorkspaces,
        });

        onShowToast(`已绑定本地工作目录《${result.name}》，笔记、附件与备份路径已自动联动更新！`, 'success');
      } else if (!isFileSystemAccessSupported()) {
        const customPath = prompt('请输入电脑本地工作文件夹路径 (如 D:/Stillnote 或 ~/Documents/Notes)：', rootWorkingFolder);
        if (customPath && customPath.trim()) {
          const derived = deriveSubPaths(customPath.trim());
          setRootWorkingFolder(derived.rootPath);
          setStoragePath(derived.notesPath);
          setMediaStoragePath(derived.mediaPath);
          setBackupPath(derived.backupPath);

          const updatedWorkspaces = (settings.workspaces || []).map((w) => {
            if (w.id === activeWorkspace.id) {
              return {
                ...w,
                path: derived.rootPath,
                notesPath: derived.notesPath,
                mediaPath: derived.mediaPath,
                backupPath: derived.backupPath,
              };
            }
            return w;
          });

          onUpdateSettings({
            ...settings,
            storagePath: derived.notesPath,
            mediaStoragePath: derived.mediaPath,
            backupPath: derived.backupPath,
            workspaces: updatedWorkspaces,
          });

          onShowToast(`已保存路径示意 ${derived.rootPath}；当前浏览器不支持直接写入，请使用导出。`, 'success');
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        onShowToast('选择本地文件夹失败或取消', 'info');
      }
    }
  };

  // Direct sync to local directory
  const handleSyncToLocalFolder = async () => {
    setIsSyncing(true);
    try {
      let handle = currentDirHandle;
      if (!handle && isFileSystemAccessSupported()) {
        const picked = await pickLocalDirectory(activeWorkspace.id);
        if (!picked) return;
        if (picked) {
          handle = picked.handle;
          setCurrentDirHandle(handle);
          if (onSaveDirHandle) onSaveDirHandle(handle);
        }
      }

      if (handle) {
        const plan = await previewWorkspaceWrite(handle, notes, {
          notesDirName: storagePath.split(/[\/\\]/).pop() || 'Notes',
          mediaDirName: mediaStoragePath.split(/[\/\\]/).pop() || '.src',
          backupDirName: backupPath.split(/[\/\\]/).pop() || 'Backups',
        });
        setWritePreview({ handle, plan });
      } else {
        if (onSyncToLocalDirectory) {
          await onSyncToLocalDirectory();
        } else {
          // Fallback: batch export
          const result = exportNotesContent(notes.filter((n) => !n.deletedAt), 'md');
          downloadFile(result.filename, result.content, result.mimeType);
          onShowToast('已导出 Markdown 笔记包并下载至您的电脑！', 'success');
        }
      }
    } catch (err: any) {
      console.error(err);
      onShowToast('读取写入预览失败，请检查文件夹权限与目录名称后重试', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Import notes from local directory
  const handleImportFromLocalFolder = async () => {
    setIsImportingFromDir(true);
    try {
      let handle = currentDirHandle;
      if (!handle && isFileSystemAccessSupported()) {
        const picked = await pickLocalDirectory(activeWorkspace.id);
        if (!picked) return;
        if (picked) {
          handle = picked.handle;
          setCurrentDirHandle(handle);
          if (onSaveDirHandle) onSaveDirHandle(handle);
        }
      }

      if (handle) {
        const imported = await readNotesFromDirectoryHandle(handle, activeWorkspace.id, storagePath.split(/[\/\\]/).pop() || 'Notes');
        if (imported.length > 0) {
          onImportNotes?.(imported);
        } else {
          onShowToast('所选文件夹中未找到 .md 笔记文件', 'info');
        }
      } else {
        onShowToast('请先选择本地文件夹', 'info');
      }
    } catch (err: any) {
      console.error(err);
      onShowToast('读取本地文件夹出错', 'error');
    } finally {
      setIsImportingFromDir(false);
    }
  };

  const handleCreateWorkspace = () => {
    const name=newWsName.trim();if(!name)return;
    if((settings.workspaces||[]).some(w=>w.name===name)){onShowToast('已存在同名工作区','info');return;}
    const paths=deriveSubPaths('');
    const workspace:Workspace={id:crypto.randomUUID(),name,path:paths.rootPath,notesPath:paths.notesPath,mediaPath:paths.mediaPath,backupPath:paths.backupPath,createdAt:Date.now()};
    onUpdateSettings({...settings,workspaces:[...(settings.workspaces||[]),workspace],activeWorkspaceId:workspace.id});
    setNewWsName('');onShowToast('工作区已创建，尚未绑定磁盘文件夹','success');
  };

  const handleSavePaths = () => {
    const updatedWorkspaces = (settings.workspaces || []).map((w) => {
      if (w.id === activeWorkspace.id) {
        return {
          ...w,
          path: rootWorkingFolder,
          notesPath: storagePath,
          mediaPath: mediaStoragePath,
          backupPath: backupPath,
        };
      }
      return w;
    });

    onUpdateSettings({
      ...settings,
      storagePath,
      mediaStoragePath,
      backupPath,
      workspaces: updatedWorkspaces,
    });
    onShowToast('工作路径与子目录配置已保存！', 'success');
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
      {writePreview && <WritePreviewModal plan={writePreview.plan} onClose={() => setWritePreview(null)} onConfirm={async () => {
        if (JSON.stringify(notes) !== JSON.stringify(writePreview.plan.sourceNotes)) return '笔记内容在预览后发生变化，请取消后重新预览。';
        const stats = await syncWorkspaceToDirectoryHandle(writePreview.handle, writePreview.plan.sourceNotes, undefined, writePreview.plan);
        if (!stats.success) return stats.error || '写入失败，请重新预览。';
        onWorkspaceSynced?.();
        onShowToast(`已写入 ${stats.notesCount} 篇笔记，生成备份 ${stats.backupFileName}`, 'success');
        setWritePreview(null);
        return null;
      }} />}

    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="系统设置" tabIndex={-1} className="sn-settings-dialog w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden border shadow-xl">
      <header className="p-5 flex justify-between border-b"><h2>设置</h2><button aria-label="关闭设置" onClick={onClose}><X size={20}/></button></header>
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        <nav aria-label="设置分类" className="sn-settings-tabs p-3 flex md:flex-col gap-2 overflow-auto md:w-44 shrink-0 border-b md:border-r">
          {([['editor','编辑与阅读'],['appearance','外观'],['workspaces','工作区'],['paths','文件夹存储'],['backups','备份与恢复'],['trash','回收站'],['help','使用帮助']] as const).map(([id,label]) => <button key={id} className={`sn-nav-item whitespace-nowrap ${activeTab===id?'is-active':''}`} aria-current={activeTab===id?'page':undefined} onClick={()=>setActiveTab(id)}>{label}</button>)}
        </nav>
        <section className="sn-settings-content p-5 flex-1 overflow-y-auto space-y-5 min-w-0">
        {activeTab==='editor' && <>
          <h3>编辑与阅读</h3>
          <label className="sn-field">正文字号<select aria-label="正文字号" value={settings.editorFontSize||'base'} onChange={e=>onUpdateSettings({...settings,editorFontSize:e.target.value as AppSettings['editorFontSize']})}>{[['sm','小号'],['base','标准'],['lg','大号'],['xl','特大']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label className="sn-field">阅读字体<select aria-label="阅读字体" value={settings.fontFamily==='serif'?'serif':'sans'} onChange={e=>onUpdateSettings({...settings,fontFamily:e.target.value as 'sans'|'serif'})}><option value="sans">标准</option><option value="serif">衬线</option></select></label>
          <p className="sn-reading-preview">阅读预览：留住一闪而过的想法。The quiet joy of writing.</p>
          <label className="sn-check-label"><input type="checkbox" checked={settings.autoSaveEnabled!==false} onChange={e=>onUpdateSettings({...settings,autoSaveEnabled:e.target.checked})}/>自动保存</label>
          <details><summary>高级编辑偏好</summary><label className="sn-field">停止输入后的保存间隔<select aria-label="停止输入后的保存间隔" value={settings.autoSaveDelay} onChange={e=>onUpdateSettings({...settings,autoSaveDelay:Number(e.target.value)})}>{[1000,2000,3000,5000].map(v=><option key={v} value={v}>{v/1000} 秒</option>)}</select></label><label className="sn-check-label"><input type="checkbox" checked={!!settings.autoFoldLongNotes} onChange={e=>onUpdateSettings({...settings,autoFoldLongNotes:e.target.checked})}/>折叠长笔记</label></details>
          <p className="sn-caption">自动保存保护正文；每次编辑会话保留起始版本，最多保存 50 个历史版本。</p>
        </>}
        {activeTab==='appearance' && <><h3>外观</h3>{desktopInfo&&<div className="sn-setting-card"><h4>Windows 桌面版 · {desktopInfo.version}</h4><p>数据位置：{desktopInfo.dataPath}</p><button className="sn-primary" disabled={shortcutBusy} onClick={createShortcut}>{shortcutBusy?'正在创建…':'创建桌面快捷方式'}</button><p className="sn-caption">仅在点击后创建；免安装版请先将 EXE 放到固定位置。</p></div>}<label className="sn-field">显示模式<select aria-label="显示模式" value={settings.themeMode||'light'} onChange={e=>onUpdateSettings({...settings,themeMode:e.target.value as AppSettings['themeMode']})}><option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option></select></label><p>代码块与表格自动适配明暗模式。代码保留语法高亮、语言标识和复制。</p><p className="sn-caption">导出卡片的极简白、暖纸和深色样式可在导出预览中选择。</p></>}
        {activeTab==='workspaces' && <><h3>工作区</h3><p className="sn-caption">工作区是笔记的分类空间，是否绑定磁盘文件夹可单独设置。</p>{(settings.workspaces||[]).map(w=><div className="sn-setting-card" key={w.id}><strong>{w.name}</strong><span>{workspaceCounts[w.id]||0} 条笔记</span>{w.id===activeWorkspace.id?<span>当前工作区</span>:<button className="sn-text-button" onClick={()=>onSwitchWorkspace?.(w.id)}>切换</button>}{w.id!=='default'&&<button className="sn-text-button" onClick={()=>{if(window.confirm('移除此工作区？其中的笔记及回收站记录将移入默认工作区，磁盘文件保留。'))onDeleteWorkspace?.(w.id);}}>移除工作区</button>}</div>)}<label className="sn-field">新工作区名称<input value={newWsName} maxLength={60} onChange={e=>setNewWsName(e.target.value)}/></label><button className="sn-primary" disabled={!newWsName.trim()} onClick={handleCreateWorkspace}>创建工作区</button></>}
        {activeTab==='paths' && <><h3>文件夹存储 · {activeWorkspace.name}</h3><p>只需选择一个根文件夹，笔记、图片与备份将统一保存在其 Notes、Images、Backups 子目录。桌面版会记住路径；网页版重新打开后需重新授权。</p><div className="sn-setting-card"><p>授权状态：{currentDirHandle?'本次会话已授权':'尚未授权'}</p><p>本工作区最近写入记录：{lastWriteAt?new Date(lastWriteAt).toLocaleString():'暂无记录'}</p><p>文件夹：{currentDirHandle?.nativePath||currentDirHandle?.name||'尚未选择'}</p></div><button className="sn-primary" onClick={handlePickRootWorkingFolder}>选择或重新授权文件夹</button><div className="flex flex-wrap gap-3"><button className="sn-text-button" disabled={isSyncing||isImportingFromDir} onClick={handleSyncToLocalFolder}>预览并写入文件夹</button><button className="sn-text-button" disabled={isSyncing||isImportingFromDir} onClick={handleImportFromLocalFolder}>扫描导入 Markdown</button></div><div className="sn-setting-card"><p>笔记：Notes/</p><p>图片：Images/</p><p>备份：Backups/</p><p className="sn-caption">先预览再写入；不会自动删除原目录里的文件。</p></div></>}
        {activeTab==='backups' && <><h3>备份与恢复</h3><p>全量备份包含所有工作区的笔记、历史、笔记内图片和界面偏好；不包含 API 密钥及独立图片资源库。</p><p role="status">最近发起全量备份：{lastBackupAt?new Date(lastBackupAt).toLocaleString():'暂无记录'}</p><p className="sn-caption">下载由浏览器完成，请确认文件已保存。这里的时间不表示已验证磁盘文件。</p><button className="sn-primary" onClick={onExportBackup}>下载全量备份 JSON</button><label className="sn-field">导入或恢复备份<input type="file" accept=".json,application/json" onChange={onImportBackup}/></label><p>导入前可预览重复和冲突，选择恢复结构或加入当前工作区。清理浏览器数据前请先备份。</p></>}
        {activeTab==='trash' && <><h3>回收站</h3><p>恢复笔记或确认永久删除。建议定期备份。</p>{trashNotes.map(n=><div className="sn-setting-card" key={n.id}><p>{n.content.slice(0,100)||'空白笔记'}</p><button className="sn-text-button" onClick={()=>onRestoreNote?.(n.id)}>恢复</button><button className="sn-text-button" onClick={()=>{if(window.confirm('永久删除这条笔记？此操作不可恢复。'))onPermanentDeleteNote?.(n.id);}}>永久删除</button></div>)}{!trashNotes.length&&<p>回收站为空。</p>}</>}
        {activeTab==='help' && <><h3>开始记录</h3><ol className="list-decimal pl-5 space-y-3"><li>在首页写下想法，点击“记下”；按工作区整理。</li><li>完整编辑器支持 Markdown、源码和实时预览；Ctrl / ⌘ + Enter 保存。</li><li>搜索可与日期组合，并保存为常用筛选。</li><li>内容导出用于阅读和分享，全量备份用于迁移和恢复。</li></ol><h4>从一个模板开始</h4><div className="flex flex-wrap gap-3">{NOTE_TEMPLATES.map(t=><button className="sn-text-button" key={t.name} onClick={()=>{onOpenTemplate?.(t.content);onClose();}}>{t.name}</button>)}</div><p className="sn-caption">模板只打开草稿，保存前不会添加笔记。更多技术说明见项目 README。</p></>}
        </section>
      </div>
      <footer className="p-4 border-t text-right"><button className="sn-primary" onClick={onClose}>完成</button></footer>
    </div>
  </div>;
};
