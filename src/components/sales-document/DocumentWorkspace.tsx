import { useState } from 'react';
import { CalendarCheck01 as CalendarDays, ChevronDown, File05 as FileText, FileCheck02, Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { AddonPaymentSchedule } from '@/components/orders/AddonPaymentSchedule';
import type { PaymentStage } from '@/lib/paymentSchedule';
import { RichTextMarkdownEditor } from '@/pages/sales/detail/components/RichTextMarkdownEditor';
import { richHtmlToPlainText } from '@/pages/sales/detail/utils/markdown.utils';
import { applyDiscounts, createDiscountEntry, MAX_TOTAL_DISCOUNTS, type TenderDiscountEntry } from '@/pages/sales/detail/utils/tenderDiscounts.utils';
import { DocumentDiscounts } from './DocumentDiscounts';
import { DocumentLineTable } from './DocumentLineTable';
import { documentLineAmount, emptyDocumentLine, type DocumentLine } from './documentLines';
import './documentWorkspace.css';

/**
 * ── DIE BELEGFLÄCHE ──────────────────────────────────────────────────────────
 * EINE Karte für Direktrechnung und Nachtrag: oben die vier Dinge, die ein
 * Beleg ausser seinen Zeilen noch trägt, in der Mitte die Zeilen, unten die
 * Summe.
 *
 * Vorgaben Samet (05.09.2026, vierte Runde):
 *   • **Ein Kasten, nicht vier.** Keine nummerierten Abschnitte, keine
 *     Erklärsätze — was die Fläche tut, sagt sie selbst.
 *   • **Anschreiben · Zahlungsplan · Schlusstext · Rabatt stehen OBEN
 *     nebeneinander** und klappen NACH UNTEN auf; es ist immer nur EINES
 *     offen — das nächste schliesst das vorige.
 *   • **Der Rabatt hat keinen eigenen Abschnitt mehr.** Sein «+» sitzt oben,
 *     und was er bewirkt, erscheint von selbst als Zeile in der Summe.
 *   • **Die Summe steht schmal rechts** — Zwischensumme, jeder Nachlass mit
 *     seinem Namen, Netto, MwSt. und Total.
 */

type Panel = 'letter' | 'plan' | 'closing' | 'discount';

export function DocumentWorkspace({
    lines, onChange,
    coverLetter, onCoverLetterChange,
    stages, onStagesChange,
    discounts, onDiscountsChange,
    closingText, onClosingTextChange, closingPlaceholder,
    vat,
    formatMoney, readOnly = false,
}: {
    lines: DocumentLine[];
    onChange: (lines: DocumentLine[]) => void;
    coverLetter: string;
    onCoverLetterChange: (value: string) => void;
    stages: PaymentStage[];
    onStagesChange: (stages: PaymentStage[]) => void;
    /** Nachlässe auf die Zwischensumme; sie wirken NACHEINANDER. */
    discounts: TenderDiscountEntry[];
    onDiscountsChange: (entries: TenderDiscountEntry[]) => void;
    /** Der Absatz unter der Summe — nur die Rechnung führt ihn. */
    closingText?: string;
    onClosingTextChange?: (value: string) => void;
    closingPlaceholder?: string;
    /** MwSt-Satz; fehlt er, rechnet die Fläche ohne Steuerzeile (Nachtrag). */
    vat?: { rate: number; onRateChange: (value: number) => void };
    formatMoney: (value: number) => string;
    readOnly?: boolean;
}) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [panel, setPanel] = useState<Panel | null>(null);
    const selectedLines = lines.filter((line) => selected.has(line.key));

    const subtotal = lines.reduce((sum, line) => sum + documentLineAmount(line), 0);
    const breakdown = applyDiscounts(subtotal, discounts);
    const netTotal = Math.round((breakdown.remaining + Number.EPSILON) * 100) / 100;
    const vatTotal = vat ? Math.round(((netTotal * vat.rate) / 100 + Number.EPSILON) * 100) / 100 : 0;
    const grossTotal = Math.round((netTotal + vatTotal + Number.EPSILON) * 100) / 100;

    /* Immer nur EIN Bereich offen (Vorgabe): der Knopf schliesst seinen eigenen
       und öffnet sonst den neuen. Der Rabatt bringt beim Öffnen gleich eine
       leere Zeile mit — «eine Zeile erscheint von selbst». */
    const openPanel = (next: Panel) => {
        setPanel((current) => {
            if (current === next) return null;
            if (next === 'discount' && !discounts.length && !readOnly) onDiscountsChange([createDiscountEntry(0)]);
            return next;
        });
    };

    const tab = (key: Panel, icon: React.ReactNode, label: string, badge?: number) => (
        <button
            type="button"
            className={`document-tab ${panel === key ? 'is-on' : ''}`}
            aria-expanded={panel === key}
            onClick={() => openPanel(key)}
        >
            {icon}
            <span>{label}</span>
            {badge ? <span className="document-count">{badge}</span> : null}
            <ChevronDown size={14} className={`document-chevron ${panel === key ? 'is-open' : ''}`} />
        </button>
    );

    return (
        <section className="document-workspace">
            {/* Oben: was der Beleg ausser seinen Zeilen trägt. */}
            <div className="document-tabs">
                {tab('letter', <FileText size={15} />, t('documentEditor.coverLetter'))}
                {tab('plan', <CalendarDays size={15} />, t('billing.paymentScheduleTab'), stages.length)}
                {onClosingTextChange ? tab('closing', <FileCheck02 size={15} />, t('invoices.section_closing')) : null}
                {tab('discount', <Plus size={15} />, t('tenders.total_discount'), discounts.length)}
            </div>

            {panel && (
                <div className="document-panel">
                    {panel === 'letter' && (readOnly
                        ? <p className="document-detail-text">{richHtmlToPlainText(coverLetter).trim() || '—'}</p>
                        : <RichTextMarkdownEditor value={coverLetter} onChange={onCoverLetterChange} minHeight={140} />)}
                    {panel === 'plan' && (
                        <AddonPaymentSchedule stages={stages} onChange={onStagesChange} baseTotal={grossTotal} formatMoney={formatMoney} readOnly={readOnly} />
                    )}
                    {panel === 'closing' && onClosingTextChange && (
                        <textarea
                            className="document-panel-field"
                            rows={3}
                            aria-label={t('invoices.section_closing')}
                            placeholder={closingPlaceholder}
                            value={closingText ?? ''}
                            readOnly={readOnly}
                            onChange={(event) => onClosingTextChange(event.target.value)}
                        />
                    )}
                    {panel === 'discount' && (
                        <DocumentDiscounts
                            entries={discounts}
                            onChange={onDiscountsChange}
                            base={subtotal}
                            formatMoney={formatMoney}
                            max={MAX_TOTAL_DISCOUNTS}
                            disabled={readOnly}
                        />
                    )}
                </div>
            )}

            <DocumentLineTable
                lines={lines}
                selected={selected}
                onSelect={setSelected}
                onChange={onChange}
                formatMoney={formatMoney}
                readOnly={readOnly}
            />

            {/* Unter der Tabelle steht LINKS der Knopf für die nächste Zeile
                (Vorgabe Samet 05.09.2026: «das + gehört immer nach links»),
                daneben — nur bei Auswahl — das Löschen. Der Zähler
                («3 Positionen») ist weg: die Tabelle zeigt ihn selbst. */
            }
            <div className="document-actions">
                <button
                    type="button"
                    className="document-button is-primary is-icon"
                    disabled={readOnly}
                    title={t('tenders.product_add')}
                    aria-label={t('tenders.product_add')}
                    onClick={() => onChange([...lines, emptyDocumentLine()])}
                >
                    <Plus size={16} />
                </button>
                {selectedLines.length > 0 && (
                    <button
                        type="button"
                        className="document-button"
                        disabled={readOnly}
                        onClick={() => { onChange(lines.filter((line) => !selected.has(line.key))); setSelected(new Set()); }}
                    >
                        <Trash01 size={14} />
                        {t('documentEditor.deleteSelected')}
                    </button>
                )}
            </div>

            {/* Die Summe steht schmal am rechten Rand. */}
            <div className="document-foot">
                <dl className="document-totals">
                    {breakdown.applied.some((entry) => entry.amount > 0) && (
                        <>
                            <div className="document-total-row">
                                <dt>{t('invoices.subtotal')}</dt>
                                <dd>{formatMoney(subtotal)}</dd>
                            </div>
                            {breakdown.applied.map((entry, index) => (entry.amount > 0 ? (
                                <div key={index} className="document-total-row is-discount">
                                    <dt>{(entry.name || '').trim() || t('invoices.discountFallback', { index: index + 1 })}</dt>
                                    <dd>− {formatMoney(entry.amount)}</dd>
                                </div>
                            ) : null))}
                        </>
                    )}
                    {/* «Netto» steht nur, wenn es etwas ANDERES sagt als die
                        Endsumme — ohne MwSt. und ohne Nachlass wäre es dieselbe
                        Zahl zweimal (Nachtrag). */}
                    {(vat || breakdown.applied.some((entry) => entry.amount > 0)) && (
                        <div className="document-total-row">
                            <dt>{t('invoices.netTotal')}</dt>
                            <dd>{formatMoney(netTotal)}</dd>
                        </div>
                    )}
                    {vat && (
                        <div className="document-total-row">
                            <dt>
                                {t('invoices.vat')}
                                <input
                                    className="document-vat"
                                    inputMode="decimal"
                                    aria-label={t('invoices.vatRate')}
                                    readOnly={readOnly}
                                    value={String(vat.rate)}
                                    onFocus={(event) => event.currentTarget.select()}
                                    onChange={(event) => vat.onRateChange(Number(event.target.value.replace(',', '.')) || 0)}
                                />
                                %
                            </dt>
                            <dd>{formatMoney(vatTotal)}</dd>
                        </div>
                    )}
                    <div className="document-total-row is-total">
                        <dt>{t('invoices.grossTotal')}</dt>
                        <dd>{formatMoney(vat ? grossTotal : netTotal)}</dd>
                    </div>
                </dl>
            </div>
        </section>
    );
}
