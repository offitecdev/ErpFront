import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Eye, RefreshCcw01, Receipt } from '@/components/icons/antIconCompat';
import { DocumentWorkspace } from '@/components/sales-document/DocumentWorkspace';
import { documentLineAmount, documentLineStarted, documentLineValid, documentNumber, emptyDocumentLine, type DocumentLine } from '@/components/sales-document/documentLines';
import { MacDatePicker } from '@/components/ui-shared/MacDatePicker';
import i18n from '@/i18n';
import { t } from '@/i18n/translate';
import { billingApi } from '@/lib/api/billing';
import { INVOICE_INTRO, invoiceLanguage, readInvoiceDocument, type InvoiceDocumentLanguage, type InvoiceDocumentOptions } from '@/lib/invoiceDocument';
import { parsePaymentStages, paymentStagesValid, serializePaymentStages, type PaymentStage } from '@/lib/paymentSchedule';
import { useUnsavedChangesGuard } from '@/pages/sales/detail/hooks/useUnsavedChangesGuard';
import { UnsavedChangesPopup } from '@/pages/sales/detail/popups/UnsavedChangesPopup';
import { PanelMacSelect, PanelPageActions, PanelPageField, PanelPageNotice } from '@/pages/production/components/PanelEditorKit';
import { applyDiscounts, MAX_LINE_DISCOUNTS, parseDiscountList, serializeDiscountList, type TenderDiscountEntry } from '@/pages/sales/detail/utils/tenderDiscounts.utils';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { DirectInvoiceLineInput, InvoiceDto } from '@/types/billing';
import { formatAddressLines } from '@/utils/address';
import { companySenderLine } from '@/utils/pdf/addressBlock';
import { DirectSection, DirectSteps, DirectTextField } from './components/DirectInvoiceKit';
import { InvoicePdfPopup } from './components/InvoicePdfPopup';
import { CustomerPickField, type CustomerPick } from './components/InvoiceLinePicker';
import { ALL_SECTIONS, apiError, invoiceDiscounts, parseInvoiceSections, isoToday, round2 } from './invoiceShared';
// Das Kleid der Pano-Seiten (Vorgabe Samet 25.09.2026, «tıpkı üretimdeki
// gibi»): Tafeln, Felder, Pop-up-Knopf und Knöpfe — invoiceDirect.css lädt
// danach und ergänzt nur, was die Rechnung darüber hinaus braucht.
import '@/styles/modules/panels.css';
import '@/styles/modules/invoiceDirect.css';

const num = (value: string) => documentNumber(value) || 0;
const validNumber = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value.trim());
const CONTROL = 'ofi-panel-page-control';

