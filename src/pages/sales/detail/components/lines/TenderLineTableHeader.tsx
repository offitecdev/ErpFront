import type { ReactNode } from 'react';

import { ColResizeHandle } from '@/components/ui-shared/TableKit';

type TenderLineHeaderCellProps = {
    /** Caption — or, for a column too narrow for words, an icon. */
    label: ReactNode;
    /** What the column is, in words. Required when `label` is an icon: it is
        the tooltip and the name screen readers announce. */
    title?: string;
    align?: 'left' | 'right' | 'center';
    className?: string;
    noTruncate?: boolean;
    /** Starts a drag on the cell's left border to resize this column. */
    onResizeStart?: (event: React.PointerEvent) => void;
    /** Double-click on the handle restores the column's default width. */
    onResizeReset?: () => void;
};

export const TenderLineHeaderCell = ({ label, title, align = 'right', className, noTruncate, onResizeStart, onResizeReset }: TenderLineHeaderCellProps) => (
    <th
        title={title}
        aria-label={title}
        className={`relative ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className || ''}`}
    >
        <span className={`block ${noTruncate ? 'whitespace-nowrap' : 'truncate'}`}>{label}</span>
        {/* Der Griff ist derselbe wie in jeder anderen Tabelle (TableKit) — er
            hatte hier eine eigene Kopie und wäre sonst der einzige dünne
            geblieben, während die App-weite Schicht die Tabelle zusätzlich
            übernommen hätte. */}
        {onResizeStart && <ColResizeHandle onResizeStart={onResizeStart} onResizeReset={onResizeReset} />}
    </th>
);
