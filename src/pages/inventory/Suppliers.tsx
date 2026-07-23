import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    Building05 as Building,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Package,
    Plus,
    Save01 as Save,
    SearchLg as Search,
    X,
} from '@/components/icons/antIconCompat';
import Tooltip from 'antd/es/tooltip';
import { toast } from 'sonner';
import dayjs from 'dayjs';

import { StockModuleHeader } from '../../components/layout/PageHeader';
import { InventoryListHeader } from '../../components/inventory/InventoryListHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Skeleton } from '../../components/ui-shared/Skeleton';
import { inventoryApi } from '../../lib/api/inventory';
import type { SupplierRow } from '../../types/inventory';

import { t } from '@/i18n/translate';

const money = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value || 0);

const number = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(value || 0);

const SUPPLIER_FILTER_CONTROL =
    'h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-normal normal-case tracking-normal text-slate-700 placeholder:text-slate-400 transition-colors hover:bg-slate-100 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10';

type SupplierSortKey =
    | 'createdAt'
    | 'companyName'
    | 'phone'
    | 'address'
    | 'articleCount'
    | 'totalPurchaseQuantity'
    | 'totalPurchaseAmount'
    | 'latestPurchaseDate'
    | 'isActive';

type SupplierSortDirection = 'asc' | 'desc';

