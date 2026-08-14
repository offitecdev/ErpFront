import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { File02 as FileText, Plus, Trash01 as Trash } from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { SectionCard, TableStateRow } from '../../components/ui-shared/TableKit';
import { ChecklistTemplateModal } from '../../components/checklists/ChecklistTemplateModal';
import { checklistApi, type ChecklistTemplateDto } from '../../lib/api/project';

import { t } from '@/i18n/translate';

/**
 * Kontrol listesi (checklist) yönetimi — teslim/übergabe raporlarının liste
 * TÜRLERİ burada yaşar. Tamamen yeniden kuruldu (kullanıcı isteği):
 *  - Listeler yalnızca ADLARIYLA, dar tablolarda görünür — kategori/alt başlık yok.
 *  - Aktif listeler ile Taslaklar iki ayrı bölümdür; taslaklar kolayca seçilip
 *    düzenlenerek aktifleştirilir.
 *  - Yeni liste, BÜYÜK bir popup pencerede oluşturulur (ChecklistTemplateModal);
 *    aynı popup teslim raporu editöründen de açılır.
 */
export const ChecklistSettings = () => {
    const [templates, setTemplates] = useState<ChecklistTemplateDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<{ open: boolean; template: ChecklistTemplateDto | null }>({ open: false, template: null });
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            setTemplates(await checklistApi.list());
        } catch {
            toast.error(t('settings.checklist.loadError'));
            setTemplates([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const remove = async (tpl: ChecklistTemplateDto) => {
        if (!confirm(t('settings.checklist.deleteConfirm'))) return;
        setDeletingId(tpl.id);
        try {
            await checklistApi.remove(tpl.id);
            toast.success(t('settings.checklist.deleted'));
            await load();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('settings.checklist.deleteError'));
        } finally {
            setDeletingId(null);
        }
    };

    const active = templates.filter((tpl) => tpl.isActive !== false);
    const drafts = templates.filter((tpl) => tpl.isActive === false);

    // Dar liste tablosu: yalnızca ad (+ madde sayısı) ve satır aksiyonları.
    const TemplateTable = ({ rows, emptyText }: { rows: ChecklistTemplateDto[]; emptyText: string }) => (
        <table data-inv-table data-unstyled-table className="w-full">
            <thead>
                <tr>
                    <th className="text-left">{t('settings.checklist.listName')}</th>
                    <th className="w-28 text-right">{t('settings.checklist.itemsCountHeader')}</th>
                    <th className="w-20 text-right" />
                </tr>
            </thead>
            <tbody>
                {rows.map((tpl) => (
                    <tr
                        key={tpl.id}
                        className="cursor-pointer hover:bg-slate-50/70 dark:hover:bg-white/5"
                        onClick={() => setModal({ open: true, template: tpl })}
                    >
                        <td className="font-medium text-slate-800 dark:text-white">{tpl.name}</td>
                        <td className="text-right tabular-nums text-slate-500 dark:text-white/60">
                            {Array.isArray(tpl.items) ? tpl.items.length : 0}
                        </td>
                        <td>
                            <div className="flex items-center justify-end">
                                <button
                                    type="button"
                                    title={t('common.delete')}
                                    aria-label={t('common.delete')}
                                    disabled={deletingId === tpl.id}
                                    onClick={(e) => { e.stopPropagation(); void remove(tpl); }}
                                    className="inline-flex size-6 items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:text-rose-600 disabled:opacity-30"
                                >
                                    <Trash size={13} />
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
                {rows.length === 0 && <TableStateRow colSpan={3} loading={loading} emptyText={emptyText} skeletonRows={3} />}
            </tbody>
        </table>
    );

    return (
        <div>
            <PageHeader
                breadcrumb={t('settings.checklist.breadcrumb')}
                title={t('settings.checklist.title')}
                description={t('settings.checklist.description')}
                actions={(
                    <Button variant="primary" icon={<Plus size={14} />} onClick={() => setModal({ open: true, template: null })}>
                        {t('settings.checklist.newList')}
                    </Button>
                )}
            />

            <div className="mx-auto max-w-3xl space-y-5">
                <SectionCard
                    title={(
                        <span className="flex items-center gap-2">
                            <FileText size={13} />
                            {t('settings.checklist.activeSection')}
                        </span>
                    )}
                    action={(
                        <button
                            type="button"
                            title={t('settings.checklist.newList')}
                            aria-label={t('settings.checklist.newList')}
                            onClick={() => setModal({ open: true, template: null })}
                            className="ofi-rs-iconbtn inline-flex size-6 items-center justify-center rounded-[2px] border transition-colors"
                        >
                            <Plus size={13} />
                        </button>
                    )}
                >
                    <TemplateTable rows={active} emptyText={t('settings.checklist.noLists')} />
                </SectionCard>

                {/* Taslaklar: pasif listeler — düzenleyip aktifleştirmek için tıklanır. */}
                <SectionCard title={t('settings.checklist.drafts')}>
                    <TemplateTable rows={drafts} emptyText={t('settings.checklist.noDrafts')} />
                </SectionCard>
            </div>

            <ChecklistTemplateModal
                open={modal.open}
                template={modal.template}
                onClose={() => setModal({ open: false, template: null })}
                onSaved={() => void load()}
            />
        </div>
    );
};

export default ChecklistSettings;
