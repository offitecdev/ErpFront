import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import type { SupplierSearchItem } from '@/types/inventory';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ColResizeHandle, ResizableCols, SearchBox, TableStateRow } from './primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';

/**
 * Tek tedarikçi seçim penceresi (ArticlePickerModal kabuğu) — sipariş
 * editöründe "tek tedarikçi" düğmesiyle açılır; seçim tüm satırlara uygulanır.
 */
export const SupplierPickerModal = ({
    open,
    onClose,
    onPick,
}: {
    open: boolean;
    onClose: () => void;
    onPick: (supplier: SupplierSearchItem) => void;
}) => {
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<SupplierSearchItem[]>([]);
    const [loading, setLoading] = useState(false);
    const debouncedQuery = useDebouncedValue(query);
    // Sürüklenebilir sütunlar; ad sütununun genişliği yoktur, kalanı o emer.
    const grid = useColumnWidths({
        storageKey: 'offitec:inv-supplier-picker:col-widths:v1',
        defaults: { contact: 224, txCount: 96 },
        minPx: 64,
    });

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        inventoryApi
            .searchSuppliers(debouncedQuery, 30)
            .then((result) => { if (!cancelled) setItems(result); })
            .catch(() => { if (!cancelled) setItems([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, debouncedQuery]);

    if (!open) return null;

    const close = () => {
        setQuery('');
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-3">
            <div
                className="absolute inset-0 bg-slate-950/30 dark:bg-black/55"
                onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
            />
            <section
                role="dialog"
                aria-modal="true"
                /* `.ofi-pop` — siehe index.css, "FENSTER-OBERFLÄCHE". */
                className="ofi-rise-in ofi-pop relative flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden"
            >
                <header className="ofi-pop__rule flex items-center justify-between gap-2 border-b px-4 py-3">
                    <h3 className="ofi-pop__title">{t('inv.orders.supplierModal.title')}</h3>
                    <button
                        type="button"
                        aria-label={t('common.close')}
                        onClick={close}
                        className="ofi-float-card__iconbtn shrink-0"
                    >
                        <X size={15} />
                    </button>
                </header>

                <div className="border-b border-slate-100 px-3 py-2.5 dark:border-white/10">
                    <SearchBox value={query} onChange={setQuery} placeholder={t('inv.suppliers.searchPlaceholder')} autoFocus />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <colgroup>
                            {/* Ad sütunu: genişliği yok, kalan yeri emer. */}
                            <col />
                            <ResizableCols keys={['contact', 'txCount'] as const} grid={grid} />
                        </colgroup>
                        <thead>
                            <tr>
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
                            {(loading || items.length === 0) && (
                                <TableStateRow colSpan={3} loading={loading} emptyText={t('inv.supplierPicker.empty')} />
                            )}
                            {!loading && items.map((supplier) => (
                                <tr
                                    key={supplier.id}
                                    onClick={() => { onPick(supplier); close(); }}
                                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                >
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
            </section>
        </div>,
        document.body,
    );
};