const SupplierSortableHeader = ({
    label,
    column,
    sortBy,
    sortDirection,
    onSort,
    align = 'left',
}: {
    label: ReactNode;
    column: SupplierSortKey;
    sortBy: SupplierSortKey;
    sortDirection: SupplierSortDirection;
    onSort: (column: SupplierSortKey, direction: SupplierSortDirection) => void;
    align?: 'left' | 'right';
}) => (
    <th className={`px-2 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <div className={`flex min-w-0 items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
            <span className="truncate">{label}</span>
            <span className="inline-flex shrink-0 items-center">
                <Tooltip title={t('inventory.articles.sortAscending')}>
                    <button
                        type="button"
                        onClick={() => onSort(column, 'asc')}
                        aria-label={t('inventory.articles.sortAscending')}
                        className={`flex size-4 items-center justify-center rounded transition-colors hover:bg-slate-200 ${
                            sortBy === column && sortDirection === 'asc' ? 'text-[#272f67]' : 'text-slate-400'
                        }`}
                    >
                        <ArrowUp size={10} />
                    </button>
                </Tooltip>
                <Tooltip title={t('inventory.articles.sortDescending')}>
                    <button
                        type="button"
                        onClick={() => onSort(column, 'desc')}
                        aria-label={t('inventory.articles.sortDescending')}
                        className={`flex size-4 items-center justify-center rounded transition-colors hover:bg-slate-200 ${
                            sortBy === column && sortDirection === 'desc' ? 'text-[#272f67]' : 'text-slate-400'
                        }`}
                    >
                        <ArrowDown size={10} />
                    </button>
                </Tooltip>
            </span>
        </div>
    </th>
);

export const Suppliers = () => {
    const navigate = useNavigate();
    const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ companyName: '', contactName: '', email: '', phone: '', address: '' });
    const [saving, setSaving] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [companyFilter, setCompanyFilter] = useState('');
    const [phoneFilter, setPhoneFilter] = useState('');
    const [addressFilter, setAddressFilter] = useState('');
    const [sortBy, setSortBy] = useState<SupplierSortKey>('createdAt');
    const [sortDirection, setSortDirection] = useState<SupplierSortDirection>('desc');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 50;

    const load = async () => {
        setLoading(true);
        try {
            setSuppliers(await inventoryApi.listSuppliers());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const companyQuery = companyFilter.trim().toLowerCase();
        const phoneQuery = phoneFilter.trim().toLowerCase();
        const addressQuery = addressFilter.trim().toLowerCase();
        const matches = suppliers.filter((supplier) => {
            if (companyQuery && !supplier.companyName.toLowerCase().includes(companyQuery)) return false;
            if (phoneQuery && !(supplier.phone || '').toLowerCase().includes(phoneQuery)) return false;
            if (addressQuery && !(supplier.address || '').toLowerCase().includes(addressQuery)) return false;
            if (!q) return true;
            return (
                supplier.companyName.toLowerCase().includes(q) ||
                (supplier.contactName || '').toLowerCase().includes(q) ||
                (supplier.email || '').toLowerCase().includes(q) ||
                (supplier.phone || '').toLowerCase().includes(q) ||
                (supplier.address || '').toLowerCase().includes(q)
            );
        });
        const directionFactor = sortDirection === 'asc' ? 1 : -1;
        return matches.sort((left, right) => {
            const leftValue = left[sortBy] ?? '';
            const rightValue = right[sortBy] ?? '';
            const comparison = sortBy === 'createdAt' || sortBy === 'latestPurchaseDate'
                ? (leftValue ? new Date(String(leftValue)).getTime() : 0)
                    - (rightValue ? new Date(String(rightValue)).getTime() : 0)
                : typeof leftValue === 'string'
                    ? leftValue.localeCompare(String(rightValue))
                    : Number(leftValue) - Number(rightValue);
            return comparison === 0 ? left.id.localeCompare(right.id) : comparison * directionFactor;
        });
    }, [addressFilter, companyFilter, phoneFilter, search, sortBy, sortDirection, suppliers]);

    useEffect(() => {
        setPage(1);
    }, [addressFilter, companyFilter, phoneFilter, search, sortBy, sortDirection]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageSafe = Math.min(page, totalPages);
    const paged = useMemo(
        () => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
        [filtered, pageSafe],
    );
    const rangeFrom = filtered.length === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
    const rangeTo = Math.min(pageSafe * PAGE_SIZE, filtered.length);

    const create = async () => {
        if (!form.companyName.trim()) return toast.error(t('auto.tedarikci_sirket_adi_zorunludur'));
        setSaving(true);
        try {
            const supplier = await inventoryApi.createSupplier(form);
            setForm({ companyName: '', contactName: '', email: '', phone: '', address: '' });
            setAddOpen(false);
            await load();
            navigate(`/inventory/suppliers/${supplier.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.tedarikci_kaydedilemedi'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <InventoryListHeader
                title={t('nav.suppliers')}
                action={(
                    <Button
                        variant="primary"
                        size="lg"
                        icon={addOpen ? <ChevronDown size={16} /> : <Plus size={16} />}
                        onClick={() => setAddOpen((o) => !o)}
                        className="!h-10 !px-4 !text-[13px] !font-semibold"
                    >
                        {t('auto.yeni_tedarikci')}
                    </Button>
                )}
            />
            {/* Aşağı doğru açılan "Yeni Tedarikçi" bölümü — liste her zaman görünür kalır. */}
            {addOpen && (
                <section className="mb-4 rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                    <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                        <Building size={13} />{t('auto.yeni_tedarikci')}</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <Field label={t('auto.sirket_adi')} required><Input size="sm" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></Field>
                        <Field label={t('common.contactPerson')}><Input size="sm" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
                        <Field label={t('common.email')}><Input size="sm" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="tedarikci@ornek.com" /></Field>
                        <Field label={t('common.phone')}><Input size="sm" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                        <Field label={t('common.address')}><Input size="sm" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
                    </div>
                    <div className="mt-3 flex justify-end">
                        <Button size="sm" icon={<Save size={13} />} loading={saving} onClick={create}>{t('common.save')}</Button>
                    </div>
                </section>
            )}

            <Card className="border-0 rounded-none" noPadding>
                {/* Filtre + sayfalama — tek satır, tam genişlik, yatay kaydırma yok. */}
                <div className="px-3 py-3">
                    <div className="flex w-full flex-nowrap items-center gap-3">
                        <div className="relative w-[240px] min-w-0 shrink">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('auto.ara_kod_ad_barkod')}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-[13px] transition-colors focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    aria-label={t('common.clear')}
                                    title={t('common.clear')}
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                        <div className="w-[200px] shrink-0">
                            <Select
                                value={`${sortBy}:${sortDirection}`}
                                onChange={(event) => {
                                    const [column, direction] = event.target.value.split(':') as [SupplierSortKey, SupplierSortDirection];
                                    setSortBy(column);
                                    setSortDirection(direction);
                                }}
                                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                                aria-label={t('inventory.articles.sortOrder')}
                            >
                                {sortBy !== 'createdAt' && (
                                    <option value={`${sortBy}:${sortDirection}`}>{t('inventory.articles.sortOrder')}</option>
                                )}
                                <option value="createdAt:desc">{t('inventory.articles.newestFirst')}</option>
                                <option value="createdAt:asc">{t('inventory.articles.oldestFirst')}</option>
                            </Select>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-3">
                            <span className="font-mono text-[12px] text-slate-500">
                                {rangeFrom}-{rangeTo} / {filtered.length}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    disabled={pageSafe <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={t('common.back')}
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span className="px-1 font-mono text-[12px] tabular-nums text-slate-500">{pageSafe} / {totalPages}</span>
                                <button
                                    type="button"
                                    disabled={pageSafe >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={t('common.next')}
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white">
                    <table className="w-full table-fixed text-[11.5px] [&_th]:border-r [&_th]:border-slate-200 [&_td]:border-r [&_td]:border-slate-200 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                        <colgroup>
                            <col style={{ width: '19%' }} />
                            <col style={{ width: '13%' }} />
                            <col style={{ width: '21%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '10%' }} />
                            <col style={{ width: '11%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '6%' }} />
                        </colgroup>
                        <thead className="sticky top-0 z-10 whitespace-nowrap text-[11.5px] text-[#86868B] bg-slate-50 uppercase tracking-[0.08em]">
                            <tr>
                                <SupplierSortableHeader label={t('auto.sirket')} column="companyName" sortBy={sortBy} sortDirection={sortDirection} onSort={(column, direction) => { setSortBy(column); setSortDirection(direction); }} />
                                <SupplierSortableHeader label={t('common.phone')} column="phone" sortBy={sortBy} sortDirection={sortDirection} onSort={(column, direction) => { setSortBy(column); setSortDirection(direction); }} />
                                <SupplierSortableHeader label={t('common.address')} column="address" sortBy={sortBy} sortDirection={sortDirection} onSort={(column, direction) => { setSortBy(column); setSortDirection(direction); }} />
                                <SupplierSortableHeader label={t('auto.urun')} column="articleCount" sortBy={sortBy} sortDirection={sortDirection} onSort={(column, direction) => { setSortBy(column); setSortDirection(direction); }} align="right" />
                                <SupplierSortableHeader label={t('auto.alim_adedi')} column="totalPurchaseQuantity" sortBy={sortBy} sortDirection={sortDirection} onSort={(column, direction) => { setSortBy(column); setSortDirection(direction); }} align="right" />
                                <SupplierSortableHeader label={t('auto.alisveris')} column="totalPurchaseAmount" sortBy={sortBy} sortDirection={sortDirection} onSort={(column, direction) => { setSortBy(column); setSortDirection(direction); }} align="right" />
                                <SupplierSortableHeader label={t('auto.son_alim')} column="latestPurchaseDate" sortBy={sortBy} sortDirection={sortDirection} onSort={(column, direction) => { setSortBy(column); setSortDirection(direction); }} />
                                <th className="px-2.5 py-2.5 text-right font-semibold">{t('common.actions')}</th>
                            </tr>
                            <tr data-filter-row>
                                <th className="px-2 py-2 font-normal">
                                    <input
                                        value={companyFilter}
                                        onChange={(event) => setCompanyFilter(event.target.value)}
                                        placeholder={`${t('common.filter')}...`}
                                        className={SUPPLIER_FILTER_CONTROL}
                                    />
                                </th>
                                <th className="px-2 py-2 font-normal">
                                    <input
                                        value={phoneFilter}
                                        onChange={(event) => setPhoneFilter(event.target.value)}
                                        placeholder={`${t('common.filter')}...`}
                                        className={SUPPLIER_FILTER_CONTROL}
                                    />
                                </th>
                                <th className="px-2 py-2 font-normal">
                                    <input
                                        value={addressFilter}
                                        onChange={(event) => setAddressFilter(event.target.value)}
                                        placeholder={`${t('common.filter')}...`}
                                        className={SUPPLIER_FILTER_CONTROL}
                                    />
                                </th>
                                <th className="px-2 py-2" />
                                <th className="px-2 py-2" />
                                <th className="px-2 py-2" />
                                <th className="px-2 py-2" />
                                <th className="px-2 py-2" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && Array.from({ length: 6 }).map((_, i) => (
                                <tr key={`supplier-skeleton-${i}`}>
                                    {Array.from({ length: 8 }).map((__, j) => (
                                        <td key={j} className="px-2.5 py-2">
                                            <Skeleton className={`h-4 w-full max-w-[120px] ${[3, 4, 5, 7].includes(j) ? 'ml-auto' : ''} bg-slate-100`} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {!loading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={8}>
                                        <EmptyState icon={<Building size={28} />} title={t('auto.tedarikci_yok')} description={t('auto.ilk_tedarikciyi_soldaki_formdan_ekleyin')} />
                                    </td>
                                </tr>
                            )}
                            {!loading && paged.map((supplier) => (
                                <tr key={supplier.id} className="cursor-pointer transition-colors hover:bg-slate-100" onClick={() => navigate(`/inventory/suppliers/${supplier.id}`)}>
                                    <td className="truncate px-2.5 py-2 font-semibold text-slate-900">{supplier.companyName}</td>
                                    <td className="truncate px-2.5 py-2 text-slate-600">{supplier.phone || '-'}</td>
                                    <td className="truncate px-2.5 py-2 text-slate-600">{supplier.address || '-'}</td>
                                    <td className="px-2.5 py-2 text-right font-mono">{supplier.articleCount || 0}</td>
                                    <td className="px-2.5 py-2 text-right font-mono">{number(supplier.totalPurchaseQuantity)}</td>
                                    <td className="px-2.5 py-2 text-right font-mono whitespace-nowrap">{money(supplier.totalPurchaseAmount)}</td>
                                    <td className="px-2.5 py-2 text-slate-600 whitespace-nowrap">{supplier.latestPurchaseDate ? dayjs(supplier.latestPurchaseDate).format('DD.MM.YYYY') : '-'}</td>
                                    <td className="px-2.5 py-2 text-right">
                                        <ChevronRight size={13} className="ml-auto text-slate-400" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export const SupplierDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [supplier, setSupplier] = useState<SupplierRow | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ companyName: '', contactName: '', email: '', phone: '', address: '', isActive: true });
    const [saving, setSaving] = useState(false);
    // "Alınan ürünler" tablosu — doğrudan ürün arama + kolon bazlı filtreler.
    const [productSearch, setProductSearch] = useState('');
    const [productFilter, setProductFilter] = useState('');
    const [locationFilter, setLocationFilter] = useState('');

    const filteredProducts = useMemo(() => {
        const list = supplier?.articleSuppliers || [];
        const s = productSearch.trim().toLowerCase();
        const pf = productFilter.trim().toLowerCase();
        const lf = locationFilter.trim().toLowerCase();
        return list.filter((row) => {
            const name = (row.article?.name || row.articleId || '').toLowerCase();
            const code = (row.article?.articleCode || '').toLowerCase();
            const sku = (row.supplierSku || '').toLowerCase();
            const loc = (row.location?.locationName || '').toLowerCase();
            if (s && !(name.includes(s) || code.includes(s) || sku.includes(s) || loc.includes(s))) return false;
            if (pf && !(name.includes(pf) || code.includes(pf) || sku.includes(pf))) return false;
            if (lf && !loc.includes(lf)) return false;
            return true;
        });
    }, [supplier, productSearch, productFilter, locationFilter]);

    const load = async () => {
        if (!id) return;
        try {
            const data = await inventoryApi.getSupplier(id);
            setSupplier(data);
            setEditForm({
                companyName: data.companyName || '',
                contactName: data.contactName || '',
                email: data.email || '',
                phone: data.phone || '',
                address: data.address || '',
                isActive: data.isActive,
            });
        } catch {
            toast.error(t('auto.tedarikci_yuklenemedi'));
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const save = async () => {
        if (!id) return;
        if (!editForm.companyName.trim()) return toast.error(t('auto.tedarikci_sirket_adi_zorunludur'));
        setSaving(true);
        try {
            await inventoryApi.updateSupplier(id, editForm);
            toast.success('Tedarikçi güncellendi.');
            setEditOpen(false);
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Tedarikçi güncellenemedi.');
        } finally {
            setSaving(false);
        }
    };

    if (!supplier) return <div className="h-80 animate-pulse rounded-md border border-slate-100 bg-slate-50" />;

    return (
        <div>
            <StockModuleHeader
                label={`Stock › Suppliers › ${supplier.companyName}`}
                actions={
                    <>
                        <Button variant="secondary" icon={<Save size={13} />} onClick={() => setEditOpen((o) => !o)}>Düzenle</Button>
                        <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/inventory/suppliers')}>{t('auto.listeye_don')}</Button>
                    </>
                }
            />

            {/* İletişim bilgileri / düzenleme */}
            <section className="mb-4 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                        <Building size={13} /> İletişim Bilgileri
                    </div>
                    {editOpen && (
                        <button type="button" onClick={() => { setEditOpen(false); void load(); }} className="text-slate-400 hover:text-slate-600" aria-label={t('common.clear')}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                {editOpen ? (
                    <div className="p-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <Field label={t('auto.sirket_adi')} required><Input size="sm" value={editForm.companyName} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} /></Field>
                            <Field label={t('common.contactPerson')}><Input size="sm" value={editForm.contactName} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} /></Field>
                            <Field label={t('common.email')}><Input size="sm" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="tedarikci@ornek.com" /></Field>
                            <Field label={t('common.phone')}><Input size="sm" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></Field>
                            <Field label={t('common.address')}><Input size="sm" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></Field>
                            <Field label={t('common.status')}>
                                <Select size="sm" value={editForm.isActive ? 'ACTIVE' : 'INACTIVE'} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === 'ACTIVE' })}>
                                    <option value="ACTIVE">{t('common.active')}</option>
                                    <option value="INACTIVE">{t('common.inactive')}</option>
                                </Select>
                            </Field>
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                            <Button variant="secondary" size="sm" onClick={() => { setEditOpen(false); void load(); }} disabled={saving}>{t('common.cancel')}</Button>
                            <Button size="sm" icon={<Save size={13} />} loading={saving} onClick={save}>{t('common.save')}</Button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 text-[12.5px] sm:grid-cols-2">
                        <InfoLine label={t('common.contactPerson')} value={supplier.contactName} />
                        <InfoLine label={t('common.email')} value={supplier.email} />
                        <InfoLine label={t('common.phone')} value={supplier.phone} />
                        <InfoLine label={t('common.address')} value={supplier.address} />
                    </div>
                )}
            </section>

            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <Metric label={t('auto.urun')} value={String(supplier.articleCount || 0)} />
                <Metric label={t('auto.alim_kaydi')} value={String(supplier.purchaseCount || 0)} />
                <Metric label={t('auto.toplam_adet')} value={number(supplier.totalPurchaseQuantity)} />
                <Metric label={t('auto.toplam_alis')} value={money(supplier.totalPurchaseAmount)} />
            </div>

            <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-xs">
                {/* Başlık + doğrudan ürün arama */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.alinan_urunler')}</div>
                    <div className="relative w-[240px] max-w-full">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            placeholder={t('auto.ara_kod_ad_barkod')}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-[13px] transition-colors focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                        />
                        {productSearch && (
                            <button
                                type="button"
                                onClick={() => setProductSearch('')}
                                aria-label={t('common.clear')}
                                title={t('common.clear')}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>
                {(supplier.articleSuppliers || []).length === 0 ? (
                    <EmptyState icon={<Package size={28} />} title={t('auto.urun_kaydi_yok')} description={t('auto.bu_tedarikciye_bagli_urun_henuz_eklenmemis')} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full table-fixed text-[11.5px] [&_th]:border-r [&_th]:border-slate-200 [&_td]:border-r [&_td]:border-slate-200 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                            <colgroup>
                                <col style={{ width: '32%' }} />
                                <col style={{ width: '16%' }} />
                                <col style={{ width: '13%' }} />
                                <col style={{ width: '13%' }} />
                                <col style={{ width: '14%' }} />
                                <col style={{ width: '12%' }} />
                            </colgroup>
                            <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-2.5 py-2 text-left font-semibold">{t('auto.urun')}</th>
                                    <th className="px-2.5 py-2 text-left font-semibold">{t('common.location')}</th>
                                    <th className="px-2.5 py-2 text-right font-semibold">{t('common.quantity')}</th>
                                    <th className="px-2.5 py-2 text-right font-semibold">{t('auto.alis_fiyati')}</th>
                                    <th className="px-2.5 py-2 text-right font-semibold">{t('common.total')}</th>
                                    <th className="px-2.5 py-2 text-left font-semibold">{t('auto.son_alim')}</th>
                                </tr>
                                {/* Kolon bazlı filtre satırı — ürün ve lokasyon metinle daraltır. */}
                                <tr data-filter-row className="bg-white">
                                    <th className="px-2 py-1.5 font-normal">
                                        <input value={productFilter} onChange={(e) => setProductFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={SUPPLIER_FILTER_CONTROL} />
                                    </th>
                                    <th className="px-2 py-1.5 font-normal">
                                        <input value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={SUPPLIER_FILTER_CONTROL} />
                                    </th>
                                    <th className="px-2 py-2" />
                                    <th className="px-2 py-2" />
                                    <th className="px-2 py-2" />
                                    <th className="px-2 py-2" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-[12.5px] text-slate-400">{t('auto.arama_sonucu_yok')}</td>
                                    </tr>
                                ) : filteredProducts.map((row) => (
                                    <tr
                                        key={row.id}
                                        className="cursor-pointer transition-colors hover:bg-slate-100"
                                        onClick={() => navigate(`/inventory/articles/${row.articleId}`)}
                                    >
                                        <td className="px-2.5 py-2">
                                            <span className="block truncate font-semibold text-slate-900">{row.article?.name || row.articleId}</span>
                                            <span className="text-[11px] text-slate-500">{row.article?.articleCode || '-'} · {row.supplierSku || '-'}</span>
                                        </td>
                                        <td className="px-2.5 py-2 text-slate-600"><span className="block truncate">{row.location?.locationName || '-'}</span></td>
                                        <td className="px-2.5 py-2 text-right font-mono whitespace-nowrap">{number(row.quantity)} {row.article?.unit || ''}</td>
                                        <td className="px-2.5 py-2 text-right font-mono">{money(row.purchasePrice)}</td>
                                        <td className="px-2.5 py-2 text-right font-mono">{money(Number(row.quantity || 0) * Number(row.purchasePrice || 0))}</td>
                                        <td className="px-2.5 py-2 text-slate-600 whitespace-nowrap">{row.lastPurchaseDate ? dayjs(row.lastPurchaseDate).format('DD.MM.YYYY') : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-xs">
        <div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div>
        <div className="mt-1 font-semibold text-slate-950">{value}</div>
    </div>
);

const InfoLine = ({ label, value }: { label: string; value?: string | null }) => (
    <div className="flex items-baseline gap-2">
        <span className="w-20 shrink-0 text-[11px] font-semibold uppercase text-slate-400">{label}</span>
        <span className="min-w-0 truncate text-slate-700">{value || '—'}</span>
    </div>
);
