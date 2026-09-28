import { useEffect, useState } from 'react';
import { X } from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import type { SupplierSearchItem } from '@/types/inventory';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ColResizeHandle, ResizableCols, SearchBox, TableStateRow } from './primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';

/** Single supplier selection, or a batch kept across searches until Apply. */
export const SupplierPickerModal = ({
    open,
    embedded = false,
    multiple = false,
    selectedIds = [],
    onClose,
    onPick,
    onPickMany,
}: {
    open: boolean;
    embedded?: boolean;
    multiple?: boolean;
    /** Already applied suppliers are checked and disabled. */
    selectedIds?: string[];
    onClose: () => void;
    onPick?: (supplier: SupplierSearchItem) => void;
    /** Newly selected suppliers only, in selection order. */
    onPickMany?: (suppliers: SupplierSearchItem[]) => void;
}) => {
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<SupplierSearchItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    const [chosen, setChosen] = useState<Map<string, SupplierSearchItem>>(() => new Map());
    const debouncedQuery = useDebouncedValue(query);
    // Sürüklenebilir sütunlar; ad sütununun genişliği yoktur, kalanı o emer.
    const grid = useColumnWidths({
        storageKey: 'offitec:inv-supplier-picker:col-widths:v1',
        defaults: { contact: 224, txCount: 96 },
        minPx: 64,
    });

    useEffect(() => {
        if (!open) { setQuery(''); setChosen(new Map()); return; }
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        inventoryApi
            .searchSuppliers(debouncedQuery, 30)
            .then((result) => { if (!cancelled) setItems(result); })
            .catch(() => { if (!cancelled) { setItems([]); setFailed(true); } })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, debouncedQuery, retry]);

    if (!open) return null;

    const close = () => {
        setQuery('');
        setChosen(new Map());
        onClose();
    };
    const existing = new Set(selectedIds);
    const selection = [...chosen.values()].filter((supplier) => !existing.has(supplier.id));
    const toggle = (supplier: SupplierSearchItem) => {
        if (existing.has(supplier.id)) return;
        setChosen((current) => {
            const next = new Map(current);
            if (next.has(supplier.id)) next.delete(supplier.id);
            else next.set(supplier.id, supplier);
            return next;
        });
    };
    const pick = (supplier: SupplierSearchItem) => {
        if (multiple) toggle(supplier);
        else { onPick?.(supplier); close(); }
    };

    return (
        <PopupDialog open={open} embedded={embedded} onClose={close} title={t('inv.orders.supplierModal.title')} width={760}
            footer={multiple ? <PopupActions start={t('productionBom.procurement.selected', { count: selection.length })}>
                <PopupButton onClick={close}>{t('productionBom.common.cancel')}</PopupButton>
                <PopupButton variant="primary" disabled={!selection.length || !onPickMany} onClick={() => { onPickMany?.(selection); close(); }}>{t('common.apply')}</PopupButton>
            </PopupActions> : undefined}>
            <div className="flex min-h-0 flex-col gap-3">
                <div>
                    <SearchBox value={query} onChange={setQuery} placeholder={t('inv.suppliers.searchPlaceholder')} autoFocus />
                </div>
                {multiple && selection.length > 0 && <div className="flex flex-wrap gap-1.5">
                    {selection.map((supplier) => <button key={supplier.id} type="button" onClick={() => toggle(supplier)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-transparent px-2 py-1 text-xs text-slate-700 dark:border-white/15 dark:text-white/80"
                        aria-label={`${t('productionBom.common.remove')}: ${supplier.companyName}`}>
                        {supplier.companyName}<X size={12} aria-hidden />
                    </button>)}
                </div>}
                <div className="min-h-0 flex-1 overflow-auto" style={{ maxHeight: 'min(50vh, 480px)' }}>
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <colgroup>
                            {multiple && <col style={{ width: 38 }} />}
                            {/* Ad sütunu: genişliği yok, kalan yeri emer. */}
                            <col />
                            <ResizableCols keys={['contact', 'txCount'] as const} grid={grid} />
                        </colgroup>
                        <thead>
                            <tr>
                                {multiple && <th aria-label={t('common.apply')} />}
                                <th className="text-left">{t('inv.suppliers.name')}</th>
                                <th className="relative text-left">
                                    {t('inv.suppliers.contact')}
                                    <ColResizeHandle {...grid.resizeProps('contact')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.suppliers.txCount')}
                                    <ColResizeHandle {...grid.resizeProps('txCount')} />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {failed && !loading ? <tr><td colSpan={multiple ? 4 : 3} className="py-8 text-center">
                                <p role="alert" className="mb-2 text-sm text-slate-500 dark:text-white/60">{t('inv.suppliers.loadFailed')}</p>
                                <PopupButton onClick={() => setRetry((value) => value + 1)}>{t('common.retry')}</PopupButton>
                            </td></tr> : (loading || items.length === 0) && (
                                <TableStateRow colSpan={multiple ? 4 : 3} loading={loading} emptyText={t('inv.supplierPicker.empty')} />
                            )}
                            {!loading && !failed && items.map((supplier) => (
                                <tr
                                    key={supplier.id}
                                    onClick={() => pick(supplier)}
                                    tabIndex={multiple ? undefined : 0}
                                    onKeyDown={multiple ? undefined : (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(supplier); } }}
                                    className={multiple && existing.has(supplier.id) ? 'opacity-55' : 'cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5'}
                                >
                                    {multiple && <td><input type="checkbox" checked={existing.has(supplier.id) || chosen.has(supplier.id)} disabled={existing.has(supplier.id)} aria-label={supplier.companyName}
                                        onClick={(event) => event.stopPropagation()} onChange={() => toggle(supplier)} className="h-4 w-4 accent-blue-600" /></td>}
                                    <td className="text-slate-800 dark:text-white">{supplier.companyName}</td>
                                    <td className="max-w-0 truncate text-slate-500 dark:text-white/60">
                                        {[supplier.contactName, supplier.email].filter(Boolean).join(' · ') || '—'}
                                    </td>
                                    <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{supplier.purchaseCount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </PopupDialog>
    );
};
