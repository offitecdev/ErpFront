import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    ChevronLeft,
    ChevronRight,
    Edit01 as EditIcon,
    Percent01 as PercentIcon,
    Plus,
    Save01 as Save,
    SearchLg as Search,
    Tag01 as Tag,
    Trash01 as TrashIcon,
    X as XIcon,
} from '@/components/icons/antIconCompat';

import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Input } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Modal } from '../../components/ui-shared/Modal';
import { customerApi, type CustomerProductDiscountDto } from '../../lib/api/customer';
import { inventoryApi } from '../../lib/api/inventory';
import type { ArticleListItem } from '../../types/inventory';
import { t as i18nT } from '@/i18n/translate';

const PAGE_SIZE = 10;

const clampDiscount = (raw: string): number | null => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.min(100, Math.max(0, n));
};

// Side panel: type-ahead paginated product search (id + name only); picking a
// product reveals a discount input next to it.
const ProductSearchPanel: React.FC<{
    open: boolean;
    onClose: () => void;
    existing: CustomerProductDiscountDto[];
    onSubmit: (article: ArticleListItem, discount: number) => Promise<void>;
}> = ({ open, onClose, existing, onSubmit }) => {
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<ArticleListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<ArticleListItem | null>(null);
    const [discountInput, setDiscountInput] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) {
            setSearch('');
            setDebounced('');
            setPage(1);
            setSelected(null);
            setDiscountInput('');
        }
    }, [open]);

    useEffect(() => {
        const handle = window.setTimeout(() => {
            setPage(1);
            setDebounced(search.trim());
        }, 300);
        return () => window.clearTimeout(handle);
    }, [search]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const res = await inventoryApi.articlesSummaryPaged({ page, pageSize: PAGE_SIZE, search: debounced || undefined });
                if (!cancelled) {
                    setItems(res.items ?? []);
                    setTotal(res.total ?? 0);
                }
            } catch {
                if (!cancelled) {
                    setItems([]);
                    setTotal(0);
                    toast.error(i18nT('crm.productDiscountSearchError'));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, page, debounced]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const existingByArticle = new Map(existing.map((d) => [d.articleId, d.discount]));

    const pickArticle = (article: ArticleListItem) => {
        setSelected(article);
        const current = existingByArticle.get(article.id);
        setDiscountInput(current !== undefined ? String(current) : '');
    };

    const handleSave = async () => {
        if (!selected) return;
        const discount = clampDiscount(discountInput);
        if (discount === null) {
            toast.error(i18nT('crm.productDiscountInvalid'));
            return;
        }
        try {
            setSaving(true);
            await onSubmit(selected, discount);
            setSelected(null);
            setDiscountInput('');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title={i18nT('crm.productDiscountAdd')}
            description={i18nT('crm.productDiscountAddHint')}
            onClose={onClose}
            placement="drawer"
            drawerWidth="md"
        >
            <div className="relative mb-3">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={i18nT('crm.productDiscountSearchPlaceholder')}
                    className="w-full pl-8 pr-3 py-2 text-[13px] border border-slate-200 rounded-md bg-slate-50/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10 focus:border-blue-400"
                />
            </div>

            {loading ? (
                <div className="animate-pulse space-y-2 py-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-10 rounded-md bg-slate-50 border border-slate-100" />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <div className="text-[12.5px] text-slate-400 text-center py-8">
                    {debounced ? i18nT('crm.productDiscountNoResults') : i18nT('crm.productDiscountTypeToSearch')}
                </div>
            ) : (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-md">
                    {items.map((article) => {
                        const isSelected = selected?.id === article.id;
                        const existingDiscount = existingByArticle.get(article.id);
                        return (
                            <div key={article.id} className={isSelected ? 'bg-blue-50/60' : ''}>
                                <button
                                    type="button"
                                    onClick={() => pickArticle(article)}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-50"
                                >
                                    <span className="font-mono text-[11.5px] text-slate-500 w-24 flex-shrink-0 truncate">{article.articleCode}</span>
                                    <span className="text-[13px] text-slate-800 truncate flex-1">{article.name}</span>
                                    {existingDiscount !== undefined && !isSelected && (
                                        <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 flex-shrink-0">
                                            {existingDiscount}%
                                        </span>
                                    )}
                                </button>
                                {isSelected && (
                                    <div className="flex items-center gap-2 px-3 pb-2.5">
                                        <PercentIcon size={13} className="text-slate-400 flex-shrink-0" />
                                        <Input
                                            autoFocus
                                            type="number"
                                            min={0}
                                            max={100}
                                            step="0.1"
                                            value={discountInput}
                                            onChange={(e) => setDiscountInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSave(); } }}
                                            placeholder={i18nT('crm.productDiscountPercent')}
                                            className="w-28"
                                        />
                                        <Button variant="primary" size="sm" loading={saving} icon={<Save size={12} />} onClick={() => void handleSave()}>
                                            {i18nT('common.save')}
                                        </Button>
                                        <Button variant="secondary" size="sm" icon={<XIcon size={12} />} onClick={() => setSelected(null)}>
                                            {i18nT('common.cancel')}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 text-[12px] text-slate-500">
                    <span>{i18nT('common.total')} {total}</span>
                    <div className="inline-flex items-center gap-1.5">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage(page - 1)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
                        >
                            <ChevronLeft size={13} />
                        </button>
                        <span className="font-medium text-slate-700">{page} / {totalPages}</span>
                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => setPage(page + 1)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
                        >
                            <ChevronRight size={13} />
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export const CustomerProductDiscounts: React.FC<{ customerId: string }> = ({ customerId }) => {
    const [discounts, setDiscounts] = useState<CustomerProductDiscountDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [panelOpen, setPanelOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchDiscounts = useCallback(async () => {
        try {
            const rows = await customerApi.listProductDiscounts(customerId);
            setDiscounts(rows);
        } catch {
            toast.error(i18nT('crm.productDiscountLoadError'));
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    useEffect(() => {
        setLoading(true);
        void fetchDiscounts();
    }, [fetchDiscounts]);

    const handleUpsert = async (article: ArticleListItem, discount: number) => {
        try {
            await customerApi.upsertProductDiscount(customerId, { articleId: article.id, discount });
            toast.success(i18nT('crm.productDiscountSaved'));
            await fetchDiscounts();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || i18nT('common.error'));
        }
    };

    const startEdit = (row: CustomerProductDiscountDto) => {
        setEditingId(row.id);
        setEditValue(String(row.discount));
    };

    const handleUpdate = async (row: CustomerProductDiscountDto) => {
        const discount = clampDiscount(editValue);
        if (discount === null) {
            toast.error(i18nT('crm.productDiscountInvalid'));
            return;
        }
        try {
            setSavingEdit(true);
            await customerApi.updateProductDiscount(customerId, row.id, { discount });
            toast.success(i18nT('crm.productDiscountSaved'));
            setEditingId(null);
            await fetchDiscounts();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || i18nT('common.error'));
        } finally {
            setSavingEdit(false);
        }
    };

    const handleDelete = async () => {
        if (!confirmDeleteId) return;
        try {
            setDeleting(true);
            await customerApi.deleteProductDiscount(customerId, confirmDeleteId);
            toast.success(i18nT('crm.productDiscountDeleted'));
            setConfirmDeleteId(null);
            await fetchDiscounts();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || i18nT('common.error'));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <Card
                title={i18nT('crm.tab_productDiscounts')}
                description={i18nT('crm.productDiscountsHint')}
                icon={<Tag size={13} />}
                noPadding
                actions={
                    <Button variant="primary" size="sm" icon={<Plus size={11} />} onClick={() => setPanelOpen(true)}>
                        {i18nT('crm.productDiscountAdd')}
                    </Button>
                }
            >
                {loading ? (
                    <div className="px-6 py-8 animate-pulse space-y-2">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-10 rounded-md bg-slate-50 border border-slate-100" />
                        ))}
                    </div>
                ) : discounts.length === 0 ? (
                    <EmptyState
                        icon={<Tag size={28} />}
                        title={i18nT('crm.productDiscountsEmpty')}
                        description={i18nT('crm.productDiscountsEmptyHint')}
                        action={
                            <Button variant="primary" size="sm" icon={<Plus size={11} />} onClick={() => setPanelOpen(true)}>
                                {i18nT('crm.productDiscountAdd')}
                            </Button>
                        }
                    />
                ) : (
                    <table className="w-full text-[13px] text-left">
                        <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-2.5 font-semibold">{i18nT('crm.productDiscountColArticle')}</th>
                                <th className="px-4 py-2.5 font-semibold">{i18nT('crm.productDiscountColName')}</th>
                                <th className="px-4 py-2.5 font-semibold text-right">{i18nT('crm.productDiscountPercent')}</th>
                                <th className="px-4 py-2.5 font-semibold text-right">{i18nT('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {discounts.map((row) => (
                                <tr key={row.id} className="group">
                                    <td className="px-4 py-2.5 font-mono text-[12px] text-slate-600">{row.articleCode || '—'}</td>
                                    <td className="px-4 py-2.5 text-slate-800">{row.articleName || row.articleId}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        {editingId === row.id ? (
                                            <div className="inline-flex items-center gap-1.5">
                                                <Input
                                                    autoFocus
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    step="0.1"
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleUpdate(row); } }}
                                                    className="w-24 text-right"
                                                />
                                                <Button variant="primary" size="sm" loading={savingEdit} icon={<Save size={12} />} onClick={() => void handleUpdate(row)} />
                                                <Button variant="secondary" size="sm" icon={<XIcon size={12} />} onClick={() => setEditingId(null)} />
                                            </div>
                                        ) : (
                                            <span className="font-semibold text-blue-700">{row.discount}%</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button type="button" onClick={() => startEdit(row)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700" title={i18nT('common.edit')}>
                                                <EditIcon size={13} />
                                            </button>
                                            <button type="button" onClick={() => setConfirmDeleteId(row.id)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" title={i18nT('common.delete')}>
                                                <TrashIcon size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Card>

            <ProductSearchPanel
                open={panelOpen}
                onClose={() => setPanelOpen(false)}
                existing={discounts}
                onSubmit={handleUpsert}
            />

            <Modal
                open={confirmDeleteId !== null}
                title={i18nT('common.delete')}
                onClose={() => !deleting && setConfirmDeleteId(null)}
                width="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>{i18nT('common.cancel')}</Button>
                        <Button variant="danger" loading={deleting} icon={<TrashIcon size={13} />} onClick={() => void handleDelete()}>{i18nT('common.delete')}</Button>
                    </>
                }
            >
                <p className="text-[13px] text-slate-600">{i18nT('crm.productDiscountDeleteConfirm')}</p>
            </Modal>
        </>
    );
};
