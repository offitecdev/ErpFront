type TenderLineHeaderCellProps = {
    label: string;
    align?: 'left' | 'right' | 'center';
    className?: string;
    noTruncate?: boolean;
};

export const TenderLineHeaderCell = ({ label, align = 'right', className, noTruncate }: TenderLineHeaderCellProps) => (
    <th
        className={`border-l border-slate-200/70 px-1.5 py-2 font-semibold ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className || ''}`}
    >
        <span className={`block ${noTruncate ? 'whitespace-nowrap' : 'truncate'}`}>{label}</span>
    </th>
);
