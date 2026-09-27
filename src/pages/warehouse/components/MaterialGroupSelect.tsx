import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings2 } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { WarehouseCatalog, WarehouseGroupRef } from '@/types/warehouse';

import { includesText } from '../warehouseText';
import { PickerPanel, PickerRow, PickerState, TokenField } from './pickerParts';

/**
 * ── MATERIALGRUPPE DER KARTE (einfach) ──────────────────────────────────────
 * Anfangs leer (Vorgabe). Die Gruppen stehen unter ihrer Hauptkategorie;
 * angelegt werden sie seit dem zweiten Durchgang nur noch unter Depo ›
 * Ayarlar › Malzeme grupları («teker teker, kısaltmasıyla») — der Weg dorthin
 * steht am Fuss der Auswahl. Eine Gruppe ohne Kürzel (Altbestand) vergibt
 * keinen ERP-Code; sie ist darum nicht wählbar.
 */
export const MaterialGroupSelect = ({
    value,
    catalog,
    onChange,
    disabled,
    invalid,
}: {
    value: WarehouseGroupRef | null;
    catalog: WarehouseCatalog | null;
    onChange: (next: WarehouseGroupRef | null) => void;
    disabled?: boolean;
    invalid?: boolean;
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

    const close = () => { setAnchor(null); setQuery(''); };
    const pick = (next: WarehouseGroupRef | null) => { onChange(next); close(); };
    const flat = sections.flatMap(({ category, groups }) => groups
        .filter((group) => group.code)
        .map((group) => ({ id: group.id, name: group.name, code: group.code, category: { id: category.id, name: category.name, code: category.code } })));

    const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (flat.length === 1 && flat[0]) pick(flat[0]);
    };

    const token = value
        ? [{
            key: value.id,
            label: value.code && value.category?.code ? `${value.category.code}-${value.code} · ${value.name}` : value.name,
        }]
        : [];

    return (
        <>
            <TokenField
                ref={fieldRef}
                open={Boolean(anchor)}
                size="field"
                placeholder={t('warehouse.groups.pick')}
                tokens={token}
                onOpen={() => setAnchor(fieldRef.current)}
                onRemove={() => onChange(null)}
                disabled={disabled}
                invalid={invalid}
                single
                ariaLabel={t('warehouse.fields.materialGroup')}
            />
            <PickerPanel
                anchorEl={anchor}
                onClose={close}
                width={340}
                query={query}
                onQuery={setQuery}
                onSearchKeyDown={onSearchKeyDown}
                searchPlaceholder={t('warehouse.groups.search')}
                ariaLabel={t('warehouse.fields.materialGroup')}
                footer={(
                    <div className="ofi-wh-picker__foot">
                        <button type="button" className="ofi-wh-linkbtn" onClick={() => { close(); navigate('/warehouse/settings'); }}>
                            <Settings2 />
                            {t('warehouse.groups.manage')}
                        </button>
                    </div>
                )}
            >
                {!catalog && <PickerState><span className="ofi-wh-spinner" /></PickerState>}
                {value && (
                    <PickerRow selected={false} check={false} onSelect={() => pick(null)} main={t('warehouse.groups.clear')} />
                )}
                {sections.map(({ category, groups }) => (
                    <div key={category.id} className="ofi-wh-picker__section" role="group" aria-label={category.name}>
                        <div className="ofi-wh-picker__caption">
                            <span className="ofi-wh-abbr">{category.code}</span>
                            <span>{category.name}</span>
                        </div>
                        {groups.map((group) => (
                            <PickerRow
                                key={group.id}
                                selected={group.id === value?.id}
                                disabled={!group.code}
                                onSelect={() => pick({
                                    id: group.id,
                                    name: group.name,
                                    code: group.code,
                                    category: { id: category.id, name: category.name, code: category.code },
                                })}
                                main={group.name}
                                sub={group.code ? group.nextCode ?? `${category.code}-${group.code}` : t('warehouse.groups.noCode')}
                                hint={t('warehouse.groups.cards', { count: group.productCount })}
                            />
                        ))}
                    </div>
                ))}
                {catalog && !sections.length && (
                    <PickerState>{query.trim() ? t('warehouse.groups.noMatch') : t('warehouse.groups.empty')}</PickerState>
                )}
            </PickerPanel>
        </>
    );
};
