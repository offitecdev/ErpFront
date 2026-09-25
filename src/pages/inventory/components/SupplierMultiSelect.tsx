import { useMemo, useState, type KeyboardEvent } from 'react';

import { Plus, SearchLg, X } from '@/components/icons/antIconCompat';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { Spinner } from '@/components/ui-shared/Loader';
import { MacSelectionCheck } from '@/components/ui-shared/MacSelectionParts';
import { t } from '@/i18n/translate';
import { useSupplierSearch } from '../hooks/useSupplierSearch';

/** Seçilen tedarikçi: kayıtlı olan kimliğiyle, formda yeni yazılan yalnızca adıyla. */
export interface SupplierPick {
    supplierId: string | null;
    name: string;
}

const nameKey = (value: string) => value.trim().toLocaleLowerCase('tr');
const pickKey = (pick: SupplierPick) => pick.supplierId ?? `new:${nameKey(pick.name)}`;

/**
 * TEDARİKÇİLER — birden fazla seçilir (Samet, 23.09.2026).
 *
 * Alan bir macOS belirteç alanıdır (NSTokenField): seçilenler mavi kapsül,
 * her birinin kendi çarpısı var. Tıklayınca modalls.png'deki macOS popover'ı
 * açılır — arama hapı, onay kutulu çizgili liste, altta "Tamam". Seçilenler
 * listenin başında durur (arama ilk 10 kaydı getirir, seçilen dışarıda
 * kalmasın); aranan ad hiçbir kayda uymuyorsa yeni tedarikçi olarak eklenir
 * ve kaydederken oluşturulur. İlk seçilen, tercih edilen tedarikçidir.
 *
 * `single` (Samet, 24.09.2026): ürünün TEK tedarikçisi olur — seçim eskisinin
 * yerine geçer ve popover kapanır.
 */
