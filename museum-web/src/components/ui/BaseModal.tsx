import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type Ref } from 'react';

/**
 * Generic modal scaffold (overlay + panel + dismiss + focus-on-open).
 *
 * UFR-022 RUN_ID 2026-05-23-web-refactor-p2 — replaces the byte-for-byte
 * duplicated scaffold (`fixed inset-0 z-[60] flex items-center justify-center
 * bg-black/40` + Escape window listener + backdrop click handler) found in
 * 8 admin sites (TierToggleButton + tickets/users/users[id]/reports/reviews).
 *
 * Structure (design §1.3 — keeps ESLint happy, NFR-LINT-1):
 *
 *   <div role="presentation" onClick=backdrop>
 *     <div role="dialog" aria-modal="true" aria-labelledby tabIndex={-1}
 *          onClick=stopPropagation>
 *       {title && <h2 id={generatedId}>{title}</h2>}
 *       {children}
 *       {footer}
 *     </div>
 *   </div>
 *
 * Spec REQ-U-1..REQ-U-5, REQ-E-1..REQ-E-3, REQ-S-1..REQ-S-3,
 * REQ-O-1..REQ-O-2, REQ-UN-1..REQ-UN-3.
 *
 * @todo Phase V2 — return-focus on close (OQ-1).
 * @todo Phase V2 — focus-trap (Tab/Shift+Tab) via Radix migration (OQ-2).
 * @todo Phase V2 — scroll-lock body (OQ-3).
 */
export interface BaseModalProps {
  /** Visible state. `false` → renders nothing (REQ-U-1). */
  open: boolean;
  /** Dismiss handler called by Escape / backdrop. Always required even when
   *  `dismissable=false` (consumer passes `() => {}` no-op). (OQ-7) */
  onClose: () => void;
  /** Optional heading. When provided, BaseModal renders an internal
   *  `<h2 id={generatedId}>{title}</h2>` and wires `aria-labelledby`. */
  title?: string;
  /** Pre-existing heading id rendered by the consumer in `children`.
   *  When provided, BaseModal does NOT render a heading itself and
   *  uses `aria-labelledby={titleId}`. Mutually exclusive with `title`. */
  titleId?: string;
  /** Panel max-width variant (REQ-U-5). Default `'md'`. */
  size?: 'sm' | 'md' | 'lg';
  /** When `false`, disables Escape + backdrop click (REQ-O-1). Default `true`. */
  dismissable?: boolean;
  /** Modal body. */
  children: ReactNode;
  /** Optional footer slot (typically `<ModalActions … />`). Rendered
   *  after `children` (REQ-O-2). */
  footer?: ReactNode;
  /** Escape hatch to override default backdrop classes. Rarely used. */
  backdropClassName?: string;
  /** Escape hatch to override default panel classes. Rarely used. */
  panelClassName?: string;
  /** Optional ref forwarded to the panel element (React 19 ref-as-prop). */
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

  // Resolve aria-labelledby (REQ-U-3).
  const resolvedLabelledBy: string | undefined =
    titleId ?? (title !== undefined ? generatedId : undefined);

  // Escape key listener (REQ-E-1, REQ-S-3, REQ-UN-1, REQ-O-1).
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

  // Focus management on open (REQ-S-1).
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
    // REQ-E-2 + REQ-E-3: only fire onClose when the click target is the
    // backdrop itself; clicks bubbling up from the panel (or its descendants)
    // are ignored because `e.target` !== `e.currentTarget`.
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Compose panel ref: keep internal ref for focus mgmt AND forward to caller.
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
