import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { SearchLg, X } from '@/components/icons/antIconCompat';
import type { ProjectMaterial } from '@/types/project';
import { t } from '@/i18n/translate';

/**
 * Tender-picker-style material chooser, rebuilt as a bottom sheet for fast
 * one-tap use: search box on top, big tappable rows (name · article no · stock).
 * Fed from the already-loaded materials catalogue — no extra requests.
 */
export const MaterialPickerSheet = ({
    open,
    materials,
    onClose,
    onSelect,
}: {
    open: boolean;
    materials: ProjectMaterial[];
    onClose: () => void;
    onSelect: (material: ProjectMaterial) => void;
}) => {
    const [search, setSearch] = useState('');

    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        const active = materials.filter((m) => m.isActive !== false);
        if (!query) return active;
        return active.filter((m) => `${m.name} ${m.serialId ?? ''}`.toLowerCase().includes(query));
    }, [materials, search]);

    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[85] flex items-end justify-center px-3">
            <button type="button" aria-label={t('common.close')} onClick={onClose} className="ofi-sheet-backdrop absolute inset-0" />
            <section
                role="dialog"
                aria-modal="true"
                className="ofi-sheet ofi-sheet-up relative flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl"
                style={{ height: 'min(640px, 85vh)' }}
            >
                <header className="space-y-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-[18px] font-extrabold text-slate-900 dark:text-slate-50">{t('montage.materials.pick')}</h2>
                        <button
                            type="button"
                            aria-label={t('common.close')}
                            onClick={onClose}
                            className="grid size-11 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
                        >
                            <X size={22} />
                        </button>
                    </div>
                    <div className="relative">
                        <SearchLg size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            autoFocus
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('montage.materials.searchPlaceholder')}
                            className="h-14 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-[16px] font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-slate-50"
                        />
                    </div>
                </header>
                <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-white/5">
                    {rows.length === 0 && (
                        <div className="px-5 py-8 text-center text-[14.5px] text-slate-500">{t('auto.arama_sonucu_yok')}</div>
                    )}
                    {rows.map((material) => (
                        <button
                            key={material.id}
                            type="button"
                            onClick={() => { onSelect(material); setSearch(''); onClose(); }}
                            className="ofi-option-row flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-white/5"
                        >
                            <div className="min-w-0">
                                <div className="truncate text-[16px] font-bold text-slate-900 dark:text-slate-50">{material.name}</div>
                                {material.serialId && <div className="text-[13px] text-slate-500 dark:text-slate-400">{material.serialId}</div>}
                            </div>
                            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[13px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                                {t('montage.materials.stock')}: {material.stockQuantity ?? 0}
                            </span>
                        </button>
                    ))}
                </div>
            </section>
        </div>,
        document.body,
    );
};
