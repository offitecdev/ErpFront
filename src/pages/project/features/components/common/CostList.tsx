import { memo } from 'react';

import { money } from '../../utils/projectFormatters';

/**
 * Eine Aufwandsliste des Zusatzauftrags (Material / externe Kosten / Überzeit)
 * im Kleid des Rechnungsmoduls (19.08.2026): eine `.ofi-inv-card` mit Kopf,
 * darunter Zeilen mit Haarlinie — links die Sache, rechts das Geld an der
 * Kartenkante, damit die Beträge der drei nebeneinanderstehenden Listen in
 * derselben Spalte liegen.
 *
 * Pure list renderer; callers pass memoized `rows` so this only re-renders when the
 * underlying scoped data actually changes.
 */
export const CostList = memo(({ title, empty, rows }: { title: string; empty: string; rows: Array<{ id: string; title: string; meta: string; amount: number; note?: string }> }) => (
    <section className="ofi-inv-card">
        <header className="ofi-inv-card__head">
            <span className="ofi-inv-card__title">
                <span className="truncate">{title}</span>
                {rows.length > 0 && <span className="ofi-inv-sub">{rows.length}</span>}
            </span>
        </header>
        <div className="ofi-inv-card__body">
            {rows.length === 0 ? (
                <p className="ofi-inv-empty">{empty}</p>
            ) : rows.map((row) => (
                <div key={row.id} className="ofi-inv-row">
                    <div className="ofi-inv-row__main">
                        <div className="ofi-inv-row__title">{row.title}</div>
                        <div className="ofi-inv-row__meta">{row.meta}</div>
                        {row.note && <div className="ofi-inv-row__note">{row.note}</div>}
                    </div>
                    <div className="ofi-inv-row__value">{money(row.amount)}</div>
                </div>
            ))}
        </div>
    </section>
));
