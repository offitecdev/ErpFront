import type { ReactNode } from 'react';

import { t } from '@/i18n/translate';

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
        {onResizeStart && (
            <span
                role="separator"
                aria-orientation="vertical"
                title={t('tenders.column_resize')}
                onPointerDown={onResizeStart}
                onDoubleClick={onResizeReset}
                onClick={(event) => event.stopPropagation()}
                className="absolute inset-y-0 left-0 z-10 w-[7px] -translate-x-1/2 cursor-col-resize touch-none select-none before:absolute before:inset-y-0 before:left-1/2 before:w-[3px] before:-translate-x-1/2 before:rounded-full before:bg-transparent before:transition-colors hover:before:bg-[#1f2654]/30 active:before:bg-[#1f2654]/50"
            />
        )}
    </th>
);
