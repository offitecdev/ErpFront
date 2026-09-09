import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle,
    Edit01,
    FileDownload02,
    Mail01,
    Send01,
    ShoppingCart01,
    Trash01,
    Truck01,
    X,
} from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { BotLoadingPanel } from '@/components/ui-shared/OffitecBot';
import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { isRequestTimeout } from '@/lib/axios';
import { useAuthStore } from '@/store/authStore';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { PurchaseOrderRow } from '@/types/inventory';
// Der CC-Wähler ist das Bauteil aus dem Kalender und bleibt EIN Exemplar: er ist
// ein SUCHFENSTER wie die Artikel- und Lieferantenwahl, kein Bearbeitungsblatt.
// Getippt wird die Kopie hier direkt auf der Seite; das Fenster ist der zweite Weg.
import { PeoplePickerModal } from '@/pages/calendar/components/PeoplePickerModal';
import { personKey, type PickedPerson } from '@/pages/calendar/calendarShared';
import type { OrderPdfLang } from '@/utils/pdf/orderPdf';
import { OrderFlowSteps } from './components/OrderFlowSteps';
import { SectionCard } from './components/primitives';
import { useLanguageTick } from './hooks/useLanguageTick';
import { fmtDateTime, fmtMoneyIn, fmtQty } from './utils/format';
import { EXTRA_DISCOUNT_KEYS, fmtPercent, itemDisplayNetPrice, orderGrandTotal, round2 } from './utils/orderPricing';
import {
    ORDER_STAGE_META,
    ORDER_STATUS_META,
    canRevertReceipt,
    isPriceRequestStage,
    stageIndexOf,
    stageMailState,
    stageOfStatus,
} from './utils/orderStatus';

/* ═══════════════════════════════════════════════════════════════════════════
   DIE BESTELLSEITE (Vorgabe Samet, 08.09.2026)

   «Statt Popups eine Seite — ruhiger und einfacher. Der Vorgang läuft der
   Reihe nach: eine Stufe muss fertig sein, bevor die nächste beginnt. Beim
   Umwandeln der Preisanfrage geht es auf die Bestellstufe; dort stehen SENDEN
   und BEARBEITEN als zwei eigene Knöpfe. Nach der Bestätigung folgt der
   Wareneingang. Wird die Bestellung gelöscht, geht der Vorgang eine Stufe
   zurück; wird der Wareneingang gelöscht, ebenso. Bearbeitet wird auf der
   Seite selbst, und ob die Mail gesendet wurde, muss man sofort sehen.»

   Diese Seite ersetzt das alte `OrderSheet` — ein Blatt mit drei
   übereinanderliegenden Ansichten und einer Knopfleiste, deren Inhalt je
   Status wanderte. Hier gilt:

     • DAS SCHRITTBAND ist die Auskunft über den Vorgang — drei Stufen, die
       erledigten mit Haken, die kommenden mit Schloss und dem Grund daneben.
     • DIE HANDLUNGSLEISTE hat IMMER dieselben Plätze, in derselben
       Reihenfolge: löschen · bearbeiten · senden · weiter. Was auf einer Stufe
       nicht gilt, fehlt — aber nichts rutscht an einen anderen Platz.
     • RÜCKFRAGEN sind kein Fenster mehr, sondern ein Streifen in derselben
       Leiste: die Frage steht da, wo der Knopf stand.
     • DIE MAIL ist ein eigener Zustand im Kopf und in der Übersicht:
       gesendet (mit Zeit und Empfänger) oder nicht gesendet.
   ═════════════════════════════════════════════════════════════════════════ */

type DetailTab = 'overview' | 'items' | 'document' | 'mail';

/**
 * Die Rückfragen. Jede gehört zu genau einem Knopf der Handlungsleiste und
 * erscheint AN SEINER STELLE — deshalb braucht sie weder Titel noch Fenster,
 * nur den Satz und zwei Knöpfe.
 */
type AskKind =
    | 'deleteRecord'       // Stufe 1: es gibt keine Stufe davor → der Datensatz geht
    | 'convert'            // Stufe 1 → 2
    | 'deleteOrder'        // Stufe 2 → 1
    | 'confirmOrder'       // Stufe 2: Entwurf → verbindlich
    | 'startReceipt'       // Stufe 2 → 3
    | 'startReceiptNoMail' // dito, aber die Bestellung ist noch nicht draussen
    | 'deleteReceipt';     // Stufe 3 → 2 (die Lagerbuchungen werden zurückgenommen)

const ASK_TEXT: Record<AskKind, () => string> = {
    deleteRecord: () => t('inv.orders.deleteConfirm'),
    convert: () => t('inv.orders.convertConfirm'),
    deleteOrder: () => t('inv.orders.flow.deleteOrderConfirm'),
    confirmOrder: () => t('inv.orders.confirmOrderConfirm'),
    startReceipt: () => t('inv.orders.receive.stageConfirm'),
    startReceiptNoMail: () => t('inv.orders.receive.stageConfirmNoMail'),
    deleteReceipt: () => t('inv.orders.flow.deleteReceiptConfirm'),
};

const DANGER_ASKS = new Set<AskKind>(['deleteRecord', 'deleteOrder', 'deleteReceipt']);

const PDF_LANGS: OrderPdfLang[] = ['de', 'tr', 'en'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Die Felder der Übersicht tragen KEINEN eigenen Rahmen, solange niemand
   hineinschreibt: die Zeile ist das Feld. Erst Zeiger und Schreibmarke legen
   einen weichen Grund darunter — dieselbe Sprache wie in den Bestelldetails. */
const FIELD_CLASS = 'h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] font-normal text-slate-800 outline-none transition-colors hover:bg-slate-50 focus:border-[#272f67]/40 focus:bg-white dark:text-white dark:hover:bg-white/5 dark:focus:border-white/40';
const MAIL_INPUT_CLASS = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px] font-normal text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white';

/** Zahlbetrag der Position: Nettosumme plus die für diese Zeile geltende MwSt. */
const payableLineTotal = (order: PurchaseOrderRow, item: PurchaseOrderRow['items'][number]): number => {
    const vat = order.vatMode === 'TOTAL'
        ? (item.lineTotal || 0) * ((order.orderVatRate || 0) / 100)
        : (item.lineVat || 0);
    return round2((item.lineTotal || 0) + vat);
};

