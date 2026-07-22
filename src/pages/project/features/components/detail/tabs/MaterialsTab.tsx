import { memo, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { Clipboard as ClipboardPenLine, PackagePlus, Trash01 as Trash2 } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Card } from '@/components/ui-shared/Card';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { tenderApi } from '@/lib/api/tender';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { SubTabs } from '../../common/SubTabs';
import { scopedRecords } from '../../../utils/projectOrderScope';
import { groupRecordsByReport } from '../../../utils/reportGrouping';
import { displayOperationsDone, money, numberFmt } from '../../../utils/projectFormatters';
import { getProjectUsedMaterials } from '../../../utils/projectMaterialUsage';
import { getMaterialSubTabs, type MaterialMode } from '../../../utils/materialTabs';

const extraMaterialAmount = (item: any) => (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

// Material rows lead with a coded badge (serial or initials) so different
// articles are told apart at a glance rather than reading as identical lines.
const ExtraMaterialRow = ({ item }: { item: any }) => {
    const name = item.material?.name || t('auto.malzeme');
    const code = item.material?.serialId || name.slice(0, 2).toUpperCase();
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#272f67]/10 px-1 font-mono text-[9.5px] font-bold text-[#272f67] dark:bg-white/10">
                    {String(code).slice(0, 4)}
                </span>
                <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold text-slate-800">{name}</div>
                    <div className="text-[11.5px] text-slate-500">
                        {numberFmt(item.quantity)} {t('auto.adet_x')} {money(item.unitPrice)}
                        {item.description ? ` · ${item.description}` : ''}
                    </div>
                </div>
            </div>
            <span className="font-mono text-[12.5px] font-semibold text-slate-800">{money(extraMaterialAmount(item))}</span>
        </div>
    );
};

const GroupHeader = ({ title, subtitle, total }: { title: string; subtitle?: string; total: number }) => (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
            <ClipboardPenLine size={13} className="shrink-0 text-slate-400" />
            <div className="min-w-0">
                <span className="text-[12px] font-semibold text-slate-800">{title}</span>
                {subtitle && <span className="ml-2 truncate text-[11px] text-slate-400">{subtitle}</span>}
            </div>
        </div>
        <span className="shrink-0 font-mono text-[12px] font-semibold text-slate-700">{money(total)}</span>
    </div>
);

// Materials tab: the tender-included (used) list stays flat; the priced extra
// materials are organized hierarchically under the field report that added them.
// With no field report the extra list explains the field-report-driven flow
// instead of wrongly claiming "no materials".
export const MaterialsTab = memo(({
    project,
    order,
    isPrimary,
    onSaved,
    onGoFieldReports,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    isPrimary: boolean;
    materials: ProjectMaterial[];
    onSaved: () => Promise<void>;
    onGoFieldReports: () => void;
}) => {
    const [mode, setMode] = useState<MaterialMode>('used');
    const usedMaterials = useMemo(() => getProjectUsedMaterials(project, order), [project, order]);
    const reports = useMemo(
        () => scopedRecords(project.reports, order, isPrimary, project.salesOrders),
        [project.reports, project.salesOrders, order, isPrimary],
    );
    const extraMaterials = useMemo(
        () => scopedRecords(project.extraMaterials, order, isPrimary, project.salesOrders),
        [project.extraMaterials, project.salesOrders, order, isPrimary],
    );
    const { groups, unassigned } = useMemo(
        () => groupRecordsByReport(reports, extraMaterials as any[], (item: any) => item.addedAt),
        [reports, extraMaterials],
    );

    const groupTotal = (items: any[]) => items.reduce((sum, item) => sum + extraMaterialAmount(item), 0);

    return (
        <div>
            <SubTabs tabs={getMaterialSubTabs()} activeTab={mode} onSelectTab={setMode} />

            {mode === 'used' && (
                <Card title={t('auto.kullanilan_malzemeler')} icon={<PackagePlus size={13} />} noPadding>
                    {usedMaterials.length === 0 ? (
                        <EmptyState icon={<PackagePlus size={28} />} title={t('auto.kullanilan_malzeme_yok')} />
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {usedMaterials.map((item) => (
                                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                    <div>
                                        <div className="font-medium text-slate-800">{item.material?.name || t('auto.malzeme')}</div>
                                        <div className="text-[11.5px] text-slate-500">
                                            {item.material?.serialId || '-'} · {numberFmt(item.quantity)} {t('auto.adet_x')} {money(item.unitCost)} · {item.positionNumber}
                                        </div>
                                        <div className="mt-1 text-[12px] text-slate-400">{t('auto.kullanilan_malzeme_fiyat_toplamina_eklenmez')}</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right font-mono text-[12.5px] font-semibold text-slate-800">
                                            <div>{money(item.value)}</div>
                                            <div className="text-[10.5px] font-normal text-slate-500">{t('auto.dahil_degil')}</div>
                                        </div>
                                        {(order?.tenderId || project.tenderId) && item.source === 'tender' && (
                                            <button
                                                type="button"
                                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                                onClick={async () => {
                                                    if (!confirm(t('auto.kullanilan_malzeme_kaldirilsin_mi'))) return;
                                                    await tenderApi.removeMaterialMapping((order?.tenderId || project.tenderId)!, item.rawId);
                                                    toast.success(t('auto.kullanilan_malzeme_kaldirildi'));
                                                    await onSaved();
                                                }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {mode === 'extra' && (
                !reports.length && !extraMaterials.length ? (
                    <EmptyState
                        icon={<PackagePlus size={28} />}
                        title={t('projects.detail.noFieldReportsTitle')}
                        description={t('projects.detail.materialsComeFromReports')}
                        action={(
                            <Button variant="primary" size="sm" onClick={onGoFieldReports}>
                                {t('projects.detail.goFieldReports')}
                            </Button>
                        )}
                    />
                ) : (
                    <div className="space-y-3">
                        {groups.map((group) => {
                            const report = group.report;
                            return (
                                <div key={group.key} className="overflow-hidden rounded-lg border border-slate-200/70 bg-white">
                                    <GroupHeader
                                        title={`${dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY')} · ${t('projects.fieldReport')}`}
                                        subtitle={report.operationsDone ? displayOperationsDone(report.operationsDone) : undefined}
                                        total={groupTotal(group.items)}
                                    />
                                    {group.items.length === 0 ? (
                                        <div className="px-4 py-3 text-[11.5px] text-slate-400">{t('projects.detail.reportNoMaterials')}</div>
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {group.items.map((item: any) => <ExtraMaterialRow key={item.id} item={item} />)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {unassigned.length > 0 && (
                            <div className="overflow-hidden rounded-lg border border-slate-200/70 bg-white">
                                <GroupHeader title={t('projects.detail.unassignedGroup')} total={groupTotal(unassigned)} />
                                <div className="divide-y divide-slate-100">
                                    {unassigned.map((item: any) => <ExtraMaterialRow key={item.id} item={item} />)}
                                </div>
                            </div>
                        )}
                        {/* Grand total, aligned with the group amount column like a table footer. */}
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#272f67]/20 bg-[#eef4ff] px-4 py-2.5">
                            <span className="text-[12px] font-semibold text-slate-900">{t('projects.detail.totalMaterials')}</span>
                            <span className="font-mono text-[13px] font-bold text-[#272f67]">
                                {money(groupTotal(extraMaterials as any[]))}
                            </span>
                        </div>
                    </div>
                )
            )}
        </div>
    );
});
