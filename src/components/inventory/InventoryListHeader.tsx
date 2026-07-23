import type { ReactNode } from 'react';

type InventoryListHeaderProps = {
    title: ReactNode;
    action?: ReactNode;
};

export const InventoryListHeader = ({ title, action }: InventoryListHeaderProps) => (
    <div className="mb-3 flex min-h-14 items-center justify-between gap-4">
        <h1 className="min-w-0 truncate text-[23px] font-semibold tracking-tight text-slate-900">
            {title}
        </h1>
        {action && <div className="shrink-0">{action}</div>}
    </div>
);
