/**
 * Shared `<th>` table header cell.
 *
 * UFR-022 RUN_ID 2026-05-23-web-refactor-p4 — absorbs the
 * `<th className="px-6 py-3 font-medium text-text-secondary">` literal
 * duplicated across the 5 admin tables
 * (audit-logs, tickets, users, reports, reviews — 31 hits total).
 *
 * - Pure presentational component (no hooks — UB-R8, NFR-PERF-1).
 * - A11y: native `<th>` with `scope="col"` default (WCAG 1.3.1, NFR-A11Y-2).
 * - className merge `[defaults, alignClass, className].filter(Boolean).join(' ')`
 *   — Spinner / AlertBanner pattern (O-R5).
 */

import type { ReactNode } from 'react';

type CellAlign = 'left' | 'right' | 'center';
type ThScope = 'col' | 'row';

export interface TableHeaderCellProps {
  children: ReactNode;
  /** Text alignment. Default `'left'`. */
  align?: CellAlign;
  /** HTML `scope` attribute. Default `'col'`. */
  scope?: ThScope;
  /** Extra Tailwind classes, appended after defaults + align. */
  className?: string;
}

const DEFAULT_CLASSES = 'px-6 py-3 font-medium text-text-secondary';

const alignClasses: Record<CellAlign, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function TableHeaderCell({
  children,
  align = 'left',
  scope = 'col',
  className,
}: TableHeaderCellProps) {
  const classes = [DEFAULT_CLASSES, alignClasses[align], className].filter(Boolean).join(' ');

  return (
    <th scope={scope} className={classes}>
      {children}
    </th>
  );
}
