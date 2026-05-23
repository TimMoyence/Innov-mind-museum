import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HoneypotField } from './HoneypotField';

// ---------------------------------------------------------------------------
// RED phase — UFR-022 / RUN_ID 2026-05-23-web-refactor-p4
// These tests fail until museum-web/src/components/forms/HoneypotField.tsx is created.
// Spec U-R1..U-R4, E-R1..E-R2, O-R1..O-R2, O-R7, UB-R1..UB-R2 + design §2.1.
//
// lib-docs/react/PATTERNS.md §4 (pure presentational, no hooks),
// §5 (no innerHTML, no useId literal assertion), §8 (fireEvent over userEvent
// — convention museum-web). Caller-owned controlled input.
// ---------------------------------------------------------------------------

describe('HoneypotField', () => {
  // ── Rendering ──────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders an <input type="text"> with the controlled value (U-R2)', () => {
      render(<HoneypotField value="hello" onChange={() => undefined} />);
      const input = screen.getByDisplayValue('hello');
      expect(input.tagName).toBe('INPUT');
      expect(input.getAttribute('type')).toBe('text');
    });

    it('renders an empty input when controlled value is "" (E-R2 — controlled contract)', () => {
      const { container } = render(<HoneypotField value="" onChange={() => undefined} />);
      const input = container.querySelector('input');
      expect(input).not.toBeNull();
      expect((input as HTMLInputElement).value).toBe('');
    });

    it('renders a <label> bound to the input via htmlFor/id (U-R4)', () => {
      const { container } = render(<HoneypotField value="" onChange={() => undefined} />);
      const input = container.querySelector('input');
      const label = container.querySelector('label');
      expect(input).not.toBeNull();
      expect(label).not.toBeNull();
      const inputId = (input as HTMLInputElement).getAttribute('id');
      expect(inputId).not.toBeNull();
      expect(inputId).not.toBe('');
      expect(label?.getAttribute('for')).toBe(inputId);
    });
  });

  // ── Off-screen positioning + a11y hiding (U-R1, UB-R1, NFR-SECURITY-1) ─

  describe('off-screen positioning + aria-hidden wrapper (U-R1, UB-R1)', () => {
    it('wrapper has aria-hidden="true"', () => {
      const { container } = render(<HoneypotField value="" onChange={() => undefined} />);
      // The wrapper is the <input>'s closest ancestor element with aria-hidden.
      const wrapper = container.querySelector('[aria-hidden="true"]');
      expect(wrapper).not.toBeNull();
    });

    it('wrapper applies an off-screen inline style (left: -10000px + position: absolute + overflow: hidden, height/width 0)', () => {
      const { container } = render(<HoneypotField value="" onChange={() => undefined} />);
      const wrapper = container.querySelector('[aria-hidden="true"]');
      expect(wrapper).not.toBeNull();
      // jsdom exposes inline styles via the `.style` IDL — we assert each
      // critical property explicitly rather than coupling to the serialized
      // `style` attribute string ordering.
      const style = (wrapper as HTMLElement).style;
      expect(style.position).toBe('absolute');
      expect(style.left).toBe('-10000px');
      expect(style.overflow).toBe('hidden');
      // width / height must be zero (jsdom may serialize as "0" or "0px";
      // accept either — both are zero-extent in CSS).
      expect(['0', '0px']).toContain(style.width);
      expect(['0', '0px']).toContain(style.height);
    });
  });

  // ── Input attributes (U-R3, UB-R2, NFR-SECURITY-1) ─────────────────────

  describe('input a11y + anti-autofill attributes (U-R3, UB-R2)', () => {
    it('input has tabIndex=-1 (UB-R2 — not in sequential tab order)', () => {
      const { container } = render(<HoneypotField value="" onChange={() => undefined} />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input.tabIndex).toBe(-1);
    });

    it('input has autoComplete="off"', () => {
      const { container } = render(<HoneypotField value="" onChange={() => undefined} />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input.getAttribute('autocomplete')).toBe('off');
    });

    it('input has aria-hidden="true"', () => {
      const { container } = render(<HoneypotField value="" onChange={() => undefined} />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input.getAttribute('aria-hidden')).toBe('true');
    });
  });

  // ── onChange contract (E-R1) ───────────────────────────────────────────

  describe('onChange contract (E-R1)', () => {
    it('fires onChange with the new string when the input changes', () => {
      const onChange = vi.fn<(value: string) => void>();
      const { container } = render(<HoneypotField value="" onChange={onChange} />);
      const input = container.querySelector('input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'spam-bot' } });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('spam-bot');
    });
  });

  // ── fieldName prop (O-R1) ──────────────────────────────────────────────

  describe('fieldName prop (O-R1)', () => {
    it('defaults to name="website" when no fieldName is provided', () => {
      const { container } = render(<HoneypotField value="" onChange={() => undefined} />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input.getAttribute('name')).toBe('website');
    });

    it('uses the custom fieldName as the name attribute', () => {
      const { container } = render(
        <HoneypotField value="" onChange={() => undefined} fieldName="trap" />,
      );
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input.getAttribute('name')).toBe('trap');
    });
  });

  // ── labelText prop (O-R2, NFR-I18N-1) ──────────────────────────────────

  describe('labelText prop (O-R2 / NFR-I18N-1)', () => {
    it('defaults the label text to "Website" when not provided', () => {
      const { container } = render(<HoneypotField value="" onChange={() => undefined} />);
      const label = container.querySelector('label');
      expect(label?.textContent).toBe('Website');
    });

    it('renders the custom labelText override', () => {
      const { container } = render(
        <HoneypotField value="" onChange={() => undefined} labelText="Leave blank" />,
      );
      const label = container.querySelector('label');
      expect(label?.textContent).toBe('Leave blank');
    });
  });

  // ── className wrapper merge (O-R7) ─────────────────────────────────────

  describe('className prop on wrapper (O-R7)', () => {
    it('appends the className to the wrapper without disabling the off-screen inline style', () => {
      // design.md §2.1 + §1 OQ-7 — the default off-screen positioning is
      // expressed via INLINE STYLE (not Tailwind classes); a custom className
      // therefore composes ADDITIVELY: classes appear on the wrapper but the
      // critical `left: -10000px` style remains intact. (UB-R1 invariant.)
      const { container } = render(
        <HoneypotField value="" onChange={() => undefined} className="custom-wrap" />,
      );
      const wrapper = container.querySelector('[aria-hidden="true"]');
      expect(wrapper).not.toBeNull();
      expect((wrapper as HTMLElement).className).toContain('custom-wrap');
      // Off-screen positioning MUST survive (invariant — anti-bot guarantee).
      expect((wrapper as HTMLElement).style.left).toBe('-10000px');
      expect((wrapper as HTMLElement).style.position).toBe('absolute');
    });
  });
});
