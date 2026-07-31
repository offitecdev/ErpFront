import { useState } from 'react';

import { Plus, Trash01 } from '@/components/icons/antIconCompat';
import type { ProjectMaterial } from '@/types/project';
import { t } from '@/i18n/translate';

import type { MontageMaterialMode } from '../types/montage';
import { BigButton } from './BigButton';
import { MaterialPickerSheet } from './MaterialPickerSheet';

type MaterialRow = { materialId: string; quantity: number; description: string };

/**
 * Materials — sub-divided into "used" and "additional" via two big toggle
 * buttons. Rows follow the tender line-table pattern: the material cell opens
 * the picker (the "+"-to-browse flow), quantity is edited inline, and a "+"
 * strip at the bottom appends the next empty row.
 */
export const MaterialsSection = ({
    mode,
    setMode,
    usedRows,
    setUsedRows,
    extraRows,
    setExtraRows,
    quotedMaterials,
    materials,
    disabled,
}: {
    mode: MontageMaterialMode;
    setMode: (mode: MontageMaterialMode) => void;
    usedRows: MaterialRow[];
    setUsedRows: (rows: MaterialRow[]) => void;
    extraRows: MaterialRow[];
    setExtraRows: (rows: MaterialRow[]) => void;
    /** Read-only reference list derived from the tender ("included"). */
    quotedMaterials: { id: string; material?: ProjectMaterial | null; quantity: number; source: string }[];
    materials: ProjectMaterial[];
    disabled: boolean;
}) => {
    const rows = mode === 'used' ? usedRows : extraRows;
    const setRows = mode === 'used' ? setUsedRows : setExtraRows;
    const [pickerIndex, setPickerIndex] = useState<number | null>(null);

    const materialName = (id: string) => materials.find((m) => m.id === id)?.name || '';
    const update = (index: number, patch: Partial<MaterialRow>) =>
        setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    return (
        <div className="space-y-4">
            {/* The two big sub-toggle buttons. */}
            <div className="grid grid-cols-2 gap-3">
                <BigButton tone={mode === 'used' ? 'navy' : 'neutral'} onClick={() => setMode('used')}>
                    {t('montage.materials.used')}
                </BigButton>
                <BigButton tone={mode === 'extra' ? 'navy' : 'neutral'} onClick={() => setMode('extra')}>
                    {t('montage.materials.extra')}
                </BigButton>
            </div>

            {mode === 'used' && quotedMaterials.length > 0 && (
                <div className="overflow-hidden rounded-[3px] border border-slate-300 bg-white dark:border-white/10 dark:bg-[#17191c]">
                    <div className="border-b border-slate-200 bg-[#eaf0fb] px-2.5 py-2 text-[12px] font-bold text-[#38446e] dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                        {t('montage.materials.quoted')}
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-white/5">
                        {quotedMaterials.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 px-2.5 py-2">
                                <div className="min-w-0">
                                    <div className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-50">{item.material?.name || '-'}</div>
                                    <div className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">{item.source}</div>
                                </div>
                                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                    {item.quantity} {t('auto.adet_x').replace(' x', '')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="overflow-x-auto rounded-[3px] border border-slate-300 bg-white dark:border-white/10 dark:bg-[#17191c]">
                <table data-montage-table data-unstyled-table className="min-w-[520px] text-left">
                    <thead className="dark:[&_th]:border-white/10 dark:[&_th]:bg-white/5 dark:[&_th]:text-slate-300">
                        <tr>
                            <th>{t('nav.materials')}</th>
                            <th className="w-28">{t('montage.materials.quantity')}</th>
                            <th>{t('common.description')}</th>
                            <th className="w-10" />
                        </tr>
                    </thead>
                    <tbody className="dark:[&_td]:border-white/10">
                        {rows.map((row, index) => (
                            <tr key={index}>
                                <td>
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => setPickerIndex(index)}
                                        className={`flex h-9 w-full items-center justify-between gap-2 rounded-[3px] border px-2.5 text-left text-[13px] font-medium outline-none transition-colors disabled:opacity-60 ${
                                            row.materialId
                                                ? 'border-slate-200 text-slate-900 hover:border-brand-400 dark:border-white/15 dark:text-slate-50'
                                                : 'border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-700 dark:border-white/20'
                                        }`}
                                    >
                                        <span className="truncate">{materialName(row.materialId) || t('montage.materials.choose')}</span>
                                        <Plus size={14} className="shrink-0" />
                                    </button>
                                </td>
                                <td>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        value={row.quantity || ''}
                                        disabled={disabled}
                                        onChange={(e) => update(index, { quantity: Number(e.target.value || 0) })}
                                        className="h-9 w-full rounded-[3px] border border-slate-200 bg-white px-2.5 text-center text-[13px] font-semibold text-slate-900 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-50"
                                    />
                                </td>
                                <td>
                                    <input
                                        value={row.description}
                                        disabled={disabled}
                                        onChange={(e) => update(index, { description: e.target.value })}
                                        placeholder={t('montage.expenses.notePlaceholder')}
                                        className="h-9 w-full rounded-[3px] border border-slate-200 bg-white px-2.5 text-[13px] text-slate-900 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-50"
                                    />
                                </td>
                                <td className="text-right">
                                    {!disabled && rows.length > 1 && (
                                        <button
                                            type="button"
                                            aria-label={t('common.delete')}
                                            onClick={() => setRows(rows.filter((_, i) => i !== index))}
                                            className="grid size-7 place-items-center rounded-[3px] text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                                        >
                                            <Trash01 size={14} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!disabled && (
                    <button
                        type="button"
                        onClick={() => setRows([...rows, { materialId: '', quantity: 1, description: '' }])}
                        className="flex min-h-9 w-full items-center gap-1.5 border-t border-slate-100 px-3 text-[12.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-50 dark:border-white/5 dark:text-brand-300 dark:hover:bg-white/5"
                    >
                        <Plus size={15} />
                        {t('montage.addRow')}
                    </button>
                )}
            </div>

            <MaterialPickerSheet
                open={pickerIndex !== null}
                materials={materials}
                onClose={() => setPickerIndex(null)}
                onSelect={(material) => {
                    if (pickerIndex === null) return;
                    const next = rows.map((row, i) => (i === pickerIndex ? { ...row, materialId: material.id } : row));
                    // Tender-table behaviour: filling the last row appends a fresh empty one.
                    if (pickerIndex === rows.length - 1) next.push({ materialId: '', quantity: 1, description: '' });
                    setRows(next);
                }}
            />
        </div>
    );
};
