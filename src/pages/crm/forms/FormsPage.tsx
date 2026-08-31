import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { LuFileText, LuLink, LuListChecks } from 'react-icons/lu';
import { Edit01, Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { formsApi, type FormSubmissionDto, type FormSubmissionRow, type FormTemplateDto } from '@/lib/api/forms';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { ColResizeHandle, Pager, SearchBox, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { CrmFilterBar, CrmFilterSelect } from '../components/CrmFilterBar';
import { CustomerPicker } from '../components/CustomerPicker';
import { useCrmPagedList } from '../hooks/useCrmPagedList';
import type { CrmCustomerOption } from '../types/crm.types';
import { ChecklistLinkSheet, type ChecklistTarget } from './components/ChecklistLinkSheet';
import { DevelopmentNotice } from './components/DevelopmentNotice';
import { TemplatePickerModal } from './components/TemplatePickerModal';
import { FormFillSheet } from './components/FormFillSheet';
import { CustomerCell, LinkChips } from './components/FormsContextPanel';
import { apiErrorMessage, BTN_ICON, BTN_ICON_DANGER, BTN_PRIMARY, fmtDate, presetsFromLinks } from './ui';
import { ChecklistTabs } from './components/ChecklistTabs';

/**
 * Checklisten — die erste der zwei Seiten des Bereichs (Reiter oben, die
 * zweite sind die Vorlagen): alle Checklisten des Mandanten
 * (Vorlage | Kunde | Verknüpfung | ausgefüllt von | Datum).
 *
 * KEIN Status (Vorgabe 16.08.2026): weder Entwurf noch abgeschlossen — eine
 * Checkliste wird angelegt, verknüpft und ausgefüllt.
 *
 * "Checkliste ausfüllen" führt in zwei Schritten: Vorlage wählen →
 * VERKNÜPFEN (Kunden und deren Angebote), dann öffnet der Editor im
 * Untenfenster. Es entsteht dabei GENAU EINE Checkliste (Vorgabe 16.08.2026):
 * fünf Kunden mit je vier Angeboten ergeben eine Checkliste mit zwanzig
 * Verknüpfungen, nicht zwanzig Checklisten — einmal ausgefüllt, bei allen
 * beteiligten Kunden sichtbar. Das Angebot entscheidet über die Reichweite:
 * verknüpft erscheint die Checkliste bei dessen Aufträgen, Projekten, auf dem
 * Montagebildschirm und im Rapport. Das Kettensymbol in der Zeile öffnet
 * dieselbe Tabelle wieder — dort kommen Kunden dazu oder fallen weg.
 *
 * Die Liste lädt NICHT neu, wenn eine Checkliste geöffnet oder gespeichert
 * wird: der Editor schreibt den Speicherstand in die Zeile zurück
 * (`mutateRows`) — und er sichert von selbst, ohne Meldungen.
 *
 * `?open=<id>` öffnet eine Checkliste direkt (Sprung aus Benachrichtigungen).
 */
const COLUMN_WIDTHS = { customer: 220, links: 260, filledBy: 160, date: 110, actions: 160 };
type Column = keyof typeof COLUMN_WIDTHS;
const PAGE_SIZE = 20;

/**
 * Die Zeile aus einer vollen Checkliste — OHNE `values`/`templateFields`:
 * Fotos und Unterschriften stecken als Data-URLs darin und haben in der Liste
 * nichts verloren (schlanke Listen, [[forms-checklists-module]]).
 */
const leanRow = (submission: FormSubmissionDto): FormSubmissionRow => {
    const { values, templateFields, ...row } = submission;
    void values;
    void templateFields;
    return row;
};

export const FormsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [search, setSearch] = useState('');
    const [templateId, setTemplateId] = useState('');
    const [customer, setCustomer] = useState<CrmCustomerOption | null>(null);
    const [templates, setTemplates] = useState<FormTemplateDto[]>([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pendingTemplate, setPendingTemplate] = useState<FormTemplateDto | null>(null);
    // Zum Ändern wird die volle Checkliste geholt (sie trägt alle
    // Verknüpfungen); `relinkBusy` hält solange das Kettensymbol besetzt.
    const [relinking, setRelinking] = useState<FormSubmissionDto | null>(null);
    const [relinkBusy, setRelinkBusy] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [openId, setOpenId] = useState<string | null>(() => searchParams.get('open'));
    const [pendingDelete, setPendingDelete] = useState<FormSubmissionRow | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [busyPdf, setBusyPdf] = useState<string | null>(null);

    const { widths, setColRef, startResize, resetColumn } = useColumnWidths<Column>({
        storageKey: 'offitec:crm-forms:col-widths:v1',
        defaults: COLUMN_WIDTHS,
        minPx: 60,
    });

    useEffect(() => {
        formsApi.listTemplates().then(setTemplates).catch(() => setTemplates([]));
    }, []);

    const filterKey = JSON.stringify({ search, templateId, customerId: customer?.id || '' });
    const fetcher = useCallback(
        (page: number) => formsApi.listSubmissions({
            search: search || undefined,
            templateId: templateId || undefined,
            customerId: customer?.id || undefined,
            page,
            pageSize: PAGE_SIZE,
        }),
        [search, templateId, customer?.id],
    );
    const { rows, total, page, totalPages, loading, setPage, reload, mutateRows, removeRow } = useCrmPagedList<FormSubmissionRow>({
        fetcher,
        filterKey,
        pageSize: PAGE_SIZE,
        errorMessageKey: 'forms.errors.load',
    });

    const templateOptions = useMemo(() => templates.map((template) => ({ value: template.id, label: template.name })), [templates]);

    /** Eine geladene Zeile örtlich umschreiben — ohne die Liste neu zu holen. */
    const patchRow = useCallback((id: string, patch: Partial<FormSubmissionRow>) => {
        mutateRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    }, [mutateRows]);

    /**
     * Eine neue Checkliste entsteht in zwei Schritten: Vorlage, dann
     * Verknüpfung. Alle gewählten Paare (Kunde, Angebot) gehören zu EINER
     * Checkliste — sie wird nicht je Kunde vervielfältigt (Vorgabe
     * 16.08.2026).
     */
    const createFor = async (template: FormTemplateDto, targets: ChecklistTarget[]) => {
        setCreating(true);
        try {
            const created = await formsApi.createSubmission({
                templateId: template.id,
                links: targets.map((target) => ({ customerId: target.customerId, tenderId: target.tenderId })),
            });
            // Die neue Zeile kennt die Liste noch nicht — hier ist Neuladen richtig.
            reload();
            const customers = new Set(targets.map((target) => target.customerId)).size;
            if (customers > 1) toast.success(t('forms.toasts.createdShared', { count: customers }));
            setOpenId(created.id);
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.create')));
        } finally {
            setCreating(false);
            setPendingTemplate(null);
        }
    };

    /** Die volle Checkliste holen und die Verknüpfungstabelle damit öffnen. */
    const startRelink = async (row: FormSubmissionRow) => {
        setRelinkBusy(row.id);
        try {
            setRelinking(await formsApi.getSubmission(row.id));
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.load')));
        } finally {
            setRelinkBusy(null);
        }
    };

    /** Verknüpfungen ändern (Kettensymbol in der Zeile) — die Liste ersetzt den Satz. */
    const saveLink = async (row: FormSubmissionRow, targets: ChecklistTarget[]) => {
        if (!targets.length) return;
        setCreating(true);
        try {
            await formsApi.updateSubmission(row.id, {
                links: targets.map((target) => ({ customerId: target.customerId, tenderId: target.tenderId })),
            });
            // Der Server ergänzt Auftrag/Projekt aus der Kette — dafür EINE
            // gezielte Anfrage statt der ganzen Liste.
            const fresh = await formsApi.getSubmission(row.id);
            patchRow(row.id, leanRow(fresh));
            setRelinking(null);
            toast.success(t('forms.toasts.linked'));
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.save')));
        } finally {
            setCreating(false);
        }
    };

    // Schliessen lädt NICHT neu: Gespeichertes steht schon in der Zeile.
    const closeSheet = () => {
        setOpenId(null);
        if (searchParams.has('open')) {
            const next = new URLSearchParams(searchParams);
            next.delete('open');
            setSearchParams(next, { replace: true });
        }
    };

    const downloadPdf = async (row: FormSubmissionRow) => {
        setBusyPdf(row.id);
        try {
            const [full, { exportFormSubmissionPdf }] = await Promise.all([formsApi.getSubmission(row.id), import('@/utils/pdf/formSubmissionPdf')]);
            await exportFormSubmissionPdf({ submission: full, output: 'download' });
        } catch {
            toast.error(t('forms.errors.pdf'));
        } finally {
            setBusyPdf(null);
        }
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        const target = pendingDelete;
        setDeleting(true);
        try {
            await formsApi.deleteSubmission(target.id);
            setPendingDelete(null);
            removeRow((row) => row.id === target.id);
            toast.success(t('forms.toasts.deleted'));
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.delete')));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('nav.crmForms')}
                action={(
                    <button type="button" className={BTN_PRIMARY} disabled={creating} onClick={() => setPickerOpen(true)}>
                        <Plus size={14} />{t('forms.list.new')}
                    </button>
                )}
            />

            <ChecklistTabs active="checklists" />

            <CrmFilterBar>
                <SearchBox value={search} onChange={setSearch} placeholder={t('forms.list.search')} className="w-64" />
                <CrmFilterSelect value={templateId} onChange={setTemplateId} label={t('forms.list.filterTemplate')} options={templateOptions} allLabel={t('forms.list.allTemplates')} />
                <div className="w-56">
                    <CustomerPicker value={customer} onPick={(pick) => setCustomer(pick?.customer ?? null)} placeholder={t('forms.list.filterCustomer')} />
                </div>
            </CrmFilterBar>

            <SectionCard title={<span className="inline-flex items-center gap-2"><LuListChecks size={15} className="text-[#1f2654] dark:text-amber-400" />{t('nav.crmForms')} ({total})</span>}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col />
                        <col ref={setColRef('customer')} style={{ width: widths.customer }} />
                        <col ref={setColRef('links')} style={{ width: widths.links }} />
                        <col ref={setColRef('filledBy')} style={{ width: widths.filledBy }} />
                        <col ref={setColRef('date')} style={{ width: widths.date }} />
                        <col ref={setColRef('actions')} style={{ width: widths.actions }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('forms.panel.colTemplate')}</th>
                            <th className="relative text-left">{t('forms.links.customer')}<ColResizeHandle onResizeStart={(event) => startResize('customer', event)} onResizeReset={() => resetColumn('customer')} /></th>
                            <th className="relative text-left">{t('forms.panel.colLinks')}<ColResizeHandle onResizeStart={(event) => startResize('links', event)} onResizeReset={() => resetColumn('links')} /></th>
                            <th className="relative text-left">{t('forms.panel.colFilledBy')}<ColResizeHandle onResizeStart={(event) => startResize('filledBy', event)} onResizeReset={() => resetColumn('filledBy')} /></th>
                            <th className="relative text-left">{t('forms.panel.colDate')}<ColResizeHandle onResizeStart={(event) => startResize('date', event)} onResizeReset={() => resetColumn('date')} /></th>
                            <th className="relative text-right">{t('forms.panel.colActions')}<ColResizeHandle onResizeStart={(event) => startResize('actions', event)} onResizeReset={() => resetColumn('actions')} /></th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || rows.length === 0) && <TableStateRow colSpan={6} loading={loading} emptyText={t('forms.list.empty')} />}
                        {!loading && rows.map((row) => (
                            <tr key={row.id} className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => setOpenId(row.id)}>
                                <td>
                                    <span className="block truncate font-semibold text-slate-900 dark:text-white">{row.templateName}</span>
                                    {row.notes && <span className="block truncate text-[11.5px] text-slate-400">{row.notes}</span>}
                                </td>
                                {/* Eine Checkliste kann an mehreren Kunden hängen: die Zelle
                                    zeigt alle Namen in einer Zeile, der Anhang die Zahl. */}
                                <td className="text-[12.5px] text-slate-700 dark:text-white/80">
                                    <CustomerCell row={row} />
                                </td>
                                <td><LinkChips row={row} showCustomer={false} /></td>
                                <td className="truncate text-[12.5px] text-slate-600 dark:text-white/70">{row.filledByName || <span className="text-slate-300">—</span>}</td>
                                <td className="whitespace-nowrap text-[12.5px] text-slate-600 dark:text-white/70">{fmtDate(row.updatedAt)}</td>
                                <td onClick={(event) => event.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-1.5">
                                        <button type="button" className={BTN_ICON} title={t('forms.panel.edit')} onClick={() => setOpenId(row.id)}>
                                            <Edit01 size={14} />
                                        </button>
                                        <button type="button" className={BTN_ICON} title={t('forms.link.action')} disabled={relinkBusy === row.id} onClick={() => void startRelink(row)}>
                                            <LuLink size={14} />
                                        </button>
                                        <button type="button" className={BTN_ICON} title={t('forms.fill.pdf')} disabled={busyPdf === row.id} onClick={() => void downloadPdf(row)}>
                                            <LuFileText size={14} />
                                        </button>
                                        <button type="button" className={BTN_ICON_DANGER} title={t('common.delete')} onClick={() => setPendingDelete(row)}>
                                            <Trash01 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
                </div>
            </SectionCard>

            {/* Der Bereich ist noch in Arbeit — der Hinweis steht UNTER der Liste. */}
            <DevelopmentNotice />

            {/* Schritt 1: Vorlage — Schritt 2: Verknüpfung (Kunde + Angebot) */}
            <TemplatePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(template) => setPendingTemplate(template)} />
            <ChecklistLinkSheet
                open={Boolean(pendingTemplate)}
                onClose={() => setPendingTemplate(null)}
                busy={creating}
                onSubmit={(targets) => { if (pendingTemplate) void createFor(pendingTemplate, targets); }}
            />

            {/* Dieselbe Tabelle für eine bestehende Checkliste (Kettensymbol):
                sie bringt alle bisherigen Kunden mit und ersetzt den Satz. */}
            <ChecklistLinkSheet
                open={Boolean(relinking)}
                onClose={() => setRelinking(null)}
                busy={creating}
                submitLabel={t('forms.link.save')}
                initial={relinking ? presetsFromLinks(relinking.links) : null}
                onSubmit={(targets) => { if (relinking) void saveLink(relinking, targets); }}
            />

            <FormFillSheet
                submissionId={openId}
                open={Boolean(openId)}
                onClose={closeSheet}
                // Gespeichertes wandert in die Zeile — die Liste bleibt stehen.
                onSaved={(submission) => patchRow(submission.id, leanRow(submission))}
                onDeleted={() => { if (openId) removeRow((row) => row.id === openId); }}
            />

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title={t('forms.fill.deleteTitle')}
                message={pendingDelete ? `${pendingDelete.templateName}${pendingDelete.customerName ? ` · ${pendingDelete.customerName}` : ''}` : undefined}
                tone="danger"
                busy={deleting}
                confirmLabel={t('common.delete')}
                onConfirm={() => void confirmDelete()}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
};

export default FormsPage;
