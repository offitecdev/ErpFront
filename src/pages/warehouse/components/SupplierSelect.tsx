import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { t } from '@/i18n/translate';
import { warehouseApi } from '@/lib/api/warehouse';
import type { WarehouseSupplierOption } from '@/types/warehouse';
import { readQuery } from '@/lib/api/queryCache';
import '@/styles/modules/warehouse.css';

import { sameText } from '../warehouseText';
import { PickerCreateRow, PickerPanel, PickerRow, PickerState, TokenField } from './pickerParts';

export interface SupplierValue {
    id: string | null;
    name: string;
    /** Aus der Lieferantenliste (nur als Vorschlag für die E-Mail der Zeile). */
    email?: string | null;
}

/**
 * ── DER LIEFERANT DER KARTE — GENAU EINER ───────────────────────────────────
 * «Ürün detayında tek bir tedarikçi olmak zorundadır.» Dieselbe Form wie im
 * Lager (SupplierMultiSelect, `single`): eine Kapsel, ein Klick ändert. Die
 * Liste ist die Lieferantenliste der Firma (nur gelesen) plus Namen, die
 * schon auf einer Karte frei geschrieben stehen; ein neuer Name wird einfach
 * verwendet — das Depo legt im Lager keinen Lieferanten an.
 */
export const SupplierSelect = ({
    value,
    onChange,
    disabled,
    invalid,
    taken = [],
}: {
    value: SupplierValue | null;
    onChange: (next: SupplierValue | null) => void;
    disabled?: boolean;
    invalid?: boolean;
    /** Schon in anderen Zeilen der Karte — erscheinen nicht in der Liste. */
    taken?: SupplierValue[];
}) => {
    const fieldRef = useRef<HTMLDivElement>(null);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<WarehouseSupplierOption[] | null>(null);
    const open = Boolean(anchor);

    // Nur solange die Auswahl offen ist, entprellt.
    useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        let unsubscribe: (() => void) | undefined;
        const timer = window.setTimeout(() => {
            unsubscribe = readQuery(`warehouse:suppliers:${query.trim()}`, () => warehouseApi.suppliers(query), { freshMs: 30_000, tags: ['warehouse', 'catalog'] },
                (result) => { if (alive) setItems(result); },
                () => { if (alive) setItems([]); });
        }, query ? 220 : 0);
        return () => { alive = false; unsubscribe?.(); window.clearTimeout(timer); };
    }, [open, query]);

    const typed = query.trim();
    const isTaken = (item: SupplierValue) => taken.some((other) => (other.id && item.id ? other.id === item.id : sameText(other.name, item.name)));
    const shown = items === null ? null : items.filter((item) => !isTaken(item));
    const exact = [...(items ?? []), ...taken].some((item) => sameText(item.name, typed));
    const close = () => { setAnchor(null); setQuery(''); };
    const pick = (next: SupplierValue | null) => { onChange(next); close(); };

    const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const match = (shown ?? []).find((item) => sameText(item.name, typed));
        if (match) pick(match);
        else if (typed) pick({ id: null, name: typed });
        else if (shown?.length === 1 && shown[0]) pick(shown[0]);
    };

    return (
        <div className="ofi-wh ofi-wh-supplier-field">
            <TokenField
                ref={fieldRef}
                open={open}
                size="field"
                placeholder={t('warehouse.supplier.pick')}
                tokens={value ? [{ key: value.id ?? `name:${value.name}`, label: value.name }] : []}
                onOpen={() => setAnchor(fieldRef.current)}
                onRemove={() => onChange(null)}
                disabled={disabled}
                invalid={invalid}
                single
                ariaLabel={value ? t('warehouse.supplier.change') : t('warehouse.supplier.pick')}
            />
            <PickerPanel
                anchorEl={anchor}
                onClose={close}
                width={320}
                query={query}
                onQuery={setQuery}
                onSearchKeyDown={onSearchKeyDown}
                searchPlaceholder={t('warehouse.supplier.search')}
                ariaLabel={t('warehouse.fields.supplierName')}
            >
                {shown === null && <PickerState><span className="ofi-wh-spinner" /></PickerState>}
                {shown !== null && !shown.length && !typed && <PickerState>{t('warehouse.supplier.empty')}</PickerState>}
                {(shown ?? []).map((item) => (
                    <PickerRow
                        key={item.id ?? `name:${item.name}`}
                        selected={Boolean(value) && (item.id ? item.id === value?.id : !value?.id && sameText(item.name, value?.name))}
                        onSelect={() => pick(item)}
                        main={item.name}
                        sub={item.id ? undefined : t('warehouse.supplier.typed')}
                    />
                ))}
                {typed && !exact && (
                    <PickerCreateRow label={t('warehouse.supplier.use', { name: typed })} onCreate={() => pick({ id: null, name: typed })} />
                )}
            </PickerPanel>
        </div>
    );
};
