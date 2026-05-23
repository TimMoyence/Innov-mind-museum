import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertBanner } from './AlertBanner';

// ---------------------------------------------------------------------------
// RED phase — UFR-022 / RUN_ID 2026-05-23-web-refactor-p1
// These tests fail until museum-web/src/components/ui/AlertBanner.tsx is created.
// Spec U-R14.1..U-R14.5 + design §1.4.
// ---------------------------------------------------------------------------

describe('AlertBanner', () => {
  it('renders the message text as a text node (UB-2 — no innerHTML)', () => {
    render(<AlertBanner variant="error" message="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('error variant uses role="alert" and red Tailwind palette', () => {
    render(<AlertBanner variant="error" message="Boom" />);
    const node = screen.getByRole('alert');
    expect(node).toBeInTheDocument();
    expect(node.className).toContain('bg-red-50');
    expect(node.className).toContain('text-red-700');
  });

  it('success variant uses role="alert" and green Tailwind palette', () => {
    render(<AlertBanner variant="success" message="Saved" />);
    const node = screen.getByRole('alert');
    expect(node).toBeInTheDocument();
    expect(node.className).toContain('bg-green-50');
    expect(node.className).toContain('text-green-700');
  });

  it('info variant uses role="status" (not "alert") and blue Tailwind palette', () => {
    render(<AlertBanner variant="info" message="Heads up" />);
    const node = screen.getByRole('status');
    expect(node).toBeInTheDocument();
    expect(node.className).toContain('bg-blue-50');
    expect(node.className).toContain('text-blue-700');
    // role="status" implies NOT role="alert" for info (NFR-A11Y-3, design §1.4)
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('applies the shared rounded-lg padding shell across all variants', () => {
    render(<AlertBanner variant="error" message="X" />);
    const node = screen.getByRole('alert');
    expect(node.className).toContain('rounded-lg');
    expect(node.className).toContain('px-4');
    expect(node.className).toContain('py-3');
    expect(node.className).toContain('text-sm');
  });

  it('merges a custom className with the variant classes', () => {
    render(<AlertBanner variant="error" message="X" className="mt-4 extra-class" />);
    const node = screen.getByRole('alert');
    expect(node.className).toContain('mt-4');
    expect(node.className).toContain('extra-class');
    // Variant classes must still be present.
    expect(node.className).toContain('bg-red-50');
  });
});
