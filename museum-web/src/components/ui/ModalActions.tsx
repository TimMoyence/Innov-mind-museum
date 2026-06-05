import type { Ref } from 'react';

/**
 * Cancel/Confirm action footer for modals.
 *
 * UFR-022 RUN_ID 2026-05-23-web-refactor-p2 — replaces the duplicated
 * `mt-6 flex justify-end gap-3` + 2 button scaffolds present in 7/8 admin
 * modals (TierToggleButton + tickets/users/users[id]/reports). The
 * reviews/page.tsx modal keeps a bespoke inline footer (green/red dynamic)
 * by design (OQ-6 outlier).
 *
 * Pure functional component (zero hook → React Compiler-friendly).
 *
 * Spec REQ-U-6, REQ-U-7, REQ-U-8, REQ-E-4, REQ-E-5, REQ-UN-4.
 */
export interface ModalActionsProps {
  /** Localized label for the Cancel button (REQ-UN-4). */
  cancelLabel: string;
  /** Localized label for the Confirm button (REQ-UN-4). */
  confirmLabel: string;
  /** Click handler for the Cancel button (REQ-E-4). */
  onCancel: () => void;
  /** Click handler for the Confirm button (REQ-E-5).
   *  Ignored when `confirmDisabled` or `confirmBusy`. */
  onConfirm: () => void;
  /** When `true`, Confirm is `disabled` and ignores clicks. */
  confirmDisabled?: boolean;
  /** When `true`, Confirm is `disabled` AND label is replaced by '…' (U+2026).
   *  Cancel is also disabled while busy (prevents canceling an in-flight mutation). */
  confirmBusy?: boolean;
  /** When `true`, Confirm uses red palette (destructive action). */
  destructive?: boolean;
  /** Optional ref forwarded to the Confirm button (React 19 ref-as-prop). */
  confirmRef?: Ref<HTMLButtonElement>;
}

const WRAPPER_CLASSES = 'mt-6 flex justify-end gap-3';

const CANCEL_CLASSES =
  'rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-50';

const CONFIRM_BASE_CLASSES =
  'rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50';

const CONFIRM_DESTRUCTIVE_CLASSES = 'bg-red-600 hover:bg-red-700';
const CONFIRM_PRIMARY_CLASSES = 'bg-primary-600 hover:bg-primary-700';

const BUSY_LABEL = '…'; // U+2026 HORIZONTAL ELLIPSIS

export function ModalActions({
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  confirmDisabled,
  confirmBusy,
  destructive,
  confirmRef,
}: ModalActionsProps) {
  const isBusy = confirmBusy === true;
  const isConfirmDisabled = confirmDisabled === true || isBusy;

  const confirmVariantClass =
    destructive === true ? CONFIRM_DESTRUCTIVE_CLASSES : CONFIRM_PRIMARY_CLASSES;
  const confirmClasses = `${CONFIRM_BASE_CLASSES} ${confirmVariantClass}`;

  return (
    <div className={WRAPPER_CLASSES}>
      <button type="button" disabled={isBusy} onClick={onCancel} className={CANCEL_CLASSES}>
        {cancelLabel}
      </button>
      <button
        ref={confirmRef}
        type="button"
        disabled={isConfirmDisabled}
        onClick={onConfirm}
        className={confirmClasses}
      >
        {isBusy ? BUSY_LABEL : confirmLabel}
      </button>
    </div>
  );
}
