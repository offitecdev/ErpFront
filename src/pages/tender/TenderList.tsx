import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    ArrowDown,
    ArrowRight,
    ArrowUp,
    Building02 as Building2,
    ChevronLeft,
    ChevronRight,
    File05 as FileSpreadsheet,
    Plus,
    SearchLg as Search,
    UploadCloud02 as Upload,
    X,
    XClose,
} from '@/components/icons/antIconCompat';
import Tooltip from 'antd/es/tooltip';

import { InventoryListHeader } from '../../components/inventory/InventoryListHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Select } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { BlockingDialog } from '../../components/ui-shared/BlockingDialog';

import { useTenderStore } from '../../store/tenderStore';
import { useAuthStore } from '../../store/authStore';
import type { TenderListItem } from '../../types/tender';
import { formatMoney, toCurrencyCode } from '../../utils/currency';
import { localizeTenderNumber } from '../../utils/tenderNumber';

import { t as i18nT } from '@/i18n/translate';
import { isSourceSalesOrder } from './detail/utils/tenderStatus.utils';
import { useLanguageRefresh } from './detail/hooks/useLanguageRefresh';

// İş akışı iki durumludur: sipariş (projeye bağlı ya da kaynağı satış siparişi)
// veya taslak (diğer her şey). Ham Draft/Approved/Exported durumları listede
// "taslak" altında toplanır.
const isOrderTender = (tender: TenderListItem) =>
    Boolean(tender.projectId) || isSourceSalesOrder(tender.sourceStatus);

const tenderStatusLabel = (tender: TenderListItem) =>
    isOrderTender(tender) ?i18nT('crm.tenders.statusOrdered') :i18nT('crm.tenders.statusDraft');

const tenderStatusVariant = (tender: TenderListItem): 'passive' | 'order' =>
    isOrderTender(tender) ? 'order' : 'passive';

const tenderCreatorName = (tender: TenderListItem) =>
    tender.createdByName || tender.createdByEmail || tender.createdByEmployeeId || '—';

const initialsFromName = (value?: string | null) => {
    const cleaned = value?.trim();
    if (!cleaned || cleaned === '—') return '?';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const source = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [cleaned];
    return source.map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase();
};

const fmtMoney = (v?: number | null, currency?: string | null) =>
    typeof v === 'number' ? formatMoney(v, toCurrencyCode(currency)) : '—';

// Filtre satırı kontrolü — Ürünler listesindeki desenle aynı: alan hücreyle bütünleşik,
// odaklanınca yumuşak kenarlı soluk bir zemin belirir.
const TENDER_FILTER_CONTROL =
    'h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-normal normal-case tracking-normal text-slate-700 placeholder:text-slate-400 transition-colors hover:bg-slate-100 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10';

