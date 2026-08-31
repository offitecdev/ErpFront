import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy01, Edit01, Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { formsApi, type FormTemplateDto } from '@/lib/api/forms';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { SearchBox, SectionCard, TableStateRow, ToggleGroup } from '@/components/ui-shared/TableKit';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { Switch } from '@/components/ui-shared/Switch';
import { CrmFilterBar } from '../components/CrmFilterBar';
import { apiErrorMessage, BTN_ICON, BTN_ICON_DANGER, BTN_PRIMARY, fmtDate } from './ui';
import { ChecklistTabs } from './components/ChecklistTabs';
import { NEW_TEMPLATE_PATH, templateEditorPath } from './routes';
import { DevelopmentNotice } from './components/DevelopmentNotice';

/**
 * Vorlagen der Checklisten — die zweite Seite des Bereichs (Reiter oben):
 * Vorlage | Felder | ausgefüllt | aktiv | geändert. Das Schlagwort steht als
 * kleines Schild neben dem Namen statt in einer eigenen Spalte.
 *
 * Neue Vorlage / Bearbeiten öffnen den Editor (eigene Seite — die Feldliste
 * mit Bedingungen braucht Platz); der Aktiv-Schalter sitzt direkt in der
 * Zeile, Kopieren legt eine inaktive Kopie mit neuen Feld-Ids an.
 */
export const FormTemplatesPage = () => {
    const navigate = useNavigate();
    const [templates, setTemplates] = useState<FormTemplateDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
    const [pendingDelete, setPendingDelete] = useState<FormTemplateDto | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    // `loading` startet wahr und fällt nach dem ersten Laden — kein setState
    // synchron im Effekt.
    const load = useCallback(async () => {
        try {
            setTemplates(await formsApi.listTemplates());
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.load')));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return templates.filter((template) => {
            if (activeFilter === 'true' && !template.isActive) return false;
            if (activeFilter === 'false' && template.isActive) return false;
            if (!query) return true;
            return `${template.name} ${template.category || ''} ${template.description || ''}`.toLowerCase().includes(query);
        });
    }, [templates, search, activeFilter]);

    const toggleActive = async (template: FormTemplateDto) => {
        setBusyId(template.id);
        const next = !template.isActive;
        setTemplates((current) => current.map((row) => (row.id === template.id ? { ...row, isActive: next } : row)));
        try {
            await formsApi.updateTemplate(template.id, { isActive: next });
        } catch (error) {
            setTemplates((current) => current.map((row) => (row.id === template.id ? { ...row, isActive: !next } : row)));
            toast.error(apiErrorMessage(error, t('forms.errors.save')));
        } finally {
            setBusyId(null);
        }
    };

    const duplicate = async (template: FormTemplateDto) => {
        setBusyId(template.id);
        try {
            const copy = await formsApi.duplicateTemplate(template.id);
            toast.success(t('forms.templates.duplicated'));
            navigate(templateEditorPath(copy.id));
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.save')));
        } finally {
            setBusyId(null);
        }
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        try {
            await formsApi.deleteTemplate(pendingDelete.id);
            setTemplates((current) => current.filter((row) => row.id !== pendingDelete.id));
            setPendingDelete(null);
            toast.success(t('forms.templates.deleted'));
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.delete')));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('nav.crmFormTemplates')}
                action={(
                    <button type="button" className={BTN_PRIMARY} onClick={() => navigate(NEW_TEMPLATE_PATH)}>
                        <Plus size={14} />{t('forms.templates.new')}
                    </button>
                )}
            />

            <ChecklistTabs active="templates" />

            <CrmFilterBar>
                <SearchBox value={search} onChange={setSearch} placeholder={t('forms.templates.search')} className="w-64" />
                <ToggleGroup
                    value={activeFilter}
                    onChange={setActiveFilter}
                    options={[
                        { key: '', label: t('common.all') },
                        { key: 'true', label: t('forms.templates.active') },
                        { key: 'false', label: t('forms.templates.inactive') },
                    ]}
                />
            </CrmFilterBar>

            <SectionCard title={`${t('nav.crmFormTemplates')} (${rows.length})`}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col />
                        <col style={{ width: 90 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 130 }} />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 150 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('forms.templates.colName')}</th>
                            <th className="text-right">{t('forms.templates.colFields')}</th>
                            <th className="text-right">{t('forms.templates.colUsage')}</th>
                            <th className="text-left">{t('forms.templates.active')}</th>
                            <th className="text-left">{t('forms.templates.colUpdated')}</th>
                            <th className="text-right">{t('forms.panel.colActions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || rows.length === 0) && <TableStateRow colSpan={6} loading={loading} emptyText={t('forms.templates.empty')} />}
                        {!loading && rows.map((template) => (
                            <tr key={template.id} className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => navigate(templateEditorPath(template.id))}>
                                <td>
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span className="truncate font-semibold text-slate-900 dark:text-white">{template.name}</span>
                                        {template.category && (
                                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-white/70">
                                                {template.category}
                                            </span>
                                        )}
                                    </span>
                                    {template.description && <span className="block truncate text-[11.5px] text-slate-400">{template.description}</span>}
                                </td>
                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{template.fieldCount ?? template.fields.length}</td>
                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{template.submissionCount ?? 0}</td>
                                <td onClick={(event) => event.stopPropagation()}>
                                    {/* Schalter + Wort daneben: der Schalter selbst trägt keinen
                                        sichtbaren Text (Switch.label ist nur für Screenreader). */}
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={template.isActive}
                                            onChange={() => void toggleActive(template)}
                                            label={t('forms.templates.active')}
                                            disabled={busyId === template.id}
                                        />
                                        <span className={`text-[12.5px] font-semibold ${template.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                                            {template.isActive ? t('forms.templates.active') : t('forms.templates.inactive')}
                                        </span>
                                    </div>
                                </td>
                                <td className="whitespace-nowrap text-[12.5px] text-slate-600 dark:text-white/70">{fmtDate(template.updatedAt)}</td>
                                <td onClick={(event) => event.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-1.5">
                                        <button type="button" className={BTN_ICON} title={t('common.edit')} onClick={() => navigate(templateEditorPath(template.id))}><Edit01 size={14} /></button>
                                        <button type="button" className={BTN_ICON} title={t('forms.templates.duplicate')} disabled={busyId === template.id} onClick={() => void duplicate(template)}><Copy01 size={14} /></button>
                                        <button type="button" className={BTN_ICON_DANGER} title={t('common.delete')} onClick={() => setPendingDelete(template)}><Trash01 size={14} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </SectionCard>

            {/* Der Bereich ist noch in Arbeit — der Hinweis steht UNTER der Liste. */}
            <DevelopmentNotice />

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title={t('forms.templates.deleteTitle')}
                message={pendingDelete ? `${pendingDelete.name} — ${t('forms.templates.deleteHint')}` : undefined}
                tone="danger"
                busy={deleting}
                confirmLabel={t('common.delete')}
                onConfirm={() => void confirmDelete()}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
};

export default FormTemplatesPage;
