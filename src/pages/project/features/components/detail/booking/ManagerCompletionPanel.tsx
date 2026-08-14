import { useMemo, useState } from 'react';

import {
    Clipboard as ClipboardPenLine,
    PackagePlus,
    Receipt as ReceiptText,
    Save01 as Save,
    Trash01 as Trash2,
    X,
} from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Field, Input, Select, Textarea } from '@/components/ui-shared/Field';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { MaterialSearchSelect } from '../../common/MaterialSearchSelect';
import { SubTabs } from '../../common/SubTabs';
import { money, numberFmt } from '../../../utils/projectFormatters';
import { getProjectUsedMaterials } from '../../../utils/projectMaterialUsage';
import { getMaterialSubTabs, type MaterialMode } from '../../../utils/materialTabs';

export type ManagerCompletionFormState = {
    operations: string[];
    technicalNotes: string;
    expenses: Array<{ expenseType: string; amount: number; description: string }>;
    materials: Array<{ materialId: string; quantity: number; description: string }>;
    usedMaterials: Array<{ materialId: string; quantity: number; description: string }>;
};

export const emptyManagerCompletionForm = (): ManagerCompletionFormState => ({
    operations: [t('auto.yonetici_tarafindan_montaj_bitirildi')],
    technicalNotes: '',
    expenses: [{ expenseType: t('auto.nakliye'), amount: 0, description: '' }],
    materials: [{ materialId: '', quantity: 1, description: '' }],
    usedMaterials: [{ materialId: '', quantity: 1, description: '' }],
});

