import { Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import {
    applyDiscounts,
    createDiscountEntry,
    MAX_DISCOUNT_NAME_LENGTH,
    MAX_TOTAL_DISCOUNTS,
    type DiscountKind,
    type TenderDiscountEntry,
} from '@/pages/sales/detail/utils/tenderDiscounts.utils';

/**
 * ── DIE NACHLÄSSE ────────────────────────────────────────────────────────────
 * Sie greifen NACHEINANDER: jeder auf das, was der vorige übrig lässt — die
 * Rechnung der Offerte (`applyDiscounts`), nur in klein.
 *
 * Vorgabe Samet (05.09.2026): «einfach, linksbündig und kleiner». Also EINE
 * schmale Zeile je Nachlass — Name, Prozent oder Franken, Wert, Wirkung, weg —
 * und keine Kästen darum. Die frühere Fassung lieh sich den Stapel-Editor der
 * Offerte; der ist für ein ganzes Fenster gebaut und war hier zu gross.
 */
export function DocumentDiscounts({ entries, onChange, base, formatMoney, max = MAX_TOTAL_DISCOUNTS, disabled = false }: {
    entries: TenderDiscountEntry[];
    onChange: (entries: TenderDiscountEntry[]) => void;
    /** Betrag, auf den der erste Nachlass greift. */
    base: number;
    formatMoney: (value: number) => string;
    max?: number;
    disabled?: boolean;
}) {
    const applied = applyDiscounts(base, entries).applied;
    const patch = (index: number, next: Partial<TenderDiscountEntry>) =>
        onChange(entries.map((entry, i) => (i === index ? { ...entry, ...next } : entry)));

    return (
        <div className="document-discounts">
            {entries.map((entry, index) => {
                const effect = applied[index];
                return (
                    <div key={index} className="document-discount-row">
                        <input
                            className="document-discount-name"
                            maxLength={MAX_DISCOUNT_NAME_LENGTH}
                            placeholder={t('invoices.discountName')}
                            aria-label={t('invoices.discountName')}
                            readOnly={disabled}
                            value={entry.name}
                            onChange={(event) => patch(index, { name: event.target.value })}
                        />
                        {/* Prozent oder Franken — zwei Knöpfe, keine Auswahlliste:
                            die Entscheidung ist binär und muss ohne Aufklappen
                            zu lesen sein. */}
                        <span className="document-discount-kind" role="group" aria-label={t('invoices.discountKind')}>
                            {(['PERCENT', 'AMOUNT'] as DiscountKind[]).map((kind) => (
                                <button
                                    key={kind}
                                    type="button"
                                    className={entry.kind === kind ? 'is-on' : ''}
                                    aria-pressed={entry.kind === kind}
                                    disabled={disabled}
                                    onClick={() => patch(index, { kind })}
                                >
                                    {kind === 'PERCENT' ? '%' : t('invoices.discountMoney')}
                                </button>
                            ))}
                        </span>
                        <input
                            className="document-discount-value"
                            inputMode="decimal"
                            aria-label={t('invoices.discountValue')}
                            readOnly={disabled}
                            value={entry.value ? String(entry.value) : ''}
                            placeholder="0"
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => patch(index, { value: Number(event.target.value.replace(',', '.')) || 0 })}
                        />
                        <span className="document-discount-effect">
                            {effect && effect.amount > 0 ? `− ${formatMoney(effect.amount)}` : '—'}
                        </span>
                        {!disabled && (
                            <button
                                type="button"
                                className="document-rowbtn"
                                title={t('invoices.discountRemove')}
                                aria-label={t('invoices.discountRemove')}
                                onClick={() => onChange(entries.filter((_, i) => i !== index))}
                            >
                                <Trash01 size={14} />
                            </button>
                        )}
                    </div>
                );
            })}
            {!disabled && (
                <button
                    type="button"
                    className="document-discount-add"
                    disabled={entries.length >= max}
                    onClick={() => onChange([...entries, createDiscountEntry(entries.length)])}
                >
                    <Plus size={13} />
                    {t('invoices.discountAdd')}
                </button>
            )}
        </div>
    );
}
