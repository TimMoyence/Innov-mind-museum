import type { ReactNode } from 'react';

type CellAlign = 'left' | 'right' | 'center';
type ThScope = 'col' | 'row';

export interface TableHeaderCellProps {
  children: ReactNode;
  align?: CellAlign;
  scope?: ThScope;
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
