import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders without crashing and exposes role="status" (NFR-A11Y-1)', () => {
    render(<Spinner />);
    const node = screen.getByRole('status');
    expect(node).toBeInTheDocument();
  });

  it('applies default size "md" classes (h-8 w-8 border-4)', () => {
    render(<Spinner />);
    const node = screen.getByRole('status');
    expect(node.className).toContain('h-8');
    expect(node.className).toContain('w-8');
    expect(node.className).toContain('border-4');
  });

  it('applies size="sm" classes (h-5 w-5 border-2)', () => {
    render(<Spinner size="sm" />);
    const node = screen.getByRole('status');
    expect(node.className).toContain('h-5');
    expect(node.className).toContain('w-5');
    expect(node.className).toContain('border-2');
  });

  it('applies size="lg" classes (h-12 w-12 border-4)', () => {
    render(<Spinner size="lg" />);
    const node = screen.getByRole('status');
    expect(node.className).toContain('h-12');
    expect(node.className).toContain('w-12');
    expect(node.className).toContain('border-4');
  });

  it('always applies the animate-spin Tailwind class (NFR-PERF-1, U-R12.4)', () => {
    render(<Spinner />);
    const node = screen.getByRole('status');
    expect(node.className).toContain('animate-spin');
  });

  it('uses a default English fallback label when none is provided', () => {
    render(<Spinner />);
    const node = screen.getByRole('status');
    const accessible = node.getAttribute('aria-label') ?? node.textContent;
    expect(accessible.length).toBeGreaterThan(0);
    expect(accessible.toLowerCase()).toContain('loading');
  });

  it('exposes the injected label via aria-label AND an sr-only span (U-R12.3)', () => {
    render(<Spinner label="Chargement en cours" />);
    const node = screen.getByRole('status');
    expect(node.getAttribute('aria-label')).toBe('Chargement en cours');
    expect(node.textContent).toContain('Chargement en cours');
    const srOnly = node.querySelector('.sr-only');
    expect(srOnly).not.toBeNull();
    expect(srOnly?.textContent).toBe('Chargement en cours');
  });

  it('merges a custom className with the variant classes', () => {
    render(<Spinner className="my-custom-class mt-4" />);
    const node = screen.getByRole('status');
    expect(node.className).toContain('my-custom-class');
    expect(node.className).toContain('mt-4');
    expect(node.className).toContain('animate-spin');
  });
});
