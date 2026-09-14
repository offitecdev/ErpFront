import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { CheckCircle, ChevronLeft, ChevronRight, Plus, Save01, Trash01, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { usePurchaseTemplateStore } from '@/store/purchaseTemplateStore';
import type { PurchaseTemplateDocumentType, SupplierCalcConfig, SupplierOrderTemplate } from '@/types/inventory';
import '@/styles/purchaseImport.css';
/* Die Kiste im Apple-Stil, in der die Vorlage steht. */
import '@/styles/orderDetails.css';

import { TemplateColumnsPanel } from './TemplateColumnsPanel';
import { apiFailure, defaultCalcConfig, templateProblemText, templateProblems, templateSummary } from './importTemplate';

/**
 * ── MEINE VORLAGEN ──────────────────────────────────────────────────────────
 *
 * Vorgabe Samet (11.09.2026): «Eine Vorlage hat einen Namen — keinen
 * Lieferanten, keine Rechenart, keine Mehrwertsteuer — und ihre Spalten:
 * bis zu zwoelf, jede mit Name, Art und Zuordnung. Produktname und Menge
 * sind Pflicht; fehlt eine, zeigt das System einen Fehler. Die Vorlage ist
 * Pflicht: ohne sie gibt es keine Tabelle.»
 *
 * Eine Vorlage auf einmal, mit Pfeilen davor und danach; die Reiterreihe
 * zeigt alle. Gespeichert wird erst auf Knopfdruck, und die gespeicherte
 * Vorlage gilt danach sofort (sie wird die Vorgabe ihrer Dokumentart).
 */

interface Draft {
    /** Leer = eine neue, noch nicht gespeicherte Vorlage. */
    id: string;
    title: string;
    isDefault: boolean;
    config: SupplierCalcConfig;
}

const newDraft = (index: number): Draft => ({
    id: '',
    title: t('inv.aiImport.templateNewName', { index }),
    isDefault: false,
    config: defaultCalcConfig(),
});

const toDraft = (template: SupplierOrderTemplate): Draft => ({
    id: template.id,
    title: template.title,
    isDefault: template.isDefault,
    config: template.config,
});

const TemplateManagerPopupContent = ({
    open, onClose, onSaved, openTemplateId, documentType = 'ORDER',
}: {
    open: boolean;
    onClose: () => void;
    /** Welche Vorlage aufgeschlagen werden soll — der Klick in der Werkzeugleiste. */
    openTemplateId?: string | null;
    /**
     * Nach jedem Speichern/Löschen: die Bestellseite lädt ihre Vorgabe neu.
     * Beim SPEICHERN kommt die Kennung der Vorlage mit — die Seite macht sie
     * damit sofort zur geltenden. Beim Löschen fehlt sie.
     */
    onSaved?: (templateId?: string) => void;
    /** Bestellung, Preisanfrage und Wareneingang haben je eine eigene Liste. */
    documentType?: PurchaseTemplateDocumentType;
}) => {
    const preferredTemplateId = usePurchaseTemplateStore((state) => state.selected[documentType]);
    const selectPreferredTemplate = usePurchaseTemplateStore((state) => state.select);
    const [templates, setTemplates] = useState<SupplierOrderTemplate[]>([]);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [busy, setBusy] = useState(false);
    /** Nach einem gescheiterten Speichern zeigt die Liste, was fehlt. */
    const [showErrors, setShowErrors] = useState(false);
    /** Welche Vorlage gerade dasteht — das Blaettern zaehlt hier. */
    const [index, setIndex] = useState(0);

    const show = (next: number) => {
        const entry = templates[next];
        if (!entry) return;
        setIndex(next);
        setDraft(toDraft(entry));
        setShowErrors(false);
    };

    const reload = async (selectId?: string) => {
        try {
            const items = await purchaseOrdersApi.listSupplierTemplates(null, documentType);
            setTemplates(items);
            /* Nach dem Speichern soll die eben gespeicherte dastehen, nach dem
               Loeschen die an ihrer Stelle — sonst blaettert man sich verloren. */
            const desired = selectId ?? preferredTemplateId ?? undefined;
            const at = desired ? items.findIndex((entry) => entry.id === desired) : Math.min(index, items.length - 1);
            const target = at >= 0 ? at : 0;
            setIndex(Math.max(0, target));
            /* Gibt es noch keine Vorlage, steht gleich eine leere neue da —
               die Vorlage ist Pflicht, und ein leeres Fenster hilft niemandem. */
            setDraft(items[target] ? toDraft(items[target]) : newDraft(1));
        } catch {
            setTemplates([]);
            setDraft(newDraft(1));
        }
    };

    useEffect(() => {
        void reload(openTemplateId ?? undefined);
    }, [open, openTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── DIE REITERREIHE ──────────────────────────────────────────────────
       Laeuft sie ueber ihren Platz hinaus, kommen die zwei Pfeile dazu und
       schieben sie um eine Fensterbreite. */
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
        setDraft(newDraft(templates.length + 1));
        setShowErrors(false);
    };

    const save = async () => {
        if (!draft) return;
        const title = draft.title.trim();
        if (!title) {
            toast.error(t('inv.aiImport.templateNameRequired'));
            return;
        }
        /* ── DIE PFLICHT (Vorgabe Samet): Produktname und Menge muessen
           zugeordnet sein, jede Spalte braucht einen Namen, jede Zuordnung
           gibt es nur einmal. Der Server prueft dasselbe noch einmal. */
        const problems = templateProblems(draft.config, documentType);
        if (problems.length) {
            setShowErrors(true);
            toast.error(templateProblemText(problems[0]));
            return;
        }
        setBusy(true);
        try {
            const payload = {
                title,
                // Saving makes this template the default for its own document list.
                isDefault: true,
                documentType,
                config: draft.config,
            };
            const saved = draft.id
                ? await purchaseOrdersApi.updateSupplierTemplate(draft.id, payload)
                : await purchaseOrdersApi.createSupplierTemplate(payload);
            await reload(saved.id);
            /* Die eben gespeicherte Vorlage IST ab jetzt die geltende — sonst
               legt man eine an, schliesst das Fenster und die Bestellung zeigt
               weiter die alte, ohne dass irgendetwas es sagt. */
            onSaved?.(saved.id);
            selectPreferredTemplate(documentType, saved.id);
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
            if (preferredTemplateId === template.id) selectPreferredTemplate(documentType, null);
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
                                        <small>{t('inv.aiImport.columnCount', { count: template.config.columns.length })}</small>
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
                            </div>

                            <TemplateColumnsPanel
                                config={draft.config}
                                documentType={documentType}
                                showErrors={showErrors}
                                onChange={(config) => setDraft({ ...draft, config })}
                            />
                        </div>
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
