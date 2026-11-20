import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * A small centred dialog / bottom sheet.
 *
 * One primitive for three jobs (create a playlist, add a song to a list,
 * import one) so they share positioning, Escape handling, scroll locking and
 * the same restrained motion. On a phone it slides up from the bottom; on a
 * desktop it fades in as a centred card — the same breakpoint the queue panel
 * already uses.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  // Escape closes, and the body behind must not scroll while a sheet is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      cancelAnimationFrame(raf);
    };
  }, [onClose]);

  return (
    <div
      className={`sheet-backdrop${mounted ? ' in' : ''}`}
      onClick={(e) => {
        // Only a tap on the backdrop itself closes: a drag that ends here
        // (scrolling a long list) must not dismiss the sheet.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`sheet${wide ? ' sheet-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="sheet-head">
          <div className="sheet-head-text">
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer ? <footer className="sheet-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
