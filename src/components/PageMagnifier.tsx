import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn } from 'lucide-react';

const SCALE = 2;

export function PageMagnifier() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const lens = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const point = useRef({ x: 0, y: 0 });

  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }

  function aim(x: number, y: number) {
    if (!lens.current || !mirror.current) return;
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    point.current = { x: Math.max(0, Math.min(x, width)), y: Math.max(0, Math.min(y, height)) };
    const box = lens.current.getBoundingClientRect();
    const left = Math.max(0, Math.min(point.current.x - box.width / 2, width - box.width));
    const top = Math.max(0, Math.min(point.current.y - box.height / 2, height - box.height));
    lens.current.style.transform = `translate(${left}px, ${top}px)`;
    const offsetX = Math.max(box.width - width * SCALE, Math.min(0, box.width / 2 - point.current.x * SCALE));
    const offsetY = Math.max(box.height - height * SCALE, Math.min(0, box.height / 2 - point.current.y * SCALE));
    mirror.current.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${SCALE})`;
  }

  useLayoutEffect(() => {
    const source = trigger.current?.closest<HTMLElement>('.stillnote-app');
    const panel = dialog.current;
    const viewport = surface.current;
    if (!open || !source || !panel || !viewport) return;

    function copyPage() {
      if (!source || !viewport) return;
      const copy = source.cloneNode(true) as HTMLElement;
      const originals = source.querySelectorAll<HTMLElement>('*');
      const duplicates = copy.querySelectorAll<HTMLElement>('*');
      duplicates.forEach(element => {
        element.removeAttribute('id');
        element.removeAttribute('name');
        element.removeAttribute('autofocus');
      });
      viewport.style.width = `${document.documentElement.clientWidth}px`;
      viewport.replaceChildren(copy);
      originals.forEach((element, index) => {
        const duplicate = duplicates[index];
        if (element.scrollTop) duplicate.scrollTop = element.scrollTop;
        if (element.scrollLeft) duplicate.scrollLeft = element.scrollLeft;
      });
      viewport.scrollTop = document.scrollingElement?.scrollTop ?? 0;
      viewport.scrollLeft = document.scrollingElement?.scrollLeft ?? 0;
    }

    panel.showModal();
    copyPage();
    aim(document.documentElement.clientWidth / 2, document.documentElement.clientHeight / 2);
    const resize = () => {
      copyPage();
      aim(point.current.x, point.current.y);
    };
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      panel.close();
      viewport.replaceChildren();
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="sn-icon-button" title="局部放大" aria-label="局部放大" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <ZoomIn size={18} />
    </button>
    {open && createPortal(
      <dialog
        ref={dialog}
        className="sn-magnifier"
        aria-label="局部放大镜"
        aria-describedby="magnifier-hint"
        onCancel={event => { event.preventDefault(); close(); }}
        onPointerMove={event => aim(event.clientX, event.clientY)}
        onPointerDown={event => {
          if (event.target === event.currentTarget) {
            event.currentTarget.setPointerCapture(event.pointerId);
            aim(event.clientX, event.clientY);
          }
        }}
        onKeyDown={event => {
          const step = event.shiftKey ? 48 : 16;
          const offsets: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
          };
          const offset = offsets[event.key];
          if (!offset) return;
          event.preventDefault();
          aim(point.current.x + offset[0], point.current.y + offset[1]);
        }}
      >
        <div ref={lens} className="sn-magnifier-lens" aria-hidden="true" inert>
          <div ref={mirror} className="sn-magnifier-mirror">
            <div ref={surface} className="sn-magnifier-surface" />
          </div>
        </div>
        <div className="sn-magnifier-controls">
          <span id="magnifier-hint">2× · 拖动或按方向键移动</span>
          <button type="button" autoFocus className="sn-icon-button" aria-label="关闭放大镜" title="关闭放大镜 (Esc)" onClick={close}><X size={18} /></button>
        </div>
      </dialog>,
      document.body,
    )}
  </>;
}
