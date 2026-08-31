import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import { File05 } from '@/components/icons/antIconCompat';
import { PdfPreviewSheet } from '@/components/pdf/PdfPreviewSheet';
import { DateField } from '@/components/ui-shared/DateField';
import { PopupActions, PopupButton, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { myOrdersApi } from '@/lib/api/billing';
import { tenderApi } from '@/lib/api/tender';
import { lazyToast as toast } from '@/lib/lazyToast';
import {
    confirmationDateOf,
    defaultConfirmationValidUntil,
    resolveConfirmationValidUntil,
} from '@/lib/orderConfirmation';
import { richTextToPlain } from '@/pages/sales/detail/utils/markdown.utils';
import { usePdfSettings } from '@/store/pdfSettingsStore';

// Derselbe Editor, mit dem der Einleitungstext der Offerte geschrieben wird —
// der Text der Bestätigung STARTET dort, also muss er hier dieselbe
// Auszeichnung tragen können. Lazy, damit jsPDF-freie Seiten ihn nicht laden.
const LazyRichTextEditor = lazy(() =>
    import('@/pages/sales/detail/components/RichTextMarkdownEditor')
        .then((module) => ({ default: module.RichTextMarkdownEditor })),
);

/** Leer heisst: kein sichtbarer Text — leere Absätze zählen nicht. */
const hasText = (value: string) => richTextToPlain(value).replace(/\s|&nbsp;/g, '').length > 0;

/**
 * Der Auftrag, so wie ihn die Bestätigung braucht. Bewusst eine eigene, schmale
 * Form: die Auftragskarte der Projektübersicht (`ProjectSalesOrder`) und die
 * Auftragsansicht (`MyOrderDetailDto`) sind zwei verschiedene Typen, und beide
 * öffnen dasselbe Fenster.
 */
export interface OrderConfirmationTarget {
    id: string;
    orderNumber: string;
    tenderId?: string | null;
    /** Geschäftsdatum des Auftrags; leer = `createdAt`. */
    orderDate?: string | null;
    createdAt?: string | null;
    confirmationNote?: string | null;
    confirmationValidUntil?: string | null;
    /** Wer den Auftrag erteilt hat — er steht als Verkäufer auf dem Beleg. */
    createdBy?: { firstName?: string | null; lastName?: string | null } | null;
}

const fullName = (person?: { firstName?: string | null; lastName?: string | null } | null): string =>
    `${person?.firstName || ''} ${person?.lastName || ''}`.trim();

/**
 * ── VERKAUFS-PDF = DIE AUFTRAGSBESTÄTIGUNG ──────────────────────────────────
 * ACHTUNG, Name und Inhalt gehen auseinander, und zwar mit Absicht: der Knopf
 * heisst «Verkaufs-PDF», das Dokument darunter ist die AUFTRAGSBESTÄTIGUNG. So
 * hat es der Benutzer entschieden (29.08.2026): «es gibt keinen Knopf
 * ‹Auftragsbestätigung›, es gibt das Verkaufs-PDF — das kommt dorthin, in das
 * dunkelblaue Feld.» Zum Auftrag gehört also nur noch EIN Beleg; der frühere
 * rote Verkaufsausdruck mit eigenem Text wurde dafür abgeschafft.
 *
 * Der Knopf steht neben der Auftragskarte — auf der Projektübersicht wie in der
 * Auftragsansicht, denn dort steht in beiden Modulen der Auftrag selbst.
 *
 * Was er öffnet, ist genau das, worum gebeten wurde: EIN Fenster mit dem
 * Einleitungstext und dem Enddatum. Beide sind vorbelegt und beide sind
 * änderbar:
 *
 *   • Der Text startet beim EINLEITUNGSTEXT DER OFFERTE. Ist am Auftrag schon
 *     einer gesichert, gilt dieser — sonst wird der der Offerte geholt
 *     (`/tenders/:id/pdf-content`) und steht sofort im Editor.
 *   • «Gültig bis» ist standardmässig das AUFTRAGSDATUM PLUS EIN MONAT. Das
 *     Datum des Belegs ist der Zeitpunkt, an dem der Auftrag entstanden ist,
 *     nicht das Datum der Offerte.
 *
 * «PDF erstellen» sichert beides am Auftrag und druckt dann — nur so trägt das
 * Dokument garantiert denselben Stand, den der Auftrag ab jetzt kennt.
 *
 * Das Dokument selbst ist die Offerte: dasselbe Gesicht, dieselben Zahlen, nur
 * auf die AB-Nummer ausgestellt (siehe `buildOrderConfirmationPdf`). Es geht an
 * den Kunden, darum trägt der Knopf das Marineblau des Dokuments und nicht mehr
 * das Rot des abgeschafften internen Ausdrucks.
 */
export const OrderConfirmationButton = ({ order, fallbackTenderId, onSaved, className }: {
    order: OrderConfirmationTarget | null;
    /** Hat der Auftrag keine eigene Offerte, gilt die des Projekts. */
    fallbackTenderId?: string | null;
    /** Meldet den gesicherten Stand zurück, damit die Seite ihn nicht neu lädt. */
    onSaved?: (saved: { confirmationNote: string | null; confirmationValidUntil: string | null }) => void;
    className?: string;
}) => {
    const settings = usePdfSettings();
    const tenderId = order?.tenderId || fallbackTenderId || null;
    // Synthetische «project-main-*» Aufträge sind keine Zeile in der Datenbank —
    // an ihnen kann nichts gesichert werden, also bleibt der Knopf aus.
    const orderId = order && !order.id.startsWith('project-main-') ? order.id : null;
    const orderDate = confirmationDateOf(order);

    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [validUntil, setValidUntil] = useState('');
    const [prefilling, setPrefilling] = useState(false);
    const [saving, setSaving] = useState(false);

    const [previewOpen, setPreviewOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [stage, setStage] = useState<string | null>(null);
    const [blob, setBlob] = useState<Blob | null>(null);
    const saveRef = useRef<(() => void) | null>(null);

    // Der gesicherte Stand. Er wird hier MITGEFÜHRT und nicht nur aus den Props
    // gelesen: die Auftragskarte lädt nach dem Sichern nicht neu, und das
    // Fenster muss beim zweiten Öffnen den eben gespeicherten Text zeigen.
    const [saved, setSaved] = useState<{ note: string | null; validUntil: string | null }>({
        note: order?.confirmationNote ?? null,
        validUntil: order?.confirmationValidUntil ?? null,
    });

    // Auftragswechsel: Text und Gültigkeit gehören dem Auftrag — sonst zeigte
    // die Karte die Bestätigung des vorigen.
    useEffect(() => {
        setSaved({ note: order?.confirmationNote ?? null, validUntil: order?.confirmationValidUntil ?? null });
        setPreviewOpen(false);
        setBlob(null);
        saveRef.current = null;
    }, [order?.id, order?.confirmationNote, order?.confirmationValidUntil]);

    const openPopup = () => {
        const storedNote = saved.note || '';
        setNote(storedNote);
        setValidUntil(resolveConfirmationValidUntil(saved.validUntil, orderDate));
        setOpen(true);

        // Noch nie bearbeitet: der Text der Offerte ist der Startpunkt. Er wird
        // erst beim Öffnen geholt — die Auftragskarte soll dafür nicht bei
        // jedem Seitenaufbau eine Anfrage bezahlen.
        if (!hasText(storedNote) && tenderId) {
            setPrefilling(true);
            tenderApi.getPdfContent(tenderId)
                .then((content) => {
                    const quoteText = content?.coverLetter || '';
                    // Nur übernehmen, wenn inzwischen niemand selbst getippt hat.
                    if (quoteText) setNote((current) => (hasText(current) ? current : quoteText));
                })
                .catch(() => { /* kein Anschreiben: das Feld bleibt leer und wird getippt */ })
                .finally(() => setPrefilling(false));
        }
    };

    const generate = async () => {
        if (!tenderId || !orderId) return;
        const text = hasText(note) ? note.trim() : '';
        const day = validUntil || defaultConfirmationValidUntil(orderDate);
        setSaving(true);
        try {
            // Erst sichern, dann drucken.
            const response = await myOrdersApi.updateOrderConfirmation(orderId, {
                confirmationNote: text || null,
                confirmationValidUntil: day,
            });
            const stored = {
                confirmationNote: response.confirmationNote ?? null,
                confirmationValidUntil: response.confirmationValidUntil ?? null,
            };
            setSaved({ note: stored.confirmationNote, validUntil: stored.confirmationValidUntil });
            onSaved?.(stored);
            setOpen(false);

            // Ein neuer Stand heisst ein neues Dokument — der alte wird
            // verworfen, damit die Vorschau nie das vorige PDF zeigt.
            saveRef.current = null;
            setBlob(null);
            setPreviewOpen(true);
            setBusy(true);
            setStage(t('tenders.pdf_gorseller_yukleniyor'));

            const module = await import('@/utils/pdf/quotePdf');
            const doc = await module.buildOrderConfirmationPdf(tenderId, settings, {
                orderNumber: order?.orderNumber || '',
                orderDate,
                validUntil: day,
                salespersonName: fullName(order?.createdBy),
                introText: text || null,
            }, {
                fileBaseName: order?.orderNumber || undefined,
                onProgress: (p) => {
                    if (p.stage === 'positions') {
                        setStage(t('tenders.pdf_positions_progress', { done: p.done, total: p.total }));
                    } else if (p.stage === 'finalize') {
                        setStage(t('tenders.pdf_finalizing'));
                    }
                },
            });
            saveRef.current = () => module.saveQuotePdf(doc);
            setBlob(doc.blob);
        } catch (error: any) {
            toast.error(error?.response?.data?.error || error?.message || t('services.toastPdfError'));
            setPreviewOpen(false);
        } finally {
            setSaving(false);
            setBusy(false);
            setStage(null);
        }
    };

    const disabled = !tenderId || !orderId;

    return (
        <>
            <button
                type="button"
                onClick={openPopup}
                disabled={disabled}
                title={disabled ? t('projects.bu_siparis_bir_teklife_bagli_degil') : t('crm.orderConfirmation.title')}
                className={`ofi-ordconf-btn ${className || ''}`}
            >
                <File05 size={14} />
                <span>{t('crm.orderConfirmation.button')}</span>
            </button>

            <PopupDialog
                open={open}
                title={t('crm.orderConfirmation.title')}
                subtitle={order?.orderNumber || undefined}
                icon={<File05 size={20} />}
                width={640}
                onClose={() => { if (!saving) setOpen(false); }}
                closeOnBackdrop={!saving}
                closeOnEscape={!saving}
                footer={(
                    <PopupActions>
                        <PopupButton disabled={saving} onClick={() => setOpen(false)}>{t('common.cancel')}</PopupButton>
                        <PopupButton
                            variant="primary"
                            loading={saving}
                            disabled={prefilling}
                            onClick={() => { void generate(); }}
                        >
                            {t('projects.general.generatePdf')}
                        </PopupButton>
                    </PopupActions>
                )}
            >
                <PopupField
                    label={t('crm.orderConfirmation.validUntilLabel')}
                    hint={t('crm.orderConfirmation.validUntilHint')}
                >
                    <DateField
                        value={validUntil}
                        onChange={setValidUntil}
                        ariaLabel={t('crm.orderConfirmation.validUntilLabel')}
                        className="w-[190px]"
                    />
                </PopupField>

                <PopupField
                    label={t('crm.orderConfirmation.introLabel')}
                    hint={t('crm.orderConfirmation.introHint')}
                >
                    {prefilling ? (
                        <div className="ofi-shimmer h-40 rounded-[3px]" />
                    ) : (
                        <Suspense fallback={<div className="ofi-shimmer h-40 rounded-[3px]" />}>
                            <LazyRichTextEditor
                                value={note}
                                onChange={setNote}
                                minHeight={190}
                                placeholder={t('crm.orderConfirmation.introPlaceholder')}
                            />
                        </Suspense>
                    )}
                </PopupField>

                <PopupNote className="ofi-ordconf-hint">{t('crm.orderConfirmation.hint')}</PopupNote>
            </PopupDialog>

            <PdfPreviewSheet
                open={previewOpen}
                title={t('crm.orderConfirmation.title')}
                subtitle={order?.orderNumber || undefined}
                blob={blob}
                loading={busy}
                loadingLabel={stage ?? t('tenders.pdf_olusturuluyor')}
                emptyText={t('services.toastPdfError')}
                downloadLabel={t('common.download')}
                onClose={() => setPreviewOpen(false)}
                onDownload={() => {
                    saveRef.current?.();
                    toast.success(t('tenders.pdf_indirildi'));
                }}
            />
        </>
    );
};
