import { useMemo, useState } from 'react';
import { Columns02, XClose } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { DateField } from '@/components/ui-shared/DateField';
import { t } from '@/i18n/translate';
import type { MovementKind, MovementOrigin } from '@/types/inventory';
import { ColResizeHandle, FilterBar, Pager, ResizableCols, SearchBox, SectionCard, TableStateRow, ToggleGroup } from './components/primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { useLanguageTick } from './hooks/useLanguageTick';
import { MOVEMENTS_PAGE_SIZE, useMovementsList, type QuickRange } from './hooks/useMovementsList';
import { fmtDateTime, fmtQty } from './utils/format';

/**
 * LAGERBEWEGUNGEN (10.09.2026) — stärker kategorisiert, mit Zeitraum, im
 * Apple-Lager-Kleid (Haarlinien, Segmente, 28px-Felder, keine Pillen).
 *
 *   · Zeitraum «Von – Bis» mit Kalender-Popover (DateField) und der
 *     Schnellwahl Heute / Diese Woche / Dieser Monat / Dieses Jahr / Gesamt.
 *   · TYP als Segment: Alle, Zugang, Abgang, Umbuchung, Rücknahme, Korrektur.
 *   · HERKUNFT als Segment: Alle, Schnellerfassung, Wareneingang Bestellung,
 *     Rapport/Projekt, manuell.
 *   · Spalten: Datum/Zeit, Typ, Herkunft, ERP-Code, Bezeichnung, Modell,
 *     Seriennummer, Barcode, Menge, Lager, Mitarbeiter, Beschreibung —
 *     Barcode und Seriennummer sind in der Spaltenwahl abwählbar.
 *   · EIN Suchfeld über ERP-Code, Bezeichnung, Modell, Serie und Barcode.
 *
 * Die Typmarken sind `span.rounded-full`: lagerApple.css macht daraus
 * umrandete Abzeichen ohne Tönung; die Segmente sind `ToggleGroup`s, die dort
 * als Mac-Segment gezeichnet werden. Die Definition (Zugang mit Menge 0)
 * bleibt als eigene Marke sichtbar, ist aber kein Filterreiter.
 */

const KIND_META: Record<string, { labelKey: string; className: string }> = {
    IN: { labelKey: 'inv.movement.in', className: 'text-emerald-700 dark:text-emerald-300' },
    OUT: { labelKey: 'inv.movement.out', className: 'text-red-600 dark:text-red-300' },
    DEFINITION: { labelKey: 'inv.movement.definition', className: 'text-slate-600 dark:text-white/70' },
    TRANSFER: { labelKey: 'inv.movement.transfer', className: 'text-sky-700 dark:text-sky-300' },
    RETURN: { labelKey: 'inv.movement.return', className: 'text-amber-700 dark:text-amber-300' },
    ADJUSTMENT: { labelKey: 'inv.movement.adjustment', className: 'text-violet-700 dark:text-violet-300' },
};

const ORIGIN_LABEL: Record<MovementOrigin, string> = {
    QUICK_ADD: 'inv.origin.quickAdd',
    QUICK_DELETE: 'inv.origin.quickDelete',
    ORDER_RECEIPT: 'inv.origin.orderReceipt',
    REPORT: 'inv.origin.report',
    MANUAL: 'inv.origin.manual',
};

type TypeFilter = MovementKind | '';
const TYPE_OPTIONS: Array<{ key: TypeFilter; labelKey: string }> = [
    { key: '', labelKey: 'inv.movements.allTypes' },
    { key: 'IN', labelKey: 'inv.movement.in' },
    { key: 'OUT', labelKey: 'inv.movement.out' },
    { key: 'TRANSFER', labelKey: 'inv.movement.transfer' },
    { key: 'RETURN', labelKey: 'inv.movement.return' },
    { key: 'ADJUSTMENT', labelKey: 'inv.movement.adjustment' },
];
type OriginFilter = MovementOrigin | '';
const ORIGIN_OPTIONS: Array<{ key: OriginFilter; labelKey: string }> = [
    { key: '', labelKey: 'inv.movements.allTypes' },
    { key: 'QUICK_ADD', labelKey: 'inv.origin.quickAdd' },
    { key: 'ORDER_RECEIPT', labelKey: 'inv.origin.orderReceipt' },
    { key: 'REPORT', labelKey: 'inv.origin.report' },
    { key: 'MANUAL', labelKey: 'inv.origin.manual' },
];
const RANGE_OPTIONS: Array<{ key: QuickRange | 'custom'; labelKey: string }> = [
    { key: 'today', labelKey: 'inv.movements.quickToday' },
    { key: 'week', labelKey: 'inv.movements.quickWeek' },
    { key: 'month', labelKey: 'inv.movements.quickMonth' },
    { key: 'year', labelKey: 'inv.movements.quickYear' },
    { key: 'all', labelKey: 'inv.movements.quickAll' },
];

