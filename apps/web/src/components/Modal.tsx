import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  customHeader?: ReactNode;
  hideHeader?: boolean;
  maxWidthClassName?: string;
  bodyClassName?: string;
  fullHeightOnMobile?: boolean;
}

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  customHeader,
  hideHeader = false,
  maxWidthClassName = 'max-w-lg',
  bodyClassName = 'px-4 py-2',
  fullHeightOnMobile = false,
}: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const mouseDownTarget = useRef<EventTarget | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    (focusable()[0] ?? panel.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        panel.current?.focus();
        return;
      }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const modalElement = (
    <div
      onMouseDown={(event) => {
        mouseDownTarget.current = event.target;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && mouseDownTarget.current === event.currentTarget) {
          onClose();
        }
      }}
      className={`fixed inset-0 z-[90] flex items-center justify-center bg-black/65 backdrop-blur-sm animate-[backdropIn_0.15s_ease-out_both] ${
        fullHeightOnMobile ? 'p-2 sm:p-6' : 'p-4'
      }`}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`flex w-full ${maxWidthClassName} animate-[modalIn_0.18s_cubic-bezier(0.16,1,0.3,1)_both] flex-col overflow-hidden rounded-2xl border border-strong bg-bg-2 shadow-2xl outline-none ${
          fullHeightOnMobile ? 'h-[95dvh] sm:h-auto sm:max-h-[90dvh]' : 'max-h-[85vh]'
        }`}
      >
        {!hideHeader &&
          (customHeader ? (
            customHeader
          ) : (
            <header
              className={`flex flex-shrink-0 items-center justify-between gap-3 ${
                description ? 'border-b border-subtle px-5 py-4 sm:px-6' : 'px-4 py-3'
              }`}
            >
              <div className="min-w-0">
                {title && (
                  <h2 className={description ? 'text-base font-semibold tracking-tight' : 'text-sm font-medium'}>
                    {title}
                  </h2>
                )}
                {description && <p className="mt-1 text-xs text-txt-2">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                title="Close (Esc)"
                className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-subtle text-txt-2 transition-colors hover:border-accent hover:text-accent-2"
              >
                <CloseIcon className="h-4 w-4 fill-none stroke-current" />
              </button>
            </header>
          ))}
        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
        {footer}
      </div>
    </div>
  );

  return createPortal(modalElement, document.body);
}
