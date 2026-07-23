import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    ArrowDown,
    ArrowUp,
    Building02 as Building2,
    ChevronLeft,
    ChevronRight,
    Eye,
    Hash01 as Hash,
    Mail01 as Mail,
    MarkerPin01 as MapPin,
    Phone,
    Plus,
    Save01 as Save,
    SearchLg as Search,
    X as XIcon,
} from '@/components/icons/antIconCompat';
import Tooltip from 'antd/es/tooltip';

import { apiClient } from '../../lib/axios';
import { InventoryListHeader } from '../../components/inventory/InventoryListHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { CUSTOMER_TYPE_OPTIONS, CUSTOMER_LANGUAGE_OPTIONS, CUSTOMER_STATUS_OPTIONS, DEFAULT_CUSTOMER_TYPE, DEFAULT_CUSTOMER_STATUS, getCustomerStatusOption, getCustomerStatusLabel } from './customerType';

import { t } from '@/i18n/translate';

interface CustomerRow {
    id: string;
    companyName: string;
    vatNumber?: string | null;
    mainEmail?: string | null;
    mainPhone?: string | null;
    address?: string | null;
    status?: string | null;
    isActive: boolean;
}

// Filtre satırı kontrolü — Teklifler/Ürünler listesindeki desenle aynı: alan hücreyle
// bütünleşik, odaklanınca yumuşak kenarlı soluk bir zemin belirir.
const CUSTOMER_FILTER_CONTROL =
    'h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-normal normal-case tracking-normal text-slate-700 placeholder:text-slate-400 transition-colors hover:bg-slate-100 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10';

// Not: Customer modelinde createdAt yok — sıralama yalnızca ad/VAT/durum kolonlarınadır.
type CustomerSortKey = 'companyName' | 'vatNumber' | 'status';
type SortDirection = 'asc' | 'desc';