export const SupplierMultiSelect = ({ value, onChange, invalid = false, ariaLabel, lockedIds, disabled = false, id, single = false }: {
    value: SupplierPick[];
    onChange: (next: SupplierPick[]) => void;
    /** Zorunlu olup boş bırakıldı — kırmızı halka. */
    invalid?: boolean;
    ariaLabel: string;
    /** Alım geçmişi olan tedarikçiler (ürün detayı): çarpısız, listeden de çıkmaz. */
    lockedIds?: ReadonlySet<string>;
    disabled?: boolean;
    /** Açma düğmesinin kimliği — uyarıdan odaklanabilmek için. */
    id?: string;
    /** Yalnızca bir tedarikçi seçilebilir. */
    single?: boolean;
}) => {
    const isLocked = (pick: SupplierPick) => Boolean(pick.supplierId && lockedIds?.has(pick.supplierId));
    const [fieldEl, setFieldEl] = useState<HTMLDivElement | null>(null);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const open = Boolean(anchorEl);
    const { items, loading, query, setQuery } = useSupplierSearch(open);

    const selectedKeys = useMemo(() => new Set(value.map(pickKey)), [value]);
    const typed = query.trim();
    const rows = useMemo(() => {
        const needle = nameKey(typed);
        const chosen = value
            .filter((pick) => !needle || nameKey(pick.name).includes(needle))
            .map((pick) => ({ ...pick, hint: '' }));
        const found = items
            .filter((item) => !selectedKeys.has(item.id))
            .map((item) => ({ supplierId: item.id, name: item.companyName, hint: item.contactName ?? '' }));
        return [...chosen, ...found];
    }, [items, selectedKeys, typed, value]);
    const exactMatch = typed
        ? items.find((item) => nameKey(item.companyName) === nameKey(typed))
        : undefined;
    const canAddTyped = Boolean(typed)
        && !exactMatch
        && !value.some((pick) => nameKey(pick.name) === nameKey(typed));

    const openPicker = () => { if (fieldEl && !disabled) setAnchorEl(fieldEl); };
    const closePicker = () => {
        setAnchorEl(null);
        setQuery('');
    };
    const toggle = (pick: SupplierPick) => {
        const key = pickKey(pick);
        if (selectedKeys.has(key)) {
            if (isLocked(pick)) return;
            onChange(value.filter((entry) => pickKey(entry) !== key));
            return;
        }
        const next = { supplierId: pick.supplierId, name: pick.name };
        if (single) {
            onChange([next]);
            closePicker();
            return;
        }
        onChange([...value, next]);
    };
    const addTyped = () => {
        if (!canAddTyped) return;
        if (single) {
            onChange([{ supplierId: null, name: typed }]);
            closePicker();
            return;
        }
        onChange([...value, { supplierId: null, name: typed }]);
        setQuery('');
    };

    // Enter: aranan ad birebir bir kayıtsa onu, hiçbirine uymuyorsa yeni adı,
    // tek sonuç kaldıysa onu seçer.
    const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (exactMatch) {
            if (!selectedKeys.has(exactMatch.id)) toggle({ supplierId: exactMatch.id, name: exactMatch.companyName });
            setQuery('');
        } else if (canAddTyped) {
            addTyped();
        } else if (rows.length === 1) {
            toggle(rows[0]);
        }
    };

    return (
        <>
            <div
                ref={setFieldEl}
                className={`ofi-sup-field${open ? ' is-open' : ''}${invalid ? ' is-invalid' : ''}`}
                // Fare için bütün alan açar; klavye için sondaki düğme var.
                onClick={(event) => {
                    if ((event.target as HTMLElement).closest('button')) return;
                    openPicker();
                }}
            >
                {value.length === 0 && (
                    <span className="ofi-sup-placeholder">{t('inv.newProduct.supplierPick')}</span>
                )}
                {value.map((pick) => {
                    const locked = isLocked(pick);
                    return (
                        <span
                            key={pickKey(pick)}
                            className={`ofi-sup-token${locked ? ' is-locked' : ''}`}
                            title={locked ? `${pick.name} — ${t('inv.newProduct.supplierLocked')}` : pick.name}
                        >
                            <span>{pick.name}</span>
                            {!pick.supplierId && <em>{t('inv.newProduct.supplierNew')}</em>}
                            {!locked && !disabled && (
                                <button
                                    type="button"
                                    aria-label={t('inv.newProduct.supplierRemove', { name: pick.name })}
                                    onClick={() => onChange(value.filter((entry) => pickKey(entry) !== pickKey(pick)))}
                                >
                                    <X size={11} />
                                </button>
                            )}
                        </span>
                    );
                })}
                {/* Tek seçimde tedarikçi seçildiyse ikinci bir "+" yok; alana
                    tıklamak seçimi değiştirir. */}
                {!disabled && !(single && value.length > 0) && (
                    <button
                        id={id}
                        type="button"
                        className="ofi-sup-open"
                        aria-label={ariaLabel}
                        title={t('inv.newProduct.supplierPick')}
                        aria-haspopup="dialog"
                        aria-expanded={open}
                        onClick={openPicker}
                    >
                        <Plus size={13} />
                    </button>
                )}
            </div>

            <AnchoredPicker
                anchorEl={anchorEl}
                onClose={closePicker}
                width={300}
                maxHeight={320}
                arrow
                exactWidth
                panelClassName="ofi-gv-picker ofi-mac-selection ofi-sup-picker"
                ariaLabel={ariaLabel}
                footer={(
                    <div className="ofi-mac-selection__footer">
                        <button type="button" onClick={closePicker}>{t('common.done')}</button>
                    </div>
                )}
            >
                <div className="ofi-gv-picker__search">
                    <SearchLg size={15} aria-hidden />
                    <input
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={onSearchKeyDown}
                        placeholder={t('inv.supplierPicker.searchPlaceholder')}
                        aria-label={t('inv.supplierPicker.searchPlaceholder')}
                        className="ofi-cal-input w-full"
                    />
                </div>
                <div
                    className="ofi-gv-picker__list min-h-0 flex-1 overflow-y-auto"
                    role="listbox"
                    aria-multiselectable={!single}
                    aria-label={ariaLabel}
                >
                    {rows.map((row) => {
                        const selected = selectedKeys.has(pickKey(row));
                        const locked = selected && isLocked(row);
                        return (
                            <button
                                key={pickKey(row)}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                aria-disabled={locked || undefined}
                                title={locked ? t('inv.newProduct.supplierLocked') : undefined}
                                className={`ofi-gv-picker__row${locked ? ' is-locked' : ''}`}
                                onClick={() => toggle(row)}
                            >
                                <MacSelectionCheck selected={selected} />
                                <span className="ofi-gv-picker__name">{row.name}</span>
                                {!row.supplierId
                                    ? <span className="ofi-gv-picker__hint">{t('inv.newProduct.supplierNew')}</span>
                                    : locked
                                        ? <span className="ofi-gv-picker__hint">{t('inv.newProduct.supplierLocked')}</span>
                                        : row.hint && <span className="ofi-gv-picker__hint">{row.hint}</span>}
                            </button>
                        );
                    })}
                    {canAddTyped && (
                        <button type="button" className="ofi-gv-picker__row ofi-sup-picker__new" onClick={addTyped}>
                            <span className="ofi-sup-picker__plus" aria-hidden><Plus size={12} /></span>
                            <span className="ofi-gv-picker__name">{t('inv.newProduct.supplierAdd', { name: typed })}</span>
                        </button>
                    )}
                    {!rows.length && !canAddTyped && (
                        <div className="ofi-sup-picker__state">
                            {loading ? <Spinner size="sm" /> : t('inv.supplierPicker.empty')}
                        </div>
                    )}
                </div>
            </AnchoredPicker>
        </>
    );
};
