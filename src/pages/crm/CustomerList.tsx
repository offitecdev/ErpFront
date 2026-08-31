import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {

    Mail01 as Mail,
    MarkerPin01 as MapPin,
    Phone,
    Plus,
    X as XIcon,
} from '@/components/icons/antIconCompat';

import { getShared } from '../../lib/axios';
import { InventoryListHeader } from '../../components/inventory/InventoryListHeader';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { ColResizeHandle, FILTER_INPUT_CLASS, Pager, SearchBox, SectionCard, SortableTh, TableStateRow } from '../../components/ui-shared/TableKit';
import { useColumnWidths } from '../../hooks/useColumnWidths';
import { CUSTOMER_STATUS_OPTIONS, getCustomerStatusOption, getCustomerStatusLabel } from './customerType';
import { CustomerCreateModal } from './CustomerCreateModal';

import { t } from '@/i18n/translate';

// Sunucudan `fields=list` ile istenen daraltılmış satır — tablonun çizdiği
// kolonların birebir karşılığı. Buraya alan eklemek backend'deki
// CUSTOMER_LIST_SELECT'e de eklemeyi gerektirir.
interface CustomerRow {
    id: string;
    companyName: string;
    vatNumber?: string | null;
    mainEmail?: string | null;
    mainPhone?: string | null;
    responsibleFirstName?: string | null;
    responsibleLastName?: string | null;
    address?: string | null;
    status?: string | null;
}

// Sunucu sayfalı zarf döner; eski çağıranlarla uyum için düz dizi de kabul edilir.
type CustomerListResponse = CustomerRow[] | { items?: CustomerRow[]; total?: number; totalPages?: number };

// Not: Customer modelinde createdAt yok — sıralama yalnızca ad/VAT/durum kolonlarınadır.
type CustomerSortKey = 'companyName' | 'status';
type SortDirection = 'asc' | 'desc';

// Sürüklenebilir sütun genişlikleri (teklif satırları tablosundaki mekanik).
// Firma sütunu listede YOKTUR: genişliği olmayan tek sütun odur, artan yeri o
// emer — böylece bir sütun genişletilince sağda boşluk kalmaz.
//
// Kolon seti CRM sadeleştirmesiyle (2026-08-14) şu beşe indi: Firma, Telefon,
// E-posta, Ansprechpartner, Durum. Vergi numarası listeden çıktı — müşteri
// detayında duruyor.
//
// Genişlikler 20.08.2026'da ferahlatıldı: telefon sütunu "+41 61 311 98 88
// E-M…" diye kesiliyordu, yanında firma sütunu yarı boş duruyordu. Saklama
// anahtarı bu yüzden v2 — v1'i saklamış tarayıcılar da yeni ölçüyü alsın.
const CUSTOMER_LIST_COLUMN_WIDTHS = {
    phone: 200,
    email: 260,
    contact: 220,
    status: 152,
};
type CustomerListColumn = keyof typeof CUSTOMER_LIST_COLUMN_WIDTHS;
const CUSTOMER_LIST_COLUMNS = Object.keys(CUSTOMER_LIST_COLUMN_WIDTHS) as CustomerListColumn[];

