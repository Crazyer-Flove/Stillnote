import { RefObject, useEffect, useRef } from 'react';

// Only the topmost dialog handles keyboard events, including nested dialogs.
const dialogs: HTMLElement[] = [];
function topDialog() {
  const layer = (element: HTMLElement) => {
    let value = 0;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const index = Number.parseInt(getComputedStyle(node).zIndex, 10);
      if (Number.isFinite(index)) value = Math.max(value, index);
    }
    return value;
  };
  return dialogs.filter(dialog => dialog.isConnected).reduce<HTMLElement | undefined>((top, candidate) => {
    if (!top || layer(candidate) > layer(top)) return candidate;
    if (layer(candidate) === layer(top) && (top.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING)) return candidate;
    return top;
  }, undefined);
}
export function useDialog(open: boolean, onClose: () => void): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const root = ref.current;
    if (!open || !root) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogs.push(root);
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
    )).filter((element) => element.getClientRects().length > 0);
    if (topDialog() === root) (focusable()[0] || root).focus();
    const keydown = (event: KeyboardEvent) => {
      if (topDialog() !== root) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); closeRef.current();
      }
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); root.focus(); return; }
        if (!root.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
          event.preventDefault(); (event.shiftKey ? last : first)?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      const wasTop = topDialog() === root;
      const index = dialogs.indexOf(root);
      if (index >= 0) dialogs.splice(index, 1);
      document.removeEventListener('keydown', keydown, true);
      if (wasTop && previous?.isConnected && (!topDialog() || topDialog()?.contains(previous))) previous.focus();
    };
  }, [open]);
  return ref;
}
