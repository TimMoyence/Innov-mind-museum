import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalActions } from './ModalActions';

// ---------------------------------------------------------------------------
// RED phase — UFR-022 / RUN_ID 2026-05-23-web-refactor-p2
// These tests fail until museum-web/src/components/ui/ModalActions.tsx is
// created. Spec REQ-U-6, REQ-U-7, REQ-U-8, REQ-E-4, REQ-E-5, REQ-UN-4
// + design §2.1..§2.4 + tasks Step A2 (8 cas).
//
// Composant pur (zero hook), 2 boutons Cancel + Confirm, variants
// destructive / busy / disabled, ref forwarding via React 19 ref-as-prop.
// ---------------------------------------------------------------------------

describe('ModalActions', () => {
  // ── T1 — REQ-U-6 + REQ-UN-4 ────────────────────────────────────────────
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
    // Cancel must appear before Confirm in DOM order (REQ-U-6 "à gauche puis à droite").
    expect(cancel.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // ── T2 — REQ-U-7 destructive ──────────────────────────────────────────
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
    // Defense-in-depth: must NOT carry the primary palette.
    expect(confirm.className).not.toContain('bg-primary-600');
  });

  // ── T3 — REQ-U-7 default primary ───────────────────────────────────────
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

  // ── T4 — REQ-E-4 ───────────────────────────────────────────────────────
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

  // ── T5 — REQ-E-5 ───────────────────────────────────────────────────────
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

  // ── T6 — REQ-E-5 confirmDisabled ───────────────────────────────────────
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
    // jsdom: clicks on a disabled <button> do not fire onClick by default.
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // ── T7 — confirmBusy (design §2.4 label '…' U+2026) ────────────────────
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
    // The confirm button now exposes accessible name '…' (U+2026), not 'Save'.
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    const confirm = screen.getByRole('button', { name: '…' });
    expect(confirm).toBeDisabled();
    expect(confirm.textContent).toBe('…');
    // Sanity: U+2026 not three ASCII dots.
    expect(confirm.textContent).not.toBe('...');
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // ── T8 — confirmRef forwarding (React 19 ref-as-prop) ──────────────────
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
    // The ref MUST point to the Confirm button, not Cancel.
    expect(ref.current).toBe(screen.getByRole('button', { name: 'OK' }));
  });
});

// ---------------------------------------------------------------------------
// Wrapper layout & Cancel button styling (REQ-U-6, REQ-U-8)
// ---------------------------------------------------------------------------
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
