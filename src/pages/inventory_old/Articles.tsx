// ARCHIVED: eski envanter modülü — yeni tablo-tabanlı modül src/pages/inventory altında. Bu dosya devre dışı bırakıldı.
// import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
// import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
// import { toast } from 'sonner';
// import {
//     AlertTriangle,
//     ArrowDown,
//     ArrowLeft,
//     ArrowUp,
//     Camera01 as Camera,
//     CheckCircle,
//     ChevronLeft,
//     ChevronRight,
//     ChevronSelectorVertical,
//     Image01 as ImageIcon,
//     List,
//     Package,
//     PackageX,
//     Plus,
//     Save01 as Save,
//     Scan as ScanBarcode,
//     SearchLg as Search,
//     Trash01 as Trash2,
//     UploadCloud02 as Upload,
//     X,
//     XCircle,
// } from '@/components/icons/antIconCompat';
// import Tooltip from 'antd/es/tooltip';
// 
// import { StockModuleHeader } from '../../components/layout/PageHeader';
// import { InventoryListHeader } from '../../components/inventory/InventoryListHeader';
// import { Card } from '../../components/ui-shared/Card';
// import { Button } from '../../components/ui-shared/Button';
// import { Field, Input, Select } from '../../components/ui-shared/Field';
// import { EmptyState } from '../../components/ui-shared/EmptyState';
// import { Skeleton } from '../../components/ui-shared/Skeleton';
// import { BarcodeScannerModal } from '../../components/ui-shared/BarcodeScannerModal';
// 
// import { useInventoryStore } from '../../store/inventoryStore';
// import { articleApi } from '../../lib/api/inventory';
// import { useAuthStore } from '../../store/authStore';
// import type { ArticleStatus, InventoryArticle, ItemType } from '../../types/inventory';
// import { RichTextMarkdownEditor } from '../tender/detail/TenderRichText';
// 
// const BRAND = '#272f67';
// 
// // Filtre satırı kontrolü — ayrı kutu/çerçeve YOK: alanlar hücreyle bütünleşik,
// // kolonlar yalnızca ince dikey çizgilerle ayrılır (birleşik filtre bandı).
// // Odaklanınca yumuşak kenarlı (rounded) soluk bir zemin belirir.
// const ARTICLE_FILTER_CONTROL =
//     'h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-normal normal-case tracking-normal text-slate-700 placeholder:text-slate-400 transition-colors hover:bg-slate-100 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10';
// 
// import { t } from '@/i18n/translate';
// import { useTranslation } from 'react-i18next';
// 
// const useLanguageRefresh = () => {
//     const { i18n } = useTranslation();
//     const [, setTick] = useState(0);
//     useEffect(() => {
//         const handler = () => setTick((tick) => tick + 1);
//         i18n.on('languageChanged', handler);
//         return () => i18n.off('languageChanged', handler);
//     }, [i18n]);
// };
// 
// const fmtMoney = (v: number) =>
//     new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v);
// 
// const fmtNumber = (v: number) =>
//     new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(v);
// 
// const articleUnitCost = (article: { baseCost?: number | null; weightedAverageCost?: number | null }) => {
//     const weightedAverageCost = Number(article.weightedAverageCost ?? 0);
//     return weightedAverageCost > 0 ? weightedAverageCost : Number(article.baseCost || 0);
// };
// 
// type ArticleSortKey =
//     | 'createdAt'
//     | 'articleCode'
//     | 'name'
//     | 'barcode'
//     | 'salePrice'
//     | 'totalQuantity'
//     | 'minStockLevel'
//     | 'status';
// 
// type SortDirection = 'asc' | 'desc';
// 
// const SortableHeader = ({
//     label,
//     column,
//     sortBy,
//     sortDirection,
//     onSort,
//     align = 'left',
// }: {
//     label: ReactNode;
//     column: ArticleSortKey;
//     sortBy: ArticleSortKey;
//     sortDirection: SortDirection;
//     onSort: (column: ArticleSortKey, direction: SortDirection) => void;
//     align?: 'left' | 'right';
// }) => (
//     <th className={`px-2 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
//         <div className={`flex min-w-0 items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
//             <span className="truncate">{label}</span>
//             <span className="inline-flex shrink-0 items-center">
//                 <Tooltip title={t('inventory.articles.sortAscending')}>
//                     <button
//                         type="button"
//                         aria-label={t('inventory.articles.sortAscending')}
//                         aria-pressed={sortBy === column && sortDirection === 'asc'}
//                         onClick={() => onSort(column, 'asc')}
//                         className={`flex size-4 items-center justify-center rounded transition-colors hover:bg-slate-200 ${
//                             sortBy === column && sortDirection === 'asc' ? 'text-[#272f67]' : 'text-slate-400'
//                         }`}
//                     >
//                         <ArrowUp size={10} />
//                     </button>
//                 </Tooltip>
//                 <Tooltip title={t('inventory.articles.sortDescending')}>
//                     <button
//                         type="button"
//                         aria-label={t('inventory.articles.sortDescending')}
//                         aria-pressed={sortBy === column && sortDirection === 'desc'}
//                         onClick={() => onSort(column, 'desc')}
//                         className={`flex size-4 items-center justify-center rounded transition-colors hover:bg-slate-200 ${
//                             sortBy === column && sortDirection === 'desc' ? 'text-[#272f67]' : 'text-slate-400'
//                         }`}
//                     >
//                         <ArrowDown size={10} />
//                     </button>
//                 </Tooltip>
//             </span>
//         </div>
//     </th>
// );
// 
// // Ürün / malzeme tip etiketleri — envanter kalemleri bu ikiye ayrılır, süreçler ortaktır.
// const ITEM_TYPE_LABEL = (): Record<ItemType, string> => ({
//     PRODUCT: t('auto.urun'),
//     MATERIAL: t('auto.malzeme'),
// });
// 
// const suggestCode = () => {
//     const year = new Date().getFullYear();
//     const rand = Math.floor(Math.random() * 9000) + 1000;
//     return `ART-${year}-${rand}`;
// };
// 
// const emptyArticle = (name = ''): Partial<InventoryArticle> => ({
//     articleCode: suggestCode(),
//     name,
//     description: '',
//     baseCost: 0,
//     salePrice: 0,
//     unit:t('auto.stk'),
//     supplierBarcode: '',
//     imageUrl: '',
//     category: '',
//     itemType: 'PRODUCT',
//     status: 'ACTIVE',
//     isActive: true,
//     minStockLevel: 10,
//     criticalStockLevel: 5,
//     maxStockLevel: 100,
//     lastPurchaseDate: null,
// });
// 
// export const Articles = () => {
//     useLanguageRefresh();
//     const navigate = useNavigate();
//     const { permissions } = useAuthStore();
//     const hasImplicitPermissions = permissions.length === 0;
//     const canCreate = hasImplicitPermissions || permissions.includes('inventory.articles.create');
//     const canUpdate = hasImplicitPermissions || permissions.includes('inventory.articles.update');
//     const canDelete = hasImplicitPermissions || permissions.includes('inventory.articles.delete');
// 
//     const {
//         articlesPageItems,
//         articlesTotal,
//         articlesPageLoading,
//         fetchArticlesPage,
//         deleteArticle,
//     } = useInventoryStore();
// 
//     const [search, setSearch] = useState('');
//     const [debouncedSearch, setDebouncedSearch] = useState('');
//     // Kolon bazlı filtreler (tablo başlığı altındaki filtre satırı) — sunucuda daraltır.
//     const [codeFilter, setCodeFilter] = useState('');
//     const [nameFilter, setNameFilter] = useState('');
//     const [barcodeFilter, setBarcodeFilter] = useState('');
//     const [debouncedColumns, setDebouncedColumns] = useState({
//         code: '',
//         name: '',
//         barcode: '',
//     });
//     const [sortBy, setSortBy] = useState<ArticleSortKey>('createdAt');
//     const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
//     const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
//     const [page, setPage] = useState(1);
//     const PAGE_SIZE = 15;
// 
//     // Server-side search — debounce keystrokes so we don't hit the API per letter.
//     useEffect(() => {
//         const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
//         return () => clearTimeout(id);
//     }, [search]);
// 
//     // Kolon filtreleri de aynı şekilde debounce edilir. Değerler değişmediyse
//     // ÖNCEKİ nesne korunur: her seferinde yeni nesne üretmek, mount'tan 300ms
//     // sonra fetch'i ikinci kez tetikliyordu (liste iki kez yükleniyordu).
//     useEffect(() => {
//         const id = setTimeout(() => {
//             setDebouncedColumns((prev) => {
//                 const next = {
//                     code: codeFilter.trim(),
//                     name: nameFilter.trim(),
//                     barcode: barcodeFilter.trim(),
//                 };
//                 return JSON.stringify(prev) === JSON.stringify(next)
//                     ? prev
//                     : next;
//             });
//         }, 300);
//         return () => clearTimeout(id);
//     }, [barcodeFilter, codeFilter, nameFilter]);
// 
//     // Ürünler sayfa sayfa (15) sunucudan çekilir — tüm katalog tek seferde yüklenmez.
//     // Filtre değişimi + sayfa sıfırlama TEK efekte toplanır: filtre değiştiğinde
//     // sayfa > 1 ise önce sayfa sıfırlanır ve o tur fetch atlanır — ayrı bir
//     // reset efekti, eski sayfa + yeni filtreyle gereksiz bir ara istek çıkarıyordu.
//     const filterKeyRef = useRef<string | null>(null);
//     useEffect(() => {
//         const filterKey = JSON.stringify([
//             debouncedSearch,
//             debouncedColumns,
//             sortBy,
//             sortDirection,
//         ]);
//         const filtersChanged = filterKeyRef.current !== null && filterKeyRef.current !== filterKey;
//         filterKeyRef.current = filterKey;
//         if (filtersChanged && page !== 1) {
//             setPage(1);
//             return;
//         }
//         void fetchArticlesPage({
//             page,
//             pageSize: PAGE_SIZE,
//             search: debouncedSearch || undefined,
//             itemType: 'PRODUCT',
//             code: debouncedColumns.code || undefined,
//             name: debouncedColumns.name || undefined,
//             barcode: debouncedColumns.barcode || undefined,
//             sortBy,
//             sortDirection,
//         });
//     }, [
//         page,
//         debouncedSearch,
//         debouncedColumns,
//         sortBy,
//         sortDirection,
//         fetchArticlesPage,
//     ]);
// 
//     const reloadCurrentPage = () => {
//         void fetchArticlesPage({
//             page,
//             pageSize: PAGE_SIZE,
//             search: debouncedSearch || undefined,
//             itemType: 'PRODUCT',
//             code: debouncedColumns.code || undefined,
//             name: debouncedColumns.name || undefined,
//             barcode: debouncedColumns.barcode || undefined,
//             sortBy,
//             sortDirection,
//         });
//     };
// 
//     const handleSort = (column: ArticleSortKey, direction: SortDirection) => {
//         setSortBy(column);
//         setSortDirection(direction);
//     };
// 
//     const updateStatus = async (id: string, status: ArticleStatus) => {
//         setStatusUpdatingId(id);
//         try {
//             await articleApi.update(id, {
//                 status,
//                 ...(status === 'ACTIVE' ? { isActive: true } : {}),
//                 ...(status === 'INACTIVE' ? { isActive: false } : {}),
//             });
//             reloadCurrentPage();
//             toast.success(t('inventory.articles.statusUpdated'));
//         } catch (error: any) {
//             toast.error(error.response?.data?.error || t('inventory.articles.statusUpdateFailed'));
//         } finally {
//             setStatusUpdatingId(null);
//         }
//     };
// 
//     const paged = articlesPageItems;
//     const totalPages = Math.max(1, Math.ceil(articlesTotal / PAGE_SIZE));
//     const pageSafe = Math.min(page, totalPages);
//     const rangeFrom = articlesTotal === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
//     const rangeTo = Math.min(pageSafe * PAGE_SIZE, articlesTotal);
// 
//     return (
//         <div>
//             <InventoryListHeader
//                 title={t('inventory.articles.title')}
//                 action={canCreate && (
//                     <Button
//                         variant="primary"
//                         size="lg"
//                         icon={<Plus size={16} />}
//                         onClick={() => navigate('/inventory/articles/new')}
//                         className="!h-10 !px-4 !text-[13px] !font-semibold"
//                     >
//                         {t('auto.yeni_urun')}
//                     </Button>
//                 )}
//             />
//             <Card
//                 className="border-0 rounded-none"
//                 noPadding
//             >
//                 {/* Üst çubuk — üç sayfada birebir aynı: arama (esner) + sıralama (sabit) + sayfalama (sağda). */}
//                 <div className="px-3 py-3">
//                     <div className="flex w-full flex-nowrap items-center gap-3">
//                         <div className="relative w-[240px] min-w-0 shrink">
//                             <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
//                             <input
//                                 value={search}
//                                 onChange={(e) => setSearch(e.target.value)}
//                                 placeholder={t('auto.ara_kod_ad_barkod')}
//                                 className="h-9 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-[13px] transition-colors focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10"
//                             />
//                             {search && (
//                                 <button
//                                     type="button"
//                                     onClick={() => setSearch('')}
//                                     aria-label={t('common.clear')}
//                                     title={t('common.clear')}
//                                     className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
//                                 >
//                                     <X size={12} />
//                                 </button>
//                             )}
//                         </div>
//                         <div className="w-[200px] shrink-0">
//                             <Select
//                                 value={`${sortBy}:${sortDirection}`}
//                                 onChange={(event) => {
//                                     const [column, direction] = event.target.value.split(':') as [ArticleSortKey, SortDirection];
//                                     handleSort(column, direction);
//                                 }}
//                                 className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-700/10"
//                                 aria-label={t('inventory.articles.sortOrder')}
//                             >
//                                 {sortBy !== 'createdAt' && (
//                                     <option value={`${sortBy}:${sortDirection}`}>{t('inventory.articles.sortOrder')}</option>
//                                 )}
//                                 <option value="createdAt:desc">{t('inventory.articles.newestFirst')}</option>
//                                 <option value="createdAt:asc">{t('inventory.articles.oldestFirst')}</option>
//                             </Select>
//                         </div>
//                         <div className="ml-auto flex shrink-0 items-center gap-3">
//                             <span className="font-mono text-[12px] text-slate-500">
//                                 {rangeFrom}-{rangeTo} / {articlesTotal}
//                             </span>
//                             <div className="flex items-center gap-1">
//                                 <button
//                                     type="button"
//                                     disabled={pageSafe <= 1}
//                                     onClick={() => setPage((p) => Math.max(1, p - 1))}
//                                     className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
//                                     aria-label={t('common.back')}
//                                 >
//                                     <ChevronLeft size={14} />
//                                 </button>
//                                 <span className="px-1 font-mono text-[12px] tabular-nums text-slate-500">{pageSafe} / {totalPages}</span>
//                                 <button
//                                     type="button"
//                                     disabled={pageSafe >= totalPages}
//                                     onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
//                                     className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
//                                     aria-label={t('common.next')}
//                                 >
//                                     <ChevronRight size={14} />
//                                 </button>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
// 
//                 <div className="w-full overflow-hidden bg-white">
//                     <table className="w-full table-fixed text-[13px] [&_th]:border-r [&_th]:border-slate-200 [&_td]:border-r [&_td]:border-slate-200 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
//                         <colgroup>
//                             <col style={{ width: '10%' }} />
//                             <col style={{ width: '24%' }} />
//                             <col style={{ width: '15%' }} />
//                             <col style={{ width: '13%' }} />
//                             <col style={{ width: '10%' }} />
//                             <col style={{ width: '12%' }} />
//                             <col style={{ width: '7%' }} />
//                             <col style={{ width: '9%' }} />
//                         </colgroup>
//                         <thead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 text-[12px] uppercase tracking-[0.08em] text-[#86868B]">
//                             <tr>
//                                 <SortableHeader label={t('auto.stok_kodu')} column="articleCode" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
//                                 <SortableHeader label={t('auto.urun_adi')} column="name" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
//                                 <SortableHeader label={t('auto.barkod_seri_no')} column="barcode" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
//                                 <SortableHeader label={t('auto.satis_fiyati')} column="salePrice" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} align="right" />
//                                 <SortableHeader label={t('auto.mevcut')} column="totalQuantity" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} align="right" />
//                                 <SortableHeader label={t('auto.min_kritik')} column="minStockLevel" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} align="right" />
//                                 <th className="px-2 py-3 text-center font-semibold">{'Stock'}</th>
//                                 <th className="px-2 py-3 text-right font-semibold">{t('common.actions')}</th>
//                             </tr>
//                             {/* Kolon bazlı filtre satırı — kod/ad/barkod sunucuda daraltır,
//                                 durum seçicisi üstteki durum filtresiyle aynı state'i paylaşır. */}
//                             <tr data-filter-row>
//                                 <th className="px-2 py-1.5 font-normal">
//                                     <input
//                                         value={codeFilter}
//                                         onChange={(e) => setCodeFilter(e.target.value)}
//                                         placeholder={`${t('common.filter')}...`}
//                                         className={ARTICLE_FILTER_CONTROL}
//                                     />
//                                 </th>
//                                 <th className="px-2 py-1.5 font-normal">
//                                     <input
//                                         value={nameFilter}
//                                         onChange={(e) => setNameFilter(e.target.value)}
//                                         placeholder={`${t('common.filter')}...`}
//                                         className={ARTICLE_FILTER_CONTROL}
//                                     />
//                                 </th>
//                                 <th className="px-2 py-1.5 font-normal">
//                                     <input
//                                         value={barcodeFilter}
//                                         onChange={(e) => setBarcodeFilter(e.target.value)}
//                                         placeholder={`${t('common.filter')}...`}
//                                         className={ARTICLE_FILTER_CONTROL}
//                                     />
//                                 </th>
//                                 <th className="px-2 py-2" />
//                                 <th className="px-2 py-2" />
//                                 <th className="px-2 py-2" />
//                                 <th className="px-2 py-2" />
//                                 <th className="px-2 py-1.5" />
//                             </tr>
//                         </thead>
//                         <tbody className="divide-y divide-slate-100">
//                             {articlesPageLoading && Array.from({ length: 6 }).map((_, i) => (
//                                 <tr key={`article-skeleton-${i}`}>
//                                     {Array.from({ length: 8 }).map((__, j) => (
//                                         <td key={j} className="px-3 py-2">
//                                             <Skeleton className={`h-4 w-full max-w-[120px] ${j >= 3 && j <= 5 ? 'ml-auto' : ''} bg-slate-100`} />
//                                         </td>
//                                     ))}
//                                 </tr>
//                             ))}
//                             {!articlesPageLoading && articlesTotal === 0 && (
//                                 <tr>
//                                     <td colSpan={8}>
//                                         <EmptyState
//                                             icon={<Package size={32} />}
//                                             title={t('auto.urun_yok')}
//                                             description={t('auto.ilk_urununuzu_ekleyerek_baslayin')}
//                                             action={canCreate && (
//                                                 <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/inventory/articles/new')}>{t('auto.yeni_urun')}</Button>
//                                             )}
//                                         />
//                                     </td>
//                                 </tr>
//                             )}
//                             {!articlesPageLoading && paged.map((a) => {
//                                 const isCritical = a.criticalStockLevel > 0 && a.totalQuantity <= a.criticalStockLevel;
//                                 const isBelowMin = a.minStockLevel > 0 && a.totalQuantity <= a.minStockLevel;
//                                 return (
//                                     <tr key={a.id} className="group cursor-pointer transition-colors hover:bg-slate-100" onClick={() => navigate(`/inventory/articles/${a.id}`)}>
//                                         <td className="truncate px-3 py-2 font-mono text-[11.5px] text-slate-700">{a.articleCode}</td>
//                                         <td className="px-3 py-2">
//                                             <div className="flex min-w-0 items-center gap-1.5">
//                                                 <span className="truncate font-medium text-slate-800 group-hover:text-[#272f67]">{a.name}</span>
//                                                 {(a.itemType ?? 'PRODUCT') === 'MATERIAL' && (
//                                                     <span className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 ring-1 ring-amber-100">{t('auto.malzeme')}</span>
//                                                 )}
//                                             </div>
//                                             {a.category && <div className="mt-0.5 truncate text-[10.5px] text-slate-400">{a.category}</div>}
//                                         </td>
//                                         <td className="truncate px-3 py-2 font-mono text-[11px] text-slate-500">
//                                             {a.systemBarcode || a.supplierBarcode || '—'}
//                                         </td>
//                                         <td className="px-3 py-2 text-right text-slate-700">
//                                             <div className="truncate font-mono">{fmtMoney(Number(a.salePrice || 0))}/{a.unit}</div>
//                                             <div className="mt-0.5 truncate text-[10.5px] text-slate-400">{t('auto.ort_maliyet')}{fmtMoney(articleUnitCost(a))}</div>
//                                         </td>
//                                         <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
//                                             <span className={isCritical ? "text-rose-700 font-semibold" : isBelowMin ? "text-amber-700 font-semibold" : 'text-slate-800'}>
//                                                 {fmtNumber(a.totalQuantity)} {a.unit}
//                                             </span>
//                                             {(isCritical || isBelowMin) && (
//                                                 <AlertTriangle size={11} className="inline ml-1 text-amber-600" />
//                                             )}
//                                         </td>
//                                         <td className="px-3 py-2 text-right font-mono text-[11.5px] text-slate-500 whitespace-nowrap">
//                                             {fmtNumber(a.minStockLevel)} / {fmtNumber(a.criticalStockLevel)}
//                                         </td>
//                                         <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
//                                             <Tooltip title={t('inventory.articles.openStockMovements')}>
//                                                 <button
//                                                     type="button"
//                                                     onClick={() => navigate(`/inventory/movements?item=${a.id}`)}
//                                                     className="inline-flex items-center justify-center rounded p-1 transition-colors hover:bg-slate-100"
//                                                     style={{ color: BRAND }}
//                                                     aria-label={t('inventory.articles.openStockMovements')}
//                                                 >
//                                                     <ChevronSelectorVertical size={16} />
//                                                 </button>
//                                             </Tooltip>
//                                         </td>
//                                         <td className="px-1.5 py-2 text-right" onClick={(e) => e.stopPropagation()}>
//                                             <div className="inline-flex items-center gap-0.5">
//                                                 {canUpdate && (
//                                                     <Tooltip title={a.status === 'INACTIVE' ? t('inventory.articles.setActive') : t('inventory.articles.setInactive')}>
//                                                         <button
//                                                             type="button"
//                                                             disabled={statusUpdatingId === a.id}
//                                                             onClick={() => void updateStatus(a.id, a.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE')}
//                                                             className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#272f67] disabled:opacity-40"
//                                                             aria-label={a.status === 'INACTIVE' ? t('inventory.articles.setActive') : t('inventory.articles.setInactive')}
//                                                         >
//                                                             {a.status === 'INACTIVE' ? <CheckCircle size={13} /> : <XCircle size={13} />}
//                                                         </button>
//                                                     </Tooltip>
//                                                 )}
//                                                 {canUpdate && a.status === 'IN_PRODUCTION' && (
//                                                     <Tooltip title={t('inventory.articles.removeFromProduction')}>
//                                                         <button
//                                                             type="button"
//                                                             disabled={statusUpdatingId === a.id}
//                                                             onClick={() => void updateStatus(a.id, 'ACTIVE')}
//                                                             className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#272f67] disabled:opacity-40"
//                                                             aria-label={t('inventory.articles.removeFromProduction')}
//                                                         >
//                                                             <PackageX size={13} />
//                                                         </button>
//                                                     </Tooltip>
//                                                 )}
//                                                 {canDelete && (
//                                                     <Tooltip title={t('inventory.articles.moveToTrash')}>
//                                                         <button
//                                                             type="button"
//                                                             onClick={async () => {
//                                                                 if (!confirm(t('inventory.articles.moveToTrashConfirm', { name: a.name }))) return;
//                                                                 try {
//                                                                     // Store drops the row from the current page in place — no reload.
//                                                                     await deleteArticle(a.id);
//                                                                     toast.success(t('inventory.articles.movedToTrash'));
//                                                                 } catch (error: any) {
//                                                                     toast.error(error.response?.data?.error || t('auto.silinemedi'));
//                                                                 }
//                                                             }}
//                                                             className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-rose-600"
//                                                             aria-label={t('inventory.articles.moveToTrash')}
//                                                         >
//                                                             <Trash2 size={13} />
//                                                         </button>
//                                                     </Tooltip>
//                                                 )}
//                                                 <ChevronRight size={13} className="text-slate-400" />
//                                             </div>
//                                         </td>
//                                     </tr>
//                                 );
//                             })}
//                         </tbody>
//                     </table>
//                 </div>
//             </Card>
//         </div>
//     );
// };
// 
// export const ArticleCreate = () => <ArticleFormPage mode="create" />;
// 
// export const ArticleEdit = () => <ArticleFormPage mode="edit" />;
// 
// export const ArticleDetail = () => <ArticleFormPage mode="edit" />;
// 
// const ArticleFormPage = ({ mode }: { mode: 'create' | 'edit' }) => {
//     const { id } = useParams();
//     const [searchParams] = useSearchParams();
//     const navigate = useNavigate();
//     // When opened from another screen (e.g. the tender product picker), a ?name=
//     // query param pre-fills the product name so the user only fills the rest.
//     const prefillName = searchParams.get('name')?.trim() ?? '';
//     const { createArticle, updateArticle } = useInventoryStore();
//     const [editing, setEditing] = useState<InventoryArticle | null>(null);
//     const [loaded, setLoaded] = useState(mode === 'create');
// 
//     // With the list now server-paginated, the full catalogue isn't in memory —
//     // fetch just this product by id for the detail/edit screen.
//     useEffect(() => {
//         if (mode !== 'edit' || !id) return;
//         let cancelled = false;
//         setLoaded(false);
//         articleApi
//             .getById(id)
//             .then((data) => {
//                 if (!cancelled) setEditing(data);
//             })
//             .catch(() => {
//                 if (!cancelled) setEditing(null);
//             })
//             .finally(() => {
//                 if (!cancelled) setLoaded(true);
//             });
//         return () => {
//             cancelled = true;
//         };
//     }, [id, mode]);
// 
//     const submit = async (data: FormData) => {
//         try {
//             // Ürün kartı yalnızca tanım + satış fiyatı + ayarları taşır. Stok ve alış maliyeti
//             // "Envanter > Stoğa Ekle" akışından girilir; burada stok hareketi oluşturulmaz.
//             if (mode === 'edit' && editing?.id) {
//                 await updateArticle(editing.id, data);
//                 toast.success(t('auto.urun_guncellendi'));
//             } else {
//                 await createArticle(data);
//                 toast.success(t('auto.urun_olusturuldu'));
//             }
//             navigate('/inventory/articles');
//         } catch (e: any) {
//             toast.error(e.response?.data?.error ||t('auto.kaydedilemedi'));
//         }
//     };
// 
//     if (mode === 'edit' && !editing && !loaded) {
//         return <div className="h-96 animate-pulse rounded-md border border-slate-100 bg-slate-50" />;
//     }
// 
//     if (mode === 'edit' && !editing) {
//         return (
//             <EmptyState
//                 icon={<Package size={32} />}
//                 title={t('auto.urun_bulunamadi')}
//                 description={t('auto.duzenlemek_istediginiz_urun_bulunamadi')}
//                 action={<Button variant="secondary" icon={<ArrowLeft size={13} />} onClick={() => navigate('/inventory/articles')}>{t('auto.listeye_don')}</Button>}
//             />
//         );
//     }
// 
//     return (
//         <ArticleFormCard
//             mode={mode}
//             initial={mode === 'edit' && editing ? editing : emptyArticle(prefillName)}
//             onClose={() => navigate('/inventory/articles')}
//             onSubmit={submit}
//         />
//     );
// };
// 
// type FormData = Partial<InventoryArticle>;
// 
// const articleInputClass = t('auto.h_8_px_2_5_py_1_text_12_5px');
// 
// const ArticleInfoRow = ({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) => (
//     <label className="grid grid-cols-1 gap-1 md:grid-cols-[118px_minmax(0,1fr)] md:items-center">
//         <span className="text-[12px] font-semibold text-slate-700">
//             {label}
//             {required && <span className="ml-0.5 text-rose-600">*</span>}
//         </span>
//         {children}
//     </label>
// );
// 
// const ArticleFormCard: React.FC<{
//     mode: 'create' | 'edit';
//     initial: FormData;
//     onClose: () => void;
//     onSubmit: (data: FormData) => Promise<void>;
// }> = ({ mode, initial, onSubmit }) => {
//     const navigate = useNavigate();
//     const [form, setForm] = useState<FormData>({ ...initial });
//     const [submitting, setSubmitting] = useState(false);
//     const [scannerOpen, setScannerOpen] = useState(false);
//     const [scannerMode, setScannerMode] = useState<'serial' | 'general'>('serial');
//     const fileRef = useRef<HTMLInputElement>(null);
// 
//     const normalizeForm = (value: FormData) => JSON.stringify({
//         articleCode: value.articleCode || '',
//         name: value.name || '',
//         description: value.description || '',
//         salePrice: Number(value.salePrice || 0),
//         unit: value.unit || '',
//         supplierBarcode: value.supplierBarcode || '',
//         imageUrl: value.imageUrl || '',
//         category: value.category || '',
//         itemType: value.itemType || 'PRODUCT',
//         status: value.status || 'ACTIVE',
//         minStockLevel: Number(value.minStockLevel || 0),
//         criticalStockLevel: Number(value.criticalStockLevel || 0),
//         maxStockLevel: value.maxStockLevel == null ? '' : Number(value.maxStockLevel),
//     });
//     const isDirty = useMemo(() => normalizeForm(initial) !== normalizeForm(form), [form, initial]);
// 
//     const handleImage = async (file: File) => {
//         if (file.size > 2 * 1024 * 1024) {
//             toast.error(t('auto.gorsel_2_mb_sinirini_asiyor'));
//             return;
//         }
//         const reader = new FileReader();
//         reader.onload = (e) => {
//             setForm((p) => ({ ...p, imageUrl: e.target?.result as string }));
//         };
//         reader.readAsDataURL(file);
//     };
// 
//     const submit = async () => {
//         if (!form.articleCode || !form.name || !form.unit) {
//             toast.error(t('auto.kod_ad_ve_birim_zorunludur'));
//             return;
//         }
//         setSubmitting(true);
//         try {
//             const payload = { ...form };
//             if (payload.supplierBarcode === '') payload.supplierBarcode = undefined;
//             if (payload.description === '') payload.description = undefined;
//             if (payload.category === '') payload.category = undefined;
// 
//             await onSubmit(payload);
//         } finally {
//             setSubmitting(false);
//         }
//     };
// 
//    return (
//         <>
//             <StockModuleHeader
//                 label={
//                     <button
//                         type="button"
//                         onClick={() => navigate(-1)}
//                         aria-label={t('common.back')}
//                         title={t('common.back')}
//                         className="-ml-1 inline-flex items-center justify-center rounded p-0.5 text-[#272f67] transition-colors hover:text-[#1a2255]"
//                     >
//                         <ChevronLeft size={22} strokeWidth={2.75} />
//                     </button>
//                 }
//                 actions={
//                     <>
//                         {mode === 'edit' && initial.id && (
//                             <Button
//                                 variant="secondary"
//                                 size="sm"
//                                 icon={<ChevronSelectorVertical size={14} />}
//                                 onClick={() => navigate(`/inventory/movements?item=${initial.id}`)}
//                                 aria-label={t('nav.movements')}
//                                 title={t('nav.movements')}
//                             />
//                         )}
//                         <Button
//                             variant="primary"
//                             size="sm"
//                             loading={submitting}
//                             disabled={!isDirty}
//                             icon={<Save size={13} />}
//                             onClick={submit}
//                         >{t('common.save')}</Button>
//                     </>
//                 }
//             />
// 
//             {/* Form Yapısı — Ürün Bilgileri (Stok ayarları "Stok Hareketleri" bölümüne taşındı) */}
//             <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] xl:items-start">
//                 <div className="min-w-0 space-y-3">
//                     <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
//                         <div className="mb-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
//                             <Package size={13} />{t('auto.temel_bilgiler')}</div>
//                         <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
//                             <ArticleInfoRow label={t('auto.urun_adi')} required>
//                                 <Input size="sm" className={articleInputClass} value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
//                             </ArticleInfoRow>
//                             <ArticleInfoRow label={t('auto.stok_kodu')} required>
//                                 <Input size="sm" className={articleInputClass} value={form.articleCode ?? ''} onChange={(e) => setForm({ ...form, articleCode: e.target.value })} placeholder="ART-2026-001" />
//                             </ArticleInfoRow>
//                             <ArticleInfoRow label={t('auto.birim')} required>
//                                 <Input size="sm" className={articleInputClass} value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={t('auto.stk_m2_kg')} />
//                             </ArticleInfoRow>
//                             <ArticleInfoRow label={t('auto.birim_satis_fiyati')}>
//                                 <Input size="sm" className={articleInputClass} type="number" step="1" min={0} value={form.salePrice ?? 0} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) || 0 })} />
//                             </ArticleInfoRow>
//                             <ArticleInfoRow label={t('auto.kalem_tipi')}>
//                                 <Select size="sm" className="w-full" value={form.itemType ?? 'PRODUCT'} onChange={(e) => setForm({ ...form, itemType: e.target.value as ItemType })}>
//                                     <option value="PRODUCT">{ITEM_TYPE_LABEL().PRODUCT}</option>
//                                     <option value="MATERIAL">{ITEM_TYPE_LABEL().MATERIAL}</option>
//                                 </Select>
//                             </ArticleInfoRow>
//                             <ArticleInfoRow label={t('common.category')}>
//                                 <Input size="sm" className={articleInputClass} value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t('auto.hidrolik_servis')} />
//                             </ArticleInfoRow>
//                         </div>
//                     </section>
// 
//                     <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
//                         <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
//                             <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
//                                 <List size={13} />{t('common.description')}</div>
//                             <RichTextMarkdownEditor
//                                 value={form.description ?? ''}
//                                 onChange={(description) => setForm((previous) => ({ ...previous, description }))}
//                                 minHeight={220}
//                                 placeholder={t('auto.urun_ile_ilgili_detayli_aciklamalari_buraya_yaza')}
//                             />
//                         </section>
// 
//                         <div className="space-y-3">
//                             <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
//                                 <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
//                                     <ScanBarcode size={13} />{t('auto.barkod_bilgileri')}</div>
//                                 <div className="flex flex-col gap-4">
//                                     <Field label={t('auto.urun_seri_kodu')} hint={t('auto.zorunlu_her_urune_ozgu')} required>
//                                         <div className="flex items-center gap-2">
//                                             <Input size="sm" value={form.supplierBarcode ?? ''} onChange={(e) => setForm({ ...form, supplierBarcode: e.target.value })} placeholder={t('auto.okutun_veya_yazin')} className={`${articleInputClass} flex-1`} />
//                                             <button
//                                                 type="button"
//                                                 onClick={() => { setScannerMode('serial'); setScannerOpen(true); }}
//                                                 className="flex h-8 w-8 items-center justify-center shrink-0 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-slate-100 transition-colors"
//                                                 title={t('auto.kamera_ile_seri_kod_tara')}
//                                             >
//                                                 <Camera size={14} />
//                                             </button>
//                                         </div>
//                                     </Field>
//                                 </div>
//                             </section>
// 
//                         </div>
//                     </div>
//                 </div>
// 
//                 <div className="space-y-3">
//                     <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
//                         <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
//                             <ImageIcon size={13} />{t('auto.urun_gorseli')}</div>
//                         <div className="flex flex-col items-center gap-3 rounded-md border border-slate-200 bg-slate-50/60 p-4">
//                             {form.imageUrl ? (
//                                 <div className="relative h-32 w-32 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
//                                     <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
//                                     <button
//                                         type="button"
//                                         onClick={() => setForm({ ...form, imageUrl: null })}
//                                         className="absolute top-1.5 right-1.5 p-1 bg-white/90 rounded shadow-sm text-rose-600 hover:bg-slate-100 transition-colors"
//                                     >
//                                         <X size={12} />
//                                     </button>
//                                 </div>
//                             ) : (
//                                 <div className="flex h-32 w-32 items-center justify-center rounded-md bg-white border border-dashed border-slate-300 text-slate-400">
//                                     <ImageIcon size={28} />
//                                 </div>
//                             )}
//                             <input
//                                 ref={fileRef}
//                                 type="file"
//                                 accept="image/*"
//                                 hidden
//                                 onChange={(e) => {
//                                     const f = e.target.files?.[0];
//                                     if (f) handleImage(f);
//                                 }}
//                             />
//                             <Button
//                                 type="button"
//                                 variant="secondary"
//                                 size="sm"
//                                 icon={<Upload size={13} />}
//                                 onClick={() => fileRef.current?.click()}
//                                 className="w-full justify-center"
//                             >
//                                 {form.imageUrl ?t('auto.gorseli_degistir') :t('auto.gorsel_yukle')}
//                             </Button>
//                         </div>
//                     </section>
// 
//                 </div>
//             </div>
// 
//             {scannerOpen && (
//                 <BarcodeScannerModal
//                     mode={scannerMode}
//                     onClose={() => setScannerOpen(false)}
//                     onScan={(code) => {
//                         setForm((prev) => ({ ...prev, supplierBarcode: code }));
//                         setScannerOpen(false);
//                     }}
//                 />
//             )}
//         </>
//     );
// };
