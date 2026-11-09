import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertBanner } from './AlertBanner';

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
    expect(node.className).toContain('bg-red-50');
  });

  it('exposes the error message as the announced content of the alert live region', () => {
    render(<AlertBanner variant="error" message="Save failed" />);
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Save failed');
  });

  it('error and success are assertive alert regions, info is a polite status', () => {
    const { rerender } = render(<AlertBanner variant="error" message="E" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<AlertBanner variant="success" message="S" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<AlertBanner variant="info" message="I" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the message as plain text (no raw HTML injection)', () => {
    render(<AlertBanner variant="error" message="<b>x</b> & y" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('<b>x</b> & y');
    expect(alert.querySelector('b')).toBeNull();
  });
});
