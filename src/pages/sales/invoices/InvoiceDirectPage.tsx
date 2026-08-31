import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Eye, Plus, Receipt, Trash01 } from '@/components/icons/antIconCompat';
import { CELL_INPUT_CLASS, SectionCard } from '@/components/ui-shared/TableKit';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { t } from '@/i18n/translate';
import { billingApi } from '@/lib/api/billing';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { DirectInvoiceLineInput, InvoiceDto } from '@/types/billing';
import { formatAddressLines } from '@/utils/address';

import { InvoicePdfPopup } from './components/InvoicePdfPopup';
import {
    InvoiceField,
    InvoicePageHeader,
    InvoiceStepFoot,
    InvoiceSteps,
    type WizardStep,
} from './components/InvoiceFormBits';
import { ArticleLineCell, CustomerPickCell, type CustomerPick } from './components/InvoiceLinePicker';
import {
    apiError,
    articlePrice,
    FIELD_INPUT_CLASS,
    FIELD_TEXTAREA_CLASS,
    fmtMoney,
    isoToday,
    round2,
} from './invoiceShared';

/**
 * ── DIREKTRECHNUNG (`/sales/invoices/new/direct`) ────────────────────────────
 *
 * Vorgabe Samet: „eine Rechnung direkt erstellen — kein Fenster, eine Seite mit
 * Zurück-Knopf. Produkte wie im Angebot wählen oder von Hand eintippen, Preise
 * setzen. Man muss sich das PDF als leere Vorlage vorstellen, die wir selbst
 * ausfüllen." Und: Schritt für Schritt statt einer langen Seite —
 *
 *   1 Empfänger   Bestandskunde suchen oder frei erfassen; die Adresse steht in
 *                 ihren Bestandteilen und wird zu ganzen Zeilen gefaltet.
 *   2 Positionen  Katalogprodukt wählen ODER die Zeile selbst tippen, Menge und
 *                 Preis setzen. Hier entsteht der Betrag.
 *   3 Rechnung    Datum, Fälligkeit, Verkäufer, Einleitungstext — Vorschau und
 *                 erstellen.
 *
 * Sie hängt an keinem Auftrag und an keinem Projekt: Empfänger, Steuersatz und
 * Einleitungstext stehen auf der Rechnung SELBST (es gibt keine Offerte, aus der
 * sie nachgeladen werden könnten), und die Positionen SIND der Betrag. Ihre
 * Rechnungsart ist deshalb immer die GESAMTRECHNUNG — das steht im dritten
 * Schritt als Marke, damit es nicht erraten werden muss.
 *
 * Preise sind netto — dieselbe Lesart wie im Angebot; die MWST steht als eigene
 * Zeile unter dem Netto. Die Vorschau baut das ECHTE Dokument aus dem Entwurf,
 * bevor irgendetwas gespeichert ist.
 */

let lineSeed = 0;

interface DraftLine {
    key: string;
    /** Katalogartikel, aus dem die Zeile stammt — leer heisst handgetippt. */
    articleId: string | null;
    description: string;
    unit: string;
    quantity: string;
    unitPrice: string;
}

const emptyLine = (): DraftLine => ({
    key: `line-${lineSeed += 1}`,
    articleId: null,
    description: '',
    unit: '',
    quantity: '1',
    unitPrice: '',
});

const num = (value: string): number => {
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
};

const lineAmount = (line: DraftLine) => round2(num(line.quantity) * num(line.unitPrice));

