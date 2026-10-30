import { resolveSrcImageUrl } from '../utils/imageStorage';
import React, { useState, useRef, useEffect } from 'react';
import { handleClipboardImagePaste } from '../utils/pasteUtils';
import { IconPickerModal } from './IconPickerModal';
import { ImageInsertModal } from './ImageInsertModal';
import {
  Paperclip, Tag, ArrowRight,
  Send,
  Hash,
  Image as ImageIcon,
  Smile,
  Sparkles,
  Maximize2,
  X,
  Check,
  Feather,
} from 'lucide-react';

interface TopComposerProps {
  workspaceId: string;
  onPublish: (content: string) => boolean;
  onOpenFullEditor: (initialContent?: string) => void;
  allExistingTags: string[];
}

export const TopComposer: React.FC<TopComposerProps> = ({
  onPublish,
  workspaceId,
  onOpenFullEditor,
  allExistingTags,
}) => {
  const draftKey = `flovenote_draft_${workspaceId}`;
  const [content, setContent] = useState(() => { try { return localStorage.getItem(draftKey) || ''; } catch { return ''; } });
  const [draftError, setDraftError] = useState(false);
  useEffect(() => {
    try {
      if (content) localStorage.setItem(draftKey, content);
      else localStorage.removeItem(draftKey);
      setDraftError(false);
    } catch { setDraftError(true); }
  }, [content, draftKey]);
  useEffect(() => {
    const saved = (event: Event) => { if ((event as CustomEvent<string>).detail === workspaceId) setContent(''); };
    window.addEventListener('flovenote-composer-saved', saved);
    return () => window.removeEventListener('flovenote-composer-saved', saved);
  }, [workspaceId]);
  useEffect(() => {
    if (!content || !draftError) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [content, draftError]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handlePublish = () => {
    if (!content.trim()) return;
    if (!onPublish(content)) return;
    setContent('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handlePublish();
    }
  };

  const insertTag = (tag: string) => {
    setContent((prev) => `${prev} #${tag} `);
    setShowTagPicker(false);
  };

  const insertIcon = (iconStr: string) => {
    setContent((prev) => `${prev} ${iconStr} `);
  };

  const handleInsertImage = (url: string, altText?: string) => {
    let cleanUrl = url.replace(/[\r\n]+/g, '').trim();
    if (cleanUrl.includes(' ') && !cleanUrl.startsWith('data:')) {
      cleanUrl = cleanUrl.replace(/ /g, '%20');
    }
    const cleanAlt = (altText || '图片').replace(/[\]\[\r\n]/g, '').trim();
    setContent((prev) => `${prev}\n\n![${cleanAlt}](${cleanUrl})\n\n`);
  };

  // Helper to extract image markdown syntax from content for preview strip
  const detectedImages = React.useMemo(() => {
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const matches: { alt: string; url: string; fullMatch: string }[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      matches.push({
        alt: match[1],
        url: match[2].replace(/[\r\n]+/g, '').trim(),
        fullMatch: match[0],
      });
    }
    return matches;
  }, [content]);

  const removeImageFromContent = (fullMatch: string) => {
    setContent((prev) => prev.replace(fullMatch, '').replace(/\n\n\n+/g, '\n\n'));
  };

  return (
    <section className="sn-composer" aria-label="快速记录">
      <textarea ref={textareaRef} value={content} aria-label="笔记内容" placeholder="此刻，你在想什么？" rows={2} onChange={event => setContent(event.target.value)} onKeyDown={handleKeyDown}
        onPaste={event => handleClipboardImagePaste(event, (dataUrl, alt) => handleInsertImage(dataUrl, alt))}
        onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
        onDrop={event => {
          const images = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'));
          if (!images.length) return;
          event.preventDefault();
          for (const file of images) { const reader = new FileReader(); reader.onload = () => handleInsertImage(String(reader.result), file.name); reader.readAsDataURL(file); }
        }} />
      {detectedImages.length > 0 && <div className="sn-composer-images">{detectedImages.map((image, index) => <div key={index}><img src={resolveSrcImageUrl(image.url)} alt={image.alt || '图片预览'} /><button className="sn-icon-button" aria-label={`移除图片 ${image.alt || index + 1}`} onClick={() => removeImageFromContent(image.fullMatch)}><X size={13} /></button></div>)}</div>}
      <div className="sn-composer-toolbar">
        <div className="sn-composer-tools">
          <button aria-label="添加附件" onClick={() => setShowImageModal(true)}><Paperclip size={18} /><span>添加附件</span></button>
          <button className="sn-composer-extra" title="图标与表情" aria-label="插入表情" onClick={() => setShowIconPicker(true)}><Smile size={17} /></button>
          <button className="sn-composer-extra" title="打开完整编辑器" aria-label="打开完整编辑器" onClick={() => onOpenFullEditor(content)}><Maximize2 size={17} /></button>
        </div>
        <button className="sn-primary" onClick={handlePublish} disabled={!content.trim()} title="Ctrl / ⌘ + Enter 记下"><span>记下</span><ArrowRight size={18} /></button>
      </div>
      {(draftError || content) && <p className={`sn-composer-draft ${draftError ? 'sn-error' : ''}`} role="status">{draftError ? '草稿保存失败，请复制内容后重试。' : '草稿已保存在此浏览器 · Ctrl / ⌘ + Enter 记下'}</p>}
      <ImageInsertModal isOpen={showImageModal} onClose={() => setShowImageModal(false)} onInsertImage={handleInsertImage} />
      <IconPickerModal isOpen={showIconPicker} onClose={() => setShowIconPicker(false)} onSelectIcon={insertIcon} />
    </section>
  );
};
