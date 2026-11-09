import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TableDataCell } from './TableDataCell';

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

  describe('className prop (O-R5 — merge [defaults, nowrap, align, className])', () => {
    it('appends the caller className AFTER the defaults (both present in DOM)', () => {
      const { container } = renderInTable(
        <TableDataCell className="text-text-primary">X</TableDataCell>,
      );
      const td = container.querySelector('td') as HTMLElement;
      expect(td.className).toContain('text-text-secondary');
      expect(td.className).toContain('text-text-primary');
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
      expect(td.className).toContain('px-6');
      expect(td.className).toContain('py-3');
    });
  });
});
