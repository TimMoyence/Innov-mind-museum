import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TableHeaderCell } from './TableHeaderCell';

// ---------------------------------------------------------------------------
// RED phase — UFR-022 / RUN_ID 2026-05-23-web-refactor-p4
// These tests fail until museum-web/src/components/ui/TableHeaderCell.tsx is created.
// Spec U-R5, O-R3, O-R5, O-R6, UB-R8, NFR-A11Y-2, NFR-PERF-1 + design §2.2.
//
// lib-docs/react/PATTERNS.md §4 (DO keep components PURE) + §8 (RTL conventions).
// Pure presentational `<th>` — no hooks, no state, no effects.
//
// Wrapped in a <table><thead><tr> harness so the rendered <th> sits in a valid
// table tree (jsdom is lenient but the parent context is required when consumers
// rely on default scope semantics — WCAG 1.3.1).
// ---------------------------------------------------------------------------

function renderInTable(ui: React.ReactElement) {
  return render(
    <table>
      <thead>
        <tr>{ui}</tr>
      </thead>
    </table>,
  );
}

describe('TableHeaderCell', () => {
  // ── Element type (U-R5, NFR-A11Y-2) ────────────────────────────────────

  describe('element + semantics', () => {
    it('renders a native <th> element (NFR-A11Y-2)', () => {
      const { container } = renderInTable(<TableHeaderCell>Name</TableHeaderCell>);
      const th = container.querySelector('th');
      expect(th).not.toBeNull();
      expect((th as HTMLElement).tagName).toBe('TH');
    });

    it('does NOT accidentally render a <td>', () => {
      const { container } = renderInTable(<TableHeaderCell>Name</TableHeaderCell>);
      expect(container.querySelector('td')).toBeNull();
    });

    it('renders children inside the <th>', () => {
      const { container } = renderInTable(<TableHeaderCell>Email address</TableHeaderCell>);
      const th = container.querySelector('th') as HTMLElement;
      expect(th.textContent).toBe('Email address');
    });
  });

  // ── Default classes (U-R5) ─────────────────────────────────────────────

  describe('default classes (U-R5)', () => {
    it('includes the shared defaults "px-6 py-3 font-medium text-text-secondary"', () => {
      const { container } = renderInTable(<TableHeaderCell>X</TableHeaderCell>);
      const th = container.querySelector('th') as HTMLElement;
      expect(th.className).toContain('px-6');
      expect(th.className).toContain('py-3');
      expect(th.className).toContain('font-medium');
      expect(th.className).toContain('text-text-secondary');
    });
  });

  // ── scope attribute (a11y default) ─────────────────────────────────────

  describe('scope attribute (WCAG 1.3.1)', () => {
    it('defaults scope="col" (matches the 100% column-header case in admin tables)', () => {
      // design.md §2.2 — scope="col" by default. All 31 admin sites are column
      // headers; the default avoids per-site prop noise.
      const { container } = renderInTable(<TableHeaderCell>X</TableHeaderCell>);
      const th = container.querySelector('th') as HTMLElement;
      expect(th.getAttribute('scope')).toBe('col');
    });

    it('propagates scope="row" when explicitly provided', () => {
      const { container } = renderInTable(<TableHeaderCell scope="row">X</TableHeaderCell>);
      const th = container.querySelector('th') as HTMLElement;
      expect(th.getAttribute('scope')).toBe('row');
    });
  });

  // ── align prop (O-R3) ──────────────────────────────────────────────────

  describe('align prop (O-R3)', () => {
    it('default align="left" emits text-left class', () => {
      const { container } = renderInTable(<TableHeaderCell>X</TableHeaderCell>);
      const th = container.querySelector('th') as HTMLElement;
      expect(th.className).toContain('text-left');
    });

    it('align="right" emits text-right class', () => {
      const { container } = renderInTable(<TableHeaderCell align="right">X</TableHeaderCell>);
      const th = container.querySelector('th') as HTMLElement;
      expect(th.className).toContain('text-right');
      expect(th.className).not.toContain('text-left');
    });

    it('align="center" emits text-center class', () => {
      const { container } = renderInTable(<TableHeaderCell align="center">X</TableHeaderCell>);
      const th = container.querySelector('th') as HTMLElement;
      expect(th.className).toContain('text-center');
      expect(th.className).not.toContain('text-left');
    });
  });

  // ── className merge (O-R5) ─────────────────────────────────────────────

  describe('className prop (O-R5 — merge [defaults, align, className])', () => {
    it('appends the caller className AFTER the defaults', () => {
      // design.md §2.2 — pattern `[defaults, alignClass, className].filter(Boolean).join(' ')`.
      // Both defaults AND the caller class must be present; merge semantics
      // (NOT default-OR-override — that pattern belongs to FormFieldError).
      const { container } = renderInTable(
        <TableHeaderCell className="custom-extra">X</TableHeaderCell>,
      );
      const th = container.querySelector('th') as HTMLElement;
      expect(th.className).toContain('px-6');
      expect(th.className).toContain('py-3');
      expect(th.className).toContain('font-medium');
      expect(th.className).toContain('text-text-secondary');
      expect(th.className).toContain('custom-extra');
    });
  });
});
