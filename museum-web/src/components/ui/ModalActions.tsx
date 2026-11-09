import type { Ref } from 'react';

export interface ModalActionsProps {
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  confirmBusy?: boolean;
  destructive?: boolean;
  confirmRef?: Ref<HTMLButtonElement>;
}

const WRAPPER_CLASSES = 'mt-6 flex justify-end gap-3';

const CANCEL_CLASSES =
  'rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-50';

const CONFIRM_BASE_CLASSES =
  'rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50';

const CONFIRM_DESTRUCTIVE_CLASSES = 'bg-red-600 hover:bg-red-700';
const CONFIRM_PRIMARY_CLASSES = 'bg-primary-600 hover:bg-primary-700';

const BUSY_LABEL = '…';

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
