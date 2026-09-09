import type { ReactNode } from 'react';

type InventoryListHeaderProps = {
    title: ReactNode;
    /**
     * MITTE DER KOPFZEILE (09.09.2026) — für das, was zwischen Titel und
     * Handlung gehört: bei der Lieferantenbestellung das Schrittband, das den
     * Vorgang in drei Wörtern zeigt. Es steht MITTIG auf der Seite, nicht
     * neben dem Titel: so liest man links WO man ist, in der Mitte WIE WEIT,
     * rechts WAS ansteht.
     */
    center?: ReactNode;
    action?: ReactNode;
};

/* Listenkopf der neueren Module (Lager, CRM, Formulare). Der Titel steht in
   der Titelschrift wie auf der Anmeldeseite, der Kopf steigt beim Öffnen kurz
   auf — beides aus styles/refine.css. */
export const InventoryListHeader = ({ title, center, action }: InventoryListHeaderProps) => (
    <div className="ofi-rise mb-3 flex min-h-14 items-center gap-4">
        {/* Ohne Titel bleibt nur der Platzhalter: die Handlung rutscht damit
            an den rechten Rand, ohne dass eine leere Überschrift entsteht
            (Nachtragsmaske, Vorgabe Samet 05.09.2026). */}
        {title ? (
            <h1 className="ofi-serif min-w-0 flex-1 truncate text-[23px] font-semibold tracking-tight text-slate-900">
                {title}
            </h1>
        ) : <span className="min-w-0 flex-1" />}
        {/* Die Mitte ist WIRKLICH die Mitte der Zeile: Titel und Handlung
            dehnen sich gleich weit, das Band dazwischen bleibt zentriert,
            auch wenn der Titel lang ist. Auf schmalen Schirmen fällt es weg —
            dort trägt die Seite das Band selbst. */}
        {center && <div className="hidden shrink-0 lg:block">{center}</div>}
        <div className="flex min-w-0 flex-1 justify-end">
            {action}
        </div>
    </div>
);
