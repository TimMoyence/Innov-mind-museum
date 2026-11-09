import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BaseModal } from './BaseModal';

describe('BaseModal', () => {
  beforeEach(() => {
    if (typeof document !== 'undefined' && document.body) {
      document.body.focus();
    }
  });

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

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.getAttribute('id')).toBe('custom-id');
    expect(headings[0]?.textContent).toBe('Custom Heading');
  });

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

  it('T6: backdrop click closes when dismissable=true (REQ-E-2)', () => {
    const onClose = vi.fn();
    render(
      <BaseModal open onClose={onClose} title="X" dismissable>
        <p>Body</p>
      </BaseModal>,
    );
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

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

  it('T11: removes keydown listener on unmount (REQ-S-3)', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <BaseModal open onClose={onClose} title="X" dismissable>
        <p>Body</p>
      </BaseModal>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

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
    expect(body.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
