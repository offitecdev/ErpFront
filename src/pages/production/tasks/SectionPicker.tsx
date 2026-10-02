import { useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';
import { BomCategoryIcon } from '@/pages/production/bom/bomCategories';
import type { BomCategoryOption } from '@/pages/production/bom/bomCategoryOptions';

/**
 * ── «+ BÖLÜM EKLE» AUS DEN KATEGORIEN (02.10.2026) ──────────────────────────
 *
 * «Now we will select the sections in the templates based on the categories.»
 * Ein Bereich der Vorlage IST eine BOM-Kategorie: Mekanik / Elektrik (feste
 * Kennung) oder eine eigene («c-…»). Angeboten wird, was die Vorlage noch nicht
 * hat; neue Kategorien legt die Administratorrolle in den Einstellungen an.
 */
export const SectionPicker = ({
    options,
    usedKeys,
    className,
    canManage,
    onPick,
}: {
    options: BomCategoryOption[];
    usedKeys: readonly string[];
    className: string;
    /** Darf die Kategorien pflegen (Einstellungen) — dann steht der Verweis unten. */
    canManage: boolean;
    onPick: (option: BomCategoryOption) => void;
}) => {
    const navigate = useNavigate();
    const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
    const free = options.filter((option) => !usedKeys.includes(option.area));

    return (
        <>
            <button
                type="button"
                className={`${className} ofi-nosize`}
                aria-haspopup="listbox"
                aria-expanded={Boolean(anchor)}
                onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
            >
                <Plus aria-hidden />
                {t('productionTasks.template.addSection')}
            </button>
            <AnchoredPicker
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                width={280}
                maxHeight={320}
                ariaLabel={t('productionTasks.template.addSection')}
                footer={canManage ? (
                    <button
                        type="button"
                        className="ofi-option-row flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-slate-500 dark:text-white/55"
                        onClick={() => { setAnchor(null); navigate('/production/settings?section=categories'); }}
                    >
                        <Settings2 size={13} aria-hidden />
                        {t('productionTasks.template.manageCategories')}
                    </button>
                ) : undefined}
            >
                <div role="listbox" aria-label={t('productionTasks.template.addSection')} className="min-h-0 flex-1 overflow-y-auto py-1">
                    {free.map((option) => (
                        <button
                            key={option.area}
                            type="button"
                            role="option"
                            aria-selected={false}
                            className="ofi-option-row flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors"
                            onClick={() => { setAnchor(null); onPick(option); }}
                        >
                            <span className="inline-flex size-4 shrink-0 items-center justify-center text-slate-500 dark:text-white/60 [&>svg]:size-3.5">
                                <BomCategoryIcon category={option.category} />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-700 dark:text-white/80">{option.label}</span>
                            <span className="shrink-0 font-mono text-[11px] text-slate-400 dark:text-white/45">{option.code}</span>
                        </button>
                    ))}
                    {!free.length && (
                        <p className="px-3 py-2 text-[12px] text-slate-500 dark:text-white/55">{t('productionTasks.template.noFreeCategory')}</p>
                    )}
                </div>
            </AnchoredPicker>
        </>
    );
};
