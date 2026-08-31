import type { ReactNode } from 'react';

import { usePageBackTarget } from '@/lib/backNav';

/**
 * Page-level heading of the montage screens: the title, an optional second
 * line, and the page's own actions on the right.
 *
 * ── Was hier verschwunden ist (Vorgabe Samet, 28.08.2026) ────────────────────
 * Links stand ein Paar grosser roter Knöpfe — zurück und vorwärts — vor jedem
 * Titel. Der Rückweg gehört jetzt dem Knopf ganz vorn in der Kopfleiste: er
 * verwandelt sich auf jeder Unterseite in einen Zurück-Pfeil, und der rote
 * Arbeitsplatz zeigt dieselbe Kopfleiste wie das Büro. `backTo` wird darum
 * nicht mehr gezeichnet, sondern ANGEMELDET — die Adresse allein sagt ja nicht,
 * ob ein Montage-Auftrag zu den offenen oder den abgeschlossenen gehört, oder
 * ob ein Rapport aus den Dokumenten oder aus der Auftragsliste geöffnet wurde.
 * Der Vorwärts-Knopf ist mit dem Rückweg gegangen: allein wäre er nur noch ein
 * halbes Paar, und den Weg nach vorn kennt das Tablet selbst.
 */
export const MontageHeader = ({
    title,
    subtitle,
    backTo,
    actions,
}: {
    title: ReactNode;
    subtitle?: ReactNode;
    /** Rückweg dieser Seite — er erscheint als Pfeil an der Marke. */
    backTo?: string;
    actions?: ReactNode;
}) => {
    usePageBackTarget(backTo ? { to: backTo } : null);
    return (
        <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
                <h1 className="truncate text-[17px] font-bold leading-tight text-slate-900 dark:text-slate-50">{title}</h1>
                {subtitle && <div className="truncate text-[12.5px] text-slate-500 dark:text-slate-400">{subtitle}</div>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
};
