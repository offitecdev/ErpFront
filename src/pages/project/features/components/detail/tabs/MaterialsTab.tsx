import { memo, useMemo, useState } from 'react';

import { PackagePlus, Trash01 as Trash2 } from '@/components/icons/antIconCompat';
import { Card } from '@/components/ui-shared/Card';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { tenderApi } from '@/lib/api/tender';
import { toast } from 'sonner';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { SubTabs } from '../../common/SubTabs';
import { scopedRecords } from '../../../utils/projectOrderScope';
import { money, numberFmt } from '../../../utils/projectFormatters';
import { getProjectUsedMaterials } from '../../../utils/projectMaterialUsage';
// MaterialMode + getMaterialSubTabs stay in ProjectDetail.tsx (shared with staying
// components); referenced only at render time, so this back-import is safe despite the cycle.
import { getMaterialSubTabs, type MaterialMode } from '../../../../ProjectDetail';

export const MaterialsTab = memo(({ project, order, isPrimary, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [mode, setMode] = useState<MaterialMode>('used');
    const usedMaterials = useMemo(() => getProjectUsedMaterials(project, order), [project, order]);
    const extraMaterials = useMemo(
        () => scopedRecords(project.extraMaterials, order, isPrimary, project.salesOrders),
        [project.extraMaterials, project.salesOrders, order, isPrimary],
    );

    return (
        <div>
            <SubTabs tabs={getMaterialSubTabs()} activeTab={mode} onSelectTab={setMode} />
            <div className="grid grid-cols-1 gap-4">
                <div className="space-y-4">
                    {mode === 'used' && (
                        <Card title={t('auto.kullanilan_malzemeler')} icon={<PackagePlus size={13} />} noPadding>
                            {usedMaterials.length === 0 ? (
                                <EmptyState icon={<PackagePlus size={28} />} title={t('auto.kullanilan_malzeme_yok')} />
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {usedMaterials.map((item) => (
                                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                            <div>
                                                <div className="font-medium text-slate-800">{item.material?.name ||t('auto.malzeme')}</div>
                                                <div className="text-[11.5px] text-slate-900">
                                                    {item.material?.serialId || '-'} · {numberFmt(item.quantity)} {t('auto.adet_x')} {money(item.unitCost)} · {item.positionNumber}
                                                </div>
                                                <div className="mt-1 text-[12px] text-slate-900">{t('auto.kullanilan_malzeme_fiyat_toplamina_eklenmez')}</div>
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
                        <Card title={t('auto.ek_malzemeler')} icon={<PackagePlus size={13} />} noPadding>
                            {extraMaterials.length === 0 ? (
                                <EmptyState icon={<PackagePlus size={28} />} title={t('auto.ek_malzeme_yok')} description={t('auto.fiyata_eklenecek_proje_malzemeleri_buradan_eklen')} />
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {extraMaterials.map((v: any) => (
                                        <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                            <div>
                                                <div className="font-medium text-slate-800">{v.material?.name ||t('auto.malzeme')}</div>
                                                <div className="text-[11.5px] text-slate-900">{numberFmt(v.quantity)} {t('auto.adet_x')} {money(v.unitPrice)}</div>
                                                {v.description && <div className="mt-1 text-[12px] text-slate-900">{v.description}</div>}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono text-[12.5px] font-semibold">{money((Number(v.quantity) || 0) * (Number(v.unitPrice) || 0))}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
});