const SortableHeader = ({
    label,
    column,
    sortBy,
    sortDirection,
    onSort,
    align = 'left',
}: {
    label: ReactNode;
    column: CustomerSortKey;
    sortBy: CustomerSortKey;
    sortDirection: SortDirection;
    onSort: (column: CustomerSortKey, direction: SortDirection) => void;
    align?: 'left' | 'right' | 'center';
}) => (
    <th className={`px-4 py-2.5 font-semibold ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
        <div className={`flex min-w-0 items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
            <span className="truncate">{label}</span>
            <span className="inline-flex shrink-0 items-center">
                <Tooltip title={t('common.sortAscending')}>
                    <button
                        type="button"
                        aria-label={t('common.sortAscending')}
                        aria-pressed={sortBy === column && sortDirection === 'asc'}
                        onClick={() => onSort(column, 'asc')}
                        className={`flex size-4 items-center justify-center rounded transition-colors hover:bg-slate-200 ${
                            sortBy === column && sortDirection === 'asc' ? 'text-[#272f67]' : 'text-slate-400'
                        }`}
                    >
                        <ArrowUp size={10} />
                    </button>
                </Tooltip>
                <Tooltip title={t('common.sortDescending')}>
                    <button
                        type="button"
                        aria-label={t('common.sortDescending')}
                        aria-pressed={sortBy === column && sortDirection === 'desc'}
                        onClick={() => onSort(column, 'desc')}
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

export const CustomerList = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    // Kolon bazlı filtreler (tablo başlığı altındaki filtre satırı) — sunucuda daraltır.
    const [companyFilter, setCompanyFilter] = useState('');
    const [vatFilter, setVatFilter] = useState('');
    const [emailFilter, setEmailFilter] = useState('');
    const [debouncedColumns, setDebouncedColumns] = useState({ companyName: '', vatNumber: '', email: '' });
    const [statusFilter, setStatusFilter] = useState('');
    const [sortBy, setSortBy] = useState<CustomerSortKey>('companyName');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [reloadTick, setReloadTick] = useState(0);
    const PAGE_SIZE = 15;

    // `?create=1` (CRM overview quick action) lands with the form already open.
    const [showForm, setShowForm] = useState(() => new URLSearchParams(location.search).has('create'));
    const [submitting, setSubmitting] = useState(false);
    const [submitAttempted, setSubmitAttempted] = useState(false);

    const [form, setForm] = useState({
        companyName: '',
        customerType: DEFAULT_CUSTOMER_TYPE,
        vatNumber: '',
        priceList: '',
        mainEmail: '',
        mainPhone: '',
        mobilePhone: '',
        website: '',
        language: '',
        responsibleFirstName: '',
        responsibleLastName: '',
        addressName: '',
        address: '',
        postalCode: '',
        city: '',
        country: '',
        status: DEFAULT_CUSTOMER_STATUS,
    });

    // Sunucu taraflı arama — tuş vuruşlarını debounce et.
    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(search.trim()), 250);
        return () => clearTimeout(id);
    }, [search]);

    // Kolon filtreleri de debounce edilir; değer değişmediyse önceki nesne korunur.
    useEffect(() => {
        const id = setTimeout(() => {
            setDebouncedColumns((prev) => {
                const next = {
                    companyName: companyFilter.trim(),
                    vatNumber: vatFilter.trim(),
                    email: emailFilter.trim(),
                };
                return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
            });
        }, 300);
        return () => clearTimeout(id);
    }, [companyFilter, vatFilter, emailFilter]);

    // Filtre değişimi + sayfa sıfırlama TEK efekte toplanır: filtre değiştiğinde
    // sayfa > 1 ise önce sayfa sıfırlanır ve o tur fetch atlanır. reloadTick
    // filtre anahtarına dâhil DEĞİL — kayıt eklendikten sonra sayfayı sıfırlamadan yeniler.
    const filterKeyRef = useRef<string | null>(null);
    useEffect(() => {
        const filterKey = JSON.stringify([debouncedSearch, debouncedColumns, statusFilter, sortBy, sortDirection]);
        const filtersChanged = filterKeyRef.current !== null && filterKeyRef.current !== filterKey;
        filterKeyRef.current = filterKey;
        if (filtersChanged && page !== 1) {
            setPage(1);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
                if (debouncedSearch) params.set('search', debouncedSearch);
                if (debouncedColumns.companyName) params.set('companyName', debouncedColumns.companyName);
                if (debouncedColumns.vatNumber) params.set('vatNumber', debouncedColumns.vatNumber);
                if (debouncedColumns.email) params.set('email', debouncedColumns.email);
                if (statusFilter) params.set('status', statusFilter);
                params.set('sortBy', sortBy);
                params.set('sortDirection', sortDirection);
                const res = await apiClient.get(`/customers?${params.toString()}`);
                if (cancelled) return;
                if (Array.isArray(res.data)) {
                    setCustomers(res.data || []);
                    setTotal(res.data?.length || 0);
                    setTotalPages(1);
                } else {
                    setCustomers(res.data.items || []);
                    setTotal(res.data.total || 0);
                    setTotalPages(res.data.totalPages || 1);
                }
            } catch {
                if (cancelled) return;
                toast.error(t('crm.customers.errorLoad'));
                setCustomers([]);
                setTotal(0);
                setTotalPages(1);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [page, debouncedSearch, debouncedColumns, statusFilter, sortBy, sortDirection, reloadTick]);

    const handleSort = (column: CustomerSortKey, direction: SortDirection) => {
        setSortBy(column);
        setSortDirection(direction);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitAttempted(true);
        if (!form.companyName.trim()) {
            toast.error(t('crm.customers.companyNameRequired'));
            return;
        }
        try {
            setSubmitting(true);
            await apiClient.post('/customers', form);
            toast.success(t('crm.customers.successAdd'));
            setForm({
                companyName: '', customerType: DEFAULT_CUSTOMER_TYPE, vatNumber: '', priceList: '',
                mainEmail: '', mainPhone: '', mobilePhone: '', website: '', language: '',
                responsibleFirstName: '', responsibleLastName: '',
                addressName: '', address: '', postalCode: '', city: '', country: '',
                status: DEFAULT_CUSTOMER_STATUS,
            });
            setSubmitAttempted(false);
            setShowForm(false);
            setPage(1);
            setReloadTick((n) => n + 1);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('crm.customers.errorAdd'));
        } finally {
            setSubmitting(false);
        }
    };

    const totalPagesSafe = Math.max(1, totalPages);
    const pageSafe = Math.min(page, totalPagesSafe);
    const rangeFrom = total === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
    const rangeTo = Math.min(pageSafe * PAGE_SIZE, total);

    return (
        <div>
            <InventoryListHeader
                title={t('nav.customerList')}
                action={
                    <Button
                        variant={showForm ? 'secondary' : 'primary'}
                        icon={showForm ? <XIcon size={13} /> : <Plus size={13} />}
                        onClick={() => {
                            setSubmitAttempted(false);
                            setShowForm(!showForm);
                        }}
                    >
                        {showForm ?t('common.close') :t('crm.customers.newCustomer')}
                    </Button>
                }
            />

            {/* Inline add form (NOT a popup/modal) */}
            {showForm && (
                <Card
                    title={t('crm.customers.newCustomer')}
                    description={t('crm.customers.newCustomerDesc')}
                    icon={<Plus size={13} />}
                    className="mb-4"
                >
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {submitAttempted && !form.companyName.trim() && (
                            <div className="md:col-span-3 flex flex-wrap items-center gap-2 rounded-md border border-utility-yellow-200 bg-warning-primary px-3 py-2 text-[12px] text-warning-primary">
                                <StatusChip variant="warning">{t('common.required')}</StatusChip>
                                <span className="font-medium">{t('crm.customers.requiredFieldWarning')}</span>
                            </div>
                        )}
                        <Field label={t('crm.customers.companyName')} required className="md:col-span-2" error={submitAttempted && !form.companyName.trim() ?t('crm.customers.companyNameRequired') : null}>
                            <Input
                                value={form.companyName}
                                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                                placeholder={t('crm.customers.companyNamePlaceholder')}
                            />
                        </Field>
                        <Field label={t('crm.customers.customerType')}>
                            <Select
                                value={form.customerType}
                                onChange={(e) => setForm({ ...form, customerType: e.target.value })}
                            >
                                {CUSTOMER_TYPE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                                ))}
                            </Select>
                        </Field>
                        <Field label={t('common.status')}>
                            <Select
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                            >
                                {CUSTOMER_STATUS_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                                ))}
                            </Select>
                        </Field>
                        <Field label={t('crm.customers.vatNumber')}>
                            <Input value={form.vatNumber}
                                onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} />
                        </Field>
                        <Field label={t('crm.customers.pricelist')}>
                            <Input value={form.priceList}
                                onChange={(e) => setForm({ ...form, priceList: e.target.value })} />
                        </Field>
                        <Field label={t('crm.customers.language')}>
                            <Select
                                value={form.language}
                                onChange={(e) => setForm({ ...form, language: e.target.value })}
                            >
                                <option value="">{t('common.select')}</option>
                                {CUSTOMER_LANGUAGE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                                ))}
                            </Select>
                        </Field>
                        <Field label={t('common.email')}>
                            <Input type="email" value={form.mainEmail}
                                onChange={(e) => setForm({ ...form, mainEmail: e.target.value })} />
                        </Field>
                        <Field label={t('common.phone')}>
                            <Input value={form.mainPhone}
                                onChange={(e) => setForm({ ...form, mainPhone: e.target.value })} />
                        </Field>
                        <Field label={t('crm.customers.mobilePhone')}>
                            <Input value={form.mobilePhone}
                                onChange={(e) => setForm({ ...form, mobilePhone: e.target.value })} />
                        </Field>
                        <Field label={t('crm.customers.website')}>
                            <Input value={form.website}
                                onChange={(e) => setForm({ ...form, website: e.target.value })}
                                placeholder="https://" />
                        </Field>
                        <Field label={t('crm.customers.responsibleEmployee')}>
                            <div className="flex gap-2">
                                <Input value={form.responsibleFirstName}
                                    onChange={(e) => setForm({ ...form, responsibleFirstName: e.target.value })}
                                    placeholder={t('crm.customers.responsibleFirstName')} />
                                <Input value={form.responsibleLastName}
                                    onChange={(e) => setForm({ ...form, responsibleLastName: e.target.value })}
                                    placeholder={t('crm.customers.responsibleLastName')} />
                            </div>
                        </Field>
                        <div className="md:col-span-3 mt-1 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                            <MapPin size={11} /> {t('crm.locationPrimary')}
                        </div>
                        <Field label={t('crm.locationName')} className="md:col-span-3">
                            <Input value={form.addressName}
                                onChange={(e) => setForm({ ...form, addressName: e.target.value })} />
                        </Field>
                        <Field label={t('common.address')} className="md:col-span-3">
                            <Input value={form.address}
                                onChange={(e) => setForm({ ...form, address: e.target.value })} />
                        </Field>
                        <Field label={t('crm.postalCode')}>
                            <Input value={form.postalCode}
                                onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
                        </Field>
                        <Field label={t('crm.city')}>
                            <Input value={form.city}
                                onChange={(e) => setForm({ ...form, city: e.target.value })} />
                        </Field>
                        <Field label={t('crm.country')}>
                            <Input value={form.country}
                                onChange={(e) => setForm({ ...form, country: e.target.value })} />
                        </Field>
                        <div className="md:col-span-3 flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            <Button variant="secondary" type="button" onClick={() => { setSubmitAttempted(false); setShowForm(false); }}>{t('common.cancel')}</Button>
                            <Button variant="primary" type="submit" loading={submitting} icon={<Save size={13} />}>{t('crm.customers.saveCustomer')}</Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card noPadding>
                {/* Üst çubuk — arama (esner) + sıralama + sayfalama (sağda).
                    Durum filtresi kolon filtre satırındadır. */}
                <div className="px-3 py-3">
                    <div className="flex w-full flex-wrap items-center gap-3">
                        <div className="relative w-[240px] min-w-0 shrink">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('crm.customers.search')}
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
                                    <XIcon size={12} />
                                </button>
                            )}
                        </div>
                        <div className="w-[200px] shrink-0">
                            <Select
                                value={`${sortBy}:${sortDirection}`}
                                onChange={(event) => {
                                    const [column, direction] = event.target.value.split(':') as [CustomerSortKey, SortDirection];
                                    handleSort(column, direction);
                                }}
                                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                                aria-label={t('common.sortOrder')}
                            >
                                {sortBy !== 'companyName' && (
                                    <option value={`${sortBy}:${sortDirection}`}>{t('common.sortOrder')}</option>
                                )}
                                <option value="companyName:asc">{t('common.sortNameAsc')}</option>
                                <option value="companyName:desc">{t('common.sortNameDesc')}</option>
                            </Select>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-3">
                            <span className="font-mono text-[12px] text-slate-500">
                                {rangeFrom}-{rangeTo} / {total}
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
                                <span className="px-1 font-mono text-[12px] tabular-nums text-slate-500">{pageSafe} / {totalPagesSafe}</span>
                                <button
                                    type="button"
                                    disabled={pageSafe >= totalPagesSafe}
                                    onClick={() => setPage((p) => Math.min(totalPagesSafe, p + 1))}
                                    className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={t('common.next')}
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                        <table className="w-full table-fixed text-[13px] text-left [&_th]:border-r [&_th]:border-slate-200 [&_td]:border-r [&_td]:border-slate-200 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                            <colgroup>
                                <col style={{ width: '28%' }} />
                                <col style={{ width: '15%' }} />
                                <col style={{ width: '25%' }} />
                                <col style={{ width: '16%' }} />
                                <col style={{ width: '16%' }} />
                            </colgroup>
                            <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                                <tr>
                                    <SortableHeader label={t('common.company')} column="companyName" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                                    <SortableHeader label={t('crm.customers.vatNumber')} column="vatNumber" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                                    <th className="px-4 py-2.5 font-semibold">{t('crm.customers.colContact')}</th>
                                    <SortableHeader label={t('common.status')} column="status" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                                    <th className="px-4 py-2.5 font-semibold text-right">{t('common.actions')}</th>
                                </tr>
                                {/* Kolon bazlı filtre satırı — şirket / VAT / e-posta metinle, durum seçiciyle daraltır. */}
                                <tr data-filter-row className="bg-white border-b border-slate-100">
                                    <th className="px-2 py-1.5 font-normal">
                                        <input
                                            value={companyFilter}
                                            onChange={(e) => setCompanyFilter(e.target.value)}
                                            placeholder={`${t('common.filter')}...`}
                                            className={CUSTOMER_FILTER_CONTROL}
                                        />
                                    </th>
                                    <th className="px-2 py-1.5 font-normal">
                                        <input
                                            value={vatFilter}
                                            onChange={(e) => setVatFilter(e.target.value)}
                                            placeholder={`${t('common.filter')}...`}
                                            className={CUSTOMER_FILTER_CONTROL}
                                        />
                                    </th>
                                    <th className="px-2 py-1.5 font-normal">
                                        <input
                                            value={emailFilter}
                                            onChange={(e) => setEmailFilter(e.target.value)}
                                            placeholder={`${t('common.filter')}...`}
                                            className={CUSTOMER_FILTER_CONTROL}
                                        />
                                    </th>
                                    <th className="px-2 py-1.5 font-normal">
                                        <select
                                            value={statusFilter}
                                            onChange={(e) => setStatusFilter(e.target.value)}
                                            aria-label={t('common.status')}
                                            className={CUSTOMER_FILTER_CONTROL}
                                        >
                                            <option value="">{t('common.all')}</option>
                                            {CUSTOMER_STATUS_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                                            ))}
                                        </select>
                                    </th>
                                    <th className="px-2 py-2" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                                            <div className="mx-auto max-w-sm animate-pulse space-y-2">
                                                <div className="h-3 bg-slate-100 rounded" />
                                                <div className="h-3 bg-slate-100 rounded w-2/3 mx-auto" />
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {!loading && customers.length === 0 && (
                                    <tr>
                                        <td colSpan={5}>
                                            <EmptyState
                                                icon={<Building2 size={32} />}
                                                title={t('crm.customers.noCustomers')}
                                                description={debouncedSearch ?t('crm.customers.noCustomersSearch') :t('crm.customers.noCustomersEmpty')}
                                                action={
                                                    !debouncedSearch && (
                                                        <Button variant="primary" icon={<Plus size={13} />} onClick={() => { setSubmitAttempted(false); setShowForm(true); }}>{t('crm.customers.addFirst')}</Button>
                                                    )
                                                }
                                            />
                                        </td>
                                    </tr>
                                )}
                                {!loading && customers.map((c) => (
                                    <tr
                                        key={c.id}
                                        className="cursor-pointer transition-colors hover:bg-slate-50/80 active:bg-slate-100"
                                        onClick={() => navigate(`/crm/customers/${c.id}`)}
                                    >
                                        <td className="px-4 py-2.5">
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <div className="w-8 h-8 shrink-0 rounded bg-blue-50 text-blue-700 flex items-center justify-center font-semibold text-[12px]">
                                                    {c.companyName.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate font-semibold text-slate-900">{c.companyName}</div>
                                                    {c.address && (
                                                        <div className="text-[11.5px] text-slate-400 flex items-center gap-1 mt-0.5">
                                                            <MapPin size={10} className="shrink-0" /><span className="truncate">{c.address}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-[12px] text-slate-600">
                                            {c.vatNumber ? (
                                                <div className="flex items-center gap-1.5 font-mono">
                                                    <Hash size={10} className="text-slate-300 shrink-0" />
                                                    <span className="truncate">{c.vatNumber}</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-300">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-[12.5px]">
                                            <div className="flex items-center gap-1.5 text-slate-700">
                                                <Mail size={11} className="text-slate-400 shrink-0" />
                                                <span className="truncate">{c.mainEmail || <span className="text-slate-300">—</span>}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-500 text-[11.5px] mt-0.5">
                                                <Phone size={11} className="text-slate-400 shrink-0" />
                                                <span className="truncate">{c.mainPhone || <span className="text-slate-300">—</span>}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <StatusChip variant={getCustomerStatusOption(c.status).variant}>
                                                {getCustomerStatusLabel(c.status)}
                                            </StatusChip>
                                        </td>
                                        <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => navigate(`/crm/customers/${c.id}`)}
                                                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-blue-700 transition-colors hover:bg-blue-50 active:bg-blue-100"
                                            >
                                                <Eye size={12} />{t('common.detail')}<ChevronRight size={11} />
                                            </button>
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