// Sürüklenebilir sütun genişlikleri. Bezeichnung hat KEINE Breite: sie ist
// die einzige Spalte ohne Mass und nimmt den Rest.
const MOVEMENT_COLUMN_WIDTHS = {
    date: 138,
    kind: 104,
    origin: 150,
    code: 138,
    model: 120,
    serial: 130,
    barcode: 130,
    quantity: 84,
    location: 110,
    employee: 130,
    description: 220,
};
type MovementColumn = keyof typeof MOVEMENT_COLUMN_WIDTHS;

/** Abwählbare Spalten (Spaltenwahl) — der Rest steht immer. */
type OptionalColumn = 'model' | 'serial' | 'barcode' | 'location' | 'employee';
const OPTIONAL_COLUMNS: Array<{ key: OptionalColumn; labelKey: string }> = [
    { key: 'model', labelKey: 'inv.columns.modelNumber' },
    { key: 'serial', labelKey: 'inv.columns.serialNumber' },
    { key: 'barcode', labelKey: 'inv.columns.barcode' },
    { key: 'location', labelKey: 'inv.columns.location' },
    { key: 'employee', labelKey: 'inv.columns.employee' },
];
const COLUMNS_STORAGE = 'offitec:inv-movements:columns:v1';
const readHidden = (): Set<OptionalColumn> => {
    try {
        const parsed = JSON.parse(localStorage.getItem(COLUMNS_STORAGE) || '[]');
        return new Set(Array.isArray(parsed) ? parsed.filter((key): key is OptionalColumn => OPTIONAL_COLUMNS.some((column) => column.key === key)) : []);
    } catch {
        return new Set();
    }
};

