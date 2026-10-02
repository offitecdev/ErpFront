import { t } from '@/i18n/translate';
import {
    BUILT_IN_CATEGORY_CODE,
    isCustomBomCategory,
    type BomArea,
    type BomCategory,
    type BomCustomCategory,
    type BomSettings,
} from '@/types/productionBom';

/**
 * ── BOM-KATEGORIEN (02.10.2026) ─────────────────────────────────────────────
 *
 * «Add category button to create categories like Mechanical and Electric …
 *  for mechanical MEK-00001, for electric ELK-00001 — add them automatically;
 *  for other categories we will define them.» Die festen zwei gibt es immer;
 * eigene haben einen Namen und einen Kod (HYD → BOM-HYD-00001) und darunter
 * ihre Alt-BOM-Kodes in den Einstellungen.
 */

export interface BomCategoryOption {
    category: BomCategory;
    area: BomArea;
    /** MEK / ELK / der eigene Kod. */
    code: string;
    label: string;
    custom: BomCustomCategory | null;
}

/** Erst die festen, dann die eigenen in ihrer Reihenfolge. */
export const bomCategoryOptions = (settings: Pick<BomSettings, 'categories'> | null): BomCategoryOption[] => [
    { category: 'MACHINE', area: 'MECHANICAL', code: BUILT_IN_CATEGORY_CODE.MECHANICAL, label: t('productionBom.category.MACHINE'), custom: null },
    { category: 'ELECTRICAL', area: 'ELECTRICAL', code: BUILT_IN_CATEGORY_CODE.ELECTRICAL, label: t('productionBom.category.ELECTRICAL'), custom: null },
    ...(settings?.categories ?? []).map((entry): BomCategoryOption => ({
        category: entry.id,
        area: entry.id,
        code: entry.code,
        label: entry.name,
        custom: entry,
    })),
];

/** Der Name einer Kategorie; eine unbekannte eigene (gelöscht, älterer Stand) zeigt ihre Kennung. */
export const bomCategoryLabel = (category: BomCategory, settings: Pick<BomSettings, 'categories'> | null): string => {
    if (!isCustomBomCategory(category)) return t(`productionBom.category.${category}`);
    return settings?.categories?.find((entry) => entry.id === category)?.name ?? category;
};