export const InvoiceDirectPage = () => {
    const navigate = useNavigate();
    const settings = usePdfSettings();

    const [step, setStep] = useState(0);

    const [customerId, setCustomerId] = useState<string | null>(null);
    const [recipientName, setRecipientName] = useState('');
    const [street, setStreet] = useState('');
    const [supplement, setSupplement] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [city, setCity] = useState('');
    const [country, setCountry] = useState('');

    const [invoiceDate, setInvoiceDate] = useState(isoToday);
    const [dueDate, setDueDate] = useState(isoToday);
    // Die Fälligkeit folgt dem Rechnungsdatum, bis sie von Hand gesetzt wurde.
    const [dueTouched, setDueTouched] = useState(false);
    const [salesperson, setSalesperson] = useState('');
    const [commission, setCommission] = useState('');
    const [introText, setIntroText] = useState(() => t('invoices.introDefault'));
    const [notes, setNotes] = useState('');
    const [vatRateText, setVatRateText] = useState(() => String(Number(settings.vatRate) || 8.1));

    const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine()]);
    const [saving, setSaving] = useState(false);

    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    const vatRate = Math.max(0, num(vatRateText));
    const netTotal = useMemo(() => round2(lines.reduce((sum, line) => sum + lineAmount(line), 0)), [lines]);
    const vatTotal = round2((netTotal * vatRate) / 100);
    const grossTotal = round2(netTotal + vatTotal);

    const patchLine = (key: string, patch: Partial<DraftLine>) =>
        setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));

    const removeLine = (key: string) =>
        setLines((prev) => (prev.length <= 1 ? [emptyLine()] : prev.filter((line) => line.key !== key)));

    /* Ein Bestandskunde füllt den Empfängerblock aus seiner Adresse; danach darf
       jedes Feld noch von Hand geändert werden — die Rechnung friert ihren
       Empfänger ohnehin als Text ein und folgt späteren Kundenänderungen nicht. */
    const pickCustomer = (customer: CustomerPick) => {
        setCustomerId(customer.id);
        setRecipientName(customer.companyName);
        setStreet(customer.address || '');
        setSupplement(customer.addressSupplement || '');
        setPostalCode(customer.postalCode || '');
        setCity(customer.city || '');
        setCountry(customer.country || '');
    };

    /* Der Empfängerblock des Belegs: die Adresse wird aus ihren Bestandteilen
       zu GANZEN ZEILEN gefaltet — genau so steht sie im PDF und genau so liest
       der QR-Zahlteil den Schuldner. */
    const recipientAddress = useMemo(
        () => formatAddressLines({ street, addressSupplement: supplement, postalCode, city, country }).join('\n'),
        [street, supplement, postalCode, city, country],
    );

    const filledLines = useMemo(() => lines.filter((line) => line.description.trim()), [lines]);

    const payload = () => ({
        customerId,
        recipientName: recipientName.trim(),
        recipientAddress: recipientAddress || null,
        introText: introText.trim() || null,
        invoiceDate,
        dueDate: dueDate || invoiceDate,
        salespersonName: salesperson.trim() || null,
        commissionNumber: commission.trim() || null,
        vatRate,
        notes: notes.trim() || null,
        lines: filledLines.map<DirectInvoiceLineInput>((line) => ({
            description: line.description.trim(),
            quantity: num(line.quantity),
            unitAmount: num(line.unitPrice),
            unit: line.unit.trim() || null,
            articleId: line.articleId,
        })),
    });

    const recipientReady = Boolean(recipientName.trim());
    const linesReady = filledLines.length > 0 && grossTotal > 0;
    const furthest = recipientReady ? (linesReady ? 2 : 1) : 0;

    const validate = (): boolean => {
        if (!recipientReady) {
            toast.error(t('invoices.needRecipient'));
            setStep(0);
            return false;
        }
        if (!linesReady) {
            toast.error(t('invoices.needLines'));
            setStep(1);
            return false;
        }
        return true;
    };

    /**
     * Vorschau des Entwurfs: aus den Feldern wird eine Rechnung GEBAUT, wie der
     * Server sie speichern würde, und durch denselben Generator geschickt.
     * Gezeigt wird damit das echte Dokument — nur die Nummer fehlt noch, denn
     * die vergibt der Server erst beim Erstellen.
     */
    const preview = async () => {
        if (!validate()) return;
        setPreviewOpen(true);
        setPreviewBlob(null);
        setPreviewLoading(true);
        try {
            const body = payload();
            const draft: InvoiceDto = {
                id: 'draft',
                tenantId: '',
                customerId,
                projectId: null,
                salesOrderId: null,
                invoiceNumber: t('invoices.draftNumber'),
                billingType: 'FULL',
                kind: 'RECHNUNG',
                invoiceDate: body.invoiceDate,
                dueDate: body.dueDate,
                salespersonName: body.salespersonName,
                commissionNumber: body.commissionNumber,
                billedPercent: 100,
                baseAmount: netTotal,
                amount: grossTotal,
                status: 'ISSUED',
                notes: body.notes,
                recipientName: body.recipientName,
                recipientAddress: body.recipientAddress,
                introText: body.introText,
                vatRate,
                issuedByEmployeeId: '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                category: 'DIRECT',
                lineItems: body.lines.map((line, index) => ({
                    id: `draft-${index}`,
                    invoiceId: 'draft',
                    description: line.description,
                    sourceType: line.articleId ? 'EXTRA_MATERIAL' : 'MANUAL',
                    sourceId: line.articleId ?? null,
                    quantity: Number(line.quantity) || 0,
                    unitAmount: Number(line.unitAmount) || 0,
                    lineTotal: round2((Number(line.quantity) || 0) * (Number(line.unitAmount) || 0)),
                    unit: line.unit ?? null,
                    sortOrder: index,
                })),
            };
            const { buildInvoicePdfBytes } = await import('@/utils/pdf/invoicePdf');
            const bytes = await buildInvoicePdfBytes(draft, { orderNumber: '—' }, settings);
            setPreviewBlob(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
        } catch (e) {
            toast.error(apiError(e, t('billing.pdfError')));
        } finally {
            setPreviewLoading(false);
        }
    };

    const create = async () => {
        if (!validate()) return;
        setSaving(true);
        try {
            const { invoice } = await billingApi.createDirectInvoice(payload());
            toast.success(t('invoices.created', { number: invoice.invoiceNumber }));
            navigate('/sales/invoices');
        } catch (e) {
            toast.error(apiError(e, t('billing.invoiceError')));
        } finally {
            setSaving(false);
        }
    };

    const STEPS: WizardStep[] = [
        { key: 'recipient', label: t('invoices.stepRecipient'), hint: t('invoices.stepHintRecipient') },
        { key: 'positions', label: t('invoices.stepPositions'), hint: t('invoices.stepHintPositions') },
        { key: 'invoice', label: t('invoices.stepDetails'), hint: t('invoices.stepHintInvoice') },
    ];

    const colLabel = {
        description: t('invoices.colDescription'),
        unit: t('invoices.colUnit'),
        qty: t('invoices.colQty'),
        price: t('invoices.colUnitPrice'),
        sum: t('invoices.colLineTotal'),
    };

    const sums = (
        <div className="ofi-invp-sums">
            <div className="ofi-invp-sum">
                <span className="ofi-invp-sum__label">{t('invoices.netTotal')}</span>
                <span className="ofi-invp-sum__value">{fmtMoney(netTotal)}</span>
            </div>
            <div className="ofi-invp-sum">
                <span className="ofi-invp-sum__label">
                    {t('invoices.vat')}
                    <input
                        type="number"
                        step="0.1"
                        aria-label={t('invoices.vatRate')}
                        className="ofi-invp-vat"
                        value={vatRateText}
                        onChange={(event) => setVatRateText(event.target.value)}
                    />
                    %
                </span>
                <span className="ofi-invp-sum__value">{fmtMoney(vatTotal)}</span>
            </div>
            <div className="ofi-invp-sum is-total">
                <span className="ofi-invp-sum__label">{t('invoices.grossTotal')}</span>
                <span className="ofi-invp-sum__value">{fmtMoney(grossTotal)}</span>
            </div>
        </div>
    );

    return (
        <div className="ofi-invp-page">
            <InvoicePageHeader title={t('invoices.directTitle')} />

            <InvoiceSteps steps={STEPS} current={step} furthest={furthest} onGo={setStep} />

            {step === 0 && (
                <SectionCard title={`${t('invoices.stepCounter', { n: 1, total: STEPS.length })} · ${t('invoices.stepRecipient')}`}>
                    <div className="ofi-invp-grid ofi-invp-grid--split">
                        <InvoiceField label={t('invoices.recipientPick')} hint={t('invoices.createDirectHint')}>
                            <CustomerPickCell
                                value={recipientName}
                                onChange={(next) => {
                                    setRecipientName(next);
                                    // Sobald der Name von Hand geändert wird, ist der
                                    // Empfänger kein Bestandskunde mehr.
                                    setCustomerId(null);
                                }}
                                onPick={pickCustomer}
                            />
                        </InvoiceField>
                        <InvoiceField label={t('address.street')}>
                            <input className={FIELD_INPUT_CLASS} value={street} onChange={(e) => setStreet(e.target.value)} />
                        </InvoiceField>
                        <InvoiceField label={t('address.supplement')}>
                            <input className={FIELD_INPUT_CLASS} value={supplement} onChange={(e) => setSupplement(e.target.value)} />
                        </InvoiceField>
                        <InvoiceField label={t('address.postalCode')}>
                            <input className={FIELD_INPUT_CLASS} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                        </InvoiceField>
                        <InvoiceField label={t('address.city')}>
                            <input className={FIELD_INPUT_CLASS} value={city} onChange={(e) => setCity(e.target.value)} />
                        </InvoiceField>
                        <InvoiceField label={t('address.country')}>
                            <input className={FIELD_INPUT_CLASS} value={country} onChange={(e) => setCountry(e.target.value)} />
                        </InvoiceField>
                    </div>

                    <InvoiceStepFoot
                        stepIndex={0}
                        stepCount={STEPS.length}
                        onBack={() => navigate('/sales/invoices')}
                        onNext={() => setStep(1)}
                        nextDisabled={!recipientReady}
                        finalLabel={t('invoices.createBtn')}
                        onFinal={() => void create()}
                    />
                </SectionCard>
            )}

            {step === 1 && (
                <SectionCard
                    title={`${t('invoices.stepCounter', { n: 2, total: STEPS.length })} · ${t('invoices.stepPositions')}`}
                    action={
                        <button
                            type="button"
                            onClick={() => setLines((prev) => [...prev, emptyLine()])}
                            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
                        >
                            <Plus size={13} />
                            {t('invoices.addLine')}
                        </button>
                    }
                >
                    {/* Der Positionseditor rollt auf schmalen Geräten seitwärts —
                        wie der Bestelleditor im Lager; die Karte selbst bleibt an
                        ihrem Platz. */}
                    <div className="overflow-x-auto">
                        <table data-inv-table data-grid-lines data-unstyled-table className="w-full" style={{ minWidth: 780 }}>
                            <colgroup>
                                <col style={{ width: 46 }} />
                                {/* Bezeichnung: keine Breite, sie nimmt den Rest. */}
                                <col />
                                <col style={{ width: 112 }} />
                                <col style={{ width: 100 }} />
                                <col style={{ width: 132 }} />
                                <col style={{ width: 132 }} />
                                <col style={{ width: 54 }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th className="text-left">{t('invoices.colPos')}</th>
                                    <th className="text-left">{colLabel.description}</th>
                                    <th className="text-left">{colLabel.unit}</th>
                                    <th className="text-right">{colLabel.qty}</th>
                                    <th className="text-right">{colLabel.price}</th>
                                    <th className="text-right">{colLabel.sum}</th>
                                    <th aria-label={t('common.actions')} />
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((line, index) => (
                                    <tr key={line.key}>
                                        <td className="text-slate-400 dark:text-white/40">{index + 1}</td>
                                        <td>
                                            <ArticleLineCell
                                                value={line.description}
                                                onChange={(next) => patchLine(line.key, { description: next, articleId: null })}
                                                onPick={(article) => patchLine(line.key, {
                                                    articleId: article.id,
                                                    description: article.name,
                                                    unit: article.unit || '',
                                                    unitPrice: String(articlePrice(article)),
                                                })}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                className={CELL_INPUT_CLASS}
                                                value={line.unit}
                                                onChange={(event) => patchLine(line.key, { unit: event.target.value })}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                                value={line.quantity}
                                                onChange={(event) => patchLine(line.key, { quantity: event.target.value })}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                step="0.05"
                                                className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                                value={line.unitPrice}
                                                onChange={(event) => patchLine(line.key, { unitPrice: event.target.value })}
                                            />
                                        </td>
                                        <td className="text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-white">
                                            {fmtMoney(lineAmount(line))}
                                        </td>
                                        <td className="text-right">
                                            <button
                                                type="button"
                                                className="ofi-invp-glyph is-danger"
                                                title={t('invoices.removeLine')}
                                                onClick={() => removeLine(line.key)}
                                            >
                                                <Trash01 size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {sums}

                    <InvoiceStepFoot
                        stepIndex={1}
                        stepCount={STEPS.length}
                        onBack={() => setStep(0)}
                        onNext={() => setStep(2)}
                        nextDisabled={!linesReady}
                        finalLabel={t('invoices.createBtn')}
                        onFinal={() => void create()}
                    />
                </SectionCard>
            )}

            {step === 2 && (
                <SectionCard title={`${t('invoices.stepCounter', { n: 3, total: STEPS.length })} · ${t('invoices.stepDetails')}`}>
                    {/* Die Rechnungsart steht als Marke da, statt erraten zu
                        werden: eine Direktrechnung ist immer eine Gesamtrechnung. */}
                    <div className="ofi-invp-pad">
                        <div className="ofi-invp-tiles">
                            <div className="ofi-invp-tile">
                                <div className="ofi-invp-tile__label">{t('billing.kindLabel')}</div>
                                <div className="ofi-invp-tile__value">
                                    <StatusChip variant="approved">{t('billing.kind_RECHNUNG')}</StatusChip>
                                </div>
                            </div>
                            <div className="ofi-invp-tile">
                                <div className="ofi-invp-tile__label">{t('invoices.colCustomer')}</div>
                                <div className="ofi-invp-tile__value">{recipientName || '—'}</div>
                            </div>
                            <div className="ofi-invp-tile">
                                <div className="ofi-invp-tile__label">{t('invoices.stepPositions')}</div>
                                <div className="ofi-invp-tile__value">{filledLines.length}</div>
                            </div>
                            <div className="ofi-invp-tile is-open">
                                <div className="ofi-invp-tile__label">{t('invoices.grossTotal')}</div>
                                <div className="ofi-invp-tile__value">{fmtMoney(grossTotal)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="ofi-invp-grid ofi-invp-grid--4">
                        <InvoiceField label={t('billing.invoiceDate')}>
                            <input
                                type="date"
                                className={FIELD_INPUT_CLASS}
                                value={invoiceDate}
                                onChange={(event) => {
                                    setInvoiceDate(event.target.value);
                                    if (!dueTouched) setDueDate(event.target.value);
                                }}
                            />
                        </InvoiceField>
                        <InvoiceField label={t('billing.dueDate')}>
                            <input
                                type="date"
                                className={FIELD_INPUT_CLASS}
                                value={dueDate}
                                onChange={(event) => { setDueTouched(true); setDueDate(event.target.value); }}
                            />
                        </InvoiceField>
                        <InvoiceField label={t('billing.salesperson')}>
                            <input className={FIELD_INPUT_CLASS} value={salesperson} onChange={(e) => setSalesperson(e.target.value)} />
                        </InvoiceField>
                        <InvoiceField label={t('billing.commission')}>
                            <input className={FIELD_INPUT_CLASS} value={commission} onChange={(e) => setCommission(e.target.value)} />
                        </InvoiceField>
                    </div>
                    <div className="ofi-invp-grid ofi-invp-grid--split">
                        <InvoiceField label={t('invoices.introText')} hint={t('invoices.directKindFix')} wide>
                            <textarea
                                className={FIELD_TEXTAREA_CLASS}
                                value={introText}
                                onChange={(event) => setIntroText(event.target.value)}
                            />
                        </InvoiceField>
                        <InvoiceField label={t('invoices.notes')} wide>
                            <textarea
                                className={FIELD_TEXTAREA_CLASS}
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                            />
                        </InvoiceField>
                    </div>

                    <InvoiceStepFoot
                        stepIndex={2}
                        stepCount={STEPS.length}
                        onBack={() => setStep(1)}
                        onNext={() => undefined}
                        finalLabel={t('invoices.createBtn')}
                        finalIcon={<Receipt size={14} />}
                        finalDisabled={saving || !linesReady}
                        onFinal={() => void create()}
                        extra={
                            <button
                                type="button"
                                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-[12.5px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
                                onClick={() => void preview()}
                            >
                                <Eye size={14} />
                                {t('invoices.previewBtn')}
                            </button>
                        }
                    />
                </SectionCard>
            )}

            <InvoicePdfPopup
                open={previewOpen}
                title={t('invoices.previewTitle', { number: t('invoices.draftNumber') })}
                subtitle={`${t('invoices.category_DIRECT')} · ${fmtMoney(grossTotal)}`}
                blob={previewBlob}
                loading={previewLoading}
                onClose={() => { setPreviewOpen(false); setPreviewBlob(null); }}
            />
        </div>
    );
};
