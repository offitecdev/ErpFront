import { memo } from 'react';

import { PackagePlus, Plus, Receipt, Trash01 as Trash } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Input, Select } from '@/components/ui-shared/Field';
import { t } from '@/i18n/translate';
import type { ProjectMaterial } from '@/types/project';

import { money, numberFmt } from '../../utils/installationMoney';
import { MaterialSearchSelect } from '../common/MaterialSearchSelect';
import { displayExpenseType } from '../../../utils/projectFormatters';

type InstallationMaterialMode = 'used' | 'extra';
type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type ExpenseRow = { expenseType: string; amount: number; description: string };
type MaterialRow = { materialId: string; quantity: number; description: string };

// The "Materials" and "External expenses" views. Both share the same two-column
// editor layout, so they live together and switch on the `view` prop.
export const InstallationMaterialExpenseSection = memo(({
    view,
    disabled,
    materials,
    usedMaterials,
    expenses,
    extraMaterials,
    materialMode,
    setMaterialMode,
    activeMaterialRows,
    setActiveMaterialRows,
    expenseRows,
    setExpenseRows,
}: {
    view: 'materials' | 'expenses';
    disabled: boolean;
    materials: ProjectMaterial[];
    usedMaterials: any[];
    expenses: any[];
    extraMaterials: any[];
    materialMode: InstallationMaterialMode;
    setMaterialMode: StateSetter<InstallationMaterialMode>;
    activeMaterialRows: MaterialRow[];
    setActiveMaterialRows: StateSetter<MaterialRow[]>;
    expenseRows: ExpenseRow[];
    setExpenseRows: StateSetter<ExpenseRow[]>;
}) => {
    if (view === 'expenses') {
        return (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-lg border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">{t('projects.harici_giderler')}</div>
                    {expenses.length === 0 ? (
                        <div className="px-3 py-6 text-center text-[12px] text-slate-500">{t('projects.gider_yok')}</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {expenses.map((expense: any) => (
                                <div key={expense.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                                    <div>
                                        <div className="font-semibold text-slate-800">{displayExpenseType(expense.expenseType)}</div>
                                        {expense.description && <div className="mt-0.5 text-slate-500">{expense.description}</div>}
                                    </div>
                                    <span className="font-mono font-semibold text-slate-900">{money(expense.amount)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                        <span className="flex items-center gap-1.5"><Receipt size={13} />{t('projects.harici_gider_ekle')}</span>
                        <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} disabled={disabled} onClick={() => setExpenseRows([...expenseRows, { expenseType: 'Diğer', amount: 0, description: '' }])}>{t('projects.satir')}</Button>
                    </div>
                    <div className="space-y-2 p-3">
                        <div className="hidden grid-cols-[1fr_120px_32px] gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
                            <span>{t('projects.colType')}</span>
                            <span>{t('projects.colAmount')}</span>
                            <span />
                        </div>
                        {expenseRows.map((row, index) => (
                            <div key={index} className="grid min-w-0 grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,1fr)_110px_32px]">
                                <Select value={row.expenseType} disabled={disabled} onChange={(e) => setExpenseRows(expenseRows.map((item, i) => i === index ? { ...item, expenseType: e.target.value } : item))}>
                                    {[{k:'transport', v:'Nakliye'}, {k:'equipmentRental', v:'Ekipman Kiralama'}, {k:'externalServices', v:'Dış hizmetler'}, {k:'subcontractor', v:'Taşeron'}, {k:'other', v:'Diğer'}].map((x) => <option key={x.v} value={x.v}>{t(`projects.expenseTypes.${x.k as "transport" | "equipmentRental" | "externalServices" | "subcontractor" | "other"}`)}</option>)}
                                </Select>
                                <Input type="number" min="0" step="0.01" value={row.amount} disabled={disabled} placeholder="0.00" aria-label={t('projects.colAmount')} onChange={(e) => setExpenseRows(expenseRows.map((item, i) => i === index ? { ...item, amount: Number(e.target.value) } : item))} />
                                <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} disabled={disabled || expenseRows.length === 1} onClick={() => setExpenseRows(expenseRows.filter((_, i) => i !== index))} />
                                <Input className="md:col-span-3 min-w-0" value={row.description} disabled={disabled} placeholder={t('common.description')} onChange={(e) => setExpenseRows(expenseRows.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                    <div className="text-[12px] font-semibold text-slate-700">{t('nav.materials')}</div>
                    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                        {[
                            { key: 'used' as const, label:t('projects.kullanilan') },
                            { key: 'extra' as const, label:t('projects.ek') },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setMaterialMode(tab.key)}
                                className={`rounded px-2.5 py-1 text-[11px] font-semibold ${materialMode === tab.key ?'bg-white text-slate-950 shadow-xs' :'text-slate-600 hover:text-slate-950'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
                {materialMode === 'used' && (usedMaterials.length === 0 ? (
                    <div className="px-3 py-6 text-center text-[12px] text-slate-500">{t('projects.kullanilan_malzeme_yok')}</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {usedMaterials.map((item: any) => (
                            <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                                <div className="min-w-0">
                                    <div className="font-semibold text-slate-800">{item.material?.name ||t('projects.malzeme')}</div>
                                    <div className="mt-0.5 text-slate-500">{item.material?.serialId || '-'} · {numberFmt(item.quantity)} {t('projects.adet')} · {item.source}</div>
                                    {item.note && <div className="mt-0.5 text-slate-500">{item.note}</div>}
                                </div>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">{t('projects.dahil')}</span>
                            </div>
                        ))}
                    </div>
                ))}
                {materialMode === 'extra' && (extraMaterials.length === 0 ? (
                    <div className="px-3 py-6 text-center text-[12px] text-slate-500">{t('projects.ek_malzeme_yok')}</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {extraMaterials.map((item: any) => (
                            <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                                <div className="min-w-0">
                                    <div className="font-semibold text-slate-800">{item.material?.name ||t('projects.malzeme')}</div>
                                    <div className="mt-0.5 text-slate-500">{numberFmt(item.quantity)} {t('projects.adet_x')} {money(item.unitPrice)}</div>
                                    {item.description && <div className="mt-0.5 text-slate-500">{item.description}</div>}
                                </div>
                                <span className="shrink-0 font-mono font-semibold text-slate-900">{money(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5"><PackagePlus size={13} /> {materialMode === 'used' ?t('projects.kullanilan_malzeme_ekle') :t('projects.ek_malzeme_ekle')}</span>
                    <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} disabled={disabled} onClick={() => setActiveMaterialRows([...activeMaterialRows, { materialId: '', quantity: 1, description: '' }])}>{t('projects.satir')}</Button>
                </div>
                <div className="space-y-2 p-3">
                    <div className="hidden grid-cols-[1fr_100px_32px] gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
                        <span>{t('projects.colMaterial')}</span>
                        <span>{t('projects.colQty')}</span>
                        <span />
                    </div>
                    {activeMaterialRows.map((row, index) => (
                        <div key={index} className="grid min-w-0 grid-cols-1 items-start gap-2 md:grid-cols-[minmax(0,1fr)_84px_32px]">
                            <MaterialSearchSelect
                                value={row.materialId}
                                materials={materials}
                                disabled={disabled}
                                onChange={(materialId) => setActiveMaterialRows((current) => {
                                    const next = current.map((item, i) => i === index ? { ...item, materialId } : item);
                                    return materialId && index === current.length - 1 ? [...next, { materialId: '', quantity: 1, description: '' }] : next;
                                })}
                            />
                            <Input type="number" min="0" step="0.01" value={row.quantity} disabled={disabled} placeholder="1" aria-label={t('projects.colQty')} onChange={(e) => setActiveMaterialRows(activeMaterialRows.map((item, i) => i === index ? { ...item, quantity: Number(e.target.value) } : item))} />
                            <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} disabled={disabled || activeMaterialRows.length === 1} onClick={() => setActiveMaterialRows(activeMaterialRows.filter((_, i) => i !== index))} />
                            <Input className="md:col-span-3 min-w-0" value={row.description} disabled={disabled} placeholder={t('common.description')} onChange={(e) => setActiveMaterialRows(activeMaterialRows.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});
