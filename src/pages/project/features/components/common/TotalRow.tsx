import { memo } from 'react';

import { money } from '../../utils/projectFormatters';

/**
 * Eine Summenzeile: Beschriftung links, Betrag rechts.
 *
 * Der Betrag der SUMME sass früher in einer gelben Pille, deren Polsterung ihn
 * aus der Spalte der Zeilen darüber schob — die Zahlen fluchteten nicht mehr
 * (Vorgabe 19.08.2026). Die Pille kam ausserdem gar nicht aus dieser Datei: die
 * Klassenliste war versehentlich durch den Übersetzer gelaufen
 * (`t('auto.rounded_full_bg_yellow_100_…')`), der sie Wort für Wort wieder
 * zusammensetzte — inklusive des abgeschnittenen `text-slat`, das es nie gab.
 *
 * Jetzt trägt die Zeile das Kleid des Rechnungsmoduls (`.ofi-inv-line`): eine
 * Haarlinie zwischen den Zeilen, tabellarische Ziffern, eine gemeinsame rechte
 * Kante.
 *
 * Rendered many times per cost/total panel with purely primitive props — memo keeps it
 * from re-rendering when an unrelated part of the parent updates.
 */
export const TotalRow = memo(({ label, value, total }: { label: string; value: number; total?: boolean }) => (
    <div className={`ofi-inv-line${total ? ' is-total' : ''}`}>
        <span className="ofi-inv-line__label">{label}</span>
        <span className="ofi-inv-line__value">{money(value)}</span>
    </div>
));
