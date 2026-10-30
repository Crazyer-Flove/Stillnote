import React, { useState } from 'react';
import { DirectoryWritePlan } from '../utils/localFileSystem';
import { useDialog } from '../hooks/useDialog';

export function WritePreviewModal({ plan, onClose, onConfirm }: { plan: DirectoryWritePlan; onClose: () => void; onConfirm: () => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useDialog(true, () => { if (!busy) onClose(); });
  const labels = { new: '新增', update: '更新', unchanged: '不变', conflict: '冲突，跳过' };
  return <div className="fixed inset-0 z-[70] bg-black/60 p-4 flex items-center justify-center">
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="write-title" tabIndex={-1} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 p-5 space-y-4">
      <h2 id="write-title" className="font-semibold text-lg">文件夹写入预览</h2>
      <p className="text-sm">目标文件夹：{plan.rootName}</p>
      <p className="text-sm text-slate-600 dark:text-zinc-300">确认后先生成 JSON 快照，再写入笔记。未列出的旧文件保持不变；同名但不属于对应笔记的文件会跳过。本机图片写入 Images/，JSON 快照仍保留内嵌图片。</p>
      <p role="status" className="text-sm">{Object.entries(labels).map(([key, label]) => `${label} ${plan.entries.filter(entry => entry.status === key).length}`).join(' · ')}</p>
      <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-zinc-700 rounded-xl">
        {plan.entries.map(entry => <div key={`${entry.directory}/${entry.name}`} className="p-3 border-b border-slate-200 dark:border-zinc-700 text-sm">
          <strong className={entry.status === 'conflict' ? 'text-amber-700 dark:text-amber-300' : ''}>{labels[entry.status]} · {entry.title}</strong>
          <code className="block text-xs break-all">{entry.directory === 'notes' ? `${plan.notesDirName}/` : entry.directory === 'backup' ? `${plan.backupDirName}/` : entry.directory === 'images' ? `${plan.mediaDirName}/` : ''}{entry.name}</code>
        </div>)}
      </div>
      {error && <p role="alert" className="text-red-600 dark:text-red-300">{error}</p>}
      <footer className="flex justify-end gap-3"><button disabled={busy} onClick={onClose} className="p-2">取消</button><button disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { const failure = await onConfirm(); if (failure) setError(failure); }
        catch (error) { setError((error as Error).message); }
        finally { setBusy(false); }
      }} className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50">{busy ? '正在写入…' : '确认写入（冲突文件跳过）'}</button></footer>
    </div>
  </div>;
}
