import type { ReactNode } from 'react';

import { Plus, RefreshCcw01, Trash01, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import {
    createDiscountEntry,
    MAX_DISCOUNT_NAME_LENGTH,
    MAX_TOTAL_DISCOUNTS,
    type AppliedDiscount,
    type DiscountKind,
    type TenderDiscountEntry,
} from '@/pages/sales/detail/utils/tenderDiscounts.utils';

import { FIELD_INPUT_CLASS } from '../invoiceShared';

/**
 * ── DIE DREI ABSCHNITTE DES BELEGS ───────────────────────────────────────────
 *
 * Vorgabe Samet (05.09.2026): „Die Rechnung soll drei Abschnitte haben, einer
 * davon ein Rabattbereich; die Abschnitte müssen entfernbar sein, und ein
 * entfernter Abschnitt darf auch im PDF nicht mehr erscheinen."
 *
 *   1 Positionen    was verrechnet wird
 *   2 Rabatt        gestapelte Nachlässe auf die Zwischensumme
 *   3 Schlusstext   der Absatz unter der Summe
 *
 * Entfernen LÖSCHT NICHTS: der Abschnitt klappt auf einen schmalen Steg
 * zusammen, der ihn zurückholt, und was er trug, steht danach unverändert
 * wieder da — der Knopf ist eine Aussage über den BELEG, nicht über die
 * Eingaben. Nur der Rabatt ändert dabei auch den Betrag (abgeschaltet wird er
 * nicht gerechnet); die Positionen bleiben die Grundlage der Summe, sie werden
 * bloss nicht mehr gedruckt. Genau das sagt der Hinweis unter dem Titel.
 */
export const InvoiceSection = ({
    index,
    title,
    hint,
    on,
    onToggle,
    action,
    children,
}: {
    /** Platz auf dem Beleg — die Ziffer im Kopf. */
    index: number;
    title: string;
    hint: string;
    on: boolean;
    onToggle: (next: boolean) => void;
    /** Knopf im Kopf des Abschnitts (z. B. „Position hinzufügen"). */
    action?: ReactNode;
    children: ReactNode;
}) => {
    if (!on) {
        return (
            <div className="ofi-invp-sec is-off">
                <span className="ofi-invp-sec__num is-off">{index}</span>
                <span className="ofi-invp-sec__offtext">
                    {t('invoices.sectionRemoved', { name: title })}
                </span>
                <button type="button" className="ofi-invp-sec__restore" onClick={() => onToggle(true)}>
                    <RefreshCcw01 size={13} />
                    {t('invoices.sectionRestore')}
                </button>
            </div>
        );
    }
    return (
        <section className="ofi-invp-sec">
            <header className="ofi-invp-sec__head">
                <span className="ofi-invp-sec__num">{index}</span>
                <span className="ofi-invp-sec__text">
                    <span className="ofi-invp-sec__title">{title}</span>
                    <span className="ofi-invp-sec__hint">{hint}</span>
                </span>
                {action}
                <button
                    type="button"
                    className="ofi-invp-sec__remove"
                    title={t('invoices.sectionRemove')}
                    aria-label={t('invoices.sectionRemove')}
                    onClick={() => onToggle(false)}
                >
                    <X size={15} />
                </button>
            </header>
            <div className="ofi-invp-sec__body">{children}</div>
        </section>
    );
};

/**
 * Der Rabattbereich. Die Nachlässe greifen NACHEINANDER — jeder auf das, was
 * der vorige übrig lässt (dieselbe Rechnung wie auf der Offerte, siehe
 * `applyDiscounts`). Damit das keine Behauptung bleibt, trägt jede Zeile ihre
 * eigene Grundlage und den Betrag, den sie tatsächlich abzieht.
 *
 * Prozent ODER Franken: der kleine Umschalter in der Zeile entscheidet, was das
 * Zahlenfeld bedeutet.
 */
export const DiscountEditor = ({
    entries,
    applied,
    onChange,
    fmtMoney,
}: {
    entries: TenderDiscountEntry[];
    /** Was jede Zeile gegen ihre eigene Grundlage bewirkt. */
    applied: AppliedDiscount[];
    onChange: (next: TenderDiscountEntry[]) => void;
    fmtMoney: (value: number) => string;
}) => {
    const patch = (index: number, next: Partial<TenderDiscountEntry>) =>
        onChange(entries.map((entry, i) => (i === index ? { ...entry, ...next } : entry)));

    return (
        <div className="ofi-invp-disc">
            {entries.length === 0 && (
                <p className="ofi-invp-disc__empty">{t('invoices.discountEmpty')}</p>
            )}

            {entries.map((entry, index) => {
                const line = applied[index];
                return (
                    <div key={index} className="ofi-invp-disc__row">
                        <input
                            className={FIELD_INPUT_CLASS}
                            maxLength={MAX_DISCOUNT_NAME_LENGTH}
                            placeholder={t('invoices.discountName')}
                            aria-label={t('invoices.discountName')}
                            value={entry.name}
                            onChange={(event) => patch(index, { name: event.target.value })}
                        />
                        {/* Prozent oder Franken — zwei Knöpfe statt einer Auswahl:
                            die Entscheidung ist binär und muss ohne Aufklappen
                            zu lesen sein. */}
                        <div className="ofi-invp-disc__kind" role="group" aria-label={t('invoices.discountKind')}>
                            {(['PERCENT', 'AMOUNT'] as DiscountKind[]).map((kind) => (
                                <button
                                    key={kind}
                                    type="button"
                                    className={`ofi-invp-disc__kindbtn ${entry.kind === kind ? 'is-on' : ''}`}
                                    aria-pressed={entry.kind === kind}
                                    onClick={() => patch(index, { kind })}
                                >
                                    {kind === 'PERCENT' ? '%' : t('invoices.discountMoney')}
                                </button>
                            ))}
                        </div>
                        <input
                            type="number"
                            step={entry.kind === 'PERCENT' ? '0.1' : '0.05'}
                            min="0"
                            className={`${FIELD_INPUT_CLASS} is-num ofi-invp-disc__value`}
                            aria-label={t('invoices.discountValue')}
                            value={entry.value || ''}
                            onChange={(event) => patch(index, { value: Number(event.target.value) || 0 })}
                        />
                        <span className="ofi-invp-disc__effect">
                            {line && line.amount > 0
                                ? t('invoices.discountEffect', {
                                    amount: fmtMoney(line.amount),
                                    base: fmtMoney(line.base),
                                })
                                : t('invoices.discountNoEffect')}
                        </span>
                        <button
                            type="button"
                            className="ofi-invp-glyph is-danger"
                            title={t('invoices.discountRemove')}
                            aria-label={t('invoices.discountRemove')}
                            onClick={() => onChange(entries.filter((_, i) => i !== index))}
                        >
                            <Trash01 size={15} />
                        </button>
                    </div>
                );
            })}

            <button
                type="button"
                className="ofi-invp-disc__add"
                disabled={entries.length >= MAX_TOTAL_DISCOUNTS}
                onClick={() => onChange([...entries, createDiscountEntry(entries.length)])}
            >
                <Plus size={13} />
                {t('invoices.discountAdd')}
            </button>
        </div>
    );
};
