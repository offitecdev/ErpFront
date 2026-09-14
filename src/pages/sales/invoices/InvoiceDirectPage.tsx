import { DocumentWorkspace } from '@/components/sales-document/DocumentWorkspace';
import { documentLineAmount, documentLineStarted, documentLineValid, documentNumber, emptyDocumentLine, type DocumentLine } from '@/components/sales-document/documentLines';
import { paymentStagesValid, serializePaymentStages, type PaymentStage } from '@/lib/paymentSchedule';
import { useUnsavedChangesGuard } from '@/pages/sales/detail/hooks/useUnsavedChangesGuard';
import { UnsavedChangesPopup } from '@/pages/sales/detail/popups/UnsavedChangesPopup';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Eye, RefreshCcw01, Receipt } from '@/components/icons/antIconCompat';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { t } from '@/i18n/translate';
import { billingApi } from '@/lib/api/billing';
import { parsePaymentStages } from '@/lib/paymentSchedule';
import {
    applyDiscounts,
    MAX_LINE_DISCOUNTS,
    parseDiscountList,
    serializeDiscountList,
    type TenderDiscountEntry,
} from '@/pages/sales/detail/utils/tenderDiscounts.utils';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { DirectInvoiceLineInput, InvoiceDto, InvoiceSectionFlags } from '@/types/billing';
import { formatAddressLines } from '@/utils/address';
import { companySenderLine } from '@/utils/pdf/addressBlock';

import { InvoicePdfPopup } from './components/InvoicePdfPopup';
import {
    InvoiceField,
    InvoicePageHeader,
    InvoiceProgress,
    InvoiceStepFoot,
    type WizardStep,
} from './components/InvoiceFormBits';
import { CustomerPickCell, type CustomerPick } from './components/InvoiceLinePicker';
import {
    ALL_SECTIONS,
    apiError,
    invoiceDiscounts,
    FIELD_INPUT_CLASS,
    FIELD_TEXTAREA_CLASS,
    fmtMoney,
    isoToday,
    round2,
} from './invoiceShared';
import '@/styles/modules/invoicePages.css';

/**
 * ── DIREKTRECHNUNG (`/sales/invoices/new/direct`) ────────────────────────────
 *
 * Vorgabe Samet: „eine Rechnung direkt erstellen — kein Fenster, eine Seite mit
 * Zurück-Knopf. Produkte wie im Angebot wählen oder von Hand eintippen, Preise
 * setzen. Man muss sich das PDF als leere Vorlage vorstellen, die wir selbst
 * ausfüllen." Und: Schritt für Schritt statt einer langen Seite —
 *
 *   1 Empfänger   Absenderzeile (aus den Mandanteneinstellungen vorbelegt, aber
 *                 änderbar) und der Empfänger: Bestandskunde oder frei erfasst.
 *   2 Beleg       DIE DREI ABSCHNITTE — Positionen · Rabatt · Schlusstext.
 *                 Jeder einzelne darf entfernt werden und ist dann auch nicht
 *                 mehr im PDF (Vorgabe Samet, 05.09.2026).
 *   3 Rechnung    Datum, Fälligkeit, Verkäufer, Einleitungstext — Vorschau und
 *                 erstellen.
 *
 * Sie hängt an keinem Auftrag und an keinem Projekt: Empfänger, Steuersatz,
 * Einleitungstext, Rabatte und Schlusstext stehen auf der Rechnung SELBST (es
 * gibt keine Offerte, aus der sie nachgeladen werden könnten), und die
 * Positionen SIND der Betrag. Ihre Rechnungsart ist deshalb immer die
 * GESAMTRECHNUNG — das steht im dritten Schritt als Marke, damit es nicht
 * erraten werden muss.
 *
 * Preise sind netto — dieselbe Lesart wie im Angebot; die Rabatte greifen
 * NACHEINANDER auf die Zwischensumme, die MWST rechnet auf dem Ergebnis. Die
 * Vorschau baut das ECHTE Dokument aus dem Entwurf, bevor irgendetwas
 * gespeichert ist.
 */

