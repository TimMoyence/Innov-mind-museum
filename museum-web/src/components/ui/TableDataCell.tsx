import type { ReactNode } from 'react';

type CellAlign = 'left' | 'right' | 'center';

export interface TableDataCellProps {
  children: ReactNode;
  nowrap?: boolean;
  align?: CellAlign;
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
