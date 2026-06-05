/**
 * Shared `<td>` table data cell.
 *
 * UFR-022 RUN_ID 2026-05-23-web-refactor-p4 — absorbs the
 * `<td className="whitespace-nowrap px-6 py-3 text-text-secondary">` literal
 * duplicated across the 5 admin tables (~32 hits including variants).
 *
 * - Pure presentational component (no hooks — UB-R8, NFR-PERF-1).
 * - A11y: native `<td>` (NFR-A11Y-3).
 * - className merge `[defaults, nowrapClass, alignClass, className].filter(Boolean).join(' ')`
 *   — caller class appears LAST so Tailwind 4 source-order can override the
 *   default `text-text-secondary` when callers pass `text-text-primary` /
 *   `text-text-muted` (design §2.3 + Risk R-6).
 */

import type { ReactNode } from 'react';

type CellAlign = 'left' | 'right' | 'center';

export interface TableDataCellProps {
  children: ReactNode;
  /** Add `whitespace-nowrap` class. Default `false`. */
  nowrap?: boolean;
  /** Text alignment. Default `'left'`. */
  align?: CellAlign;
  /** Extra Tailwind classes, appended after defaults. */
  className?: string;
}

const DEFAULT_CLASSES = 'px-6 py-3 text-text-secondary';

const alignClasses: Record<CellAlign, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function TableDataCell({
  children,
  nowrap = false,
  align = 'left',
  className,
}: TableDataCellProps) {
  const nowrapClass = nowrap ? 'whitespace-nowrap' : undefined;
  const classes = [DEFAULT_CLASSES, nowrapClass, alignClasses[align], className]
    .filter(Boolean)
    .join(' ');

  return <td className={classes}>{children}</td>;
}
