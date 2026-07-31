import { useEffect, useMemo, useState } from 'react';

import { Package, SearchLg } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { ProjectMaterial } from '@/types/project';

import { ReportsSheet } from './ReportsSheet';
import { numberFmt } from '../../../utils/projectFormatters';

const PAGE_SIZE = 60;

/**
 * Product picker for field-report material rows — the tender-detail pattern
 * (search on top, full-width clickable rows), rendered as its own small sheet
 * stacked above the reports popup. Materials are already in memory, so the
 * filter is instant and no request leaves the page.
 */
export const MaterialPickerModal = ({
    open,
    materials,
    onSelect,
    onClose,
}: {
    open: boolean;
    materials: ProjectMaterial[];
    onSelect: (material: ProjectMaterial) => void;
    onClose: () => void;
}) => {
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (open) setSearch('');
    }, [open]);

    const items = useMemo(() => {
        const active = materials.filter((material) => material.isActive !== false);
        const query = search.trim().toLowerCase();
        const matches = query
            ? active.filter((material) =>
                material.name.toLowerCase().includes(query)
                || (material.serialId || '').toLowerCase().includes(query))
            : active;
        return matches.slice(0, PAGE_SIZE);
    }, [materials, search]);

    return (
        <ReportsSheet
            open={open}
            title={t('projects.reportsHub.selectMaterial')}
            onClose={onClose}
            width={620}
            zIndex={90}
        >
            <div className="ofi-rise-in flex min-h-0 flex-1 flex-col gap-3 p-4">
                <label className="flex items-center gap-2 rounded-[2px] border border-slate-300 bg-white px-2.5 py-1.5 focus-within:border-[#1f2654] dark:border-white/20 dark:bg-transparent">
                    <SearchLg size={14} className="shrink-0 text-slate-400" />
                    <input
                        autoFocus
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t('projects.reportsHub.searchMaterial')}
                        className="w-full bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-white"
                    />
                </label>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-[2px] border border-slate-200 bg-white dark:border-white/15 dark:bg-transparent">
                    {items.length === 0 ? (
                        <div className="px-4 py-8 text-center text-[12.5px] text-slate-400">
                            {t('projects.reportsHub.materialNotFound')}
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-white/10">
                            {items.map((material) => (
                                <div
                                    key={material.id}
                                    role="button"
                                    tabIndex={0}
                                    title={material.name}
                                    onClick={() => onSelect(material)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            onSelect(material);
                                        }
                                    }}
                                    className="ofi-option-row group flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors hover:bg-[#1f2654]"
                                >
                                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-[2px] border border-slate-300 bg-white text-slate-400">
                                        <Package size={14} />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-slate-800 transition-colors group-hover:!text-white">
                                        {material.name}
                                    </span>
                                    <span className="shrink-0 text-[11.5px] text-slate-400 transition-colors group-hover:!text-white/70">
                                        {material.serialId || t('auto.kod_yok')} · {t('projects.stok')}: {numberFmt(material.stockQuantity)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </ReportsSheet>
    );
};