// The detailed "manager finishes the montaj" form: operations, external costs and
// materials in one panel. Saving produces a field report on the backend.
export const ManagerCompletionPanel = ({
    project,
    order,
    form,
    materials,
    loading,
    onChange,
    onCancel,
    onSubmit,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    form: ManagerCompletionFormState;
    materials: ProjectMaterial[];
    loading: boolean;
    onChange: (form: ManagerCompletionFormState) => void;
    onCancel: () => void;
    onSubmit: () => void;
}) => {
    const [activeTab, setActiveTab] = useState<'reports' | 'costs' | 'materials'>('reports');
    const [materialMode, setMaterialMode] = useState<MaterialMode>('used');
    const usedMaterials = getProjectUsedMaterials(project, order);
    const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
    const expenseTotal = form.expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const extraMaterialTotal = form.materials.reduce((sum, row) => {
        const material = materialById.get(row.materialId);
        return sum + Number(row.quantity || 0) * Number(material?.unitCost || 0);
    }, 0);
    const activeMaterialRows = materialMode === 'used' ? form.usedMaterials : form.materials;
    const setActiveMaterialRows = (rows: ManagerCompletionFormState['materials']) => {
        if (materialMode === 'used') onChange({ ...form, usedMaterials: rows });
        else onChange({ ...form, materials: rows });
    };
    const updateOperation = (index: number, value: string) =>
        onChange({ ...form, operations: form.operations.map((item, rowIndex) => rowIndex === index ? value : item) });
    const updateExpense = (index: number, patch: Partial<ManagerCompletionFormState['expenses'][number]>) =>
        onChange({ ...form, expenses: form.expenses.map((item, rowIndex) => rowIndex === index ? { ...item, ...patch } : item) });
    const updateMaterial = (index: number, patch: Partial<ManagerCompletionFormState['materials'][number]>) =>
        setActiveMaterialRows(activeMaterialRows.map((item, rowIndex) => rowIndex === index ? { ...item, ...patch } : item));

    return (
        <div className="w-full rounded-md border border-slate-200 bg-white p-3 shadow-xs">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-[12px] font-semibold text-slate-900">{t('auto.yonetici_bitirme_formu')}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{t('auto.kaydedilince_saha_raporu_olusur_maliyetler_proje')}</div>
                </div>
                <Button type="button" size="sm" variant="ghost" icon={<X size={13} />} disabled={loading} onClick={onCancel}>{t('common.close')}</Button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('projects.fieldReport')}</div>
                    <div className="mt-1 text-[13px] font-semibold text-slate-950">{form.operations.filter((item) => item.trim()).length}{t('auto.madde')}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.harici_gider')}</div>
                    <div className="mt-1 font-mono text-[13px] font-semibold text-slate-950">{money(expenseTotal)}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.ek_malzeme')}</div>
                    <div className="mt-1 font-mono text-[13px] font-semibold text-slate-950">{money(extraMaterialTotal)}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.kullanilan')}</div>
                    <div className="mt-1 text-[13px] font-semibold text-slate-950">{usedMaterials.length}{t('auto.malzeme')}</div>
                </div>
            </div>

            <div className="mb-3 overflow-x-hidden border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1">
                    {[
                        { key: 'reports' as const, label: t('projects.fieldReport') },
                        { key: 'costs' as const, label: t('auto.harici_giderler') },
                        { key: 'materials' as const, label: t('nav.materials') },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`relative whitespace-nowrap pb-3 text-[13px] font-semibold transition-colors ${activeTab === tab.key ? t('auto.text_brand_700_after_absolute_after_inset_x_0_af') : t('auto.text_slate_600_hover_text_slate_950')}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <div className={activeTab === 'reports' ? t('auto.rounded_md_border_border_slate_200') : 'hidden'}>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                        <span>{t('auto.yapilan_isler')}</span>
                        <Button type="button" size="sm" variant="secondary" icon={<ClipboardPenLine size={12} />} disabled={loading} onClick={() => onChange({ ...form, operations: [...form.operations, ''] })}>{t('auto.madde')}</Button>
                    </div>
                    <div className="space-y-2 p-3">
                        {form.operations.map((item, index) => (
                            <div key={index} className="grid grid-cols-[1fr_32px] gap-2">
                                <Input value={item} disabled={loading} onChange={(event) => updateOperation(index, event.target.value)} />
                                <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={loading || form.operations.length === 1} onClick={() => onChange({ ...form, operations: form.operations.filter((_, rowIndex) => rowIndex !== index) })} />
                            </div>
                        ))}
                        <Field label={t('auto.teknik_notlar')}>
                            <Textarea rows={3} value={form.technicalNotes} disabled={loading} onChange={(event) => onChange({ ...form, technicalNotes: event.target.value })} />
                        </Field>
                    </div>
                </div>

                <div className={activeTab === 'costs' ? t('auto.rounded_md_border_border_slate_200') : 'hidden'}>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                        <span>{t('auto.harici_giderler')}</span>
                        <Button type="button" size="sm" variant="secondary" icon={<ReceiptText size={12} />} disabled={loading} onClick={() => onChange({ ...form, expenses: [...form.expenses, { expenseType: t('auto.nakliye'), amount: 0, description: '' }] })}>{t('auto.satir')}</Button>
                    </div>
                    <div className="space-y-2 p-3">
                        {form.expenses.map((row, index) => (
                            <div key={index} className="grid grid-cols-[1fr_92px_32px] gap-2">
                                <Select value={row.expenseType} disabled={loading} onChange={(event) => updateExpense(index, { expenseType: event.target.value })}>
                                    {[t('auto.nakliye'), t('auto.ekipman_kiralama'), t('auto.dis_hizmetler'), t('auto.taseron'), t('auto.diger')].map((type) => <option key={type} value={type}>{type}</option>)}
                                </Select>
                                <Input type="number" min="0" step="0.01" value={row.amount} disabled={loading} onChange={(event) => updateExpense(index, { amount: Number(event.target.value) || 0 })} />
                                <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={loading || form.expenses.length === 1} onClick={() => onChange({ ...form, expenses: form.expenses.filter((_, rowIndex) => rowIndex !== index) })} />
                                <Input className="col-span-3" value={row.description} disabled={loading} placeholder={t('common.description')} onChange={(event) => updateExpense(index, { description: event.target.value })} />
                            </div>
                        ))}
                    </div>
                </div>

                <div className={activeTab === 'materials' ? t('auto.rounded_md_border_border_slate_200') : 'hidden'}>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                        <span>{t('nav.materials')}</span>
                        <Button type="button" size="sm" variant="secondary" icon={<PackagePlus size={12} />} disabled={loading} onClick={() => setActiveMaterialRows([...activeMaterialRows, { materialId: '', quantity: 1, description: '' }])}>{t('auto.satir')}</Button>
                    </div>
                    <div className="border-b border-slate-100 px-3 pt-3">
                        <SubTabs tabs={getMaterialSubTabs()} activeTab={materialMode} onSelectTab={setMaterialMode} />
                    </div>
                    {materialMode === 'used' && (usedMaterials.length === 0 ? (
                        <div className="px-3 py-8 text-center text-[12px] text-slate-500">{t('auto.kullanilan_malzeme_yok')}</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {usedMaterials.map((item) => (
                                <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-slate-800">{item.material?.name || t('auto.malzeme')}</div>
                                        <div className="mt-0.5 text-slate-500">{item.material?.serialId || '-'} - {numberFmt(item.quantity)}{"adet -"}{item.positionNumber}</div>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">{t('auto.dahil')}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                    <div className="space-y-2 p-3">
                        {activeMaterialRows.map((row, index) => (
                            <div key={index} className="grid grid-cols-[minmax(0,1fr)_82px_32px] gap-2">
                                <MaterialSearchSelect value={row.materialId} materials={materials} disabled={loading} onChange={(materialId) => {
                                    const next = activeMaterialRows.map((item, rowIndex) => rowIndex === index ? { ...item, materialId } : item);
                                    setActiveMaterialRows(materialId && index === activeMaterialRows.length - 1 ? [...next, { materialId: '', quantity: 1, description: '' }] : next);
                                }} />
                                <Input type="number" min="0" step="0.01" value={row.quantity} disabled={loading} onChange={(event) => updateMaterial(index, { quantity: Number(event.target.value) || 0 })} />
                                <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={loading || activeMaterialRows.length === 1} onClick={() => setActiveMaterialRows(activeMaterialRows.filter((_, rowIndex) => rowIndex !== index))} />
                                <Input className="col-span-3" value={row.description} disabled={loading} placeholder={t('common.description')} onChange={(event) => updateMaterial(index, { description: event.target.value })} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-3 flex justify-end">
                <Button type="button" loading={loading} icon={<Save size={13} />} onClick={onSubmit}>{t('auto.yonetici_bitir')}</Button>
            </div>
        </div>
    );
};
