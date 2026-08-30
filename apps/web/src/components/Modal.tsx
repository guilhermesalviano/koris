import { useEffect, type ReactNode } from 'react';
import { CloseIcon } from './Icons';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidthClassName?: string;
  /** Padding/layout of the scrollable body wrapper. Pass `p-0` for panes that manage their own layout. */
  bodyClassName?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidthClassName = 'max-w-lg',
  bodyClassName = 'px-4 py-2',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[85vh] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-card border border-subtle bg-bg-2 shadow-2xl`}
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-3 px-4 py-3">
          {title && <h2 className="text-sm font-medium">{title}</h2>}
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-subtle text-txt-2 hover:border-accent hover:text-accent-2"
          >
            <CloseIcon className="h-4 w-4 fill-none stroke-current" />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
}