export const InvoiceDirectPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const editId = searchParams.get('edit');
    const settings = usePdfSettings();
    const [step, setStep] = useState(0);
    const [editing, setEditing] = useState<InvoiceDto | null>(null);
    const [loading, setLoading] = useState(Boolean(editId));
    const [saving, setSaving] = useState(false);
    const saveLock = useRef(false);
    const baseline = useRef<string | null>(null);
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
    const [dueTouched, setDueTouched] = useState(false);
    const [salesperson, setSalesperson] = useState('');
    const [commission, setCommission] = useState('');
    const [pdfLanguage, setPdfLanguage] = useState<InvoiceDocumentLanguage>(() => invoiceLanguage(i18n.resolvedLanguage || i18n.language));
    const [introText, setIntroText] = useState(() => INVOICE_INTRO[pdfLanguage]);
    const [notes, setNotes] = useState('');
    const [vatEnabled, setVatEnabled] = useState(false);
    const [vatRateText, setVatRateText] = useState(() => String(settings.vatRate ?? 8.1));
    const [showQr, setShowQr] = useState(true);
    const [showFooter, setShowFooter] = useState(true);
    const [customNumber, setCustomNumber] = useState<string | null>(null);
    const [suggestedNumber, setSuggestedNumber] = useState<string | null>(null);
    const [numberLoading, setNumberLoading] = useState(false);
    const [numberRetry, setNumberRetry] = useState(0);
    const invoiceNumber = customNumber ?? suggestedNumber ?? '';
    const [sections, setSections] = useState(ALL_SECTIONS);
    const [lines, setLines] = useState<DocumentLine[]>(() => [emptyDocumentLine()]);
    const [stages, setStages] = useState<PaymentStage[]>([]);
    const [discounts, setDiscounts] = useState<TenderDiscountEntry[]>([]);
    const [closingText, setClosingText] = useState(() => (settings.paymentTerms || '').trim());
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        if (!editId) return;
        let cancelled = false;
        void billingApi.getInvoice(editId).then(found => {
            if (cancelled) return;
            const options = readInvoiceDocument(found);
            setEditing(found);
            setCustomerId(found.customerId ?? null);
            setRecipientName(found.recipientName || found.customer?.companyName || '');
            // Preserve all address lines on older invoices, and structured fields on new ones.
            setStreet(options.recipientFields?.street ?? found.recipientAddress ?? '');
            setSupplement(options.recipientFields?.supplement ?? '');
            setPostalCode(options.recipientFields?.postalCode ?? '');
            setCity(options.recipientFields?.city ?? '');
            setCountry(options.recipientFields?.country ?? '');
            setInvoiceDate((found.invoiceDate || found.createdAt).slice(0, 10));
            setDueDate((found.dueDate || found.invoiceDate || found.createdAt).slice(0, 10));
            setDueTouched(true);
            setSalesperson(found.salespersonName || '');
            setCommission(found.commissionNumber || '');
            setPdfLanguage(options.language);
            setIntroText(found.introText || INVOICE_INTRO[options.language]);
            setNotes(found.notes || '');
            setVatEnabled(options.vatEnabled);
            setVatRateText(String(found.vatRate ?? settings.vatRate ?? 8.1));
            setShowQr(options.showQr);
            setShowFooter(options.showFooter);
            setCustomNumber(found.invoiceNumber || null);
            setClosingText(found.closingText || '');
            setSenderAddress(found.senderAddress || defaultSender);
            setSections(parseInvoiceSections(found.sections));
            setDiscounts(invoiceDiscounts(found));
            setStages(parsePaymentStages(found.paymentStages ?? null) ?? []);
            setLines(found.lineItems?.length ? found.lineItems.map(item => ({
                ...emptyDocumentLine(), id: item.id, articleId: item.sourceId ?? null,
                description: item.description, longDescription: item.longDescription || '', unit: item.unit || '',
                quantity: String(item.quantity ?? 1), unitPrice: String(item.unitAmount ?? 0),
                discounts: parseDiscountList(item.discounts ?? null, MAX_LINE_DISCOUNTS),
            })) : [emptyDocumentLine()]);
            baseline.current = null;
            setLoading(false);
        }).catch(error => {
            if (!cancelled) { toast.error(apiError(error, t('billing.invoiceError'))); navigate('/accounting/invoices'); }
        });
        return () => { cancelled = true; };
        // Hydrate once per document; company setting changes must not overwrite it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editId]);

    useEffect(() => {
        if (loading || editing?.invoiceNumber) return;
        let cancelled = false;
        setNumberLoading(true);
        setSuggestedNumber(null);
        void billingApi.nextInvoiceNumber({ language: pdfLanguage, year: Number(invoiceDate.slice(0, 4)) }).then(number => {
            if (!cancelled) { setSuggestedNumber(number); setNumberLoading(false); }
        });
        return () => { cancelled = true; };
    }, [loading, editing?.invoiceNumber, pdfLanguage, invoiceDate, numberRetry]);

    const documentOptions: InvoiceDocumentOptions = { language: pdfLanguage, showQr, showFooter, vatEnabled, recipientFields: { street, supplement, postalCode, city, country } };
    const snapshot = JSON.stringify({ senderAddress, customerId, recipientName, invoiceDate, dueDate, salesperson, commission, introText, notes, vatRateText, sections, lines, discounts, closingText, stages, documentOptions, customNumber });
    if (!loading && baseline.current === null) baseline.current = snapshot;
    const guard = useUnsavedChangesGuard(!loading && baseline.current !== snapshot);
    const vatValid = !vatEnabled || (vatRateText.trim() !== '' && Number.isFinite(documentNumber(vatRateText)) && num(vatRateText) >= 0 && num(vatRateText) <= 100);
    const vatRate = vatEnabled && vatValid ? num(vatRateText) : 0;
    const subtotal = round2(lines.reduce((sum, line) => sum + documentLineAmount(line), 0));
    const activeDiscounts = sections.discount ? discounts : [];
    const netTotal = round2(applyDiscounts(subtotal, activeDiscounts).remaining);
    const grossTotal = round2(netTotal + round2(netTotal * vatRate / 100));
    const fmtMoney = (value: number) => new Intl.NumberFormat(pdfLanguage === 'de' ? 'de-CH' : pdfLanguage === 'tr' ? 'tr-TR' : 'en-GB', { style: 'currency', currency: settings.currency }).format(value);
    const recipientAddress = [...street.split(/\r?\n/).map(line => line.trim()).filter(Boolean), ...formatAddressLines({ addressSupplement: supplement, postalCode, city, country })].join('\n');
    const filledLines = lines.filter(line => line.description.trim());
    const recipientReady = Boolean(recipientName.trim());
    const linesReady = filledLines.length > 0 && grossTotal > 0 && Number.isFinite(grossTotal) && lines.filter(documentLineStarted).every(documentLineValid) && vatValid;
    const furthest = recipientReady ? (linesReady ? 2 : 1) : 0;

    const pickCustomer = (customer: CustomerPick) => {
        setCustomerId(customer.id); setRecipientName(customer.companyName);
        setStreet(customer.address || ''); setSupplement(customer.addressSupplement || '');
        setPostalCode(customer.postalCode || ''); setCity(customer.city || ''); setCountry(customer.country || '');
    };
    const changeLanguage = (next: InvoiceDocumentLanguage) => {
        if (!introText.trim() || Object.values(INVOICE_INTRO).includes(introText.trim())) setIntroText(INVOICE_INTRO[next]);
        setPdfLanguage(next);
    };
    const payload = () => ({
        customerId, invoiceNumber: customNumber === null ? null : customNumber.trim(), documentOptions,
        paymentStages: stages, recipientName: recipientName.trim(), recipientAddress: recipientAddress || null,
        introText: introText.trim() || null, invoiceDate, dueDate: dueDate || invoiceDate,
        salespersonName: salesperson.trim() || null, commissionNumber: commission.trim() || null,
        vatRate, notes: notes.trim() || null, sections, discounts: activeDiscounts,
        closingText: sections.closing ? closingText.trim() || null : null, senderAddress: senderAddress.trim() || null,
        lines: filledLines.map<DirectInvoiceLineInput>(line => ({
            description: line.description.trim(), longDescription: line.longDescription.trim() || null,
            quantity: num(line.quantity), unitAmount: num(line.unitPrice), unit: line.unit.trim() || null,
            discounts: line.discounts, articleId: line.articleId,
        })),
    });
    const validate = () => {
        if (!recipientReady) { toast.error(t('invoices.needRecipient')); setStep(0); return false; }
        if (!vatValid) { toast.error(t('invoices.err.VAT_INVALID')); setStep(1); return false; }
        if (!linesReady) { toast.error(t('invoices.needLines')); setStep(1); return false; }
        if (stages.length && !paymentStagesValid(stages)) { toast.error(t('crm.addon.paymentIncompleteShort')); setStep(1); return false; }
        if (!validNumber(invoiceNumber)) { toast.error(t(invoiceNumber ? 'invoices.err.NUMBER_INVALID' : 'directInvoice.numberUnavailable')); setStep(2); return false; }
        if (!invoiceDate || !dueDate || dueDate < invoiceDate) { toast.error(t('invoices.err.DUE_BEFORE_DATE')); setStep(2); return false; }
        return true;
    };

    const preview = async () => {
        if (previewLoading || !validate()) return;
        setPreviewOpen(true); setPreviewBlob(null); setPreviewLoading(true);
        try {
            const body = payload();
            const draft: InvoiceDto = {
                id: 'preview', tenantId: '', customerId, projectId: null, salesOrderId: null,
                invoiceNumber, billingType: 'FULL', kind: 'RECHNUNG', invoiceDate, dueDate,
                salespersonName: body.salespersonName, commissionNumber: body.commissionNumber,
                billedPercent: 100, baseAmount: netTotal, amount: grossTotal, status: 'ISSUED', notes: body.notes,
                recipientName: body.recipientName, recipientAddress: body.recipientAddress, introText: body.introText,
                paymentStages: serializePaymentStages(stages), vatRate,
                sections: JSON.stringify({ ...sections, document: documentOptions }), discounts: serializeDiscountList(activeDiscounts),
                closingText: body.closingText, senderAddress: body.senderAddress, issuedByEmployeeId: '',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), category: 'DIRECT',
                lineItems: filledLines.map((line, index) => ({
                    id: `preview-${index}`, invoiceId: 'preview', description: line.description.trim(),
                    longDescription: line.longDescription.trim() || null, sourceType: line.articleId ? 'EXTRA_MATERIAL' : 'MANUAL',
                    sourceId: line.articleId ?? null, quantity: num(line.quantity), unitAmount: num(line.unitPrice),
                    lineTotal: documentLineAmount(line), discounts: serializeDiscountList(line.discounts),
                    discount: applyDiscounts(num(line.quantity) * num(line.unitPrice), line.discounts).combinedPercent || null,
                    unit: line.unit.trim() || null, sortOrder: index,
                })),
            };
            const { buildInvoicePdfBytes } = await import('@/utils/pdf/invoicePdf');
            const bytes = await buildInvoicePdfBytes(draft, { orderNumber: '' }, settings);
            setPreviewBlob(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
        } catch (error) { toast.error(apiError(error, t('billing.pdfError'))); }
        finally { setPreviewLoading(false); }
    };

    const create = async (exit = true) => {
        if (saveLock.current || !validate()) return false;
        saveLock.current = true; setSaving(true);
        try {
            const { invoice } = editId
                ? await billingApi.updateDirectInvoice(editId, { ...payload(), draft: false })
                : await billingApi.createDirectInvoice({ ...payload(), draft: false });
            baseline.current = snapshot;
            toast.success(t('invoices.saved', { number: invoice.invoiceNumber }));
            if (exit) navigate(`/accounting/invoices/${invoice.id}`, { replace: true });
            return true;
        } catch (error) { toast.error(apiError(error, t('billing.invoiceError'))); return false; }
        finally { saveLock.current = false; setSaving(false); }
    };

    const stepLabels = [t('invoices.stepRecipient'), t('invoices.stepDocument'), t('invoices.stepDetails')];
    const titleKeys = ['recipient', 'document', 'details'];
    const finalLabel = saving ? t('directInvoice.issuing') : editing?.status !== 'DRAFT' && editId ? t('common.save') : t('directInvoice.issue');
    const pdfLanguages: Array<{ value: InvoiceDocumentLanguage; label: string }> = [{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }, { value: 'tr', label: 'Türkçe' }];
    const leave = () => guard.attempt(() => navigate(editId ? `/accounting/invoices/${editId}` : '/accounting/invoices/new'));

    return (
        <div className="ofi-panel-editor-page direct-invoice">
            <header className="ofi-panel-page-head direct-head">
                <div>
                    <h1>{editing ? `${t('common.edit')} ${editing.invoiceNumber || t('invoices.draftNumber')}` : t('invoices.directTitle')}</h1>
                    <p>{t(`directInvoice.${titleKeys[step]}Hint`)}</p>
                </div>
                <DirectSteps labels={stepLabels} current={step} furthest={furthest} disabled={loading || saving} onGo={setStep} ariaLabel={t('invoices.directTitle')} />
            </header>
            {loading ? <div className="ofi-panel-page-state">{t('directInvoice.loading')}</div> : (<>
                <fieldset className="direct-form" disabled={saving} aria-busy={saving}>
                    {step === 0 && <div className="direct-split">
                        <div>
                            <DirectSection title={t('directInvoice.recipient')}>
                                <div className="ofi-panel-page-grid">
                                    <PanelPageField label={t('invoices.recipientPick')} required wide hint={customerId ? t('directInvoice.customerLinked') : recipientName.trim() ? t('directInvoice.customerFree') : undefined}>
                                        <CustomerPickField value={recipientName} selectedId={customerId} onChange={next => { setRecipientName(next); setCustomerId(null); }} onPick={pickCustomer} />
                                    </PanelPageField>
                                    <DirectTextField label={t('address.street')}><textarea rows={2} className={CONTROL} value={street} onChange={e => setStreet(e.target.value)} /></DirectTextField>
                                    <PanelPageField label={t('address.supplement')} wide><input className={CONTROL} value={supplement} onChange={e => setSupplement(e.target.value)} /></PanelPageField>
                                    <PanelPageField label={t('address.postalCode')}><input className={CONTROL} autoComplete="postal-code" value={postalCode} onChange={e => setPostalCode(e.target.value)} /></PanelPageField>
                                    <PanelPageField label={t('address.city')}><input className={CONTROL} autoComplete="address-level2" value={city} onChange={e => setCity(e.target.value)} /></PanelPageField>
                                    <PanelPageField label={t('address.country')}><input className={CONTROL} autoComplete="country-name" value={country} onChange={e => setCountry(e.target.value)} /></PanelPageField>
                                </div>
                            </DirectSection>
                            <DirectSection title={t('directInvoice.sender')} description={t('directInvoice.senderHint')}
                                action={<button type="button" className="direct-link" disabled={senderAddress.trim() === defaultSender} onClick={() => setSenderAddress(defaultSender)}><RefreshCcw01 size={13} />{t('invoices.senderReset')}</button>}>
                                <div className="ofi-panel-page-grid">
                                    <PanelPageField label={t('invoices.senderAddress')} wide><input className={CONTROL} value={senderAddress} onChange={e => setSenderAddress(e.target.value)} /></PanelPageField>
                                </div>
                            </DirectSection>
                        </div>
                        <aside>
                            <DirectSection title={t('directInvoice.addressPreview')}>
                                <div className="direct-address">
                                    <p className="direct-address__sender">{senderAddress || '—'}</p>
                                    <strong className={recipientName ? undefined : 'is-empty'}>{recipientName || t('directInvoice.recipient')}</strong>
                                    <p>{recipientAddress || '—'}</p>
                                </div>
                            </DirectSection>
                        </aside>
                    </div>}
                    {step === 1 && <>
                        {/* `.ofi-invp-page` bringt der Belegtabelle das Kleid der
                            Offerte (Spaltenlinien, 26px-Zellen, invoiceMac.css). */}
                        <div className="ofi-invp-page direct-document">
                            <DocumentWorkspace lines={lines} onChange={setLines} coverLetter={introText} onCoverLetterChange={setIntroText}
                                stages={stages} onStagesChange={setStages} discounts={discounts} onDiscountsChange={setDiscounts}
                                closingText={closingText} onClosingTextChange={setClosingText} closingLabel={t('directInvoice.paymentTerm')} closingPlaceholder={t('directInvoice.paymentPlaceholder')}
                                vat={{ rate: vatRate, text: vatRateText, enabled: vatEnabled, onEnabledChange: setVatEnabled, onTextChange: setVatRateText, onRateChange: rate => setVatRateText(String(rate)) }}
                                formatMoney={fmtMoney} readOnly={saving} />
                        </div>
                        {!vatValid && <PanelPageNotice danger>{t('invoices.err.VAT_INVALID')}</PanelPageNotice>}
                    </>}
                    {step === 2 && <>
                        <dl className="ofi-panel-page-summary direct-summary">
                            <div><dt>{t('directInvoice.number')}</dt><dd>{invoiceNumber || '—'}</dd></div>
                            <div><dt>{t('directInvoice.recipient')}</dt><dd>{recipientName || '—'}</dd></div>
                            <div><dt>{t('directInvoice.documentTitle')}</dt><dd>{t('directInvoice.positions', { count: filledLines.length })}</dd></div>
                            <div><dt>{t('invoices.grossTotal')}</dt><dd>{fmtMoney(grossTotal)}</dd></div>
                        </dl>
                        <DirectSection title={t('directInvoice.detailsTitle')}>
                            <div className="ofi-panel-page-grid">
                                <PanelPageField label={t('directInvoice.number')} hint={t('directInvoice.numberHint')} required wide>
                                    <div className="direct-number">
                                        <input className={CONTROL} value={invoiceNumber} maxLength={64} placeholder={numberLoading ? '…' : 'PI-2026-003'} onChange={e => setCustomNumber(e.target.value)} aria-invalid={Boolean(invoiceNumber && !validNumber(invoiceNumber))} />
                                        {!editing?.invoiceNumber && <button type="button" title={t('directInvoice.autoNumber')} aria-label={t('directInvoice.autoNumber')} onClick={() => { setCustomNumber(null); setNumberRetry(n => n + 1); }}><RefreshCcw01 size={14} /></button>}
                                    </div>
                                </PanelPageField>
                                <PanelPageField label={t('billing.invoiceDate')}><MacDatePicker className="is-field" value={invoiceDate} ariaLabel={t('billing.invoiceDate')} onChange={next => { setInvoiceDate(next); if (!dueTouched || dueDate < next) setDueDate(next); }} /></PanelPageField>
                                <PanelPageField label={t('billing.dueDate')}><MacDatePicker className="is-field" value={dueDate} min={invoiceDate} ariaLabel={t('billing.dueDate')} onChange={next => { setDueTouched(true); setDueDate(next); }} /></PanelPageField>
                                <PanelPageField label={t('directInvoice.contact')}><input className={CONTROL} value={salesperson} onChange={e => setSalesperson(e.target.value)} /></PanelPageField>
                                <PanelPageField label={t('billing.commission')}><input className={CONTROL} value={commission} onChange={e => setCommission(e.target.value)} /></PanelPageField>
                            </div>
                            {!invoiceNumber && !numberLoading && <PanelPageNotice danger>{t('directInvoice.numberUnavailable')}</PanelPageNotice>}
                        </DirectSection>
                        <DirectSection title={t('directInvoice.textsTitle')} description={t('directInvoice.textsHint')}>
                            <div className="ofi-panel-page-grid">
                                <DirectTextField label={t('directInvoice.paymentTerm')}><textarea className={CONTROL} rows={3} value={closingText} placeholder={t('directInvoice.paymentPlaceholder')} onChange={e => setClosingText(e.target.value)} /></DirectTextField>
                                <DirectTextField label={t('invoices.introText')}><textarea className={CONTROL} rows={3} value={introText} onChange={e => setIntroText(e.target.value)} /></DirectTextField>
                                <DirectTextField label={t('invoices.notes')}><textarea className={CONTROL} rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></DirectTextField>
                            </div>
                        </DirectSection>
                        <DirectSection title={t('directInvoice.pdfSettings')}>
                            <div className="ofi-panel-page-grid">
                                <PanelPageField label={t('directInvoice.language')}>
                                    <PanelMacSelect value={pdfLanguage} onChange={next => changeLanguage(next as InvoiceDocumentLanguage)} ariaLabel={t('directInvoice.language')} options={pdfLanguages} />
                                </PanelPageField>
                            </div>
                            <div className="direct-checks">
                                <label className="ofi-panel-page-check"><input type="checkbox" checked={showQr} onChange={e => setShowQr(e.target.checked)} /><span>{t('directInvoice.qr')}<small>{t('directInvoice.qrHint')}</small></span></label>
                                <label className="ofi-panel-page-check"><input type="checkbox" checked={showFooter} onChange={e => setShowFooter(e.target.checked)} /><span>{t('directInvoice.footer')}<small>{t('directInvoice.footerHint')}</small></span></label>
                            </div>
                        </DirectSection>
                    </>}
                </fieldset>
                {/* Die Knöpfe der Pano-Seite: rechts, klein, EIN Blau (die
                    Schritte zurück/weiter stehen nebeneinander wie im
                    Mac-Assistenten). */}
                <PanelPageActions>
                    <span />
                    <button type="button" className="ofi-panel-page-button" onClick={() => (step ? setStep(step - 1) : leave())}>
                        <ArrowLeft size={15} />{step === 0 ? t('invoices.cancelBtn') : t('invoices.stepBack')}
                    </button>
                    {step === 2 && <button type="button" className="ofi-panel-page-button" disabled={saving || previewLoading || !validNumber(invoiceNumber)} onClick={() => void preview()}><Eye size={15} />{t('invoices.previewBtn')}</button>}
                    {step < 2
                        ? <button type="button" className="ofi-panel-page-button is-primary" disabled={saving || (step === 0 ? !recipientReady : !linesReady)} onClick={() => setStep(step + 1)}>{t('invoices.stepNext')}<ArrowRight size={15} /></button>
                        : <button type="button" className="ofi-panel-page-button is-primary" disabled={saving || !linesReady || !validNumber(invoiceNumber)} onClick={() => void create()}><Receipt size={15} />{finalLabel}</button>}
                </PanelPageActions>
            </>)}
            <UnsavedChangesPopup open={guard.isOpen} saving={saving} onCancel={guard.cancel} onDiscard={guard.proceed} onSave={() => void create(false).then(saved => { if (saved) guard.proceed(); })} />
            <InvoicePdfPopup open={previewOpen} title={t('invoices.previewTitle', { number: invoiceNumber })} filename={invoiceNumber}
                subtitle={`${t('invoices.category_DIRECT')} · ${fmtMoney(grossTotal)}`} blob={previewBlob} loading={previewLoading} onClose={() => { setPreviewOpen(false); setPreviewBlob(null); }} />
        </div>
    );
};
