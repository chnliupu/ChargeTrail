import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional max-width class override; defaults to a comfortable form width. */
  widthClassName?: string;
};

/**
 * Minimal accessible modal: backdrop dimmer, Escape to close, locks body
 * scroll while open. Not a focus-trap (acceptable for our internal admin UI).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  widthClassName = 'max-w-lg',
}: DialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${widthClassName} rounded-xl border border-border bg-card text-text shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close dialog')}
            className="rounded p-1 text-text-dim transition-colors hover:bg-card-hover hover:text-text"
          >
            <svg
              viewBox="0 0 16 16"
              width={14}
              height={14}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
