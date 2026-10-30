import React, { useState } from 'react';
import { X, Heart } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

interface SponsorAuthorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (text: string, type?: 'success' | 'info' | 'error') => void;
}

export const SponsorAuthorModal: React.FC<SponsorAuthorModalProps> = ({ isOpen, onClose }) => {
  const [method, setMethod] = useState<'wechat' | 'alipay'>('wechat');
  const [failed, setFailed] = useState(false);
  const dialogRef = useDialog(isOpen, onClose);
  if (!isOpen) return null;
  const label = method === 'wechat' ? '微信' : '支付宝';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="sponsor-title" tabIndex={-1} className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 p-5 shadow-xl">
        <header className="flex items-center justify-between gap-3">
          <h2 id="sponsor-title" className="flex items-center gap-2 font-semibold"><Heart className="w-5 h-5 text-indigo-500" />赞赏作者</h2>
          <button onClick={onClose} aria-label="关闭赞赏窗口" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"><X className="w-5 h-5" /></button>
        </header>
        <p className="mt-3 text-sm text-slate-600 dark:text-zinc-300">感谢你支持 Stillnote 的独立开发与持续更新。</p>
        <div className="my-4 grid grid-cols-2 gap-2" role="group" aria-label="赞赏方式">
          {(['wechat', 'alipay'] as const).map(value => <button key={value} aria-pressed={method === value} onClick={() => { setMethod(value); setFailed(false); }} className={`py-2 rounded-xl border ${method === value ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-zinc-600'}`}>{value === 'wechat' ? '微信赞赏' : '支付宝赞赏'}</button>)}
        </div>
        {failed ? <div role="alert" className="p-6 text-center text-sm"><p>赞赏码加载失败，请重试。</p><button onClick={() => setFailed(false)} className="mt-3 underline">重新加载</button></div> : <img key={method} src={`/${method}-qr.jpg`} alt={`${label}赞赏码`} onError={() => setFailed(true)} className="mx-auto w-60 max-w-full h-auto bg-white p-3 rounded-xl" />}
        <p className="mt-4 text-center text-sm text-slate-700 dark:text-zinc-200">打开{label}扫一扫，在支付应用中填写金额。</p>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-zinc-300">自愿赞赏，金额随心。此页面不会核验付款状态。</p>
      </div>
    </div>
  );
};
