import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TableHeaderCell } from './TableHeaderCell';

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

  describe('scope attribute (WCAG 1.3.1)', () => {
    it('defaults scope="col" (matches the 100% column-header case in admin tables)', () => {
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

  describe('className prop (O-R5 — merge [defaults, align, className])', () => {
    it('appends the caller className AFTER the defaults', () => {
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
