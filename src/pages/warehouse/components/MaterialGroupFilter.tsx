import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings2 } from 'lucide-react';

import { MacSelectionCheck, MacSelectionFooter } from '@/components/ui-shared/MacSelectionParts';
import { t } from '@/i18n/translate';
import type { WarehouseCatalog } from '@/types/warehouse';

import { includesText } from '../warehouseText';
import { PickerPanel, PickerRow, PickerState, TokenField } from './pickerParts';

/** Die Kennung «ohne Gruppe» — derselbe Wert wie am Server (`none`). */
export const NO_GROUP = 'none';

/**
 * ── MATERIALGRUPPE, MEHRFACH (neben dem Suchfeld) ───────────────────────────
 * «yanında malzeme grubu olmalı, malzeme grubu birden fazla seçilebilmeli».
 * Das Token-Feld der Lieferantenwahl im Werkzeugzeilen-Mass. Seit dem
 * zweiten Durchgang stehen die Gruppen unter ihrer Hauptkategorie (ELK ·
 * Elektrik); ein Klick auf die Kategorie wählt alle ihre Gruppen. «Grupsuz»
 * findet die Karten, deren Gruppe noch leer ist.
 */
export const MaterialGroupFilter = ({
    catalog,
    value,
    onChange,
}: {
    catalog: WarehouseCatalog | null;
    value: string[];
    onChange: (next: string[]) => void;
}) => {
    const navigate = useNavigate();
    const fieldRef = useRef<HTMLDivElement>(null);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [query, setQuery] = useState('');

    const sections = useMemo(() => (catalog?.categories ?? [])
        .map((category) => ({
            category,
            groups: category.groups.filter((group) =>
                includesText(`${category.name} ${category.code} ${group.name} ${group.code ?? ''}`, query)),
        }))
        .filter((section) => section.groups.length > 0), [catalog, query]);

    const byId = useMemo(() => {
        const map = new Map<string, { label: string }>();
        for (const category of catalog?.categories ?? []) {
            for (const group of category.groups) {
                map.set(group.id, { label: group.code ? `${category.code}-${group.code} · ${group.name}` : group.name });
            }
        }
        return map;
    }, [catalog]);

    const tokens = value.map((id) => {
        if (id === NO_GROUP) return { key: id, label: t('warehouse.groups.none') };
        return { key: id, label: byId.get(id)?.label ?? '…' };
    });

    const allIds = [NO_GROUP, ...(catalog?.categories ?? []).flatMap((category) => category.groups.map((group) => group.id))];
    const toggle = (id: string) => onChange(value.includes(id) ? value.filter((entry) => entry !== id) : [...value, id]);
    const toggleMany = (ids: string[]) => {
        const all = ids.every((id) => value.includes(id));
        onChange(all ? value.filter((id) => !ids.includes(id)) : [...new Set([...value, ...ids])]);
    };
    const close = () => { setAnchor(null); setQuery(''); };
    const showNone = includesText(t('warehouse.groups.none'), query);

    return (
        <>
            <TokenField
                ref={fieldRef}
                open={Boolean(anchor)}
                size="toolbar"
                label={t('warehouse.groups.label')}
                placeholder={t('warehouse.groups.all')}
                tokens={tokens}
                maxVisible={2}
                onOpen={() => setAnchor(fieldRef.current)}
                onRemove={(key) => onChange(value.filter((entry) => entry !== key))}
                ariaLabel={t('warehouse.groups.label')}
            />
            <PickerPanel
                anchorEl={anchor}
                onClose={close}
                width={320}
                query={query}
                onQuery={setQuery}
                searchPlaceholder={t('warehouse.groups.search')}
                ariaLabel={t('warehouse.groups.label')}
                footer={(
                    <MacSelectionFooter
                        allSelected={allIds.every((id) => value.includes(id))}
                        onSelectAll={() => onChange(allIds)}
                        onClose={close}
                    />
                )}
            >
                {!catalog && <PickerState><span className="ofi-wh-spinner" /></PickerState>}
                {catalog && showNone && (
                    <PickerRow
                        selected={value.includes(NO_GROUP)}
                        onSelect={() => toggle(NO_GROUP)}
                        main={t('warehouse.groups.none')}
                        hint={catalog.ungroupedCount}
                    />
                )}
                {sections.map(({ category, groups }) => {
                    const ids = groups.map((group) => group.id);
                    const all = ids.every((id) => value.includes(id));
                    const some = !all && ids.some((id) => value.includes(id));
                    return (
                        <div key={category.id} className="ofi-wh-picker__section" role="group" aria-label={category.name}>
                            <button
                                type="button"
                                className="ofi-wh-picker__caption is-button"
                                aria-pressed={all}
                                title={t('warehouse.groups.selectCategory', { name: category.name })}
                                onClick={() => toggleMany(ids)}
                            >
                                <MacSelectionCheck selected={all} />
                                <span className="ofi-wh-abbr">{category.code}</span>
                                <span>{category.name}</span>
                                {some && <em aria-hidden>•</em>}
                            </button>
                            {groups.map((group) => (
                                <PickerRow
                                    key={group.id}
                                    selected={value.includes(group.id)}
                                    onSelect={() => toggle(group.id)}
                                    main={group.name}
                                    sub={group.code ? `${category.code}-${group.code}` : t('warehouse.groups.noCode')}
                                    hint={group.productCount}
                                />
                            ))}
                        </div>
                    );
                })}
                {catalog && !sections.length && query.trim() && <PickerState>{t('warehouse.groups.noMatch')}</PickerState>}
                {catalog && !catalog.categories.some((category) => category.groups.length) && !query.trim() && (
                    <PickerState>
                        <span className="ofi-wh-picker__empty">
                            {t('warehouse.groups.empty')}
                            <button type="button" className="ofi-wh-linkbtn" onClick={() => { close(); navigate('/warehouse/settings'); }}>
                                <Settings2 />
                                {t('warehouse.groups.manage')}
                            </button>
                        </span>
                    </PickerState>
                )}
            </PickerPanel>
        </>
    );
};
