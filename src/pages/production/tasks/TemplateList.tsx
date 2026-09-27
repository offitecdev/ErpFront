import { useMemo, useState } from 'react';
import { ListChecks, Search, TriangleAlert, X } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { TaskTemplateSummary } from '@/types/productionTasks';

import { formatPercent } from './taskModel';

/**
 * Die Vorlagen links — eine Quellliste wie in den Mac-Apps: die gewählte
 * Zeile in Systemblau, jede zweite hellgrau, darunter Aufgabenzahl und die
 * Anteile der Bereiche. Ein oranges Dreieck sagt: die Summen gehen noch
 * nicht auf (so lässt sie sich nicht auf ein Gerät laden).
 */
export const TemplateList = ({
    items,
    loading,
    selectedId,
    draftNew,
    onSelect,
}: {
    items: TaskTemplateSummary[] | null;
    loading: boolean;
    selectedId: string | null;
    /** Eine neue, noch nicht gespeicherte Vorlage steht oben in der Liste. */
    draftNew: { name: string } | null;
    onSelect: (id: string) => void;
}) => {
    const [query, setQuery] = useState('');
    const filtered = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('tr-TR');
        const rows = items ?? [];
        return needle ? rows.filter((row) => row.name.toLocaleLowerCase('tr-TR').includes(needle)) : rows;
    }, [items, query]);

    return (
        <aside className="ofi-ptk-side" aria-label={t('productionTasks.templates.listTitle')}>
            <div className="ofi-ptk-search">
                <Search className="ofi-ptk-search__glass" aria-hidden />
                <input
                    value={query}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('productionTasks.templates.search')}
                    aria-label={t('productionTasks.templates.search')}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Escape' && query) { event.preventDefault(); setQuery(''); } }}
                />
                {query && (
                    <button type="button" className="ofi-ptk-search__clear ofi-nosize" aria-label={t('productionTasks.templates.clearSearch')} onClick={() => setQuery('')}>
                        <X />
                    </button>
                )}
            </div>

            <div className="ofi-ptk-list" role="listbox" aria-label={t('productionTasks.templates.listTitle')}>
                {draftNew && (
                    <button type="button" role="option" aria-selected className="ofi-ptk-listrow is-selected is-new ofi-nosize">
                        <span className="ofi-ptk-listrow__icon"><ListChecks aria-hidden /></span>
                        <span className="ofi-ptk-listrow__text">
                            <b>{draftNew.name.trim() || t('productionTasks.templates.untitled')}</b>
                            <small>{t('productionTasks.templates.notSaved')}</small>
                        </span>
                    </button>
                )}
                {loading && !items && Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="ofi-ptk-listrow is-skeleton" aria-hidden>
                        <span className="ofi-ptk-skel" style={{ width: `${[64, 48, 56][index]}%` }} />
                    </div>
                ))}
                {items && !filtered.length && !draftNew && (
                    <div className="ofi-ptk-state is-small">
                        <ListChecks aria-hidden />
                        <b>{query ? t('productionTasks.templates.noMatch') : t('productionTasks.templates.empty')}</b>
                    </div>
                )}
                {filtered.map((item) => {
                    const selected = !draftNew && item.id === selectedId;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={`ofi-ptk-listrow ofi-nosize ${selected ? 'is-selected' : ''}`}
                            onClick={() => onSelect(item.id)}
                        >
                            <span className="ofi-ptk-listrow__icon"><ListChecks aria-hidden /></span>
                            <span className="ofi-ptk-listrow__text">
                                <b title={item.name}>{item.name}</b>
                                <small>
                                    {t('productionTasks.templates.taskCount', { count: item.taskCount })}
                                    <span className="ofi-ptk-dot" aria-hidden>·</span>
                                    {formatPercent(item.areaShares.MECHANICAL)} / {formatPercent(item.areaShares.ELECTRICAL)}
                                </small>
                            </span>
                            {item.isExample && <span className="ofi-ptk-tag">{t('productionTasks.templates.example')}</span>}
                            {!item.check.valid && (
                                <span className="ofi-ptk-listrow__warn" title={t('productionTasks.check.incompleteHint')}>
                                    <TriangleAlert aria-label={t('productionTasks.check.incomplete')} />
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
            <p className="ofi-ptk-side__hint">{t('productionTasks.templates.sideHint')}</p>
        </aside>
    );
};
