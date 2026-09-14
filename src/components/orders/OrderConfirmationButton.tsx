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
import { useTenderTextTemplates } from '@/pages/sales/detail/hooks/useTenderTextTemplates';
import { richTextToPlain } from '@/pages/sales/detail/utils/markdown.utils';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import '@/styles/modules/projectDetail.css';

// Derselbe Editor, mit dem der Einleitungstext der Offerte geschrieben wird —
// der Text der Bestätigung STARTET dort, also muss er hier dieselbe
// Auszeichnung tragen können. Lazy, damit jsPDF-freie Seiten ihn nicht laden.
const LazyRichTextEditor = lazy(() =>
    import('@/pages/sales/detail/components/RichTextMarkdownEditor')
        .then((module) => ({ default: module.RichTextMarkdownEditor })),
);

// Dasselbe Vorlagenfenster wie im PDF-Reiter der Offerte. Ebenfalls lazy: es
// zieht den Editor nach, und die Auftragskarte soll ihn erst laden, wenn jemand
// die Vorlagen wirklich öffnet.
const LazyTextTemplatesPopup = lazy(() =>
    import('@/pages/sales/detail/popups/TextTemplatesPopup')
        .then((module) => ({ default: module.TextTemplatesPopup })),
);

/* Die Vorlagenkarte schwebt ÜBER dem Fenster mit dem Schleier (z 750) — ohne
   eigene Stapelhöhe läge sie darunter und wäre unerreichbar. */
const TEMPLATES_Z = 800;

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
 *     (`/tenders/:id/pdf-content`) und steht sofort im Editor. Hat die Offerte
 *     keinen, greift die Standardvorlage der Textbausteine, genau wie in der
 *     Offertenmaske.
 *   • Über dem Editor steht derselbe Knopf «Textbausteine» wie im PDF-Reiter
 *     der Offerte (Vorgabe Samet: «im Verkauf soll für das Anschreiben dasselbe
 *     kommen wie in den Angebotsdetails, mit dem Vorlagen-Bereich»). Er öffnet
 *     dieselbe mandantenweite Liste — auswählen, bearbeiten, als Standard
 *     setzen, löschen, und «+» sichert den Text, der gerade im Feld steht, als
 *     neue Vorlage (`hooks/useTenderTextTemplates`).
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

    // ── Textbausteine ────────────────────────────────────────────────────────
    // Genau die Vorlagen der Angebotsdetails: dieselbe mandantenweite Liste,
    // derselbe Haken, dasselbe Fenster (Vorgabe Samet: im Verkauf soll für das
    // Anschreiben dasselbe kommen wie in den Angebotsdetails).
    const templates = useTenderTextTemplates({
        currentText: note,
        onApply: setNote,
        onError: (message) => toast.error(message),
    });

    // Escape gehört der obersten Karte. Der Dialog gibt die Taste frei, solange
    // die Vorlagen offen sind (`closeOnEscape` unten), sonst schlösse er sich
    // mitsamt dem getippten Text.
    const { open: templatesOpen, close: closeTemplates } = templates;
    useEffect(() => {
        if (!templatesOpen) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            closeTemplates();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [templatesOpen, closeTemplates]);

    /* Das Fenster zu heisst: auch die Vorlagenkarte darüber ist zu. Sie hat
       keinen Schleier, ihr Fenster ist also weiterhin anklickbar — ohne diesen
       Griff bliebe sie nach «Abbrechen» allein auf der Seite stehen. */
    const closeDialog = () => {
        closeTemplates();
        setOpen(false);
    };

    const openPopup = () => {
        const storedNote = saved.note || '';
        setNote(storedNote);
        setValidUntil(resolveConfirmationValidUntil(saved.validUntil, orderDate));
        setOpen(true);

        // Noch nie bearbeitet: der Text der Offerte ist der Startpunkt. Er wird
        // erst beim Öffnen geholt — die Auftragskarte soll dafür nicht bei
        // jedem Seitenaufbau eine Anfrage bezahlen.
        if (hasText(storedNote)) return;
        setPrefilling(true);
        void (async () => {
            try {
                const content = tenderId
                    ? await tenderApi.getPdfContent(tenderId).catch(() => null)
                    : null;
                // Hat die Offerte selbst kein Anschreiben, gilt die Standard-
                // vorlage — dieselbe, die die Offertenmaske in ein leeres Feld
                // schreibt. Sonst bliebe das Feld hier ohne Not leer.
                const text = content?.coverLetter || (await templates.loadDefaultContent()) || '';
                // Nur übernehmen, wenn inzwischen niemand selbst getippt hat.
                if (text) setNote((current) => (hasText(current) ? current : text));
            } finally {
                setPrefilling(false);
            }
        })();
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
            closeDialog();

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
                onClose={() => { if (!saving) closeDialog(); }}
                /* Solange die Vorlagenkarte darüber steht, gehören Schleier und
                   Escape ihr — sonst nähme ein Klick daneben den getippten
                   Einleitungstext mit. */
                closeOnBackdrop={!saving && !templatesOpen}
                closeOnEscape={!saving && !templatesOpen}
                footer={(
                    <PopupActions>
                        <PopupButton disabled={saving} onClick={closeDialog}>{t('common.cancel')}</PopupButton>
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
                    {/* Derselbe Knopf wie im PDF-Reiter der Offerte: er öffnet
                        die mandantenweiten Textbausteine, aus denen das
                        Anschreiben übernommen wird. */}
                    <div className="mb-1.5 flex justify-end">
                        <PopupButton
                            icon={<File05 size={13} />}
                            disabled={prefilling || saving}
                            onClick={templates.openPicker}
                        >
                            {t('tenders.text_templates')}
                        </PopupButton>
                    </div>
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

            {/* ── Textbausteine ────────────────────────────────────────────────
                Dieselbe Karte wie in den Angebotsdetails, nur über dem Fenster
                gestapelt: Zeile anklicken = übernehmen, «+» sichert den Text,
                der gerade im Feld steht, als neue Vorlage. */}
            {templates.open && (
                <Suspense fallback={null}>
                    <LazyTextTemplatesPopup
                        open={templates.open}
                        onClose={templates.close}
                        canEdit={!saving}
                        view={templates.view}
                        onViewChange={templates.setView}
                        templates={templates.templates}
                        loading={templates.loading}
                        busy={templates.busy}
                        editingTemplate={templates.editingTemplate}
                        formTitle={templates.formTitle}
                        onFormTitleChange={templates.setFormTitle}
                        formContent={templates.formContent}
                        onFormContentChange={templates.setFormContent}
                        onApply={templates.apply}
                        onStartNew={templates.startNew}
                        onStartEdit={templates.startEdit}
                        onMakeDefault={templates.makeDefault}
                        onDelete={templates.remove}
                        onSave={templates.save}
                        z={TEMPLATES_Z}
                    />
                </Suspense>
            )}

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
