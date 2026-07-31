import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    Building02 as Building2,
    CheckCircle,
    ChevronRight,
    Eye,
    File05 as FileSpreadsheet,
    Plus,
    UploadCloud02 as Upload,
    XClose,
} from '@/components/icons/antIconCompat';

import { InventoryListHeader } from '../../components/inventory/InventoryListHeader';
import { Button } from '../../components/ui-shared/Button';
import { Field } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { BlockingDialog } from '../../components/ui-shared/BlockingDialog';
import { FILTER_INPUT_CLASS, Pager, SearchBox, SectionCard, SortableTh, TableStateRow } from '../../components/ui-shared/TableKit';

import { useTenderStore } from '../../store/tenderStore';
import { useAuthStore } from '../../store/authStore';
import type { TenderListItem } from '../../types/tender';
import { formatMoney, toCurrencyCode } from '../../utils/currency';
import { localizeTenderNumber } from '../../utils/tenderNumber';

import { t as i18nT } from '@/i18n/translate';
// İş akışı iki durumludur: sipariş (projeye bağlı ya da kaynağı satış siparişi)
// veya taslak (diğer her şey). Ham Draft/Approved/Exported durumları listede
// "taslak" altında toplanır. Aynı mantık müşteri detayındaki teklif reiterinde
// de kullanıldığından ortak yardımcıya taşındı.
import { tenderStatusLabel, tenderStatusVariant } from './detail/utils/tenderStatus.utils';
import { useLanguageRefresh } from './detail/hooks/useLanguageRefresh';

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