type TenderSortKey = 'tenderNumber' | 'customerName' | 'status' | 'createdAt';
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
    column: TenderSortKey;
    sortBy: TenderSortKey;
    sortDirection: SortDirection;
    onSort: (column: TenderSortKey, direction: SortDirection) => void;
    align?: 'left' | 'right' | 'center';
}) => (
    <th className={`px-4 py-2.5 font-semibold ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
        <div className={`flex min-w-0 items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
            <span className="truncate">{label}</span>
            <span className="inline-flex shrink-0 items-center">
                <Tooltip title={i18nT('common.sortAscending')}>
                    <button
                        type="button"
                        aria-label={i18nT('common.sortAscending')}
                        aria-pressed={sortBy === column && sortDirection === 'asc'}
                        onClick={() => onSort(column, 'asc')}
                        className={`flex size-4 items-center justify-center rounded transition-colors hover:bg-slate-200 ${
                            sortBy === column && sortDirection === 'asc' ? 'text-[#272f67]' : 'text-slate-400'
                        }`}
                    >
                        <ArrowUp size={10} />
                    </button>
                </Tooltip>
                <Tooltip title={i18nT('common.sortDescending')}>
                    <button
                        type="button"
                        aria-label={i18nT('common.sortDescending')}
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

export const TenderList = () => {
    useLanguageRefresh();
    const navigate = useNavigate();
    const { permissions } = useAuthStore();
    const canManage = permissions.length === 0 || permissions.includes('tenders.manage');
    const canImport = permissions.length === 0 || permissions.includes('tenders.import');

    const {
        list, listTotal, listPage, listTotalPages, loadingList, fetchList,
        importSalesOrderCsv,
    } = useTenderStore();

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    // Kolon bazlı filtreler (tablo başlığı altındaki filtre satırı) — sunucuda daraltır.
    const [tenderNoFilter, setTenderNoFilter] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [creatorFilter, setCreatorFilter] = useState('');
    const [debouncedColumns, setDebouncedColumns] = useState({
        tenderNumber: '',
        customerName: '',
        creatorName: '',
    });
    // İki durumlu filtre (taslak / sipariş) ve e-posta gönderim filtresi.
    const [orderState, setOrderState] = useState<'' | 'draft' | 'order'>('');
    const [mailSent, setMailSent] = useState<'' | 'yes' | 'no'>('');
    const [sortBy, setSortBy] = useState<TenderSortKey>('createdAt');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;

    // Excel'den (Odoo satış siparişi CSV) içe aktarma — sipariş kayıtları oluşturur.
    const [importOpen, setImportOpen] = useState(false);
    const [importAttempted, setImportAttempted] = useState(false);
    const [importForm, setImportForm] = useState({ fileName: '', csvContent: '' });
    const [importing, setImporting] = useState(false);
    const importMissing = importOpen && importAttempted && !importForm.csvContent.trim();

    // Sunucu taraflı arama — tuş vuruşlarını debounce et, harf başına istek atma.
    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(id);
    }, [search]);

    // Kolon filtreleri de aynı şekilde debounce edilir; değer değişmediyse önceki
    // nesne korunur (aksi hâlde her mount sonrası fetch iki kez tetiklenirdi).
    useEffect(() => {
        const id = setTimeout(() => {
            setDebouncedColumns((prev) => {
                const next = {
                    tenderNumber: tenderNoFilter.trim(),
                    customerName: customerFilter.trim(),
                    creatorName: creatorFilter.trim(),
                };
                return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
            });
        }, 300);
        return () => clearTimeout(id);
    }, [tenderNoFilter, customerFilter, creatorFilter]);

    // Filtre değişimi + sayfa sıfırlama TEK efekte toplanır: filtre değiştiğinde
    // sayfa > 1 ise önce sayfa sıfırlanır ve o tur fetch atlanır.
    const filterKeyRef = useRef<string | null>(null);
    useEffect(() => {
        const filterKey = JSON.stringify([
            debouncedSearch,
            debouncedColumns,
            orderState,
            mailSent,
            sortBy,
            sortDirection,
        ]);
        const filtersChanged = filterKeyRef.current !== null && filterKeyRef.current !== filterKey;
        filterKeyRef.current = filterKey;
        if (filtersChanged && page !== 1) {
            setPage(1);
            return;
        }
        void fetchList({
            page,
            pageSize: PAGE_SIZE,
            search: debouncedSearch || undefined,
            orderState: orderState || undefined,
            mailSent: mailSent || undefined,
            tenderNumber: debouncedColumns.tenderNumber || undefined,
            customerName: debouncedColumns.customerName || undefined,
            creatorName: debouncedColumns.creatorName || undefined,
            sortBy,
            sortDirection,
        });
    }, [
        page,
        debouncedSearch,
        debouncedColumns,
        orderState,
        mailSent,
        sortBy,
        sortDirection,
        fetchList,
    ]);

    const handleSort = (column: TenderSortKey, direction: SortDirection) => {
        setSortBy(column);
        setSortDirection(direction);
    };

    const handleImportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (/\.xlsx?$/i.test(file.name)) {
            toast.error(i18nT('tenders.bu_aktarim_csv_dosyasiyla_calisir_lutfen_csv_dos'));
            e.currentTarget.value = '';
            return;
        }
        const text = await file.text();
        setImportForm({ fileName: file.name, csvContent: text });
    };

    const handleImport = async () => {
        setImportAttempted(true);
        if (!importForm.csvContent.trim()) {
            toast.error(i18nT('tenders.csv_file_zorunludur'));
            return;
        }
        try {
            setImporting(true);
            const created = await importSalesOrderCsv({
                csvContent: importForm.csvContent,
                fileName: importForm.fileName || null,
            });
            toast.success(i18nT('tenders.sales_order_csv_import_aktarildi'));
            setImportOpen(false);
            setImportAttempted(false);
            setImportForm({ fileName: '', csvContent: '' });
            if (created) navigate(`/crm/tenders/${created.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||i18nT('tenders.import_csv_failed'));
        } finally {
            setImporting(false);
        }
    };

    const totalPages = Math.max(1, listTotalPages);
    const pageSafe = Math.min(listPage, totalPages);
    const rangeFrom = listTotal === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
    const rangeTo = Math.min(pageSafe * PAGE_SIZE, listTotal);

    return (
        <div>
            <BlockingDialog
                open={importing}
                title={i18nT('tenders.import_csving')}
                description={i18nT('tenders.sales_order_satirlari_okunuyor_customer_product_v')}
            />
            <InventoryListHeader
                title={i18nT('crm.tenders.tableTitle')}
                action={
                    <div className="flex flex-wrap items-center gap-2">
                        {canImport && (
                            <Button variant="secondary" icon={<Upload size={13} />} onClick={() => { setImportAttempted(false); setImportOpen(true); }}>{i18nT('tenders.import_from_excel')}</Button>
                        )}
                        {canManage && (
                            <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/crm/tenders/new')}>{i18nT('tenders.new_tender')}</Button>
                        )}
                    </div>
                }
            />

            <Card noPadding>
                {/* Üst çubuk — arama (esner) + sıralama + sayfalama (sağda).
                    Durum ve e-posta filtreleri kolon filtre satırındadır. */}
                <div className="px-3 py-3">
                    <div className="flex w-full flex-wrap items-center gap-3">
                        <div className="relative w-[240px] min-w-0 shrink">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={i18nT('tenders.tender_no')}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-[13px] transition-colors focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    aria-label={i18nT('common.clear')}
                                    title={i18nT('common.clear')}
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
                                    const [column, direction] = event.target.value.split(':') as [TenderSortKey, SortDirection];
                                    handleSort(column, direction);
                                }}
                                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                                aria-label={i18nT('common.sortOrder')}
                            >
                                {sortBy !== 'createdAt' && (
                                    <option value={`${sortBy}:${sortDirection}`}>{i18nT('common.sortOrder')}</option>
                                )}
                                <option value="createdAt:desc">{i18nT('common.sortNewest')}</option>
                                <option value="createdAt:asc">{i18nT('common.sortOldest')}</option>
                            </Select>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-3">
                            <span className="font-mono text-[12px] text-slate-500">
                                {rangeFrom}-{rangeTo} / {listTotal}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    disabled={pageSafe <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={i18nT('common.back')}
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span className="px-1 font-mono text-[12px] tabular-nums text-slate-500">{pageSafe} / {totalPages}</span>
                                <button
                                    type="button"
                                    disabled={pageSafe >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={i18nT('common.next')}
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-[12.5px] text-left [&_th]:border-r [&_th]:border-slate-200 [&_td]:border-r [&_td]:border-slate-200 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                        <colgroup>
                            <col style={{ width: '13%' }} />
                            <col style={{ width: '19%' }} />
                            <col style={{ width: '7%' }} />
                            <col style={{ width: '13%' }} />
                            <col style={{ width: '15%' }} />
                            <col style={{ width: '11%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '10%' }} />
                        </colgroup>
                        <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                            <tr>
                                <SortableHeader label={i18nT('tenders.tender_no')} column="tenderNumber" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                                <SortableHeader label={i18nT('nav.quickActionsGroup.customers')} column="customerName" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                                <th className="px-4 py-2.5 font-semibold text-center">{i18nT('tenders.versiyon')}</th>
                                <SortableHeader label={i18nT('common.status')} column="status" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                                <th className="px-4 py-2.5 font-semibold">{i18nT('tenders.olusturan')}</th>
                                <th className="px-4 py-2.5 font-semibold text-right">{i18nT('common.amount')}</th>
                                <SortableHeader label={i18nT('tenders.olusturma')} column="createdAt" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                                <th className="px-4 py-2.5 font-semibold text-center">{i18nT('tenders.mail')}</th>
                            </tr>
                            {/* Kolon bazlı filtre satırı — teklif no / müşteri / oluşturan metinle,
                                durum (taslak/sipariş) ve e-posta (gönderildi/gönderilmedi) seçicilerle daraltır. */}
                            <tr data-filter-row className="bg-white border-b border-slate-100">
                                <th className="px-2 py-1.5 font-normal">
                                    <input
                                        value={tenderNoFilter}
                                        onChange={(e) => setTenderNoFilter(e.target.value)}
                                        placeholder={`${i18nT('common.filter')}...`}
                                        className={TENDER_FILTER_CONTROL}
                                    />
                                </th>
                                <th className="px-2 py-1.5 font-normal">
                                    <input
                                        value={customerFilter}
                                        onChange={(e) => setCustomerFilter(e.target.value)}
                                        placeholder={`${i18nT('common.filter')}...`}
                                        className={TENDER_FILTER_CONTROL}
                                    />
                                </th>
                                <th className="px-2 py-2" />
                                <th className="px-2 py-1.5 font-normal">
                                    <select
                                        value={orderState}
                                        onChange={(e) => setOrderState(e.target.value as '' | 'draft' | 'order')}
                                        aria-label={i18nT('common.status')}
                                        className={TENDER_FILTER_CONTROL}
                                    >
                                        <option value="">{i18nT('tenders.all_statuler')}</option>
                                        <option value="draft">{i18nT('crm.tenders.statusDraft')}</option>
                                        <option value="order">{i18nT('crm.tenders.statusOrdered')}</option>
                                    </select>
                                </th>
                                <th className="px-2 py-1.5 font-normal">
                                    <input
                                        value={creatorFilter}
                                        onChange={(e) => setCreatorFilter(e.target.value)}
                                        placeholder={`${i18nT('common.filter')}...`}
                                        className={TENDER_FILTER_CONTROL}
                                    />
                                </th>
                                <th className="px-2 py-2" />
                                <th className="px-2 py-2" />
                                <th className="px-2 py-1.5 font-normal">
                                    <select
                                        value={mailSent}
                                        onChange={(e) => setMailSent(e.target.value as '' | 'yes' | 'no')}
                                        aria-label={i18nT('tenders.mail')}
                                        className={TENDER_FILTER_CONTROL}
                                    >
                                        <option value="">{i18nT('common.all')}</option>
                                        <option value="yes">{i18nT('tenders.mail_sent')}</option>
                                        <option value="no">{i18nT('tenders.mail_not_sent')}</option>
                                    </select>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loadingList && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                                        <div className="mx-auto max-w-sm animate-pulse space-y-2">
                                            <div className="h-3 bg-slate-100 rounded" />
                                            <div className="h-3 bg-slate-100 rounded w-2/3 mx-auto" />
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loadingList && list.length === 0 && (
                                <tr>
                                    <td colSpan={8}>
                                        <EmptyState
                                            icon={<FileSpreadsheet size={32} />}
                                            title={i18nT('tenders.no_tenders_yet')}
                                            description={i18nT('tenders.crb_sia_451_dosyasini_import_aktarin_veya_sifirdan')}
                                            action={
                                                canManage && (
                                                    <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/crm/tenders/new')}>{i18nT('tenders.new_tender')}</Button>
                                                )
                                            }
                                        />
                                    </td>
                                </tr>
                            )}
                            {!loadingList && list.map((t) => (
                                <tr
                                    key={t.id}
                                    className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                                    onClick={() => navigate(`/crm/tenders/${t.id}`)}
                                >
                                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                                        <div className="flex items-center gap-1.5">
                                            <FileSpreadsheet size={13} className="text-[#272f67] shrink-0" />
                                            <span className="truncate">{localizeTenderNumber(t.tenderNumber)}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-700">
                                        <div className="flex items-center gap-1.5">
                                            <Building2 size={11} className="text-slate-400 shrink-0" />
                                            <span className="truncate">{t.customerName || '—'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-center text-slate-600 font-mono text-[11.5px]">
                                        v{t.version}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <StatusChip variant={tenderStatusVariant(t)}>
                                            {tenderStatusLabel(t)}
                                        </StatusChip>
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-600">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
                                                {initialsFromName(tenderCreatorName(t))}
                                            </span>
                                            <span className="truncate text-[12px] font-medium text-slate-700">
                                                {tenderCreatorName(t)}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-semibold text-slate-900 font-mono">
                                        {fmtMoney(t.grandTotal, t.currency)}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-500 text-[12px]">
                                        {dayjs(t.createdAt).format("DD.MM.YYYY HH:mm")}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        {t.offerMailSentAt ? (
                                            <span
                                                className="inline-flex items-center justify-center text-emerald-600"
                                                title={`${i18nT('tenders.mail')} · ${dayjs(t.offerMailSentAt).format("DD.MM.YYYY HH:mm")}`}
                                            >
                                                <ArrowRight size={16} />
                                            </span>
                                        ) : (
                                            <span
                                                className="inline-flex items-center justify-center text-slate-300"
                                                title={i18nT('tenders.mail')}
                                            >
                                                <XClose size={16} />
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Excel'den içe aktarma (Odoo satış siparişi CSV) — sipariş kayıtları oluşturur. */}
            <Modal
                open={importOpen}
                title={i18nT('tenders.import_from_excel')}
                description={i18nT('tenders.odoo_sales_order_csv_dosyasindaki_customer_uru')}
                onClose={() => { setImportOpen(false); setImportAttempted(false); }}
                width="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => { setImportOpen(false); setImportAttempted(false); }}>{i18nT('common.cancel')}</Button>
                        <Button variant="primary" loading={importing} onClick={handleImport}>{i18nT('tenders.import_from_excel')}</Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-3">
                    {importMissing && (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-utility-yellow-200 bg-warning-primary px-3 py-2 text-[12px] text-warning-primary">
                            <StatusChip variant="warning">{i18nT('common.required')}</StatusChip>
                            <span className="font-medium">{i18nT('tenders.cannot_import_without_csv_file')}</span>
                        </div>
                    )}
                    <Field label={i18nT('tenders.csv_file')} required hint={i18nT('tenders.csv_uzantili_sales_order_dosyasini_select')} error={importMissing ?i18nT('tenders.csv_file_zorunludur') : null}>
                        <input
                            type="file"
                            accept=".csv,text/csv"
                            onChange={handleImportUpload}
                            className="w-full text-[12px] file:mr-3 file:rounded file:border-0 file:bg-[#272f67]/10 file:px-3 file:py-1.5 file:font-medium file:text-[#272f67] hover:file:bg-[#272f67]/15"
                        />
                    </Field>
                    {importForm.fileName && (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-700">
                            {importForm.fileName}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};
