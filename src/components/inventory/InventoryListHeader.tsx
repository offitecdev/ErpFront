import type { ReactNode } from 'react';

type InventoryListHeaderProps = {
    title: ReactNode;
    action?: ReactNode;
};

/* Listenkopf der neueren Module (Lager, CRM, Formulare). Der Titel steht in
   der Titelschrift wie auf der Anmeldeseite, der Kopf steigt beim Öffnen kurz
   auf — beides aus styles/refine.css. */
export const InventoryListHeader = ({ title, action }: InventoryListHeaderProps) => (
    <div className="ofi-rise mb-3 flex min-h-14 items-center justify-between gap-4">
        <h1 className="ofi-serif min-w-0 truncate text-[23px] font-semibold tracking-tight text-slate-900">
            {title}
        </h1>
        {action && <div className="shrink-0">{action}</div>}
    </div>
);
