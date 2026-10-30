import React, { useMemo, useState } from 'react';
import type { AppSettings, Note } from '../types';
import { ImportOptions, LibraryBackup, planImport } from '../utils/backup';
import { useDialog } from '../hooks/useDialog';

export function ImportBackupModal({ backup, notes, settings, onClose, onConfirm }: {
  backup: LibraryBackup; notes: Note[]; settings: AppSettings; onClose: () => void;
  onConfirm: (plan: ReturnType<typeof planImport>) => boolean;
}) {
  const [options, setOptions] = useState<ImportOptions>({ mode: 'current', duplicates: 'skip', conflicts: 'copy' });
  const [error, setError] = useState('');
  const plan = useMemo(() => planImport(notes, settings, backup, options), [notes, settings, backup, options]);
  const ref = useDialog(true, onClose);
  return <div className="fixed inset-0 z-[70] bg-black/60 p-4 flex items-center justify-center">
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="import-title" tabIndex={-1} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-900 rounded-2xl p-5 space-y-4">
      <h2 id="import-title" className="text-lg font-semibold">备份导入预览</h2>
      <p className="text-sm">共 {backup.notes.length} 条笔记。现有笔记与工作区会保留。导入的回收站记录重新保留七天。</p>
      <label className="block text-sm">导入位置
        <select className="block w-full mt-1 p-2 bg-slate-100 dark:bg-zinc-800 rounded-lg" value={options.mode} onChange={e => setOptions({ ...options, mode: e.target.value as ImportOptions['mode'] })}>
          <option value="current">当前工作区：{settings.workspaces?.find(w => w.id === settings.activeWorkspaceId)?.name || '默认工作区'}</option>
          <option value="structure">恢复原工作区结构{backup.settings ? '及界面偏好' : '（旧备份按工作区 ID 分组）'}</option>
        </select>
      </label>
      <p className="text-sm text-slate-600 dark:text-zinc-300">恢复原结构时，同 ID 且名称或路径不同的工作区会单独恢复，不覆盖原工作区。文件夹需要重新授权；备份不包含 API Key。</p>
      <p className="text-xs text-slate-600 dark:text-zinc-300">重复按同工作区正文判断；跳过重复不会合并历史、标签或收藏差异，需要保留时请选择副本。</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">相同正文 <select className="block w-full p-2 mt-1 bg-slate-100 dark:bg-zinc-800 rounded-lg" value={options.duplicates} onChange={e => setOptions({ ...options, duplicates: e.target.value as 'skip' | 'copy' })}><option value="skip">跳过重复</option><option value="copy">保留副本</option></select></label>
        <label className="text-sm">相同 ID、不同正文 <select className="block w-full p-2 mt-1 bg-slate-100 dark:bg-zinc-800 rounded-lg" value={options.conflicts} onChange={e => setOptions({ ...options, conflicts: e.target.value as 'skip' | 'copy' })}><option value="copy">保留副本</option><option value="skip">跳过冲突</option></select></label>
      </div>
      <p role="status" className="text-sm font-medium">将加入 {plan.added} 条 · 重复 {plan.duplicateCount} 条 · ID 冲突 {plan.conflictCount} 条</p>
      <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-zinc-700 rounded-lg">
        {plan.rows.slice(0, 200).map((row, index) => <div key={index} className="p-2 border-b border-slate-200 dark:border-zinc-700 text-sm">
          <span>{row.skipped ? '跳过' : row.kind === 'new' ? '新增' : '副本'} · </span><span>{row.note.content.split('\n')[0].slice(0, 100) || '空白笔记'}</span>
          <span className="block text-xs text-slate-600 dark:text-zinc-300">目标：{plan.settings.workspaces?.find(w => w.id === row.destination)?.name || row.destination}</span>
        </div>)}
        {plan.rows.length > 200 && <p className="p-2 text-sm">仅展示前 200 条；确认操作覆盖全部 {plan.rows.length} 条。</p>}
      </div>
      {error && <p role="alert" className="text-red-600 dark:text-red-300">{error}</p>}
      <footer className="flex gap-3 justify-end"><button onClick={onClose} className="p-2">取消</button><button onClick={() => { if (!onConfirm(plan)) setError('保存失败，现有数据未被替换。请检查浏览器空间后重试。'); }} className="px-4 py-2 rounded-lg bg-indigo-600 text-white">确认导入{options.mode === 'structure' ? '与恢复配置' : ''}</button></footer>
    </div>
  </div>;
}