export const StockMovementsPage = () => {
    useLanguageTick();
    const list = useMovementsList();
    const grid = useColumnWidths<MovementColumn>({
        storageKey: 'offitec:inv-movements:col-widths:v2',
        defaults: MOVEMENT_COLUMN_WIDTHS,
        minPx: 64,
    });

    const [hidden, setHidden] = useState<Set<OptionalColumn>>(readHidden);
    const [columnsAnchor, setColumnsAnchor] = useState<HTMLButtonElement | null>(null);
    const [columnsOpen, setColumnsOpen] = useState(false);
    const toggleColumn = (key: OptionalColumn) => setHidden((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        try { localStorage.setItem(COLUMNS_STORAGE, JSON.stringify([...next])); } catch { /* privater Modus */ }
        return next;
    });
    const show = (key: OptionalColumn) => !hidden.has(key);

    const visibleKeys = useMemo(
        () => (['origin', 'code'] as MovementColumn[])
            .concat((['model', 'serial', 'barcode'] as OptionalColumn[]).filter(show) as MovementColumn[])
            .concat(['quantity'] as MovementColumn[])
            .concat((['location', 'employee'] as OptionalColumn[]).filter(show) as MovementColumn[])
            .concat(['description'] as MovementColumn[]),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hidden],
    );
    const columnCount = 3 + visibleKeys.length;

    const rangeValue: QuickRange | 'custom' = list.quickRange ?? 'custom';
    const hasRange = Boolean(list.dateFrom || list.dateTo);

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader title={t('inv.movements.title')} />

            <FilterBar
                end={(
                    <button
                        ref={setColumnsAnchor}
                        type="button"
                        aria-expanded={columnsOpen}
                        onClick={() => setColumnsOpen((open) => !open)}
                        className="ofi-mv-columns flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-600 dark:border-white/20 dark:text-white/70"
                    >
                        <Columns02 size={13} aria-hidden />
                        {t('inv.movements.columnsButton')}
                    </button>
                )}
            >
                <SearchBox
                    value={list.search}
                    onChange={list.setSearch}
                    placeholder={t('inv.movements.searchPlaceholder')}
                />
                {/* Zeitraum: zwei Kalenderfelder und die Schnellwahl daneben. */}
                <div className="ofi-mv-range" role="group" aria-label={t('inv.movements.rangeLabel')}>
                    <DateField
                        value={list.dateFrom}
                        onChange={list.setDateFrom}
                        max={list.dateTo || undefined}
                        ariaLabel={t('inv.movements.dateFrom')}
                        placeholder={t('inv.movements.dateFrom')}
                        buttonClassName="ofi-mv-date"
                        className="ofi-mv-range__field"
                    />
                    <span className="ofi-mv-range__dash" aria-hidden>–</span>
                    <DateField
                        value={list.dateTo}
                        onChange={list.setDateTo}
                        min={list.dateFrom || undefined}
                        ariaLabel={t('inv.movements.dateTo')}
                        placeholder={t('inv.movements.dateTo')}
                        buttonClassName="ofi-mv-date"
                        className="ofi-mv-range__field"
                    />
                    {hasRange && (
                        <button
                            type="button"
                            aria-label={t('inv.movements.clearRange')}
                            title={t('inv.movements.clearRange')}
                            onClick={() => { list.setDateFrom(''); list.setDateTo(''); }}
                            className="ofi-mv-range__clear ofi-nosize"
                        >
                            <XClose size={14} />
                        </button>
                    )}
                </div>
                <ToggleGroup<QuickRange | 'custom'>
                    options={RANGE_OPTIONS.map((option) => ({ key: option.key, label: t(option.labelKey) }))}
                    value={rangeValue}
                    onChange={(next) => { if (next !== 'custom') list.setQuickRange(next); }}
                />
            </FilterBar>

            {/* Zweite Zeile: Typ und Herkunft als Segmente. */}
            <div className="ofi-mv-segments">
                <div className="ofi-mv-segments__group">
                    <span className="ofi-mv-segments__label">{t('inv.movements.typeLabel')}</span>
                    <ToggleGroup<TypeFilter>
                        options={TYPE_OPTIONS.map((option) => ({ key: option.key, label: t(option.labelKey) }))}
                        value={list.type}
                        onChange={list.setType}
                    />
                </div>
                <div className="ofi-mv-segments__group">
                    <span className="ofi-mv-segments__label">{t('inv.movements.originLabel')}</span>
                    <ToggleGroup<OriginFilter>
                        options={ORIGIN_OPTIONS.map((option) => ({ key: option.key, label: t(option.labelKey) }))}
                        value={list.origin}
                        onChange={list.setOrigin}
                    />
                </div>
            </div>

            <SectionCard title={t('inv.movements.sectionTitle', { count: list.total })}>
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full min-w-[1080px]">
                        <colgroup>
                            <ResizableCols keys={['date', 'kind'] as const} grid={grid} />
                            {/* Bezeichnung: ohne Breite, nimmt den Rest. Sie steht
                                nach dem ERP-Code — darum die Schlüssel davor und danach getrennt. */}
                            <ResizableCols keys={['origin', 'code'] as const} grid={grid} />
                            <col />
                            <ResizableCols keys={visibleKeys.slice(2)} grid={grid} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="relative text-left">
                                    {t('inv.columns.dateTime')}
                                    <ColResizeHandle {...grid.resizeProps('date')} />
                                </th>
                                <th className="relative text-left">
                                    {t('inv.columns.movementType')}
                                    <ColResizeHandle {...grid.resizeProps('kind')} />
                                </th>
                                <th className="relative text-left">
                                    {t('inv.columns.origin')}
                                    <ColResizeHandle {...grid.resizeProps('origin')} />
                                </th>
                                <th className="relative text-left">
                                    {t('inv.columns.erpCode')}
                                    <ColResizeHandle {...grid.resizeProps('code')} />
                                </th>
                                <th className="text-left">{t('inv.columns.productName')}</th>
                                {show('model') && (
                                    <th className="relative text-left">
                                        {t('inv.columns.modelNumber')}
                                        <ColResizeHandle {...grid.resizeProps('model')} />
                                    </th>
                                )}
                                {show('serial') && (
                                    <th className="relative text-left">
                                        {t('inv.columns.serialNumber')}
                                        <ColResizeHandle {...grid.resizeProps('serial')} />
                                    </th>
                                )}
                                {show('barcode') && (
                                    <th className="relative text-left">
                                        {t('inv.columns.barcode')}
                                        <ColResizeHandle {...grid.resizeProps('barcode')} />
                                    </th>
                                )}
                                <th className="relative text-right">
                                    {t('inv.columns.quantity')}
                                    <ColResizeHandle {...grid.resizeProps('quantity')} />
                                </th>
                                {show('location') && (
                                    <th className="relative text-left">
                                        {t('inv.columns.location')}
                                        <ColResizeHandle {...grid.resizeProps('location')} />
                                    </th>
                                )}
                                {show('employee') && (
                                    <th className="relative text-left">
                                        {t('inv.columns.employee')}
                                        <ColResizeHandle {...grid.resizeProps('employee')} />
                                    </th>
                                )}
                                <th className="relative text-left">
                                    {t('inv.columns.description')}
                                    <ColResizeHandle {...grid.resizeProps('description')} />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {(list.loading || list.items.length === 0) && (
                                <TableStateRow colSpan={columnCount} loading={list.loading} emptyText={list.error || t('inv.movements.empty')} />
                            )}
                            {!list.loading && list.items.map((movement) => {
                                const meta = KIND_META[movement.movementKind] ?? KIND_META.IN;
                                const isDefinition = movement.movementKind === 'DEFINITION';
                                const isOut = movement.movementType === 'OUT';
                                const article = movement.article;
                                // Beim Scan zählt die gelesene Kennung; sonst die des Artikels.
                                const serial = movement.serialNumber || article?.serialNumber || null;
                                const barcode = movement.scannedBarcode || article?.supplierBarcode || article?.systemBarcode || null;
                                const employee = movement.employee ? `${movement.employee.firstName} ${movement.employee.lastName}`.trim() : '';
                                return (
                                    <tr key={movement.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                        <td className="font-mono text-[12.5px] text-slate-500 dark:text-white/60">{fmtDateTime(movement.transactionDate)}</td>
                                        <td>
                                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
                                                {t(meta.labelKey)}
                                            </span>
                                        </td>
                                        <td className="text-[12.5px] text-slate-600 dark:text-white/70">{t(ORIGIN_LABEL[movement.origin] ?? ORIGIN_LABEL.MANUAL)}</td>
                                        <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">{article?.articleCode || '—'}</td>
                                        <td className="text-slate-800 dark:text-white">{article?.name || '—'}</td>
                                        {show('model') && <td className="font-mono text-[12.5px] text-slate-600 dark:text-white/70">{article?.modelNumber || '—'}</td>}
                                        {show('serial') && <td className="font-mono text-[12.5px] text-slate-600 dark:text-white/70">{serial || '—'}</td>}
                                        {show('barcode') && <td className="font-mono text-[12.5px] text-slate-600 dark:text-white/70">{barcode || '—'}</td>}
                                        <td className={`text-right font-mono text-[13px] ${isOut ? 'text-red-600 dark:text-red-300' : 'text-slate-700 dark:text-white/80'}`}>
                                            {isDefinition ? '—' : `${isOut ? '−' : '+'}${fmtQty(movement.quantity)}`}
                                        </td>
                                        {show('location') && <td className="text-[12.5px] text-slate-600 dark:text-white/70">{movement.location || '—'}</td>}
                                        {show('employee') && <td className="text-[12.5px] text-slate-600 dark:text-white/70">{employee || '—'}</td>}
                                        <td className="max-w-0 truncate text-[12px] text-slate-500 dark:text-white/60" title={movement.description || undefined}>
                                            {[movement.supplier?.companyName, movement.description].filter(Boolean).join(' · ') || '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={list.page}
                        totalPages={list.totalPages}
                        total={list.total}
                        pageSize={MOVEMENTS_PAGE_SIZE}
                        onPage={list.setPage}
                    />
                </div>
            </SectionCard>

            {/* Spaltenwahl — ein kleines Menü am Knopf; Barcode und Seriennummer
                lassen sich abwählen (Vorgabe), die anderen Nebenspalten auch. */}
            <AnchoredPicker anchorEl={columnsOpen ? columnsAnchor : null} onClose={() => setColumnsOpen(false)} width={240} maxHeight={320}>
                <div className="p-1.5">
                    <p className="px-2 pb-1 pt-1 text-[11.5px] font-semibold text-slate-500 dark:text-white/60">{t('inv.movements.columnsTitle')}</p>
                    {OPTIONAL_COLUMNS.map((column) => (
                        <label key={column.key} className="ofi-option-row flex cursor-pointer items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-[12.5px] text-slate-800 dark:text-white">
                            <input
                                type="checkbox"
                                checked={show(column.key)}
                                onChange={() => toggleColumn(column.key)}
                                className="size-3.5 accent-[#0a7aff]"
                            />
                            {t(column.labelKey)}
                        </label>
                    ))}
                </div>
            </AnchoredPicker>
        </div>
    );
};