type TenderSortKey = 'tenderNumber' | 'customerName' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';

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
    // İki durumlu filtre (taslak / sipariş) ve e-posta gönderim filtresi — üst çubukta.
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
            // Gövde tablonun kolonlarıyla sınırlı — tam teklif kaydı LONGTEXT
            // coverLetter/closingNote/closingImages alanlarını da taşıyor.
            fields: 'list',
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

    // Müşteri listesiyle aynı davranış: aynı kolona tıklandıkça asc/desc döner.
    const toggleSort = (column: TenderSortKey) => {
        setSortDirection(sortBy === column && sortDirection === 'asc' ? 'desc' : 'asc');
        setSortBy(column);
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
    const hasFilters = Boolean(
        debouncedSearch
        || debouncedColumns.tenderNumber
        || debouncedColumns.customerName
        || debouncedColumns.creatorName
        || orderState
        || mailSent,
    );

    return (
        <div className="flex w-full flex-col gap-4">
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

            {/* Üst çubuk — müşteri listesiyle aynı: genel arama + durum ve e-posta seçicileri. */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="w-64">
                    <SearchBox
                        value={search}
                        onChange={setSearch}
                        placeholder={i18nT('tenders.tender_no')}
                    />
                </div>
                <select
                    value={orderState}
                    onChange={(event) => setOrderState(event.target.value as '' | 'draft' | 'order')}
                    aria-label={i18nT('common.status')}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
                >
                    <option value="">{i18nT('tenders.all_statuler')}</option>
                    <option value="draft">{i18nT('crm.tenders.statusDraft')}</option>
                    <option value="order">{i18nT('crm.tenders.statusOrdered')}</option>
                </select>
                <select
                    value={mailSent}
                    onChange={(event) => setMailSent(event.target.value as '' | 'yes' | 'no')}
                    aria-label={i18nT('tenders.mail')}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
                >
                    <option value="">{i18nT('common.all')}</option>
                    <option value="yes">{i18nT('tenders.mail_sent')}</option>
                    <option value="no">{i18nT('tenders.mail_not_sent')}</option>
                </select>
            </div>

            <SectionCard title={`${i18nT('crm.tenders.tableTitle')} (${listTotal})`}>
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <SortableTh label={i18nT('tenders.tender_no')} sortKey="tenderNumber" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" />
                            <SortableTh label={i18nT('nav.quickActionsGroup.customers')} sortKey="customerName" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="w-56 text-left" />
                            <SortableTh label={i18nT('common.status')} sortKey="status" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="w-32 text-left" />
                            <th className="w-44 text-left">{i18nT('tenders.olusturan')}</th>
                            <th className="w-36 text-right">{i18nT('common.amount')}</th>
                            <SortableTh label={i18nT('tenders.olusturma')} sortKey="createdAt" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="w-40 text-left" />
                            <th className="w-20 text-center">{i18nT('tenders.mail')}</th>
                            <th className="w-28 text-right" />
                        </tr>
                        {/* Kolon bazlı filtre satırı — teklif no / müşteri / oluşturan metinle daraltır. */}
                        <tr data-filter-row>
                            <th className="pb-1.5">
                                <input
                                    value={tenderNoFilter}
                                    onChange={(e) => setTenderNoFilter(e.target.value)}
                                    placeholder={`${i18nT('common.filter')}...`}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            <th className="pb-1.5">
                                <input
                                    value={customerFilter}
                                    onChange={(e) => setCustomerFilter(e.target.value)}
                                    placeholder={`${i18nT('common.filter')}...`}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            <th />
                            <th className="pb-1.5">
                                <input
                                    value={creatorFilter}
                                    onChange={(e) => setCreatorFilter(e.target.value)}
                                    placeholder={`${i18nT('common.filter')}...`}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            <th colSpan={4} />
                        </tr>
                    </thead>
                    <tbody>
                        {(loadingList || list.length === 0) && (
                            <TableStateRow
                                colSpan={8}
                                loading={loadingList}
                                emptyText={hasFilters ?i18nT('crmOverview.picker.empty') :i18nT('tenders.no_tenders_yet')}
                            />
                        )}
                        {!loadingList && list.map((t) => (
                            <tr
                                key={t.id}
                                className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                onClick={() => navigate(`/crm/tenders/${t.id}`)}
                            >
                                <td>
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-blue-50 text-blue-700 dark:bg-sky-500/15 dark:text-sky-300">
                                            <FileSpreadsheet size={14} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="truncate font-semibold text-slate-900 dark:text-white">{localizeTenderNumber(t.tenderNumber)}</div>
                                            <div className="mt-0.5 font-mono text-[11.5px] text-slate-400">v{t.version}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-slate-700 dark:text-white/80">
                                        <Building2 size={11} className="shrink-0 text-slate-400" />
                                        <span className="truncate">{t.customerName || <span className="text-slate-300 dark:text-white/30">—</span>}</span>
                                    </div>
                                </td>
                                <td>
                                    <StatusChip variant={tenderStatusVariant(t)}>
                                        {tenderStatusLabel(t)}
                                    </StatusChip>
                                </td>
                                <td>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70">
                                            {initialsFromName(tenderCreatorName(t))}
                                        </span>
                                        <span className="truncate text-[12.5px] text-slate-700 dark:text-white/80">
                                            {tenderCreatorName(t)}
                                        </span>
                                    </div>
                                </td>
                                <td className="text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-white">
                                    {fmtMoney(t.grandTotal, t.currency)}
                                </td>
                                <td className="text-[12.5px] text-slate-500 dark:text-white/60">
                                    {dayjs(t.createdAt).format('DD.MM.YYYY HH:mm')}
                                </td>
                                <td className="text-center">
                                    {t.offerMailSentAt ? (
                                        <span
                                            className="inline-flex items-center justify-center text-emerald-600 dark:text-emerald-400"
                                            title={`${i18nT('tenders.mail')} · ${dayjs(t.offerMailSentAt).format('DD.MM.YYYY HH:mm')}`}
                                        >
                                            <CheckCircle size={15} />
                                        </span>
                                    ) : (
                                        <span
                                            className="inline-flex items-center justify-center text-slate-300 dark:text-white/30"
                                            title={i18nT('tenders.mail')}
                                        >
                                            <XClose size={15} />
                                        </span>
                                    )}
                                </td>
                                <td className="text-right" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        onClick={() => navigate(`/crm/tenders/${t.id}`)}
                                        className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-blue-700 transition-colors hover:bg-blue-50 active:bg-blue-100 dark:text-sky-300 dark:hover:bg-sky-500/15"
                                    >
                                        <Eye size={12} />{i18nT('common.detail')}<ChevronRight size={11} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={pageSafe}
                        totalPages={totalPages}
                        total={listTotal}
                        pageSize={PAGE_SIZE}
                        onPage={setPage}
                    />
                </div>
            </SectionCard>

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