export const CustomerList = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);

    // Sütun genişlikleri: başlıkların sol kenarından sürüklenir, çift tıklama
    // varsayılana döndürür, seçim tarayıcıda saklanır.
    const { widths, setColRef, startResize, resetColumn } = useColumnWidths<CustomerListColumn>({
        storageKey: 'offitec:customer-list:col-widths:v2',
        defaults: CUSTOMER_LIST_COLUMN_WIDTHS,
        minPx: 72,
    });

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    // Arama önerileri — ayrı bir istek atmaz; listenin zaten çektiği satırlardan
    // türetilir (aşağıdaki `suggestions`).
    const [suggestOpen, setSuggestOpen] = useState(false);
    // Kolon bazlı filtreler (tablo başlığı altındaki filtre satırı) — sunucuda daraltır.
    const [companyFilter, setCompanyFilter] = useState('');
    const [emailFilter, setEmailFilter] = useState('');
    const [debouncedColumns, setDebouncedColumns] = useState({ companyName: '', email: '' });
    const [statusFilter, setStatusFilter] = useState('');
    const [sortBy, setSortBy] = useState<CustomerSortKey>('companyName');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [reloadTick, setReloadTick] = useState(0);
    const PAGE_SIZE = 15;

    // `?create=1` (CRM overview quick action) lands with the modal already open.
    const [showForm, setShowForm] = useState(() => new URLSearchParams(location.search).has('create'));

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
                    email: emailFilter.trim(),
                };
                return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
            });
        }, 300);
        return () => clearTimeout(id);
    }, [companyFilter, emailFilter]);

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
                if (debouncedColumns.email) params.set('email', debouncedColumns.email);
                if (statusFilter) params.set('status', statusFilter);
                params.set('sortBy', sortBy);
                params.set('sortDirection', sortDirection);
                // Gövde tablonun kolonlarıyla sınırlı (bkz. CustomerRow).
                params.set('fields', 'list');
                // getShared: StrictMode'un çift koşan efekti tek HTTP isteğine iner.
                const res = await getShared<CustomerListResponse>(`/customers?${params.toString()}`);
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

    // Öneriler tablonun mevcut satırlarından türetilir — ayrı bir istek yok.
    // Sunucu `debouncedSearch` ile zaten daralttı; burada canlı `search` ile
    // bir kez daha süzmek, debounce beklenirken listeyi anında daraltır.
    const suggestions = useMemo(() => {
        const q = search.trim().toLowerCase();
        const rows = q
            ? customers.filter((c) =>
                c.companyName.toLowerCase().includes(q)
                || (c.mainEmail || '').toLowerCase().includes(q)
                || (c.vatNumber || '').toLowerCase().includes(q))
            : customers;
        return rows.slice(0, 10);
    }, [customers, search]);

    // Ürün listesiyle aynı davranış: aynı kolona tıklandıkça asc/desc döner.
    const toggleSort = (column: CustomerSortKey) => {
        setSortDirection(sortBy === column && sortDirection === 'asc' ? 'desc' : 'asc');
        setSortBy(column);
    };

    const totalPagesSafe = Math.max(1, totalPages);
    const pageSafe = Math.min(page, totalPagesSafe);
    const hasFilters = Boolean(debouncedSearch || debouncedColumns.companyName || debouncedColumns.email || statusFilter);

    // Telefon kartında her hücrenin başına kendi sütun adı yazılır
    // (`data-label`); metin başlıkla AYNI çeviri anahtarından gelir.
    const colLabel = {
        phone: t('common.phone'),
        email: t('common.email'),
        contact: t('crm.customers.colContact'),
        status: t('common.status'),
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('nav.customerList')}
                action={
                    <button
                        type="button"
                        onClick={() => setShowForm(!showForm)}
                        className={showForm
                            ? 'flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/10'
                            : 'ofi-btn-brand flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1f2654]'}
                    >
                        {showForm ? <XIcon size={14} /> : <Plus size={14} />}
                        {showForm ?t('common.close') :t('crm.customers.newCustomer')}
                    </button>
                }
            />

            {/* Anlegen läuft über ein Fenster (CustomerCreateModal) — das
                aufklappende Formular an dieser Stelle ist entfallen. */}
            <CustomerCreateModal
                open={showForm}
                onClose={() => setShowForm(false)}
                onCreated={() => { setPage(1); setReloadTick((n) => n + 1); }}
            />

            {/* Üst çubuk — ürün listesiyle aynı: genel arama + durum seçici.
                Telefonda ikisi de tam genişlik: 390px'te yan yana sıkışmak
                yerine alt alta, dokunulacak kadar geniş dururlar. */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                    <SearchBox
                        value={search}
                        onChange={setSearch}
                        placeholder={t('crm.customers.search')}
                        onFocus={() => setSuggestOpen(true)}
                        onBlur={() => setSuggestOpen(false)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setSuggestOpen(false); }}
                    />
                    {suggestOpen && (
                        // Öneri paneli — mousedown'da preventDefault, tıklama input blur'undan
                        // önce paneli kapatmasın diye (blur listeyi gizler, click kaybolurdu).
                        <div
                            onMouseDown={(e) => e.preventDefault()}
                            className="absolute left-0 top-full z-20 mt-1 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-white/15 dark:bg-slate-900"
                        >
                            {loading && suggestions.length === 0 ? (
                                <div className="px-3 py-2.5 text-[12px] text-slate-400">{t('common.loading')}</div>
                            ) : suggestions.length === 0 ? (
                                <div className="px-3 py-2.5 text-[12px] text-slate-400">{t('crm.customers.noCustomersSearch')}</div>
                            ) : (
                                <ul className="max-h-80 overflow-y-auto py-1">
                                    {suggestions.map((c) => (
                                        <li key={c.id}>
                                            <button
                                                type="button"
                                                onClick={() => { setSuggestOpen(false); navigate(`/crm/customers/${c.id}`); }}
                                                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-white/5"
                                            >
                                                <div className="flex size-6 shrink-0 items-center justify-center rounded bg-blue-50 text-[10px] font-semibold text-blue-700">
                                                    {c.companyName.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate text-[12.5px] font-medium text-slate-800 dark:text-white">{c.companyName}</div>
                                                    {(c.mainEmail || c.vatNumber) && (
                                                        <div className="truncate text-[11px] text-slate-400">{c.mainEmail || c.vatNumber}</div>
                                                    )}
                                                </div>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
                <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    aria-label={t('common.status')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#1f2654] focus:outline-none sm:w-auto dark:border-white/20 dark:bg-transparent dark:text-white"
                >
                    <option value="">{t('common.all')}</option>
                    {CUSTOMER_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                    ))}
                </select>
            </div>

            <SectionCard title={`${t('nav.customerList')} (${total})`}>
                {/* `data-list-table`: ferah satır ölçüsü + telefonda kart
                    görünümü (bkz. index.css "ÜBERSICHTSLISTEN"). */}
                <table data-inv-table data-list-table data-grid-lines data-unstyled-table className="w-full">
                    {/* Firma sütununun genişliği yoktur: kalan yeri o emer. */}
                    <colgroup>
                        <col />
                        {CUSTOMER_LIST_COLUMNS.map((key) => (
                            <col key={key} ref={setColRef(key)} style={{ width: widths[key] }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            {/* Kolon başlıkları KISA `col*` anahtarlarından gelir. Başlık
                                şeridi `white-space: nowrap` (bkz. index.css) ve tablo
                                `table-layout: fixed`: uzun ad "Steueridentifikationsnummer"
                                tek parça olduğu için sarılamaz, hücreden taşar ve yandaki
                                "Kontakt" başlığının üstüne binerdi. Kolon da bir tık geniş —
                                başlıklar arasında gözle görülür boşluk kalsın. */}
                            <SortableTh label={t('common.company')} sortKey="companyName" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" />
                            <th className="relative text-left">
                                {t('common.phone')}
                                <ColResizeHandle onResizeStart={(event) => startResize('phone', event)} onResizeReset={() => resetColumn('phone')} />
                            </th>
                            <th className="relative text-left">
                                {t('common.email')}
                                <ColResizeHandle onResizeStart={(event) => startResize('email', event)} onResizeReset={() => resetColumn('email')} />
                            </th>
                            <th className="relative text-left">
                                {t('crm.customers.colContact')}
                                <ColResizeHandle onResizeStart={(event) => startResize('contact', event)} onResizeReset={() => resetColumn('contact')} />
                            </th>
                            {/* Detay sütunu YOK: satıra tıklamak zaten müşteri
                                detayını açıyor. */}
                            <SortableTh label={t('common.status')} sortKey="status" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" onResizeStart={(event) => startResize('status', event)} onResizeReset={() => resetColumn('status')} />
                        </tr>
                        {/* Kolon bazlı filtre satırı — şirket / e-posta metinle daraltır. */}
                        <tr data-filter-row>
                            <th className="pb-1.5">
                                <input
                                    value={companyFilter}
                                    onChange={(e) => setCompanyFilter(e.target.value)}
                                    placeholder={`${t('common.filter')}...`}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            {/* Filtresi olmayan sütun da KENDİ hücresini alır (tek
                                bir `colSpan` değil): boş kalabilir ama sütun
                                çizgisi filtre satırında da kesilmeden sürsün. */}
                            <th />
                            <th className="pb-1.5">
                                <input
                                    value={emailFilter}
                                    onChange={(e) => setEmailFilter(e.target.value)}
                                    placeholder={`${t('common.filter')}...`}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            <th />
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || customers.length === 0) && (
                            <TableStateRow
                                colSpan={5}
                                loading={loading}
                                emptyText={hasFilters ?t('crm.customers.noCustomersSearch') :t('crm.customers.noCustomersEmpty')}
                            />
                        )}
                        {!loading && customers.map((c) => (
                            <tr
                                key={c.id}
                                className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                onClick={() => navigate(`/crm/customers/${c.id}`)}
                            >
                                <td>
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-blue-50 text-[12px] font-semibold text-blue-700">
                                            {c.companyName.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="truncate font-semibold text-slate-900 dark:text-white">{c.companyName}</div>
                                            {c.address && (
                                                <div className="ofi-list-sub flex items-center gap-1 text-[11.5px] text-slate-400">
                                                    <MapPin size={10} className="shrink-0" /><span className="truncate">{c.address}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td data-label={colLabel.phone}>
                                    <div className="flex items-center gap-1.5 text-[12.5px] text-slate-700 dark:text-white/80">
                                        <Phone size={11} className="shrink-0 text-slate-400" />
                                        <span className="truncate">{c.mainPhone || <span className="text-slate-300 dark:text-white/30">—</span>}</span>
                                    </div>
                                </td>
                                <td data-label={colLabel.email}>
                                    <div className="flex items-center gap-1.5 text-[12.5px] text-slate-700 dark:text-white/80">
                                        <Mail size={11} className="shrink-0 text-slate-400" />
                                        <span className="truncate">{c.mainEmail || <span className="text-slate-300 dark:text-white/30">—</span>}</span>
                                    </div>
                                </td>
                                <td data-label={colLabel.contact} className="truncate text-[12.5px] text-slate-600 dark:text-white/70">
                                    {[c.responsibleFirstName, c.responsibleLastName].filter(Boolean).join(' ')
                                        || <span className="text-slate-300 dark:text-white/30">—</span>}
                                </td>
                                <td data-label={colLabel.status}>
                                    <StatusChip variant={getCustomerStatusOption(c.status).variant}>
                                        {getCustomerStatusLabel(c.status)}
                                    </StatusChip>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={pageSafe}
                        totalPages={totalPagesSafe}
                        total={total}
                        pageSize={PAGE_SIZE}
                        onPage={setPage}
                    />
                </div>
            </SectionCard>
        </div>
    );
};
