import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type Ref } from 'react';

export interface BaseModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  titleId?: string;
  size?: 'sm' | 'md' | 'lg';
  dismissable?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  backdropClassName?: string;
  panelClassName?: string;
  panelRef?: Ref<HTMLDivElement>;
}

const BACKDROP_CLASSES = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/40';

const PANEL_COMMON_CLASSES = 'w-full rounded-2xl bg-white p-6 shadow-xl';

const PANEL_SIZE_CLASSES: Record<NonNullable<BaseModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

const HEADING_CLASSES = 'text-lg font-bold text-text-primary';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function BaseModal({
  open,
  onClose,
  title,
  titleId,
  size = 'md',
  dismissable = true,
  children,
  footer,
  backdropClassName,
  panelClassName,
  panelRef,
}: BaseModalProps) {
  const internalPanelRef = useRef<HTMLDivElement | null>(null);
  const generatedId = useId();

  const resolvedLabelledBy: string | undefined =
    titleId ?? (title !== undefined ? generatedId : undefined);

  useEffect(() => {
    if (!open || !dismissable) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, dismissable, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const panel = internalPanelRef.current;
    if (!panel) {
      return;
    }
    const explicit = panel.querySelector<HTMLElement>('[data-autofocus]');
    if (explicit !== null) {
      explicit.focus();
      return;
    }
    const focusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusable !== null) {
      focusable.focus();
      return;
    }
    panel.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!dismissable) {
      return;
    }
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const composedPanelRef = (node: HTMLDivElement | null) => {
    internalPanelRef.current = node;
    if (typeof panelRef === 'function') {
      panelRef(node);
    } else if (panelRef !== null && panelRef !== undefined) {
      (panelRef as { current: HTMLDivElement | null }).current = node;
    }
  };

  const backdropClasses = backdropClassName ?? BACKDROP_CLASSES;
  const panelClasses = panelClassName ?? `${PANEL_COMMON_CLASSES} ${PANEL_SIZE_CLASSES[size]}`;

  return (
    <div role="presentation" className={backdropClasses} onClick={handleBackdropClick}>
      <div
        ref={composedPanelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={resolvedLabelledBy}
        tabIndex={-1}
        className={panelClasses}
      >
        {title !== undefined && titleId === undefined && (
          <h2 id={generatedId} className={HEADING_CLASSES}>
            {title}
          </h2>
        )}
        {children}
        {footer}
      </div>
    </div>
  );
}
