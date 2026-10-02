import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, X } from 'lucide-react';

import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { t } from '@/i18n/translate';
import type { BomCategory, BomCustomCategory, BomTemplateSummary } from '@/types/productionBom';

import { BomCategoryIcon } from '../bomCategories';
import type { BomCategoryOption } from '../bomCategoryOptions';

type Filter = 'ALL' | BomCategory;

/**
 * ── DIE QUELLLISTE DER VORLAGEN (links, wie im Finder) ──────────────────────
 * Oben die Kategorie (Tümü · Makine · Elektrik · eigene) und die Suche,
 * darunter die Vorlagen, nach ihrer Ana kart gruppiert (CHILLER ▸ vier
 * Vorlagen). Die gewählte Zeile ist blau. Wer die Einstellungen ändern darf,
 * legt hier auch eine Kategorie an (02.10.2026) — eine eigene gewählt, lässt
 * sie sich über den Stift umbenennen oder löschen.
 */
export const BomTemplateList = ({
    items,
    loading,
    selectedId,
    draftNew,
    canEdit,
    categories,
    onSelect,
    onNew,
    onNewCategory,
    onEditCategory,
}: {
    items: BomTemplateSummary[] | null;
    loading: boolean;
    selectedId: string | null;
    draftNew: { name: string; category: BomCategory } | null;
    canEdit: boolean;
    categories: BomCategoryOption[];
    onSelect: (id: string) => void;
    onNew: () => void;
    /** Nur für die Administratorrolle (Einstellungen). */
    onNewCategory?: () => void;
    onEditCategory?: (category: BomCustomCategory) => void;
}) => {
    const [rawFilter, setFilter] = useState<Filter>('ALL');
    // Eine gelöschte Kategorie fällt auf «Tümü» zurück.
    const filter: Filter = rawFilter === 'ALL' || categories.some((entry) => entry.category === rawFilter) ? rawFilter : 'ALL';
    const editable = categories.find((entry) => entry.category === filter)?.custom ?? null;
    const [query, setQuery] = useState('');

    const groups = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('tr-TR');
        const shown = (items ?? []).filter((item) =>
            (filter === 'ALL' || item.category === filter)
            && (!needle || `${item.name} ${item.mainCard} ${item.codePrefix}`.toLocaleLowerCase('tr-TR').includes(needle)));
        const byCard = new Map<string, BomTemplateSummary[]>();
        for (const item of shown) byCard.set(item.mainCard, [...(byCard.get(item.mainCard) ?? []), item]);
        return [...byCard.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [items, filter, query]);

    const filters: Array<{ key: Filter; label: string }> = [
        { key: 'ALL', label: t('productionBom.templates.allCategories') },
        ...categories.map((entry) => ({ key: entry.category, label: entry.label })),
    ];
    return (
        <aside className="ofi-bom-side">
            <div className="ofi-bom-catbar">
                {/* Eine Auswahlliste statt der Knöpfe (02.10.2026). */}
                <SelectMenu
                    className="ofi-bom-catbar__select"
                    value={filter}
                    ariaLabel={t('productionBom.editor.category')}
                    options={filters.map(({ key, label }) => ({ value: key, label }))}
                    onChange={(next) => setFilter(next as Filter)}
                />
                {editable && onEditCategory && (
                    <button
                        type="button"
                        className="ofi-bom-iconbtn ofi-nosize"
                        title={t('productionBom.categories.edit', { name: editable.name })}
                        aria-label={t('productionBom.categories.edit', { name: editable.name })}
                        onClick={() => onEditCategory(editable)}
                    >
                        <Pencil />
                    </button>
                )}
                {onNewCategory && (
                    <button
                        type="button"
                        className="ofi-bom-iconbtn ofi-nosize"
                        title={t('productionBom.categories.add')}
                        aria-label={t('productionBom.categories.add')}
                        onClick={onNewCategory}
                    >
                        <Plus />
                    </button>
                )}
            </div>
            <div className="ofi-bom-search__field is-side">
                <Search className="ofi-bom-search__glass" aria-hidden />
                <input
                    value={query}
                    placeholder={t('productionBom.templates.searchPlaceholder')}
                    aria-label={t('productionBom.templates.searchPlaceholder')}
                    onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                    <button type="button" className="ofi-bom-search__clear ofi-nosize" aria-label={t('productionBom.common.clear')} onClick={() => setQuery('')}>
                        <X />
                    </button>
                )}
            </div>

            <div className="ofi-bom-source" role="listbox" aria-label={t('productionBom.templates.title')}>
                {loading && [0, 1, 2].map((index) => (
                    <div key={index} className="ofi-bom-source__row is-skeleton"><span className="ofi-bom-skel" style={{ width: `${60 + index * 12}%` }} /></div>
                ))}
                {draftNew && (
                    <button type="button" role="option" aria-selected className="ofi-bom-source__row is-selected is-new ofi-nosize">
                        <span className="ofi-bom-source__icon"><BomCategoryIcon category={draftNew.category} /></span>
                        <span className="ofi-bom-source__text">
                            <b>{draftNew.name.trim() || t('productionBom.templates.untitled')}</b>
                            <small>{t('productionBom.templates.new')}</small>
                        </span>
                    </button>
                )}
                {!loading && groups.map(([mainCard, templates]) => (
                    <div key={mainCard} className="ofi-bom-source__group" role="group" aria-label={mainCard}>
                        <div className="ofi-bom-source__caption">{mainCard}</div>
                        {templates.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                role="option"
                                aria-selected={item.id === selectedId && !draftNew}
                                className={`ofi-bom-source__row ofi-nosize${item.id === selectedId && !draftNew ? ' is-selected' : ''}`}
                                onClick={() => onSelect(item.id)}
                            >
                                <span className={`ofi-bom-source__icon is-${item.category.startsWith('c-') ? 'custom' : item.category.toLowerCase()}`}>
                                    <BomCategoryIcon category={item.category} />
                                </span>
                                <span className="ofi-bom-source__text">
                                    <b>{item.name}</b>
                                    <small>
                                        {t('productionBom.templates.lines', { count: item.lineCount })}
                                        {item.usedBy > 0 && (
                                            <>
                                                <span className="ofi-bom-dot">·</span>
                                                {t('productionBom.templates.usedBy', { count: item.usedBy })}
                                            </>
                                        )}
                                    </small>
                                </span>
                                {item.isExample && <span className="ofi-bom-tag">{t('productionBom.templates.example')}</span>}
                            </button>
                        ))}
                    </div>
                ))}
                {!loading && items && items.length > 0 && !groups.length && (
                    <p className="ofi-bom-source__empty">{t('productionBom.templates.noMatch')}</p>
                )}
            </div>
            {canEdit && (
                <button type="button" className="ofi-bom-btn is-quiet ofi-nosize ofi-bom-side__new" onClick={onNew}>
                    <Plus />
                    {t('productionBom.templates.new')}
                </button>
            )}
        </aside>
    );
};
