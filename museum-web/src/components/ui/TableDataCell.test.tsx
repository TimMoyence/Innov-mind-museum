import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TableDataCell } from './TableDataCell';

// ---------------------------------------------------------------------------
// RED phase — UFR-022 / RUN_ID 2026-05-23-web-refactor-p4
// These tests fail until museum-web/src/components/ui/TableDataCell.tsx is created.
// Spec U-R6, O-R3, O-R4, O-R5, O-R6, UB-R8, NFR-A11Y-3, NFR-PERF-1 + design §2.3.
//
// lib-docs/react/PATTERNS.md §4 (DO keep components PURE) + §8 (RTL conventions).
// Pure presentational `<td>` — no hooks, no state, no effects.
//
// Wrapped in a <table><tbody><tr> harness so the rendered <td> sits in a valid
// table tree (consistency with TableHeaderCell tests).
// ---------------------------------------------------------------------------

function renderInTable(ui: React.ReactElement) {
  return render(
    <table>
      <tbody>
        <tr>{ui}</tr>
      </tbody>
    </table>,
  );
}

describe('TableDataCell', () => {
  // ── Element type (U-R6, NFR-A11Y-3) ────────────────────────────────────

  describe('element + semantics', () => {
    it('renders a native <td> element (NFR-A11Y-3)', () => {
      const { container } = renderInTable(<TableDataCell>value</TableDataCell>);
      const td = container.querySelector('td');
      expect(td).not.toBeNull();
      expect((td as HTMLElement).tagName).toBe('TD');
    });

    it('does NOT accidentally render a <th>', () => {
      const { container } = renderInTable(<TableDataCell>value</TableDataCell>);
      expect(container.querySelector('th')).toBeNull();
    });

    it('renders children inside the <td>', () => {
      const { container } = renderInTable(<TableDataCell>Hello world</TableDataCell>);
      const td = container.querySelector('td') as HTMLElement;
      expect(td.textContent).toBe('Hello world');
    });
  });

  // ── Default classes (U-R6) ─────────────────────────────────────────────

  describe('default classes (U-R6)', () => {
    it('includes the shared defaults "px-6 py-3 text-text-secondary"', () => {
      const { container } = renderInTable(<TableDataCell>X</TableDataCell>);
      const td = container.querySelector('td') as HTMLElement;
      expect(td.className).toContain('px-6');
      expect(td.className).toContain('py-3');
      expect(td.className).toContain('text-text-secondary');
    });

    it('does NOT include "font-medium" by default (that is a TableHeaderCell-only default)', () => {
      const { container } = renderInTable(<TableDataCell>X</TableDataCell>);
      const td = container.querySelector('td') as HTMLElement;
      expect(td.className).not.toContain('font-medium');
    });
  });

  // ── nowrap prop (O-R4) ─────────────────────────────────────────────────

  describe('nowrap prop (O-R4)', () => {
    it('default (nowrap omitted) does NOT add the whitespace-nowrap class', () => {
      const { container } = renderInTable(<TableDataCell>X</TableDataCell>);
      const td = container.querySelector('td') as HTMLElement;
      expect(td.className).not.toContain('whitespace-nowrap');
    });

    it('nowrap={false} explicitly does NOT add whitespace-nowrap', () => {
      const { container } = renderInTable(<TableDataCell nowrap={false}>X</TableDataCell>);
      const td = container.querySelector('td') as HTMLElement;
      expect(td.className).not.toContain('whitespace-nowrap');
    });

    it('nowrap={true} adds the whitespace-nowrap class', () => {
      const { container } = renderInTable(<TableDataCell nowrap>X</TableDataCell>);
      const td = container.querySelector('td') as HTMLElement;
      expect(td.className).toContain('whitespace-nowrap');
    });
  });

  // ── align prop (O-R3) ──────────────────────────────────────────────────

  describe('align prop (O-R3)', () => {
    it('default align="left" emits text-left class', () => {
      const { container } = renderInTable(<TableDataCell>X</TableDataCell>);
      const td = container.querySelector('td') as HTMLElement;
      expect(td.className).toContain('text-left');
    });

    it('align="right" emits text-right class', () => {
      const { container } = renderInTable(<TableDataCell align="right">X</TableDataCell>);
      const td = container.querySelector('td') as HTMLElement;
      expect(td.className).toContain('text-right');
      expect(td.className).not.toContain('text-left');
    });

    it('align="center" emits text-center class', () => {
      const { container } = renderInTable(<TableDataCell align="center">X</TableDataCell>);
      const td = container.querySelector('td') as HTMLElement;
      expect(td.className).toContain('text-center');
      expect(td.className).not.toContain('text-left');
    });
  });

  // ── className merge (O-R5) ─────────────────────────────────────────────

  describe('className prop (O-R5 — merge [defaults, nowrap, align, className])', () => {
    it('appends the caller className AFTER the defaults (both present in DOM)', () => {
      // design.md §2.3 — pattern `[defaults, nowrapClass, alignClass, className].filter(Boolean).join(' ')`.
      // We assert STRING composition only — actual visual override (Tailwind 4
      // source-order resolution: text-text-primary winning over the default
      // text-text-secondary) is a Tailwind concern and NOT testable in jsdom
      // (Risk R-6 in design §5). The string-level merge contract is what RED
      // freezes here; visual override validation happens at REVIEW time.
      const { container } = renderInTable(
        <TableDataCell className="text-text-primary">X</TableDataCell>,
      );
      const td = container.querySelector('td') as HTMLElement;
      // Both default + caller class are present in the className string.
      expect(td.className).toContain('text-text-secondary');
      expect(td.className).toContain('text-text-primary');
      // Source order: caller className appears AFTER the default
      // (so Tailwind 4 source-order resolution favours it at runtime).
      const idxDefault = td.className.indexOf('text-text-secondary');
      const idxCaller = td.className.indexOf('text-text-primary');
      expect(idxDefault).toBeGreaterThanOrEqual(0);
      expect(idxCaller).toBeGreaterThan(idxDefault);
    });

    it('composes nowrap + align + caller className together', () => {
      const { container } = renderInTable(
        <TableDataCell nowrap align="right" className="max-w-xs truncate">
          X
        </TableDataCell>,
      );
      const td = container.querySelector('td') as HTMLElement;
      expect(td.className).toContain('whitespace-nowrap');
      expect(td.className).toContain('text-right');
      expect(td.className).toContain('max-w-xs');
      expect(td.className).toContain('truncate');
      // Defaults still present.
      expect(td.className).toContain('px-6');
      expect(td.className).toContain('py-3');
    });
  });
});
