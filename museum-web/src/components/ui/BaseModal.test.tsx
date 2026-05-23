import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BaseModal } from './BaseModal';

// ---------------------------------------------------------------------------
// RED phase — UFR-022 / RUN_ID 2026-05-23-web-refactor-p2
// These tests fail until museum-web/src/components/ui/BaseModal.tsx is created.
// Spec REQ-U-1..REQ-U-5, REQ-E-1..REQ-E-3, REQ-S-1..REQ-S-3, REQ-O-1..REQ-O-2,
// REQ-UN-1..REQ-UN-3 + design §1.1..§1.4 + tasks Step A1 (13 cas).
//
// Structure rappel design §1.3 :
//   <div role="presentation" onClick=backdrop>
//     <div role="dialog" aria-modal="true" aria-labelledby tabIndex={-1}
//          onClick=stopPropagation>
//       …
//     </div>
//   </div>
// ---------------------------------------------------------------------------

describe('BaseModal', () => {
  beforeEach(() => {
    // Reset focus to body before each test for deterministic focus assertions.
    if (typeof document !== 'undefined' && document.body) {
      document.body.focus();
    }
  });

  // ── T1 — REQ-U-1 ───────────────────────────────────────────────────────
  it('T1: open=false renders nothing (REQ-U-1)', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BaseModal open={false} onClose={onClose} title="Hidden">
        <p>Body</p>
      </BaseModal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  // ── T2 — REQ-U-2 + REQ-U-3 ─────────────────────────────────────────────
  it('T2: open=true + title="Hello" exposes role=dialog + aria-modal=true + h2 auto-id wired (REQ-U-2, REQ-U-3)', () => {
    const onClose = vi.fn();
    render(
      <BaseModal open onClose={onClose} title="Hello">
        <p>Body</p>
      </BaseModal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const heading = screen.getByRole('heading', { level: 2, name: 'Hello' });
    expect(heading).toBeInTheDocument();
    const headingId = heading.getAttribute('id');
    expect(headingId).toBeTruthy();
    expect(dialog.getAttribute('aria-labelledby')).toBe(headingId);
  });

  // ── T3 — REQ-U-3 alinéa titleId ────────────────────────────────────────
  it('T3: titleId prop wires aria-labelledby and skips internal h2 (REQ-U-3)', () => {
    const onClose = vi.fn();
    render(
      <BaseModal open onClose={onClose} titleId="custom-id">
        <h2 id="custom-id">Custom Heading</h2>
        <p>Body</p>
      </BaseModal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe('custom-id');

    // Only the consumer-provided h2 should exist; BaseModal must NOT render
    // its own auto-generated h2 (design §1.3 alinéa titleId branch).
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.getAttribute('id')).toBe('custom-id');
    expect(headings[0]?.textContent).toBe('Custom Heading');
  });

  // ── T4 — REQ-E-1 ───────────────────────────────────────────────────────
  it('T4: Escape closes when dismissable=true (REQ-E-1)', () => {
    const onClose = vi.fn();
    render(
      <BaseModal open onClose={onClose} title="X" dismissable>
        <p>Body</p>
      </BaseModal>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── T5 — REQ-O-1 (Escape disabled) ─────────────────────────────────────
  it('T5: Escape does NOT close when dismissable=false (REQ-O-1)', () => {
    const onClose = vi.fn();
    render(
      <BaseModal open onClose={onClose} title="X" dismissable={false}>
        <p>Body</p>
      </BaseModal>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── T6 — REQ-E-2 ───────────────────────────────────────────────────────
  it('T6: backdrop click closes when dismissable=true (REQ-E-2)', () => {
    const onClose = vi.fn();
    render(
      <BaseModal open onClose={onClose} title="X" dismissable>
        <p>Body</p>
      </BaseModal>,
    );
    // The backdrop is the parent of the role=dialog element (design §1.3
    // structure: <div role="presentation"> wraps <div role="dialog">).
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── T7 — REQ-E-3 ───────────────────────────────────────────────────────
  it('T7: click inside panel does NOT close (REQ-E-3, stopPropagation)', () => {
    const onClose = vi.fn();
    render(
      <BaseModal open onClose={onClose} title="X" dismissable>
        <p>Body</p>
      </BaseModal>,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── T8 — REQ-S-1 (focus auto on first focusable) ───────────────────────
  it('T8: focus moves to first focusable child on open (REQ-S-1, AC-11)', () => {
    const onClose = vi.fn();
    render(
      <BaseModal open onClose={onClose} title="X">
        <button type="button">First</button>
        <button type="button">Second</button>
      </BaseModal>,
    );
    const dialog = screen.getByRole('dialog');
    const firstButton = screen.getByRole('button', { name: 'First' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(firstButton);
  });

  // ── T9 — REQ-S-1 alinéa fallback ───────────────────────────────────────
  it('T9: focus falls back to panel itself (tabIndex=-1) when no focusable child (REQ-S-1 alinéa 2)', () => {
    const onClose = vi.fn();
    render(
      <BaseModal open onClose={onClose} title="X">
        <p>Just text, no focusable element</p>
      </BaseModal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(dialog);
  });

  // ── T10 — REQ-UN-1 (no global listener when open=false) ────────────────
  it('T10: does NOT attach keydown window listener when open=false (REQ-UN-1)', () => {
    const onClose = vi.fn();
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(
      <BaseModal open={false} onClose={onClose} title="X">
        <p>Body</p>
      </BaseModal>,
    );
    const keydownCalls = addSpy.mock.calls.filter(([evt]) => evt === 'keydown');
    expect(keydownCalls).toHaveLength(0);
    addSpy.mockRestore();
  });

  // ── T11 — REQ-S-3 (cleanup on unmount) ─────────────────────────────────
  it('T11: removes keydown listener on unmount (REQ-S-3)', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <BaseModal open onClose={onClose} title="X" dismissable>
        <p>Body</p>
      </BaseModal>,
    );
    // Sanity: Escape works while mounted.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();

    // After unmount, Escape must NOT call onClose anymore (listener detached).
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── T12 — REQ-U-5 (size variants) ──────────────────────────────────────
  it('T12: size variants apply max-w-sm | max-w-md | max-w-lg (REQ-U-5)', () => {
    const onClose = vi.fn();

    const { unmount: unmountSm } = render(
      <BaseModal open onClose={onClose} title="X" size="sm">
        <p>Body</p>
      </BaseModal>,
    );
    const dialogSm = screen.getByRole('dialog');
    expect(dialogSm.className).toContain('max-w-sm');
    expect(dialogSm.className).toContain('rounded-2xl');
    expect(dialogSm.className).toContain('bg-white');
    expect(dialogSm.className).toContain('p-6');
    expect(dialogSm.className).toContain('shadow-xl');
    unmountSm();

    const { unmount: unmountMd } = render(
      <BaseModal open onClose={onClose} title="X" size="md">
        <p>Body</p>
      </BaseModal>,
    );
    expect(screen.getByRole('dialog').className).toContain('max-w-md');
    unmountMd();

    render(
      <BaseModal open onClose={onClose} title="X" size="lg">
        <p>Body</p>
      </BaseModal>,
    );
    expect(screen.getByRole('dialog').className).toContain('max-w-lg');
  });

  // ── T13 — AC-7 (backdrop click no-op when dismissable=false) ───────────
  it('T13: backdrop click does NOT close when dismissable=false (AC-7, REQ-O-1)', () => {
    const onClose = vi.fn();
    render(
      <BaseModal open onClose={onClose} title="X" dismissable={false}>
        <p>Body</p>
      </BaseModal>,
    );
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Backdrop scaffold canonical Tailwind classes (REQ-U-4)
// Verified by an extra assertion bloc — covers AC-6 single-source-of-truth.
// ---------------------------------------------------------------------------
describe('BaseModal — canonical scaffold classes (REQ-U-4)', () => {
  it('backdrop wrapper carries fixed inset-0 z-[60] flex items-center justify-center bg-black/40', () => {
    const onClose = vi.fn();
    render(
      <BaseModal open onClose={onClose} title="X">
        <p>Body</p>
      </BaseModal>,
    );
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement;
    expect(backdrop).not.toBeNull();
    const cls = (backdrop as HTMLElement).className;
    expect(cls).toContain('fixed');
    expect(cls).toContain('inset-0');
    expect(cls).toContain('z-[60]');
    expect(cls).toContain('flex');
    expect(cls).toContain('items-center');
    expect(cls).toContain('justify-center');
    expect(cls).toContain('bg-black/40');
  });
});

// ---------------------------------------------------------------------------
// Footer slot (REQ-O-2)
// ---------------------------------------------------------------------------
describe('BaseModal — footer slot (REQ-O-2)', () => {
  it('renders the footer node after children when provided', () => {
    const onClose = vi.fn();
    render(
      <BaseModal
        open
        onClose={onClose}
        title="X"
        footer={<div data-testid="footer-slot">Footer here</div>}
      >
        <p data-testid="body-slot">Body here</p>
      </BaseModal>,
    );
    const body = screen.getByTestId('body-slot');
    const footer = screen.getByTestId('footer-slot');
    expect(body).toBeInTheDocument();
    expect(footer).toBeInTheDocument();
    // Order: body precedes footer in DOM (REQ-O-2 "rendered after children").
    expect(body.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
