import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { CheckCircle, ChevronLeft, ChevronRight, Plus, Save01, Trash01, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { usePurchaseTemplateStore } from '@/store/purchaseTemplateStore';
import type { PurchaseTemplateDocumentType, SupplierCalcConfig, SupplierOrderTemplate } from '@/types/inventory';
import '@/styles/purchaseImport.css';
/* Die Kiste im Apple-Stil, in der die Vorlage jetzt steht. */
import '@/styles/orderDetails.css';

import { SupplierComboCell } from '../components/SupplierComboCell';
import { CalcPanel } from './CalcPanel';
import { apiFailure, defaultCalcConfig, templateSummary } from './importTemplate';

/**
 * ── MEINE VORLAGEN ──────────────────────────────────────────────────────────
 *
 * Vorgabe Samet (07.09.2026): «Unter Meine Vorlagen legt man Vorlagen an —
 * Vorlage 1, Vorlage 2 —, jede mit einem Rechenbereich, in dem automatische
 * Berechnung, Lieferantenberechnung oder manuelle Eingabe eingestellt wird;
 * manuelle Eingabe ist der Standard. In den eigenen Vorlagen ordnet man die
 * Schlüssel zu. Und es gibt eine allgemeine Vorgabe, die gilt, wenn man auf
 * das Plus drückt.»
 *
 * Der Aufbau ist links Liste, rechts Bearbeitung — der Weg, den jeder von
 * seinem Mailprogramm kennt. Eine Vorlage OHNE Lieferant ist die allgemeine:
 * sie steht bei jedem Lieferanten in der Auswahl, und die als Vorgabe
 * markierte ist genau die, mit der eine mit «+» hinzugefügte Zeile rechnet.
 *
 * Gespeichert wird erst auf Knopfdruck. Ein Fenster, das im Vorbeigehen die
 * Rechenart aller künftigen Bestellungen umstellt, wäre eine Falle.
 */

interface Draft {
    /** Leer = eine neue, noch nicht gespeicherte Vorlage. */
    id: string;
    title: string;
    supplierId: string | null;
    supplierName: string;
    isDefault: boolean;
    config: SupplierCalcConfig;
}

const newDraft = (index: number): Draft => ({
    id: '',
    title: t('inv.aiImport.templateNewName', { index }),
    supplierId: null,
    supplierName: '',
    isDefault: false,
    config: defaultCalcConfig(),
});

const toDraft = (template: SupplierOrderTemplate): Draft => ({
    id: template.id,
    title: template.title,
    supplierId: template.supplierId,
    supplierName: template.supplierName,
    isDefault: template.isDefault,
    config: template.config,
});

const TemplateManagerPopupContent = ({
    open, onClose, onSaved, initialSupplier, openTemplateId, priceless = false, documentType,
}: {
    open: boolean;
    onClose: () => void;
    /** Welche Vorlage aufgeschlagen werden soll — der Klick in der Werkzeugleiste. */
    openTemplateId?: string | null;
    /**
     * Nach jedem Speichern/Löschen: die Bestellseite lädt ihre Vorgabe neu.
     * Beim SPEICHERN kommt die Kennung der Vorlage mit — die Seite macht sie
     * damit sofort zur geltenden (Vorgabe Samet, 08.09.2026: «beim Anlegen
     * einer Vorlage soll sie automatisch angewendet werden»). Beim Löschen
     * fehlt sie: dann gilt wieder, was der Lieferant vorgibt.
     */
    onSaved?: (templateId?: string) => void;
    /** Vorbelegter Lieferant für eine neue Vorlage. */
    initialSupplier?: { id: string | null; name: string };
    /**
     * FÜR WELCHES DOKUMENT die Vorlage gerade eingestellt wird. In einer
     * Preisanfrage trägt sie genau drei feste Felder und keine Rechnung;
     * in einer Bestellung acht Felder samt Rechenart und Steuersatz.
     */
    priceless?: boolean;
    /** Dedicated list for order, price request or goods receipt. */
    documentType?: PurchaseTemplateDocumentType;
}) => {
    const resolvedDocumentType: PurchaseTemplateDocumentType = documentType ?? (priceless ? 'PRICE_REQUEST' : 'ORDER');
    const goodsReceipt = resolvedDocumentType === 'GOODS_RECEIPT';
    const preferredTemplateId = usePurchaseTemplateStore((state) => state.selected[resolvedDocumentType]);
    const selectPreferredTemplate = usePurchaseTemplateStore((state) => state.select);
    const [templates, setTemplates] = useState<SupplierOrderTemplate[]>([]);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [busy, setBusy] = useState(false);
    /** Welche Vorlage gerade dasteht — das Blaettern zaehlt hier. */
    const [index, setIndex] = useState(0);

    const show = (next: number) => {
        const entry = templates[next];
        if (!entry) return;
        setIndex(next);
        setDraft(toDraft(entry));
    };

    const reload = async (selectId?: string) => {
        try {
            const items = await purchaseOrdersApi.listSupplierTemplates(null, resolvedDocumentType);
            setTemplates(items);
            /* Nach dem Speichern soll die eben gespeicherte dastehen, nach dem
               Loeschen die an ihrer Stelle — sonst blaettert man sich verloren. */
            const desired = selectId ?? preferredTemplateId ?? undefined;
            const at = desired ? items.findIndex((entry) => entry.id === desired) : Math.min(index, items.length - 1);
            const target = at >= 0 ? at : 0;
            setIndex(Math.max(0, target));
            setDraft(items[target] ? toDraft(items[target]) : null);
        } catch {
            setTemplates([]);
        }
    };

    useEffect(() => {
        void reload(openTemplateId ?? undefined);
    }, [open, openTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── DIE REITERREIHE ──────────────────────────────────────────────────
       Sie zeigt alle Vorlagen; laeuft sie ueber ihren Platz hinaus, kommen die
       zwei Pfeile dazu und schieben sie um eine Fensterbreite. Gemessen wird
       nach jedem Zeichnen UND bei jeder Groessenaenderung — eine schmalere
       Spalte macht aus «passt» sonst stillschweigend «passt nicht». */
    const tabStrip = useRef<HTMLDivElement>(null);
    const [overflowing, setOverflowing] = useState(false);

    const measureTabs = useCallback(() => {
        const strip = tabStrip.current;
        if (!strip) return;
        setOverflowing(strip.scrollWidth > strip.clientWidth + 4);
    }, []);

    useLayoutEffect(() => {
        measureTabs();
        const strip = tabStrip.current;
        if (!strip || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measureTabs);
        observer.observe(strip);
        return () => observer.disconnect();
    }, [measureTabs, templates.length]);

    const scrollTabs = (direction: 1 | -1) => {
        const strip = tabStrip.current;
        if (!strip) return;
        strip.scrollBy({ left: direction * Math.max(160, strip.clientWidth * 0.8), behavior: 'smooth' });
    };

    const startNew = () => {
        const fresh = newDraft(templates.length + 1);
        setDraft({
            ...fresh,
            supplierId: initialSupplier?.id ?? null,
            supplierName: initialSupplier?.name ?? '',
        });
    };

    const save = async () => {
        if (!draft) return;
        const title = draft.title.trim();
        if (!title) {
            toast.error(t('inv.aiImport.templateNameRequired'));
            return;
        }
        setBusy(true);
        try {
            const payload = {
                title,
                supplierId: draft.supplierId,
                supplierName: draft.supplierName,
                // Saving makes this template the default for its own document list.
                isDefault: true,
                documentType: resolvedDocumentType,
                config: draft.config,
            };
            const saved = draft.id
                ? await purchaseOrdersApi.updateSupplierTemplate(draft.id, payload)
                : await purchaseOrdersApi.createSupplierTemplate(payload);
            await reload(saved.id);
            /* Die eben gespeicherte Vorlage IST ab jetzt die geltende — sonst
               legt man eine an, schliesst das Fenster und die Bestellung rechnet
               weiter mit der alten, ohne dass irgendetwas es sagt. */
            onSaved?.(saved.id);
            selectPreferredTemplate(resolvedDocumentType, saved.id);
            toast.success(t('inv.aiImport.templateApplied', { title: saved.title || title }));
        } catch (error) {
            toast.error(apiFailure(error, t('inv.aiImport.templateSaveFailed')).title);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (template: SupplierOrderTemplate) => {
        setBusy(true);
        try {
            await purchaseOrdersApi.deleteSupplierTemplate(template.id);
            if (draft?.id === template.id) setDraft(null);
            await reload();
            if (preferredTemplateId === template.id) selectPreferredTemplate(resolvedDocumentType, null);
            onSaved?.();
        } catch (error) {
            toast.error(apiFailure(error, t('inv.aiImport.templateDeleteFailed')).title);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="ofi-poi-scrim"
            style={{ zIndex: 900 }}
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div className="ofi-poi" style={{ width: 'min(980px, 100%)', height: 'min(720px, 100%)' }}>
                <div className="ofi-poi-head">
                    <div className="ofi-poi-title">
                        <b>{t('inv.aiImport.templatesTitle')}</b>
                    </div>
                    <button type="button" className="ofi-poi-x" onClick={onClose} aria-label={t('common.close')}>
                        <X size={17} />
                    </button>
                </div>

                <div className="ofi-poi-body">
                    {/* ── BLÄTTERN, WENN DIE LISTE VOLL WIRD ─────────────────
                        Vorgabe Samet (07.09.2026): «Wenn die Liste sich füllt,
                        soll es Pfeile vor und zurück geben.» Die Reiter bleiben
                        eine Reihe — sie zeigen alle Vorlagen auf einen Blick —,
                        und sobald sie breiter wird als ihr Platz, erscheinen
                        links und rechts die zwei Pfeile und schieben sie. Sind
                        es wenige, sieht man keine: ein Pfeil, der nichts zu tun
                        hat, ist nur Betrieb. */}
                    {templates.length > 0 && (
                        <div className="ofi-poi-tabrail">
                            {overflowing && (
                                <button
                                    type="button"
                                    className="ofi-poi-tabnav"
                                    onClick={() => scrollTabs(-1)}
                                    aria-label={t('inv.orders.prevOrder')}
                                >
                                    <ChevronLeft size={16} />
                                </button>
                            )}
                            <div
                                className="ofi-poi-template-tabs"
                                role="tablist"
                                aria-label={t('inv.aiImport.templatesTitle')}
                                ref={tabStrip}
                            >
                                {templates.map((template, templateIndex) => (
                                    <button
                                        key={template.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={draft?.id === template.id}
                                        className={draft?.id === template.id ? 'is-on' : ''}
                                        onClick={() => show(templateIndex)}
                                    >
                                        <span>{template.title}</span>
                                        <small>{template.supplierName || t('inv.aiImport.templatesAllSuppliers')}</small>
                                    </button>
                                ))}
                            </div>
                            {overflowing && (
                                <button
                                    type="button"
                                    className="ofi-poi-tabnav"
                                    onClick={() => scrollTabs(1)}
                                    aria-label={t('inv.orders.nextOrder')}
                                >
                                    <ChevronRight size={16} />
                                </button>
                            )}
                        </div>
                    )}
                    {/* ── BLÄTTERN (Vorgabe Samet: «die Vorlagen erscheinen, und
                        durch Klicken geht es vor und zurück») ────────────────
                        Eine Vorlage auf einmal, mit Pfeilen davor und danach.
                        Die Liste links ist damit weg: bei drei, vier Vorlagen
                        war sie eine halbe Bildschirmbreite für nichts. */}
                    <div className="ofi-poi-pager">
                        <button
                            type="button"
                            className="ofi-poi-iconbtn"
                            disabled={!templates.length || index <= 0}
                            onClick={() => show(index - 1)}
                            aria-label={t('inv.orders.prevOrder')}
                        >
                            <ChevronLeft size={17} />
                        </button>
                        <div>
                            <b>
                                {draft ? draft.title || t('inv.aiImport.templateNew') : ''}
                                {draft?.isDefault && <CheckCircle size={13} />}
                            </b>
                            {/* Nur noch die Stellung in der Reihe («Vorlage 2 von 5»).
                                Die erklärenden Sätze — der Untertitel oben, «noch
                                keine Vorlage gespeichert» und «links wählen oder
                                oben anlegen» — sind auf Vorgabe Samet (08.09.2026)
                                fort: die Fläche sagt bereits, was sie ist. */}
                            <span>
                                {templates.length
                                    ? t('inv.aiImport.templatePosition', { index: index + 1, count: templates.length })
                                    : ''}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="ofi-poi-iconbtn"
                            disabled={!templates.length || index >= templates.length - 1}
                            onClick={() => show(index + 1)}
                            aria-label={t('inv.orders.nextOrder')}
                        >
                            <ChevronRight size={17} />
                        </button>
                        <button type="button" className="ofi-poi-ghost" onClick={startNew}>
                            <Plus size={13} />
                            {t('inv.aiImport.templateNew')}
                        </button>
                        {draft?.id && (
                            <button
                                type="button"
                                className="ofi-poi-iconbtn"
                                disabled={busy}
                                onClick={() => { const found = templates.find((entry) => entry.id === draft.id); if (found) void remove(found); }}
                                title={t('common.delete')}
                            >
                                <Trash01 size={15} />
                            </button>
                        )}
                    </div>

                    {draft && (
                        <>
                            {/* ── EINE SPRACHE FUER DIE GANZE VORLAGE ─────────
                                Vorgabe Samet (07.09.2026): «Die Rechenvorlagen
                                sind ein Durcheinander — einfacher, modularer;
                                und wo Text und Zahlen eingegeben werden, bitte
                                im Apple-Stil.» Name, Lieferant und die Vorgabe-
                                Frage liegen darum in derselben KISTE wie alles
                                Uebrige (`.ofi-ord-*`, styles/orderDetails.css):
                                eine Zeile je Sache, Beschriftung links, Wert
                                rechts. Die graue Platte darunter gibt den Grund,
                                den die weissen Gruppen brauchen. */}
                            <div className="ofi-ord-plate">
                                <span className="ofi-ord-cap">{t('inv.aiImport.templateSaveTitle')}</span>
                                <div className="ofi-ord-group">
                                    <label className="ofi-ord-row">
                                        <span className="ofi-ord-label">{t('inv.aiImport.templateName')}</span>
                                        <input
                                            value={draft.title}
                                            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                                            placeholder={t('inv.aiImport.templateNamePlaceholder')}
                                            maxLength={80}
                                        />
                                    </label>
                                    <div className="ofi-ord-row">
                                        <span className="ofi-ord-label">{t('inv.columns.supplier')}</span>
                                        {goodsReceipt ? (
                                            <b className="ml-auto text-[13px] font-semibold text-slate-700 dark:text-white/80">
                                                {draft.supplierName || t('inv.aiImport.templatesAllSuppliers')}
                                            </b>
                                        ) : (
                                            <span className="ofi-ord-combo">
                                                <SupplierComboCell
                                                    value={draft.supplierName}
                                                    onChange={(next) => setDraft({ ...draft, supplierId: null, supplierName: next })}
                                                    onSelect={(choice) => setDraft({
                                                        ...draft,
                                                        supplierId: choice.supplierId,
                                                        supplierName: choice.supplierName,
                                                    })}
                                                    placeholder={t('inv.aiImport.templatesAllSuppliers')}
                                                    inputClassName="!h-9 !text-[13px]"
                                                />
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <CalcPanel
                                    config={draft.config}
                                    priceless={priceless}
                                    goodsReceipt={goodsReceipt}
                                    onChange={(config) => setDraft({ ...draft, config })}
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="ofi-poi-foot">
                    <span className="ofi-poi-note">{draft ? templateSummary(draft.config) : ''}</span>
                    <span className="ofi-poi-spacer" />
                    <button type="button" className="ofi-poi-btn" onClick={onClose}>{t('common.close')}</button>
                    <button
                        type="button"
                        className="ofi-poi-btn is-primary"
                        disabled={busy || !draft || !draft.title.trim()}
                        onClick={() => void save()}
                    >
                        <Save01 size={13} />
                        {t('common.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

/** Each opening is a fresh editor session; unsaved draft state never leaks. */
export const TemplateManagerPopup = (props: Parameters<typeof TemplateManagerPopupContent>[0]) => (
    props.open ? <TemplateManagerPopupContent {...props} /> : null
);