// PDF-Bytes → base64 (Mailanhang). `btoa` verträgt kein grosses Feld auf einmal.
const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
};

const errorText = (err: unknown): string =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error
    || (err as Error)?.message
    || 'error';

type HeaderField = 'referenceNumber' | 'orderedByName' | 'recipientName' | 'projectName' | 'quoteNumber';

export const OrderDetailPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const { id: orderId } = useParams<{ id: string }>();
    const permissions = useAuthStore((state) => state.permissions);
    const canManage = permissions.includes('inventory.transfer');
    const settings = usePdfSettings();

    const [order, setOrder] = useState<PurchaseOrderRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [tab, setTab] = useState<DetailTab>('overview');
    const [ask, setAsk] = useState<AskKind | null>(null);

    useEffect(() => {
        if (!orderId) return;
        let cancelled = false;
        setLoading(true);
        purchaseOrdersApi
            .get(orderId)
            .then((row) => { if (!cancelled) { setOrder(row); setLoadError(null); } })
            .catch((err) => { if (!cancelled) setLoadError(errorText(err) || t('inv.orders.loadFailed')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [orderId]);

    // ── Die Stufe ────────────────────────────────────────────────────────────
    const status = order?.status ?? 'PENDING';
    const stage = order ? stageOfStatus(status) : 'REQUEST';
    const stageIndex = order ? stageIndexOf(status) : 0;
    const priceRequest = isPriceRequestStage(status);
    const mailState = order ? stageMailState(order) : 'NOT_SENT';
    const statusMeta = ORDER_STATUS_META[status] ?? ORDER_STATUS_META.PENDING;
    const isResend = Boolean(order?.emailSentAt);
    const updatedTag = (order?.revision ?? 0) > 0 && isResend;

    // ── Die Kopfangaben, DIREKT AUF DER SEITE ────────────────────────────────
    // Sie ändern weder Betrag noch Stufe (der Server behandelt sie als
    // Kopfangaben), darum werden sie beim Verlassen des Feldes gespeichert und
    // brauchen keinen eigenen Speicherknopf und erst recht kein Fenster.
    const [draft, setDraft] = useState<Record<HeaderField, string>>({
        referenceNumber: '', orderedByName: '', recipientName: '', projectName: '', quoteNumber: '',
    });
    useEffect(() => {
        if (!order) return;
        setDraft({
            referenceNumber: order.referenceNumber ?? '',
            orderedByName: order.orderedByName ?? '',
            recipientName: order.recipientName ?? '',
            projectName: order.projectName ?? '',
            quoteNumber: order.quoteNumber ?? '',
        });
    }, [order?.id, order?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

    const saveField = async (field: HeaderField) => {
        if (!order) return;
        const next = draft[field].trim();
        const current = (order[field] as string | null | undefined) ?? '';
        if (current === next) return;
        // Die Bestellnummer darf nicht leer werden — sie ist der Name des Vorgangs.
        if (field === 'referenceNumber' && !next) {
            setDraft((values) => ({ ...values, referenceNumber: order.referenceNumber }));
            return;
        }
        try {
            const updated = await purchaseOrdersApi.update(order.id, { [field]: next || null } as never);
            setOrder(updated);
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
            setDraft((values) => ({ ...values, [field]: current }));
        }
    };

    // ── Das Dokument ─────────────────────────────────────────────────────────
    const [pdfLang, setPdfLang] = useState<OrderPdfLang>('de');
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfBusy, setPdfBusy] = useState(false);
    const pdfFileName = order
        ? (priceRequest ? `Preisanfrage-${order.referenceNumber}.pdf` : `${order.referenceNumber}.pdf`)
        : 'dokument.pdf';

    const buildPdfBytes = async (): Promise<Uint8Array> => {
        if (!order) throw new Error('Bestellung nicht geladen.');
        if (priceRequest) {
            const { buildPriceRequestPdfBytes } = await import('@/utils/pdf/priceRequestPdf');
            return buildPriceRequestPdfBytes(order, settings, pdfLang);
        }
        const { buildOrderPdfBytes } = await import('@/utils/pdf/orderPdf');
        return buildOrderPdfBytes(order, settings, pdfLang);
    };

    useEffect(() => {
        if (tab !== 'document' || !order) return;
        let cancelled = false;
        let url: string | null = null;
        setPdfBusy(true);
        (async () => {
            const bytes = await buildPdfBytes();
            if (cancelled) return;
            url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
            setPdfUrl(url);
        })()
            .catch((err) => { if (!cancelled) setNotice({ kind: 'err', text: errorText(err) }); })
            .finally(() => { if (!cancelled) setPdfBusy(false); });
        return () => {
            cancelled = true;
            if (url) URL.revokeObjectURL(url);
            setPdfUrl(null);
        };
        // `updatedAt` erneuert die Vorschau nach einer Änderung, `status` wechselt
        // beim Umwandeln das Dokument (Preisanfrage ↔ Bestellung).
    }, [tab, pdfLang, order?.id, order?.updatedAt, order?.status]); // eslint-disable-line react-hooks/exhaustive-deps

    const downloadExcel = async () => {
        if (!order) return;
        setBusy('excel');
        try {
            const { exportOrderExcel } = await import('./utils/exportExcel');
            await exportOrderExcel(order);
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
        } finally {
            setBusy(null);
        }
    };

    // ── Die Mail ─────────────────────────────────────────────────────────────
    const [mailTo, setMailTo] = useState('');
    const [mailSubject, setMailSubject] = useState('');
    const [mailMessage, setMailMessage] = useState('');
    const [mailCc, setMailCc] = useState<PickedPerson[]>([]);
    const [ccDraft, setCcDraft] = useState('');
    const [ccPickerOpen, setCcPickerOpen] = useState(false);

    /* Die Mailfelder folgen dem DOKUMENT, nicht jedem Tastendruck: gefüllt wird
       einmal je Bestellung UND Dokumentart, damit ein selbst geschriebener Text
       nicht verschwindet, sobald irgendein Kopffeld gespeichert wird. Wechselt
       die Anfrage in eine Bestellung, ist es ein anderes Dokument — dann darf
       (und muss) der Vorschlagstext wechseln. */
    const mailSeededFor = useRef<string>('');
    useEffect(() => {
        if (!order) return;
        const seedKey = `${order.id}:${priceRequest ? 'REQ' : 'ORD'}`;
        if (mailSeededFor.current === seedKey) return;
        mailSeededFor.current = seedKey;
        const base = priceRequest
            ? t('inv.orders.mail.subjectPriceRequest', { number: order.referenceNumber })
            : t('inv.orders.mail.subject', { number: order.referenceNumber });
        setMailTo(order.supplierEmail ?? '');
        setMailSubject(order.revision > 0 && order.emailSentAt ? `${base} (${t('inv.orders.updatedTag')})` : base);
        setMailMessage(t(priceRequest ? 'inv.orders.mail.defaultMessagePriceRequest' : 'inv.orders.mail.defaultMessage'));
        // Der Lieferant steht von Anfang an in der Kopie: die Leiste zeigt damit,
        // von wem die Liste ausgeht. Der Server entfernt den Empfänger aus der
        // Kopie — zwei Exemplare gehen an dieselbe Adresse nicht hinaus.
        const supplierMail = (order.supplierEmail ?? '').trim();
        setMailCc(supplierMail
            ? [{
                key: personKey('EMAIL', supplierMail.toLowerCase()),
                type: 'EMAIL',
                name: order.supplierName || supplierMail,
                email: supplierMail,
            }]
            : []);
        setCcDraft('');
    }, [order, priceRequest]);

    const addCcDraft = () => {
        const email = ccDraft.trim();
        if (!email) return;
        if (!EMAIL_RE.test(email)) { setNotice({ kind: 'err', text: t('inv.orders.mail.ccInvalid') }); return; }
        const key = personKey('EMAIL', email.toLowerCase());
        setMailCc((current) => (current.some((person) => person.key === key)
            ? current
            : [...current, { key, type: 'EMAIL', name: email, email }]));
        setCcDraft('');
        setNotice(null);
    };

    const sendMail = async () => {
        if (!order) return;
        setBusy('send');
        setNotice(null);
        try {
            const bytes = await buildPdfBytes();
            const result = await purchaseOrdersApi.sendMail(order.id, {
                to: mailTo.trim() || undefined,
                // Eine Auswahl ohne Adresse (Person ohne E-Mail) geht nicht mit.
                ccEmails: mailCc.map((person) => person.email).filter((email): email is string => Boolean(email)),
                subject: mailSubject.trim(),
                message: mailMessage,
                attachments: [{
                    filename: pdfFileName,
                    contentType: 'application/pdf',
                    contentBase64: bytesToBase64(bytes),
                }],
            });
            setOrder(result.order);
            // `preview` = ohne SMTP-Einstellung: die Mail ist NICHT hinausgegangen.
            // «Gesendet» wäre hier falsch, darum die Warnung statt der Bestätigung.
            if (result.preview) {
                const text = t('inv.orders.mail.previewToast');
                toast.warning(text);
                setNotice({ kind: 'err', text });
            } else {
                const text = t(priceRequest ? 'inv.orders.mail.sentToastPriceRequest' : 'inv.orders.mail.sentToast');
                toast.success(text);
                setNotice({ kind: 'ok', text });
                setTab('overview');
            }
        } catch (err) {
            // Bei Zeitüberschreitung liefert axios einen technischen englischen
            // Satz; hier steht die Erklärung in der Sprache des Benutzers.
            const text = isRequestTimeout(err)
                ? t('common.mailTimeout')
                : errorText(err) || t('inv.orders.mail.failedToast');
            toast.error(text);
            setNotice({ kind: 'err', text });
        } finally {
            setBusy(null);
        }
    };

    // ── Der Stufenwechsel ────────────────────────────────────────────────────
    const setStatusTo = async (
        next: 'DRAFT' | 'ORDER_DRAFT' | 'PRICE_REQUEST' | 'PENDING' | 'ORDERED' | 'TO_BE_STOCKED',
        key: string,
    ): Promise<PurchaseOrderRow | null> => {
        if (!order) return null;
        setBusy(key);
        try {
            const updated = await purchaseOrdersApi.setStatus(order.id, next);
            setOrder(updated);
            return updated;
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
            return null;
        } finally {
            setBusy(null);
        }
    };

    const openEditor = () => order && navigate(`/inventory/orders/new?id=${order.id}`);

    /**
     * BEARBEITEN auf der Bestellstufe. Eine BESTÄTIGTE Bestellung ist gesperrt —
     * ohne diesen Knopf müsste man erst «Bestätigung aufheben» suchen und dann
     * bearbeiten. Hier tut EIN Knopf beides: er nimmt die Bestätigung zurück
     * (die Bestellung wird wieder Entwurf) und öffnet die Maske. Zeilen und
     * Preise bleiben unangetastet; bestätigt wird danach erneut.
     */
    const editOrder = async () => {
        if (!order) return;
        if (order.status === 'PENDING' || order.status === 'ORDERED') {
            const updated = await setStatusTo('ORDER_DRAFT', 'edit');
            if (!updated) return;
        }
        openEditor();
    };

    const runAsk = async () => {
        const kind = ask;
        setAsk(null);
        if (!order || !kind) return;
        if (kind === 'deleteRecord') {
            setBusy('delete');
            try {
                await purchaseOrdersApi.remove(order.id);
                toast.success(t('inv.orders.flow.recordDeleted'));
                navigate('/inventory/orders');
            } catch (err) {
                setNotice({ kind: 'err', text: errorText(err) });
                setBusy(null);
            }
            return;
        }
        if (kind === 'convert') {
            // Die Anfrage schliesst und wird zur PREISLICHEN Bestellung; Preise,
            // MwSt und Zusatzkosten öffnen sich erst jetzt — darum direkt in die
            // Maske, denn dort werden sie erfasst.
            const updated = await setStatusTo('ORDER_DRAFT', 'convert');
            if (updated) { toast.success(t('inv.orders.convertedToast')); openEditor(); }
            return;
        }
        if (kind === 'deleteOrder') {
            const updated = await setStatusTo('PRICE_REQUEST', 'deleteOrder');
            if (updated) toast.success(t('inv.orders.flow.orderDeleted'));
            return;
        }
        if (kind === 'confirmOrder') {
            const updated = await setStatusTo('PENDING', 'confirmOrder');
            if (updated) toast.success(t('inv.orders.confirmedToast'));
            return;
        }
        if (kind === 'startReceipt' || kind === 'startReceiptNoMail') {
            const updated = order.status === 'TO_BE_STOCKED' ? order : await setStatusTo('TO_BE_STOCKED', 'receipt');
            if (updated) navigate(`/inventory/orders/${order.id}/receive`);
            return;
        }
        if (kind === 'deleteReceipt') {
            setBusy('deleteReceipt');
            try {
                const result = await purchaseOrdersApi.revertReceive(order.id);
                setOrder(result.order);
                toast.success(t('inv.orders.flow.receiptDeleted', { count: result.revertedMovements }));
            } catch (err) {
                setNotice({ kind: 'err', text: errorText(err) });
            } finally {
                setBusy(null);
            }
        }
    };

    // ── Die Zahlen der Positionstabelle ──────────────────────────────────────
    // Nur Spalten, die im Datensatz auch gefüllt sind: ein leerer «Rabatt 3»
    // kostet in der Übersicht nur Platz.
    const shownExtraDiscounts = useMemo(
        () => (order ? EXTRA_DISCOUNT_KEYS.filter((key) => order.items.some((item) => (item[key] ?? 0) > 0)) : []),
        [order],
    );
    const vatIsTotal = order?.vatMode === 'TOTAL';
    const showLineVat = Boolean(order) && !vatIsTotal && (order?.items.some((item) => (item.vatRate ?? 0) > 0) ?? false);
    const showVatRow = vatIsTotal ? ((order?.orderVatRate ?? 0) > 0 || (order?.totalVat ?? 0) > 0) : showLineVat;
    const fees = order?.additionalFees ?? [];
    const detailExtraColumns = useMemo(() => {
        const seen = new Map<string, { key: string; name: string; width: number }>();
        order?.items.forEach((item) => item.extras?.forEach((entry) => {
            if (entry.key && entry.name && !seen.has(entry.key)) {
                seen.set(entry.key, { key: entry.key, name: entry.name, width: entry.width ?? 120 });
            }
        }));
        return [...seen.values()].slice(0, priceRequest ? 5 : 3);
    }, [order, priceRequest]);
    const itemColumnCount = priceRequest
        ? 3 + detailExtraColumns.length
        : 7 + detailExtraColumns.length + shownExtraDiscounts.length + (showLineVat ? 1 : 0);

    if (loading) {
        return (
            <div className="flex w-full flex-col gap-4">
                <InventoryListHeader title={t('inv.orders.title')} />
                {/* Offi wartet mit — und gibt in der Zeit einen Hinweis. */}
                <BotLoadingPanel label={t('common.loadingData')} />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="flex w-full flex-col gap-4">
                <InventoryListHeader title={t('inv.orders.title')} />
                <SectionCard>
                    <div className="flex flex-col items-center gap-3 py-14">
                        <span className="text-[13px] text-slate-500 dark:text-white/60">
                            {loadError || t('inv.orders.loadFailed')}
                        </span>
                        <button
                            type="button"
                            onClick={() => navigate('/inventory/orders')}
                            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/70"
                        >
                            {/* Der einzige Zurück-Knopf der Seite, und er steht
                                nur hier: wo nichts geladen werden konnte, gibt es
                                keinen Inhalt, zu dem der Blitz gehören könnte. */}
                            <ArrowLeft size={14} />
                            {t('inv.orders.flow.backToList')}
                        </button>
                    </div>
                </SectionCard>
            </div>
        );
    }

    /* ══ DIE HANDLUNGSLEISTE ══════════════════════════════════════════════════
       Feste Plätze in fester Reihenfolge: LÖSCHEN · BEARBEITEN · SENDEN ·
       WEITER. «Löschen» heisst auf jeder Stufe dasselbe — eine Stufe zurück —
       und nur auf der ersten, wo es keine Stufe davor gibt, löscht es wirklich
       den Datensatz. */
    const mailNotSentOnOrderStage = stage === 'ORDER' && mailState === 'NOT_SENT';

    const deleteAction = !canManage ? null
        : stage === 'REQUEST'
            ? { label: t('inv.orders.flow.deleteRecord'), kind: 'deleteRecord' as AskKind, busyKey: 'delete' }
            : stage === 'ORDER'
                ? { label: t('inv.orders.flow.deleteOrder'), kind: 'deleteOrder' as AskKind, busyKey: 'deleteOrder' }
                : canRevertReceipt(status)
                    ? { label: t('inv.orders.flow.deleteReceipt'), kind: 'deleteReceipt' as AskKind, busyKey: 'deleteReceipt' }
                    : null;

    // SENDEN und BEARBEITEN sind zwei EIGENE Knöpfe (Vorgabe Samet) — auf beiden
    // Stufen, damit die Leiste zwischen den Stufen nicht ihre Gestalt wechselt.
    // Im Wareneingang gibt es beides nicht: dort wird eingelagert, nicht gesendet.
    const showEdit = canManage && stage !== 'RECEIPT';
    const showSend = canManage && stage !== 'RECEIPT' && Boolean(order.supplierEmail);

    const primary: { label: string; icon: React.ReactNode; onClick: () => void; busyKey: string } | null = (() => {
        if (!canManage) return null;
        if (stage === 'REQUEST') {
            return {
                label: t('inv.orders.actions.convertToOrder'),
                icon: <ShoppingCart01 size={15} />,
                onClick: () => setAsk('convert'),
                busyKey: 'convert',
            };
        }
        if (stage === 'ORDER') {
            // Vor der Bestätigung ist die Bestätigung der nächste Schritt, danach
            // der Wareneingang — beides derselbe Platz, nie beide gleichzeitig.
            if (status === 'ORDER_DRAFT') {
                return {
                    label: t('inv.orders.actions.confirmOrder'),
                    icon: <CheckCircle size={15} />,
                    onClick: () => setAsk('confirmOrder'),
                    busyKey: 'confirmOrder',
                };
            }
            return {
                label: t('inv.orders.flow.toReceipt'),
                icon: <Truck01 size={15} />,
                onClick: () => setAsk(mailNotSentOnOrderStage ? 'startReceiptNoMail' : 'startReceipt'),
                busyKey: 'receipt',
            };
        }
        return {
            label: t('inv.orders.flow.openReceipt'),
            icon: <Truck01 size={15} />,
            onClick: () => navigate(`/inventory/orders/${order.id}/receive`),
            busyKey: 'openReceipt',
        };
    })();

    const stageStatusLine = (() => {
        if (stage === 'REQUEST') {
            return t(status === 'DRAFT' ? 'inv.orders.flow.state.requestDraft' : 'inv.orders.flow.state.requestSent');
        }
        if (stage === 'ORDER') {
            return t(status === 'ORDER_DRAFT'
                ? 'inv.orders.flow.state.orderDraft'
                : status === 'PENDING'
                    ? 'inv.orders.flow.state.orderConfirmed'
                    : 'inv.orders.flow.state.orderSent');
        }
        return t(status === 'COMPLETED' ? 'inv.orders.flow.state.receiptDone' : 'inv.orders.flow.state.receiptOpen');
    })();

    const mailBadge = (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                mailState === 'SENT'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : mailState === 'LAST_KNOWN'
                        ? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
            }`}
        >
            <Mail01 size={13} />
            {mailState === 'SENT'
                ? t('inv.orders.flow.mailSent')
                : mailState === 'LAST_KNOWN'
                    ? t('inv.orders.flow.mailLastSent')
                    : t('inv.orders.mailNotSent')}
            {mailState !== 'NOT_SENT' && order.emailSentAt && (
                <span className="font-normal opacity-80">· {fmtDateTime(order.emailSentAt)}</span>
            )}
        </span>
    );

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={(
                    <span className="flex items-center gap-2">
                        {/* Der Titel ist die STUFE, daneben steht die Nummer: man
                            liest zuerst, wo der Vorgang steht. */}
                        <span className="whitespace-nowrap">{t(ORDER_STAGE_META[stage].labelKey)}</span>
                        <span className={`rounded-full px-2 py-0.5 font-mono text-[12px] font-semibold ${statusMeta.className}`}>
                            {order.referenceNumber}
                        </span>
                        {updatedTag && (
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                                {t('inv.orders.updatedTag')} · Rev. {order.revision}
                            </span>
                        )}
                    </span>
                )}
                /* DIE DREI STUFEN STEHEN MITTIG IN DER KOPFZEILE (Vorgabe
                   Samet, 09.09.2026): links der Titel, in der Mitte die drei
                   Überschriften, rechts ob die Mail draussen ist. */
                center={<OrderFlowSteps stageIndex={stageIndex} activeLine={stageStatusLine} />}
                /* KEIN Zurück-Knopf auf der Seite (Vorgabe Samet, 28.08.2026):
                   den Rückweg trägt der Blitz in der Kopfleiste, der sich auf
                   Unterseiten in einen Pfeil verwandelt (lib/backNav.ts). Hier
                   steht darum nur die Auskunft, die man am dringendsten braucht
                   — ob die Mail draussen ist. */
                action={mailBadge}
            />

            {/* Auf schmalen Schirmen fehlt die Mitte der Kopfzeile — dort steht
                das Band als eigene Zeile darunter. */}
            <div className="lg:hidden">
                <OrderFlowSteps stageIndex={stageIndex} activeLine={stageStatusLine} />
            </div>

            {notice && (
                <div className={`flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-[12.5px] font-medium ${
                    notice.kind === 'ok'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300'
                }`}
                >
                    <span className="min-w-0 flex-1">{notice.text}</span>
                    <button
                        type="button"
                        onClick={() => setNotice(null)}
                        aria-label={t('common.close')}
                        className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* ══ DIE LEISTE ═══════════════════════════════════════════════════
                Die Rückfrage erscheint IN der Leiste, nicht als Fenster darüber:
                die Frage steht genau da, wo der Knopf stand. */}
            <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-white/15 dark:bg-transparent dark:shadow-none">
                {ask ? (
                    <div className="flex flex-wrap items-center gap-3">
                        <span className={`flex min-w-0 flex-1 items-start gap-2 text-[12.5px] ${
                            DANGER_ASKS.has(ask) ? 'text-red-600 dark:text-red-300' : 'text-slate-700 dark:text-white/80'
                        }`}
                        >
                            <AlertTriangle size={15} className="mt-px shrink-0" />
                            <span>{ASK_TEXT[ask]()}</span>
                        </span>
                        <span className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setAsk(null)}
                                className="flex h-9 items-center rounded-md border border-slate-200 px-3.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-slate-400 dark:border-white/20 dark:text-white/70"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void runAsk()}
                                className={`flex h-9 items-center rounded-md px-3.5 text-[12.5px] font-semibold text-white transition-colors ${
                                    DANGER_ASKS.has(ask) ? 'bg-red-600 hover:bg-red-700' : 'bg-[#272f67] hover:bg-[#1f2654]'
                                }`}
                            >
                                {t('common.confirm')}
                            </button>
                        </span>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-2">
                        {deleteAction && (
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => setAsk(deleteAction.kind)}
                                className="flex h-9 items-center gap-1.5 rounded-md border border-red-200 px-3.5 text-[12.5px] font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500"
                            >
                                {busy === deleteAction.busyKey
                                    ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : <Trash01 size={15} />}
                                {deleteAction.label}
                            </button>
                        )}

                        {showEdit && (
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => void editOrder()}
                                className="flex h-9 items-center gap-1.5 rounded-md border border-[#272f67]/30 px-3.5 text-[12.5px] font-semibold text-[#272f67] transition-colors hover:bg-[#272f67] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/30 dark:text-white dark:hover:bg-white/15"
                            >
                                {busy === 'edit'
                                    ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : <Edit01 size={15} />}
                                {t('common.edit')}
                            </button>
                        )}

                        {showSend && (
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => setTab('mail')}
                                className="flex h-9 items-center gap-1.5 rounded-md border border-[#272f67]/30 px-3.5 text-[12.5px] font-semibold text-[#272f67] transition-colors hover:bg-[#272f67] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/30 dark:text-white dark:hover:bg-white/15"
                            >
                                <Send01 size={15} />
                                {isResend ? t('inv.orders.actions.sendUpdated') : t('inv.orders.actions.send')}
                            </button>
                        )}

                        <span className="flex-1" />

                        {primary && (
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={primary.onClick}
                                className="flex h-9 items-center gap-1.5 rounded-md bg-[#272f67] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {busy === primary.busyKey
                                    ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : primary.icon}
                                {primary.label}
                            </button>
                        )}
                    </div>
                )}

                {/* Die Bestellung ist bestätigt, aber noch NICHT beim Lieferanten:
                    kein Riegel, nur der Hinweis — sobald die Mail wirklich
                    hinausgeht, schaltet der Server auf «Bestellung erteilt» und
                    der Streifen verschwindet von selbst. */}
                {mailNotSentOnOrderStage && !ask && (
                    <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        <AlertTriangle size={14} className="shrink-0" />
                        <span>{t('inv.orders.mailPendingWarning')}</span>
                    </div>
                )}
            </div>

            {/* ══ DIE ABSCHNITTE ═══════════════════════════════════════════════
                Übersicht · Positionen · Dokument · E-Mail. Vier Abschnitte
                DERSELBEN Seite — kein Blatt legt sich mehr über sie. */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 p-1 dark:border-white/15">
                {([
                    ['overview', t('inv.orders.views.overview')],
                    ['items', t('inv.orders.sectionEditor', { count: order.itemCount })],
                    ['document', t('inv.orders.views.pdf')],
                    ...(showSend ? [['mail', t('inv.orders.views.mail')] as [DetailTab, string]] : []),
                ] as [DetailTab, string][]).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`h-8 rounded-md px-3 text-[12.5px] font-semibold transition-colors ${
                            tab === key
                                ? 'bg-[#272f67] text-white'
                                : 'text-slate-500 hover:text-[#1f2654] dark:text-white/60 dark:hover:text-white'
                        }`}
                    >
                        {label}
                    </button>
                ))}
                {/* Der Excel-Knopf gehört zu den Positionen und steht darum in
                    DIESER Zeile, ganz rechts — nicht in einem eigenen weissen
                    Band über der Tabelle, das sonst nur ihn getragen hätte. */}
                {tab === 'items' && (
                    <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void downloadExcel()}
                        title={t('inv.orders.actions.downloadExcel')}
                        className="ml-auto flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold text-slate-500 transition-colors hover:text-[#1f2654] disabled:opacity-40 dark:text-white/60 dark:hover:text-white"
                    >
                        {busy === 'excel'
                            ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            : <FileDownload02 size={14} />}
                        {t('inv.orders.actions.downloadExcel')}
                    </button>
                )}
            </div>

            {tab === 'overview' && (
                <SectionCard title={t('inv.orders.views.overview')}>
                    {/* Bearbeitet wird HIER, auf der Seite (Vorgabe Samet): die
                        Kopfangaben SIND Felder, kein Fenster. Gespeichert wird
                        beim Verlassen des Feldes — sie ändern weder Betrag noch
                        Stufe. Die Positionen selbst gehören in die Maske, die der
                        Knopf «Bearbeiten» oben öffnet. */}
                    <div className="grid gap-x-6 p-3.5 sm:grid-cols-2">
                        {([
                            ['referenceNumber', t('inv.orders.columns.reference'), true],
                            ['quoteNumber', t('inv.orders.columns.quoteNumber'), true],
                            ['orderedByName', t('inv.orders.columns.orderedBy'), false],
                            ['recipientName', t('inv.orders.columns.recipientName'), false],
                            ['projectName', t('inv.orders.columns.project'), false],
                        ] as [HeaderField, string, boolean][]).map(([field, label, mono]) => (
                            <label key={field} className="flex items-center gap-3 border-b border-slate-100 py-1.5 dark:border-white/10">
                                <span className="w-36 shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                                    {label}
                                </span>
                                {canManage ? (
                                    <input
                                        value={draft[field]}
                                        onChange={(event) => setDraft((values) => ({ ...values, [field]: event.target.value }))}
                                        onBlur={() => void saveField(field)}
                                        onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                                        maxLength={field === 'recipientName' ? 120 : undefined}
                                        className={`${FIELD_CLASS}${mono ? ' font-mono' : ''}`}
                                    />
                                ) : (
                                    <span className={`px-2 text-[13px] text-slate-800 dark:text-white${mono ? ' font-mono' : ''}`}>
                                        {(order[field] as string | null) || '—'}
                                    </span>
                                )}
                            </label>
                        ))}

                        {/* Der Lieferant ist eine Momentaufnahme der Bestellung und
                            wird hier nicht getauscht — dafür ist die Maske da. */}
                        <div className="flex items-start gap-3 border-b border-slate-100 py-2 dark:border-white/10">
                            <span className="w-36 shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                                {t('inv.columns.supplier')}
                            </span>
                            <span className="min-w-0 px-2 text-[13px] text-slate-800 dark:text-white">
                                {order.supplierName}
                                {order.supplierAddress && (
                                    <span className="block whitespace-pre-line text-[12px] text-slate-500 dark:text-white/60">
                                        {order.supplierAddress}
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>

                    {/* ── DIE MAIL, IN KLARTEXT ────────────────────────────────
                        «Ob gesendet oder nicht, muss man sofort sehen.» Also nicht
                        bloss ein Zeitstempel irgendwo in einer Zeile, sondern der
                        Zustand als erstes Wort — und daneben, an welche Adresse er
                        ging oder gehen wird. */}
                    <div className="border-t border-slate-200 px-3.5 py-3 dark:border-white/10">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            {mailBadge}
                            <span className="text-[12.5px] text-slate-600 dark:text-white/70">
                                {mailState === 'NOT_SENT'
                                    ? (order.supplierEmail
                                        ? t('inv.orders.flow.mailWillGoTo', { email: order.supplierEmail })
                                        : t('inv.orders.flow.mailNoAddress'))
                                    : t('inv.orders.flow.mailWentTo', { email: order.emailRecipient || '—' })}
                            </span>
                            {order.revision > 0 && (
                                <span className="text-[12px] text-slate-400 dark:text-white/45">Rev. {order.revision}</span>
                            )}
                        </div>
                        <div className="mt-2 text-[12.5px] text-slate-600 dark:text-white/70">
                            <span className="text-slate-400 dark:text-white/45">{t('common.date')}: </span>
                            {fmtDateTime(order.createdAt)}
                        </div>
                        {order.stockedAt && (
                            <div className="mt-1.5 text-[12.5px] text-slate-600 dark:text-white/70">
                                <span className="text-slate-400 dark:text-white/45">{t('inv.orders.stockedAt')}: </span>
                                {fmtDateTime(order.stockedAt)}
                            </div>
                        )}
                    </div>
                </SectionCard>
            )}

            {tab === 'items' && (
                /* KOPFLOS (Vorgabe Samet, 09.09.2026): der Reiter darüber trägt
                   den Titel schon, und zweimal «Auftragspositionen (38)»
                   untereinander war genau die Doppelung, die die Karte schwer
                   machte. Der Excel-Knopf ist in die Reiterzeile gezogen. */
                <SectionCard>
                    {/* DIE TABELLE DER ANGEBOTSLISTE (Vorgabe Samet, 09.09.2026:
                        «sie soll aussehen wie die Angebotsliste — schlicht»):
                        dieselben drei Merkmale wie dort — `data-inv-table` für
                        Zeilenmass und Kopf, `data-grid-lines` für die feinen
                        Trennlinien ZWISCHEN den Spalten (die hier fehlten und
                        die Tabelle fremd aussehen liessen), `data-list-table`
                        für das luftige Mass und die Kartenansicht am Telefon.
                        Eigene Spaltenbreiten gibt es nicht mehr: die gemeinsame
                        Regel misst sie (lib/autoColumnResize).
                        Auf der Anfragestufe fallen die Preisspalten ganz weg,
                        nicht bloss ihre Werte. */}
                    <div data-ofi-tablehost className="overflow-x-auto">
                        <table data-inv-table data-list-table data-grid-lines data-unstyled-table className="w-full">
                            <thead>
                                <tr>
                                    <th className="text-left">{t('inv.columns.item')}</th>
                                    {detailExtraColumns.map((column) => (
                                        <th key={column.key} className="text-left">{column.name}</th>
                                    ))}
                                    <th className="w-32 text-left">{t('inv.columns.serialCode')}</th>
                                    <th className="w-20 text-right">{t('inv.columns.quantity')}</th>
                                    {!priceRequest && (
                                        <>
                                            <th className="w-28 text-right">{t('inv.orders.columns.grossPrice')}</th>
                                            <th className="w-28 text-right">{t('inv.orders.columns.netPrice')}</th>
                                            <th className="w-20 text-right">{t('inv.orders.columns.discount')}</th>
                                            {shownExtraDiscounts.map((key) => (
                                                <th key={key} className="w-20 text-right">{t(`inv.orders.columns.${key}`)}</th>
                                            ))}
                                            {showLineVat && <th className="w-20 text-right">{t('inv.orders.columns.vat')}</th>}
                                            <th className="w-28 text-right">{t('inv.orders.grandTotal')}</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {order.items.map((item, index) => (
                                    <tr key={`${item.code ?? ''}-${index}`}>
                                        <td className="text-slate-800 dark:text-white">{item.name}</td>
                                        {detailExtraColumns.map((column) => (
                                            <td key={column.key} className="text-slate-500 dark:text-white/60">
                                                {item.extras?.find((entry) => entry.key === column.key)?.value || '—'}
                                            </td>
                                        ))}
                                        <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">{item.code || '—'}</td>
                                        <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtQty(item.quantity)}</td>
                                        {!priceRequest && (
                                            <>
                                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtMoneyIn(item.grossPrice, order.currency)}</td>
                                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtMoneyIn(itemDisplayNetPrice(item), order.currency)}</td>
                                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtPercent(item.discount ?? 0)}</td>
                                                {shownExtraDiscounts.map((key) => (
                                                    <td key={key} className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                                        {fmtPercent(item[key] ?? 0)}
                                                    </td>
                                                ))}
                                                {showLineVat && (
                                                    <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                                        {fmtPercent(item.vatRate ?? 0)}
                                                    </td>
                                                )}
                                                <td className="text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-white">
                                                    {fmtMoneyIn(payableLineTotal(order, item), order.currency)}
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                            {!priceRequest && (
                                <tfoot>
                                    <tr>
                                        <td colSpan={itemColumnCount - 1} className="text-right text-[12.5px] font-semibold text-slate-500 dark:text-white/60">
                                            {t('inv.orders.totalNet')}
                                        </td>
                                        <td className="text-right font-mono text-[13.5px] font-bold text-slate-900 dark:text-white">
                                            {fmtMoneyIn(order.totalNet, order.currency)}
                                        </td>
                                    </tr>
                                    {/* Zusatzkosten stehen direkt unter der Nettosumme,
                                        jede mit ihrem Namen; sie gehen ins Total ein. */}
                                    {fees.map((fee, index) => (
                                        <tr key={`${fee.name}-${index}`}>
                                            <td colSpan={itemColumnCount - 1} className="text-right text-[12.5px] font-semibold text-slate-500 dark:text-white/60">
                                                {fee.name}
                                                <span className="ml-1.5 font-normal text-slate-400 dark:text-white/40">
                                                    ({t('inv.orders.fees.tag')})
                                                </span>
                                            </td>
                                            <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                                {fmtMoneyIn(fee.amount, order.currency)}
                                            </td>
                                        </tr>
                                    ))}
                                    {showVatRow && (
                                        <tr>
                                            <td colSpan={itemColumnCount - 1} className="text-right text-[12.5px] font-semibold text-slate-500 dark:text-white/60">
                                                {t('inv.orders.columns.vat')}
                                                {vatIsTotal && (
                                                    <span className="ml-1.5 font-normal text-slate-400 dark:text-white/40">
                                                        {fmtPercent(order.orderVatRate)}{order.orderVatCountry ? ` · ${order.orderVatCountry}` : ''}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                                {fmtMoneyIn(order.totalVat ?? 0, order.currency)}
                                            </td>
                                        </tr>
                                    )}
                                    {(showVatRow || fees.length > 0) && (
                                        <tr>
                                            <td colSpan={itemColumnCount - 1} className="text-right text-[12.5px] font-semibold text-slate-500 dark:text-white/60">
                                                {t('inv.orders.grandTotal')}
                                            </td>
                                            <td className="text-right font-mono text-[13.5px] font-bold text-slate-900 dark:text-white">
                                                {fmtMoneyIn(orderGrandTotal(order), order.currency)}
                                            </td>
                                        </tr>
                                    )}
                                </tfoot>
                            )}
                        </table>
                    </div>
                </SectionCard>
            )}

            {tab === 'document' && (
                <SectionCard
                    title={t('inv.orders.views.pdf')}
                    action={(
                        <div className="flex items-center gap-1 rounded-md border border-slate-200 p-0.5 dark:border-white/15">
                            {PDF_LANGS.map((lang) => (
                                <button
                                    key={lang}
                                    type="button"
                                    onClick={() => setPdfLang(lang)}
                                    className={`rounded px-2.5 py-1 text-[11.5px] font-semibold uppercase transition-colors ${
                                        pdfLang === lang
                                            ? 'bg-[#272f67] text-white'
                                            : 'text-slate-500 hover:text-[#1f2654] dark:text-white/60 dark:hover:text-white'
                                    }`}
                                >
                                    {lang}
                                </button>
                            ))}
                        </div>
                    )}
                >
                    <div className="h-[70vh] min-h-[420px] overflow-hidden bg-slate-100 dark:bg-white/5">
                        {pdfBusy || !pdfUrl ? (
                            <div className="flex h-full items-center justify-center text-[13px] text-slate-500 dark:text-white/60">
                                {t('inv.orders.pdfGenerating')}
                            </div>
                        ) : (
                            <iframe title="order-pdf" src={pdfUrl} className="h-full w-full" />
                        )}
                    </div>
                </SectionCard>
            )}

            {tab === 'mail' && showSend && (
                <SectionCard title={t('inv.orders.views.mail')}>
                    <div className="flex flex-col gap-3 p-3.5">
                        <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-500 dark:text-white/60">
                            {t('inv.orders.mail.to')}
                            <input value={mailTo} onChange={(event) => setMailTo(event.target.value)} className={MAIL_INPUT_CLASS} />
                        </label>

                        {/* KOPIE — auf der Seite getippt: Adresse eingeben, Enter,
                            fertig. Das Verzeichnis (Personal / Kunden) ist der
                            zweite Weg und bleibt ein Suchfenster wie überall sonst. */}
                        <div className="flex flex-col gap-1 text-[12px] font-semibold text-slate-500 dark:text-white/60">
                            {t('inv.orders.mail.cc')}
                            <span className="flex flex-wrap items-center gap-1.5">
                                {mailCc.map((person) => (
                                    <span
                                        key={person.key}
                                        title={person.email ?? undefined}
                                        className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-2.5 pr-1 text-[11.5px] font-medium text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70"
                                    >
                                        {person.email || person.name}
                                        <button
                                            type="button"
                                            onClick={() => setMailCc((current) => current.filter((entry) => entry.key !== person.key))}
                                            aria-label={t('common.delete')}
                                            className="flex size-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/15 dark:hover:text-white"
                                        >
                                            <X size={10} />
                                        </button>
                                    </span>
                                ))}
                                <input
                                    value={ccDraft}
                                    onChange={(event) => setCcDraft(event.target.value)}
                                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCcDraft(); } }}
                                    onBlur={addCcDraft}
                                    placeholder={t('inv.orders.mail.ccPlaceholder')}
                                    className="h-7 w-56 rounded-full border border-slate-200 bg-white px-3 text-[11.5px] font-normal text-slate-700 outline-none focus:border-[#1f2654] dark:border-white/20 dark:bg-transparent dark:text-white"
                                />
                                <button
                                    type="button"
                                    onClick={() => setCcPickerOpen(true)}
                                    className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-[11.5px] font-semibold text-slate-500 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/50 dark:hover:text-white"
                                >
                                    {t('inv.orders.mail.ccFromDirectory')}
                                </button>
                            </span>
                        </div>

                        <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-500 dark:text-white/60">
                            {t('inv.orders.mail.subjectLabel')}
                            <input value={mailSubject} onChange={(event) => setMailSubject(event.target.value)} className={MAIL_INPUT_CLASS} />
                        </label>
                        <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-500 dark:text-white/60">
                            {t('inv.orders.mail.message')}
                            <textarea
                                value={mailMessage}
                                onChange={(event) => setMailMessage(event.target.value)}
                                rows={9}
                                className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-[13px] font-normal text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
                            />
                        </label>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[12px] text-slate-400 dark:text-white/50">
                                {t('inv.orders.mail.attachmentNote', { name: pdfFileName })}
                            </span>
                            <button
                                type="button"
                                disabled={busy !== null || !mailSubject.trim()}
                                onClick={() => void sendMail()}
                                className="flex h-9 items-center gap-1.5 rounded-md bg-[#272f67] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {busy === 'send'
                                    ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : <Send01 size={15} />}
                                {isResend ? t('inv.orders.actions.sendUpdated') : t('inv.orders.actions.send')}
                            </button>
                        </div>
                    </div>
                </SectionCard>
            )}

            <PeoplePickerModal
                open={ccPickerOpen}
                onClose={() => setCcPickerOpen(false)}
                mode="cc"
                initial={mailCc}
                title={t('inv.orders.mail.ccTitle')}
                onConfirm={(picked) => { setMailCc(picked); setCcPickerOpen(false); }}
            />
        </div>
    );
};
