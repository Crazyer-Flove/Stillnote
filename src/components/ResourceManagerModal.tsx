import { resolveSrcImageUrl } from '../utils/imageStorage';
import { useDialog } from '../hooks/useDialog';
import React, { useState, useMemo, useRef } from 'react';
import { Note } from '../types';
import {
  X,
  FolderKanban,
  Image as ImageIcon,
  Copy,
  Check,
  Upload,
  Search,
  Trash2,
  ExternalLink,
  Plus,
  FileText,
  Maximize2,
  HardDrive,
} from 'lucide-react';

interface AssetFile {
  id: string;
  name: string;
  url: string;
  references?: string[];
  sourceNoteId?: string;
  sourceNoteTitle?: string;
  type: 'image' | 'link' | 'file';
  size?: string;
  createdAt: number;
}

interface ResourceManagerModalProps {
  notes: Note[];
  onClose: () => void;
  onInsertImageToActiveNote?: (imageUrl: string, altText: string) => void;
  onCreateNoteWithImage?: (imageUrl: string, altText: string) => void;
  onShowToast: (text: string, type?: 'success' | 'info' | 'error') => void;
}

export const ResourceManagerModal: React.FC<ResourceManagerModalProps> = ({
  notes,
  onClose,
  onCreateNoteWithImage,
  onShowToast,
}) => {
  const dialogRef=useDialog(true,onClose);
  const [failedImages,setFailedImages]=useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetFile | null>(null);
  const [customAssets, setCustomAssets] = useState<AssetFile[]>(() => {
    try {
      const stored = localStorage.getItem('flovenote_custom_assets');
      const parsed=stored?JSON.parse(stored):[];return Array.isArray(parsed)?parsed.filter(a=>a&&typeof a.id==='string'&&typeof a.name==='string'&&typeof a.url==='string'):[];
    } catch {
      return [];
    }
  });

  const assetsRef=useRef(customAssets);
  const persistAssets=(next:AssetFile[])=>{try{localStorage.setItem('flovenote_custom_assets',JSON.stringify(next));assetsRef.current=next;setCustomAssets(next);return true;}catch{onShowToast('图片资源保存失败，原资源保持不变。','error');return false;}};

  // Extract assets from all notes automatically
  const noteExtractedAssets = useMemo(() => {
    const extracted: AssetFile[] = [];
    // Regex for markdown images ![alt](url)
    const mdImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

    notes.forEach((note) => {
      let match;
      let imgIndex = 1;
      const versions=[{content:note.content,label:note.deletedAt?'回收站':'正文'},...(note.history||[]).map(h=>({content:h.content,label:'历史版本'}))];
      for(const version of versions) { mdImgRegex.lastIndex=0;
      while ((match = mdImgRegex.exec(version.content)) !== null) {
        const alt = match[1] || `图片资源 #${imgIndex}`;
        const url = match[2];
        extracted.push({
          id: `extracted-${note.id}-${imgIndex}`,
          name: alt,
          url,
          references: [(note.content.split('\n')[0].replace(/^#+\s*/,'').slice(0,70)||'无标题笔记')+' · '+version.label],
          sourceNoteId: note.id,
          sourceNoteTitle: note.content.split('\n')[0].replace(/^[#\s]+/, '') || '无标题笔记',
          type: 'image',
          createdAt: note.updatedAt,
        });
        imgIndex++;
      }
      }
    });

    return extracted;
  }, [notes]);

  // Combine extracted assets and custom uploaded assets
  const allAssets = useMemo(() => {
    const combined = [...customAssets, ...noteExtractedAssets];
    const byUrl=new Map<string,AssetFile>();
    for(const item of combined) {const old=byUrl.get(item.url);if(old)old.references=[...new Set([...(old.references||[]),...(item.references||[])])];else byUrl.set(item.url,{...item,references:item.references?[...item.references]:[]});}
    return [...byUrl.values()];
  }, [customAssets, noteExtractedAssets]);

  // Filtered assets
  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return allAssets;
    const q = searchQuery.toLowerCase();
    return allAssets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.sourceNoteTitle && a.sourceNoteTitle.toLowerCase().includes(q))
    );
  }, [allAssets, searchQuery]);

  // Handle local file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        onShowToast('仅支持上传图片格式资源', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        let base64Url = event.target?.result as string;
        if (!base64Url) return;
        base64Url = base64Url.replace(/[\r\n]+/g, '');

        const newAsset: AssetFile = {
          id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          url: base64Url,
          type: 'image',
          size: `${(file.size / 1024).toFixed(1)} KB`,
          createdAt: Date.now(),
        };

        if(persistAssets([newAsset,...assetsRef.current])) onShowToast(`文件 "${file.name}" 已保存至本地资源库`, 'success');
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const copyMarkdown = async (asset: AssetFile) => {
    try { await navigator.clipboard.writeText(`![${asset.name}](${asset.url})`);setCopiedId(asset.id);onShowToast('已复制 Markdown 图片代码','success');setTimeout(()=>setCopiedId(null),2000); }
    catch { onShowToast('复制失败，请检查剪贴板权限。','error'); }
  };

  const handleDeleteCustomAsset = (assetId: string) => {
    const asset=allAssets.find(a=>a.id===assetId);
    if(asset?.references?.length){onShowToast('该图片仍被正文、回收站或历史版本引用，不能清理。','info');return;}
    if(!window.confirm('删除这张未引用的资源库图片？此操作不可恢复。'))return;
    if(persistAssets(assetsRef.current.filter(a=>a.id!==assetId)))onShowToast('已从本地媒体库删除','info');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="图片资源" tabIndex={-1} className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <span>本地媒体资源管理</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-mono font-medium">
                  {allAssets.length} 项资源
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                自动检索并集中管理所有笔记中的插入图片、本地已保存资源与附件
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar Bar */}
        <div className="p-4 border-b border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索资源名称、引用笔记标题..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80 text-slate-800 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl cursor-pointer shadow-2xs transition-colors">
            <Upload className="w-4 h-4" />
            <span>上传图片至本地库</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        {/* Assets Grid / List */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-zinc-950/40">
          {filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <ImageIcon className="w-12 h-12 text-slate-300 dark:text-zinc-700 mb-2" />
              <p className="text-sm font-medium text-slate-600 dark:text-zinc-400">
                {searchQuery ? '未找到符合条件的媒体资源' : '暂无媒体图片资源'}
              </p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 max-w-sm">
                在笔记中使用 Markdown 插入图片 `![说明](图片地址)` 或点击右上角上传按钮添加本地图片
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredAssets.map((asset) => {
                const isCopied = copiedId === asset.id;
                const isCustom = asset.id.startsWith('custom-');

                return (
                  <div
                    key={asset.id}
                    className="group relative bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col"
                  >
                    {/* Thumbnail */}
                    <div
                      className="relative aspect-4/3 bg-slate-100 dark:bg-zinc-800/80 overflow-hidden cursor-pointer"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <img
                        onError={()=>setFailedImages(prev=>new Set([...prev,asset.url]))}
                        src={resolveSrcImageUrl(asset.url)}
                        alt={asset.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Maximize2 className="w-5 h-5 text-white drop-shadow-md" />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-2.5 flex-1 flex flex-col justify-between">
                      <div>
                        <p
                          className="text-xs font-semibold text-slate-800 dark:text-zinc-200 truncate"
                          title={asset.name}
                        >
                          {asset.name}
                        </p>
                        {asset.sourceNoteTitle ? (
                          <div
                            className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-500 mt-1 truncate"
                            title={`引用来自: ${asset.sourceNoteTitle}`}
                          >
                            <FileText className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span className="truncate">{asset.sourceNoteTitle}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-500 mt-1">
                            <HardDrive className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span>{asset.size || '本地文件'}</span>
                          </div>
                        )}
                      </div>

                      <details className="text-xs mt-2"><summary>引用与状态 · {asset.references?.length||0} 处</summary><p>{failedImages.has(asset.url)?'图片不可用或当前网络无法访问':'尚未发现加载错误'}</p><p>{asset.size || (asset.url.startsWith('data:')?`约 ${Math.round(asset.url.length*0.75/1024)} KB`:'网络图片 · 大小未知')}</p>{asset.references?.map(ref=><p key={ref}>{ref}</p>)}{!asset.references?.length&&<p>未发现笔记或历史引用</p>}</details>
                      {/* Actions */}
                      <div className="flex items-center justify-between gap-1 mt-2.5 pt-2 border-t border-slate-100 dark:border-zinc-800/60">
                        <button
                          type="button"
                          onClick={() => copyMarkdown(asset)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-slate-100 dark:bg-zinc-800 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 text-slate-600 dark:text-zinc-300 transition-colors flex-1 justify-center"
                          title="复制 Markdown 语法"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-500">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>复制 md</span>
                            </>
                          )}
                        </button>

                        {onCreateNoteWithImage && (
                          <button
                            type="button"
                            onClick={() => {
                              onCreateNoteWithImage(asset.url, asset.name);
                              onClose();
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                            title="以此图片创建新笔记"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {isCustom && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomAsset(asset.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                            title="删除自定义存储图片"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-zinc-900 border-t border-slate-200/80 dark:border-zinc-800 flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 shrink-0">
          <span>上传图片保存在此浏览器；网络图片仍依赖原始网址。清理前检查正文、回收站和历史引用。</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-medium bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 rounded-xl transition-colors"
          >
            关闭窗口
          </button>
        </div>
      </div>

      {/* Fullscreen Preview Lightbox */}
      {selectedAsset && (
        <div
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setSelectedAsset(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedAsset(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={resolveSrcImageUrl(selectedAsset.url)}
              alt={selectedAsset.name}
              className="max-h-[80vh] max-w-full object-contain rounded-xl shadow-2xl"
            />
            <div className="mt-3 flex items-center gap-3 text-xs text-white/80 bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">
              <span className="font-semibold">{selectedAsset.name}</span>
              <button
                onClick={() => copyMarkdown(selectedAsset)}
                className="flex items-center gap-1 text-indigo-300 hover:text-indigo-200 underline"
              >
                <Copy className="w-3 h-3" />
                <span>复制 md 链接</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
