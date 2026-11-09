import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalActions } from './ModalActions';

describe('ModalActions', () => {
  it('T1: renders Cancel + Confirm buttons with the provided i18n labels (REQ-U-6, REQ-UN-4)', () => {
    render(
      <ModalActions
        cancelLabel="Annuler"
        confirmLabel="Confirmer"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const cancel = screen.getByRole('button', { name: 'Annuler' });
    const confirm = screen.getByRole('button', { name: 'Confirmer' });
    expect(cancel).toBeInTheDocument();
    expect(confirm).toBeInTheDocument();
    expect(cancel.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('T2: destructive=true applies bg-red-600 on Confirm button (REQ-U-7)', () => {
    render(
      <ModalActions
        cancelLabel="Cancel"
        confirmLabel="Delete"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        destructive
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm.className).toContain('bg-red-600');
    expect(confirm.className).toContain('hover:bg-red-700');
    expect(confirm.className).not.toContain('bg-primary-600');
  });

  it('T3: destructive unset applies bg-primary-600 on Confirm button (REQ-U-7)', () => {
    render(
      <ModalActions
        cancelLabel="Cancel"
        confirmLabel="OK"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'OK' });
    expect(confirm.className).toContain('bg-primary-600');
    expect(confirm.className).toContain('hover:bg-primary-700');
    expect(confirm.className).not.toContain('bg-red-600');
  });

  it('T4: clicking Cancel fires onCancel (REQ-E-4)', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ModalActions
        cancelLabel="Cancel"
        confirmLabel="OK"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('T5: clicking Confirm fires onConfirm (REQ-E-5)', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ModalActions
        cancelLabel="Cancel"
        confirmLabel="OK"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('T6: confirmDisabled=true marks Confirm as disabled and ignores clicks (REQ-E-5)', () => {
    const onConfirm = vi.fn();
    render(
      <ModalActions
        cancelLabel="Cancel"
        confirmLabel="OK"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        confirmDisabled
      />,
    );
    const confirm = screen.getByRole('button', { name: 'OK' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('T7: confirmBusy=true disables Confirm AND replaces label with "…" (U+2026)', () => {
    const onConfirm = vi.fn();
    render(
      <ModalActions
        cancelLabel="Cancel"
        confirmLabel="Save"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        confirmBusy
      />,
    );
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    const confirm = screen.getByRole('button', { name: '…' });
    expect(confirm).toBeDisabled();
    expect(confirm.textContent).toBe('…');
    expect(confirm.textContent).not.toBe('...');
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('T8: confirmRef receives the Confirm <button> element (React 19 ref-as-prop)', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <ModalActions
        cancelLabel="Cancel"
        confirmLabel="OK"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        confirmRef={ref}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe('OK');
    expect(ref.current).toBe(screen.getByRole('button', { name: 'OK' }));
  });
});

describe('ModalActions — layout & Cancel styling', () => {
  it('wrapper carries mt-6 flex justify-end gap-3 (REQ-U-6)', () => {
    render(
      <ModalActions
        cancelLabel="Cancel"
        confirmLabel="OK"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const wrapper = cancel.parentElement;
    expect(wrapper).not.toBeNull();
    const cls = (wrapper as HTMLElement).className;
    expect(cls).toContain('mt-6');
    expect(cls).toContain('flex');
    expect(cls).toContain('justify-end');
    expect(cls).toContain('gap-3');
  });

  it('Cancel button carries the canonical Tailwind palette (REQ-U-8)', () => {
    render(
      <ModalActions
        cancelLabel="Cancel"
        confirmLabel="OK"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const cls = cancel.className;
    expect(cls).toContain('rounded-lg');
    expect(cls).toContain('px-4');
    expect(cls).toContain('py-2');
    expect(cls).toContain('text-sm');
    expect(cls).toContain('font-medium');
    expect(cls).toContain('text-text-secondary');
    expect(cls).toContain('hover:bg-surface-muted');
    expect(cls).toContain('disabled:opacity-50');
  });

  it('Cancel button is disabled while confirmBusy=true (design §2.4 mirroring TierToggleButton)', () => {
    render(
      <ModalActions
        cancelLabel="Cancel"
        confirmLabel="Save"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        confirmBusy
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