const emptyLine = emptyDocumentLine;
const num = (value: string) => documentNumber(value) || 0;
const lineAmount = documentLineAmount;
const lineDiscounts = (line: DocumentLine) => line.discounts;

export const InvoiceDirectPage = () => {
    const navigate = useNavigate();
    /* `?edit=<id>` — dieselbe Maske schreibt eine BESTEHENDE Direktrechnung
       neu (Vorgabe Samet 05.09.2026). Nummer und Zahlungsstand bleiben beim
       Beleg; hier wird nur sein Inhalt bearbeitet. */
    const [searchParams] = useSearchParams();
    const editId = searchParams.get('edit');
    const settings = usePdfSettings();

    const [step, setStep] = useState(0);

    /* Die Absenderzeile ist aus den MANDANTENEINSTELLUNGEN vorbelegt (die
       Firmenangaben des gewählten Mandanten, siehe `usePdfSettings`), bleibt
       aber änderbar — und wird mit der Rechnung EINGEFROREN. Eine später
       geänderte Firmenadresse schreibt eine gestellte Rechnung nicht um.

       Sie betrifft nur die gedruckte Zeile: der Gläubiger des QR-Zahlteils
       kommt weiterhin aus den Einstellungen, weil er mit dem Bankkonto
       übereinstimmen MUSS — sonst wäre der Einzahlungsschein nicht mehr
       gültig. */
    const defaultSender = useMemo(() => companySenderLine(settings), [settings]);
    const [senderAddress, setSenderAddress] = useState(defaultSender);

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

    /* ── Die drei Abschnitte ───────────────────────────────────────────────
       Welche gedruckt werden. Ein ausgeschalteter Abschnitt behält seinen
       Inhalt (Entfernen ist keine Löschung), wird aber weder gerechnet noch
       gedruckt. */
    /* Die drei Abschnitte gibt es als SCHALTER nicht mehr (Vorgabe Samet
       05.09.2026: ein Kasten, keine nummerierten Abschnitte). Das Feld bleibt
       im Beleg, damit ältere Rechnungen unverändert drucken — eine neue
       Direktrechnung führt schlicht alle drei. */
    const sections: InvoiceSectionFlags = ALL_SECTIONS;

    const [lines, setLines] = useState<DocumentLine[]>(() => [emptyLine()]);
    const [stages, setStages] = useState<PaymentStage[]>([]);
    const [discounts, setDiscounts] = useState<TenderDiscountEntry[]>([]);
    // Der Schlusstext steht als Vorschlag da: die Zahlungsbedingung aus den
    // Firmeneinstellungen — der Satz, den die Rechnung sonst ohnehin drucken
    // würde. Wer ihn leert, druckt genau diesen Vorgabesatz.
    const [closingText, setClosingText] = useState(() => (settings.paymentTerms || '').trim());

    const [saving, setSaving] = useState(false);
    /* Die Nummer, die diese Rechnung bekommen wird. Sie steht schon in der
       Vorschau, statt «Entwurf» zu schreiben (Vorgabe Samet 05.09.2026) — der
       Server gibt sie aus, ohne den Zähler zu bewegen. */
    const [nextNumber, setNextNumber] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        void billingApi.nextInvoiceNumber().then((number) => { if (!cancelled) setNextNumber(number); });
        return () => { cancelled = true; };
    }, []);

    /* Bearbeiten: den Beleg holen und die Maske damit fuellen. Der Server
       liefert ihn mit Zeilen; Rabatte und Zahlungsplan stehen als JSON darin. */
    const [editing, setEditing] = useState<InvoiceDto | null>(null);
    useEffect(() => {
        if (!editId) return undefined;
        let cancelled = false;
        void (async () => {
            try {
                const invoices = await billingApi.listInvoices({});
                const found = invoices.find((row) => row.id === editId) || null;
                if (cancelled) return;
                if (!found) { toast.error(t('crm.order_not_found')); navigate('/sales/invoices'); return; }
                setEditing(found);
                setCustomerId(found.customerId ?? null);
                setRecipientName(found.recipientName || found.customer?.companyName || '');
                setStreet((found.recipientAddress || '').split('\n')[0] || '');
                setCity((found.recipientAddress || '').split('\n').slice(1).join(' ').trim());
                setInvoiceDate((found.invoiceDate || found.createdAt || '').slice(0, 10));
                setDueDate((found.dueDate || found.invoiceDate || '').slice(0, 10));
                setSalesperson(found.salespersonName || '');
                setCommission(found.commissionNumber || '');
                setIntroText(found.introText || '');
                setNotes(found.notes || '');
                setVatRateText(String(found.vatRate ?? settings.vatRate ?? 8.1));
                setClosingText(found.closingText || '');
                setSenderAddress(found.senderAddress || defaultSender);
                setDiscounts(invoiceDiscounts(found));
                setStages(parsePaymentStages(found.paymentStages ?? null) ?? []);
                setLines((found.lineItems || []).length
                    ? (found.lineItems || []).map((item) => ({
                        ...emptyLine(),
                        id: item.id,
                        articleId: item.sourceId ?? null,
                        description: item.description,
                        longDescription: item.longDescription || '',
                        unit: item.unit || '',
                        quantity: String(item.quantity ?? 1),
                        unitPrice: String(item.unitAmount ?? 0),
                        discounts: parseDiscountList(item.discounts ?? null, MAX_LINE_DISCOUNTS),
                    }))
                    : [emptyLine()]);
                // Ein geladener Beleg ist der Ausgangsstand — sonst fragte die
                // Maske beim Verlassen nach, ohne dass jemand etwas tippte.
                setStep(1);
            } catch (error) {
                if (!cancelled) toast.error(apiError(error, t('billing.invoiceError')));
            } finally {
                /* nichts weiter: die Maske steht schon, sie füllt sich nur. */
            }
        })();
        return () => { cancelled = true; };
        // Absichtlich nur beim Aufbau: die Maske wird je Rechnung neu betreten.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editId]);

    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    const snapshot = JSON.stringify({ senderAddress, customerId, recipientName, street, supplement, postalCode, city, country, invoiceDate, dueDate, salesperson, commission, introText, notes, vatRateText, sections, lines, discounts, closingText, stages });
    const [initialSnapshot] = useState(snapshot);
    const guard = useUnsavedChangesGuard(snapshot !== initialSnapshot);

    const vatRate = Math.max(0, num(vatRateText));

    /* Zwischensumme → Rabatte (der Reihe nach, jeder auf den Rest des vorigen)
       → Netto → MWST → Total. Ist der Rabattabschnitt entfernt, wird der Stapel
       gar nicht erst angewendet: der Betrag steigt dann, und genau das ist der
       Sinn des Entfernens. */
    const subtotal = useMemo(() => round2(lines.reduce((sum, line) => sum + lineAmount(line), 0)), [lines]);
    // Eigenes `useMemo`: eine bedingt gebaute Liste wäre bei JEDEM Rendern eine
    // neue Kennung und machte die Erinnerung darunter wertlos.
    const activeDiscounts = useMemo(
        () => (sections.discount ? discounts : []),
        [sections.discount, discounts],
    );
    const breakdown = useMemo(() => applyDiscounts(subtotal, activeDiscounts), [subtotal, activeDiscounts]);
    const netTotal = round2(breakdown.remaining);
    const vatTotal = round2((netTotal * vatRate) / 100);
    const grossTotal = round2(netTotal + vatTotal);

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
        paymentStages: stages,
        recipientName: recipientName.trim(),
        recipientAddress: recipientAddress || null,
        introText: introText.trim() || null,
        invoiceDate,
        dueDate: dueDate || invoiceDate,
        salespersonName: salesperson.trim() || null,
        commissionNumber: commission.trim() || null,
        vatRate,
        notes: notes.trim() || null,
        // Die drei Abschnitte: der Server rechnet den Rabatt nur, wenn sein
        // Abschnitt eingeschaltet ist, und speichert genau diese Schalter.
        sections,
        discounts: activeDiscounts,
        closingText: sections.closing ? (closingText.trim() || null) : null,
        // Sie wird IMMER mitgespeichert, auch unverändert: die Rechnung soll
        // in einem Jahr noch den Absender zeigen, mit dem sie gestellt wurde —
        // nicht den, der dann in den Einstellungen steht.
        senderAddress: senderAddress.trim() || null,
        lines: filledLines.map<DirectInvoiceLineInput>((line) => ({
            description: line.description.trim(),
            longDescription: line.longDescription.trim() || null,
            quantity: num(line.quantity),
            unitAmount: num(line.unitPrice),
            unit: line.unit.trim() || null,
            discounts: lineDiscounts(line),
            articleId: line.articleId,
        })),
    });

    const recipientReady = Boolean(recipientName.trim());
    const linesReady = filledLines.length > 0 && grossTotal > 0 && lines.filter(documentLineStarted).every(documentLineValid);
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
        if (stages.length && !paymentStagesValid(stages)) {
            toast.error(t('crm.addon.paymentIncompleteShort'));
            setStep(1);
            return false;
        }
        return true;
    };

    /**
     * Vorschau des Entwurfs: aus den Feldern wird eine Rechnung GEBAUT, wie der
     * Server sie speichern würde, und durch denselben Generator geschickt.
     * Gezeigt wird damit das echte Dokument — nur die Nummer fehlt noch, denn
     * die vergibt der Server erst beim Erstellen. Weil auch die Abschnitte
     * mitgehen, zeigt die Vorschau schon, was das Entfernen eines Abschnitts
     * auf dem Papier bedeutet.
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
                invoiceNumber: editing?.invoiceNumber || nextNumber || t('invoices.draftNumber'),
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
                paymentStages: serializePaymentStages(stages),
                vatRate,
                sections: JSON.stringify(sections),
                discounts: serializeDiscountList(activeDiscounts),
                closingText: body.closingText,
                senderAddress: body.senderAddress,
                issuedByEmployeeId: '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                category: 'DIRECT',
                // Die Zeilen des Entwurfs tragen dieselben Felder, die der
                // Server speichern würde — inklusive Beschreibung und
                // Zeilenrabatt, damit die Vorschau die Tabelle zeigt, die
                // gedruckt wird.
                lineItems: filledLines.map((line, index) => ({
                    id: `draft-${index}`,
                    invoiceId: 'draft',
                    description: line.description.trim(),
                    longDescription: line.longDescription.trim() || null,
                    sourceType: line.articleId ? 'EXTRA_MATERIAL' : 'MANUAL',
                    sourceId: line.articleId ?? null,
                    quantity: num(line.quantity),
                    unitAmount: num(line.unitPrice),
                    // NETTO nach Zeilenrabatt — genau wie serverseitig.
                    lineTotal: lineAmount(line),
                    discounts: serializeDiscountList(lineDiscounts(line)),
                    discount: applyDiscounts(num(line.quantity) * num(line.unitPrice), line.discounts).combinedPercent || null,
                    unit: line.unit.trim() || null,
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

    const create = async (exit = true) => {
        if (saving || !validate()) return false;
        setSaving(true);
        try {
            const { invoice } = editId
                ? await billingApi.updateDirectInvoice(editId, payload())
                : await billingApi.createDirectInvoice(payload());
            toast.success(editId
                ? t('invoices.saved', { number: invoice.invoiceNumber })
                : t('invoices.created', { number: invoice.invoiceNumber }));
            if (exit) navigate('/sales/invoices');
            return true;
        } catch (e) {
            toast.error(apiError(e, t('billing.invoiceError')));
            return false;
        } finally {
            setSaving(false);
        }
    };

    const STEPS: WizardStep[] = [
        { key: 'recipient', label: t('invoices.stepRecipient'), hint: t('invoices.stepHintRecipient') },
        { key: 'document', label: t('invoices.stepDocument'), hint: t('invoices.stepHintDocument') },
        { key: 'invoice', label: t('invoices.stepDetails'), hint: t('invoices.stepHintInvoice') },
    ];

    return (
        <div className="ofi-invp-page">
            {/* Der Fortschritt steht NEBEN dem Titel: ein schmaler Balken mit
                drei Marken statt der früheren Leiter mit Erklärsätzen
                (Vorgabe Samet 05.09.2026). */}
            <InvoicePageHeader
                title={editing ? `${t('common.edit')} ${editing.invoiceNumber}` : t('invoices.directTitle')}
                actions={<InvoiceProgress steps={STEPS} current={step} furthest={furthest} onGo={setStep} />}
            />

            {step === 0 && (
                <SectionCard>
                    {/* Absender: vorbelegt aus den Mandanteneinstellungen, hier
                        änderbar — und mit der Rechnung eingefroren. */}
                    <div className="ofi-invp-grid ofi-invp-grid--split">
                        {/* EIN Feld für EINE Zeile: der Beleg druckt den Absender
                            als einzelne Zeile über dem Empfängerblock (sie
                            schrumpft, wenn sie lang wird, aber sie bricht nie um)
                            — ein Absatzfeld würde Umbrüche versprechen, die das
                            PDF nicht halten kann. */}
                        <InvoiceField label={t('invoices.senderAddress')} hint={t('invoices.senderHint')} wide>
                            <input
                                className={FIELD_INPUT_CLASS}
                                value={senderAddress}
                                onChange={(event) => setSenderAddress(event.target.value)}
                            />
                        </InvoiceField>
                        <div className="ofi-invp-senderfoot">
                            <button
                                type="button"
                                className="ofi-invp-sec__restore"
                                disabled={senderAddress.trim() === defaultSender}
                                onClick={() => setSenderAddress(defaultSender)}
                            >
                                <RefreshCcw01 size={13} />
                                {t('invoices.senderReset')}
                            </button>
                        </div>
                    </div>

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
                <SectionCard>
                    {/* EIN Kasten: die Zeilen, und darüber Anschreiben,
                        Zahlungsplan, Schlusstext und Rabatt als Reiter. Die
                        drei nummerierten Abschnitte sind entfallen — was der
                        Beleg trägt, steht in der Fläche selbst. */}
                    <DocumentWorkspace
                        lines={lines}
                        onChange={setLines}
                        coverLetter={introText}
                        onCoverLetterChange={setIntroText}
                        stages={stages}
                        onStagesChange={setStages}
                        discounts={discounts}
                        onDiscountsChange={setDiscounts}
                        closingText={closingText}
                        onClosingTextChange={setClosingText}
                        closingPlaceholder={(settings.paymentTerms || '').trim() || t('invoices.closingPlaceholder')}
                        vat={{ rate: vatRate, onRateChange: (rate) => setVatRateText(String(rate)) }}
                                               formatMoney={fmtMoney}
                        readOnly={saving}
                    />

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
                <SectionCard>
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
                                <div className="ofi-invp-tile__label">{t('invoices.stepDocument')}</div>
                                <div className="ofi-invp-tile__value">
                                    {t('invoices.sectionCount', {
                                        on: Object.values(sections).filter(Boolean).length,
                                        total: 3,
                                    })}
                                </div>
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

            <UnsavedChangesPopup open={guard.isOpen} saving={saving} onCancel={guard.cancel} onDiscard={guard.proceed}
                onSave={() => void create(false).then((saved) => { if (saved) guard.proceed(); })} />
            <InvoicePdfPopup
                open={previewOpen}
                title={t('invoices.previewTitle', { number: editing?.invoiceNumber || nextNumber || t('invoices.draftNumber') })}
                subtitle={`${t('invoices.category_DIRECT')} · ${fmtMoney(grossTotal)}`}
                blob={previewBlob}
                loading={previewLoading}
                onClose={() => { setPreviewOpen(false); setPreviewBlob(null); }}
            />
        </div>
    );
};
