import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormFieldError } from './FormFieldError';

// ---------------------------------------------------------------------------
// RED phase — UFR-022 / RUN_ID 2026-05-23-web-refactor-p1
// These tests fail until museum-web/src/components/forms/FormFieldError.tsx is created.
// Spec U-R18.1..U-R18.5 + design §1.5.
// ---------------------------------------------------------------------------

describe('FormFieldError', () => {
  it('renders null when error is undefined (U-R18.3)', () => {
    const { container } = render(<FormFieldError />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when error is the empty string (U-R18.3)', () => {
    const { container } = render(<FormFieldError error="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a <p role="alert"> with the error text when error is set', () => {
    render(<FormFieldError error="Required field" />);
    const node = screen.getByRole('alert');
    expect(node).toBeInTheDocument();
    expect(node.tagName).toBe('P');
    expect(node.textContent).toBe('Required field');
  });

  it('propagates the id prop on the rendered <p> (for aria-describedby wiring)', () => {
    render(<FormFieldError id="email-error" error="Invalid" />);
    const node = screen.getByRole('alert');
    expect(node.getAttribute('id')).toBe('email-error');
  });

  it('applies the default Tailwind classes when no className is provided', () => {
    render(<FormFieldError error="Boom" />);
    const node = screen.getByRole('alert');
    expect(node.className).toContain('mt-1');
    expect(node.className).toContain('text-sm');
    expect(node.className).toContain('text-red-700');
  });

  it('uses the provided className override when supplied (no default merge)', () => {
    render(<FormFieldError error="Boom" className="custom-only" />);
    const node = screen.getByRole('alert');
    expect(node.className).toContain('custom-only');
    // When the caller supplies a className override, the default is not applied
    // (design §1.5 default-OR-override semantic).
    expect(node.className).not.toContain('text-red-700');
  });
});
