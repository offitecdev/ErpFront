import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Package, PackagePlus, Plus, ScanBarcode, Search, Settings2, TriangleAlert, X } from 'lucide-react';

import { t } from '@/i18n/translate';
import { readWarehouseCatalog, readWarehouseProducts, warehouseErrorText } from '@/lib/api/warehouse';
import { useDebouncedValue } from '@/pages/inventory/hooks/useDebouncedValue';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useAuthStore } from '@/store/authStore';
import type { WarehouseCatalog, WarehouseProduct, WarehouseProductPage, WarehouseSortKey } from '@/types/warehouse';
import '@/styles/modules/warehouse.css';

import { AddProductDialog } from './components/AddProductDialog';
import { BarcodeScannerDialog } from './components/BarcodeScannerDialog';
import { ExportMenu } from './components/ExportMenu';
import { MaterialGroupFilter, NO_GROUP } from './components/MaterialGroupFilter';
import { fmtQuantity } from './warehouseFormat';

const PAGE_SIZE = 50;
const SORT_KEYS: readonly WarehouseSortKey[] = ['erpCode', 'name', 'brand', 'modelNumber', 'supplierName', 'description', 'quantity', 'barcode', 'updatedAt'];

interface Column {
    key: WarehouseSortKey;
    labelKey: string;
    width?: number;
    numeric?: boolean;
}

/** Die Spalten der Liste — genau die der Vorgabe, in ihrer Reihenfolge. */
const COLUMNS: Column[] = [
    { key: 'erpCode', labelKey: 'warehouse.columns.erpCode', width: 150 },
    { key: 'name', labelKey: 'warehouse.columns.name' },
    { key: 'brand', labelKey: 'warehouse.columns.brand', width: 130 },
    { key: 'modelNumber', labelKey: 'warehouse.columns.modelNumber', width: 160 },
    { key: 'supplierName', labelKey: 'warehouse.columns.supplier', width: 170 },
    { key: 'description', labelKey: 'warehouse.columns.description' },
    { key: 'quantity', labelKey: 'warehouse.columns.quantity', width: 110, numeric: true },
    { key: 'barcode', labelKey: 'warehouse.columns.barcode', width: 160 },
];

const Empty = () => <span className="ofi-wh-empty-cell">—</span>;

/**
 * ── DEPO · ÜRÜN KARTLARI (26.09.2026, Vorgabe Samet) ────────────────────────
 *
 * «Arama çubuğunun üstünde bir küçük başlık ürün kartları olacak, kenarında
 *  yeni ürün kartı butonu ve ürün ekle butonu olmalı. Tek bir arama çubuğunda
 *  ERP kodu, ürün adına göre aratma olmalıdır, yanında malzeme grubu …, tam
 *  arama çubuğunun sonunda bir barkod buton olmalı.»
 *
 * Die Seite steht im eigenen Rahmen der Produktions-Geräteseite (schmale
 * Leiste, keine Kopfleiste — MainLayout `isDeviceFocusPath`), die Tabelle
 * füllt den Rest des Fensters und blättert serverseitig (50 je Seite).
 * Suche, Gruppen, Barcode, Sortierung und Seite stehen in der Adresse — der
 * Rückweg aus einer Karte bringt die Liste genau so zurück.
 */
export const WarehouseProductsPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const canManage = useAuthStore((state) => state.permissions.includes('production.manage'));

    const urlSearch = params.get('q') ?? '';
    const groupsParam = params.get('groups') ?? '';
    const groupIds = useMemo(() => groupsParam.split(',').map((part) => part.trim()).filter(Boolean), [groupsParam]);
    const barcode = params.get('barcode') ?? '';
    const sortParam = params.get('sort') as WarehouseSortKey | null;
    const sort: WarehouseSortKey = sortParam && SORT_KEYS.includes(sortParam) ? sortParam : 'name';
    const dir: 'asc' | 'desc' = params.get('dir') === 'desc' ? 'desc' : 'asc';
    const page = Math.max(1, Math.trunc(Number(params.get('page')) || 1));

    const [search, setSearch] = useState(urlSearch);
    const debouncedSearch = useDebouncedValue(search.trim(), 250);
    /* Die Antwort merkt sich, zu WELCHER Abfrage sie gehört: so ist «lädt»
       einfach «Antwort gehört zu einer anderen Abfrage», und die letzte Seite
       bleibt stehen, bis die nächste da ist (kein Flackern beim Blättern). */
    const [result, setResult] = useState<{ key: string; data: WarehouseProductPage | null; error: string | null } | null>(null);
    const [catalog, setCatalog] = useState<WarehouseCatalog | null>(null);
    const [reloadTick, setReloadTick] = useState(0);
    const [selection, setSelection] = useState<{ key: string; index: number }>({ key: '', index: -1 });
    const [scanOpen, setScanOpen] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const dirtyRef = useRef(false);

    /** Ein Wert in der Adresse (ersetzt, kein neuer Verlaufseintrag). */
    const patchParams = useCallback((patch: Record<string, string | null>, resetPage = true) => {
        setParams((current) => {
            const next = new URLSearchParams(current);
            for (const [key, value] of Object.entries(patch)) {
                if (value) next.set(key, value);
                else next.delete(key);
            }
            if (resetPage) next.delete('page');
            return next;
        }, { replace: true });
    }, [setParams]);

    /* Die getippte Suche wandert entprellt in die Adresse — nur wenn sich der
       ENTPRELLTE Wert ändert. Wird die Suche sofort geleert (×, Barcode), hinkt
       der entprellte Wert kurz nach; er darf die Adresse dann nicht mit dem
       alten Text zurückschreiben. */
    const pushedSearchRef = useRef(debouncedSearch);
    useEffect(() => {
        if (debouncedSearch === pushedSearchRef.current) return;
        pushedSearchRef.current = debouncedSearch;
        if (debouncedSearch !== urlSearch.trim()) patchParams({ q: debouncedSearch || null });
    }, [debouncedSearch, urlSearch, patchParams]);

    const query = useMemo(() => ({
        search: urlSearch.trim() || undefined,
        groups: groupIds.length ? groupIds : undefined,
        barcode: barcode || undefined,
        sort,
        dir,
        page,
        pageSize: PAGE_SIZE,
    }), [urlSearch, groupIds, barcode, sort, dir, page]);

    const queryKey = `${JSON.stringify(query)}#${reloadTick}`;
    useEffect(() => readWarehouseProducts(
        query,
        (value) => setResult({ key: queryKey, data: value, error: null }),
        (failure) => setResult((current) => ({
            key: queryKey,
            data: current?.data ?? null,
            error: warehouseErrorText(failure, 'warehouse.products.loadFailed'),
        })),
    ), [query, queryKey]);

    useEffect(() => readWarehouseCatalog(
        (value) => setCatalog(value),
        () => setCatalog({ categories: [], ungroupedCount: 0 }),
    ), [reloadTick]);

    /* Was «İndir» herunterlädt — in Worten, für den Kopf der Liste-PDF. */
    const filterLabel = useMemo(() => {
        const parts: string[] = [];
        if (groupIds.length) {
            const names = groupIds.map((groupId) => {
                if (groupId === NO_GROUP) return t('warehouse.groups.none');
                for (const category of catalog?.categories ?? []) {
                    const group = category.groups.find((entry) => entry.id === groupId);
                    if (group) return group.code ? `${category.code}-${group.code}` : group.name;
                }
                return null;
            }).filter(Boolean);
            parts.push(t('warehouse.pdf.filterGroups', { groups: names.join(', ') }));
        }
        if (urlSearch.trim()) parts.push(`«${urlSearch.trim()}»`);
        if (barcode) parts.push(`${t('warehouse.columns.barcode')}: ${barcode}`);
        return parts.length ? parts.join(' · ') : t('warehouse.pdf.filterAll');
    }, [groupIds, catalog, urlSearch, barcode]);

    const data = result?.data ?? null;
    const loading = result?.key !== queryKey;
    const error = !loading ? result?.error ?? null : null;
    // Eine neue Abfrage beginnt ohne Auswahl.
    const selected = selection.key === queryKey ? selection.index : -1;
    const setSelected = (index: number) => setSelection({ key: queryKey, index });

    const rows = data?.items ?? [];
    const total = data?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
    const to = Math.min(total, page * PAGE_SIZE);
    const filtered = Boolean(urlSearch.trim() || groupIds.length || barcode);

    const open = (product: WarehouseProduct) => navigate(`/warehouse/products/${product.id}`);

    const toggleSort = (key: WarehouseSortKey) => {
        if (key === sort) patchParams({ dir: dir === 'asc' ? 'desc' : 'asc' });
        else patchParams({ sort: key === 'name' ? null : key, dir: key === 'updatedAt' ? 'desc' : null });
    };

    const goPage = (next: number) => {
        patchParams({ page: next > 1 ? String(next) : null }, false);
        scrollRef.current?.scrollTo({ top: 0 });
    };

    /* Die Tabelle wie eine Mac-Liste: Pfeile wählen, Enter öffnet. */
    const onTableKey = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!rows.length) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const next = event.key === 'ArrowDown'
                ? Math.min(rows.length - 1, selected + 1)
                : Math.max(0, selected < 0 ? 0 : selected - 1);
            setSelected(next);
            scrollRef.current?.querySelector<HTMLElement>(`[data-row-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Home') {
            event.preventDefault();
            setSelected(0);
        } else if (event.key === 'End') {
            event.preventDefault();
            setSelected(rows.length - 1);
        } else if (event.key === 'Enter' && selected >= 0 && rows[selected]) {
            event.preventDefault();
            open(rows[selected]);
        }
    };

    const onAddChanged = useCallback(() => { dirtyRef.current = true; }, []);
    const closeAdd = useCallback(() => {
        setAddOpen(false);
        if (dirtyRef.current) {
            dirtyRef.current = false;
            setReloadTick((tick) => tick + 1);
        }
    }, []);

    const clearSearch = () => {
        setSearch('');
        patchParams({ q: null });
        searchRef.current?.focus();
    };

    const clearFilters = () => {
        setSearch('');
        patchParams({ q: null, groups: null, barcode: null });
    };

    const showSkeleton = loading && !data;

    return (
        <div className="ofi-wh is-list">
            <header className="ofi-wh-head">
                <h1 className="ofi-wh-head__title">{t('warehouse.products.title')}</h1>
                {data && <span className="ofi-wh-head__count">{t('warehouse.products.count', { count: total })}</span>}
                <div className="ofi-wh-head__actions">
                    <button
                        type="button"
                        className="ofi-wh-btn is-icon is-quiet ofi-nosize"
                        title={t('warehouse.products.settings')}
                        aria-label={t('warehouse.products.settings')}
                        onClick={() => navigate('/warehouse/settings')}
                    >
                        <Settings2 />
                    </button>
                    <ExportMenu query={query} filterLabel={filterLabel} />
                    {canManage && (
                        <>
                            <button type="button" className="ofi-wh-btn ofi-nosize" onClick={() => setAddOpen(true)}>
                                <PackagePlus />
                                {t('warehouse.products.addProduct')}
                            </button>
                            <button type="button" className="ofi-wh-btn is-primary ofi-nosize" onClick={() => navigate('/warehouse/products/new')}>
                                <Plus />
                                {t('warehouse.products.newCard')}
                            </button>
                        </>
                    )}
                </div>
            </header>

            <div className="ofi-wh-toolbar">
                <div
                    className="ofi-wh-search"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) { event.preventDefault(); searchRef.current?.focus(); }
                    }}
                >
                    <Search className="ofi-wh-search__glass" />
                    <input
                        ref={searchRef}
                        value={search}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={t('warehouse.products.searchPlaceholder')}
                        aria-label={t('warehouse.products.searchPlaceholder')}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape' && search) { event.preventDefault(); clearSearch(); }
                            if (event.key === 'ArrowDown' && rows.length) {
                                event.preventDefault();
                                setSelected(0);
                                scrollRef.current?.focus();
                            }
                        }}
                    />
                    {search && (
                        <button type="button" className="ofi-wh-search__clear ofi-nosize" aria-label={t('warehouse.products.clearSearch')} onClick={clearSearch}>
                            <X />
                        </button>
                    )}
                    <span className="ofi-wh-search__sep" aria-hidden />
                    <button
                        type="button"
                        className="ofi-wh-search__scan ofi-nosize"
                        title={t('warehouse.products.scanSearch')}
                        aria-label={t('warehouse.products.scanSearch')}
                        onClick={() => setScanOpen(true)}
                    >
                        <ScanBarcode />
                        <span>{t('warehouse.columns.barcode')}</span>
                    </button>
                </div>

                <MaterialGroupFilter
                    catalog={catalog}
                    value={groupIds}
                    onChange={(next) => patchParams({ groups: next.length ? next.join(',') : null })}
                />

                {barcode && (
                    <span className="ofi-wh-codechip">
                        <ScanBarcode />
                        <span>{t('warehouse.columns.barcode')}:</span>
                        <b>{barcode}</b>
                        <button type="button" className="ofi-nosize" aria-label={t('warehouse.products.clearBarcode')} onClick={() => patchParams({ barcode: null })}>
                            <X />
                        </button>
                    </span>
                )}
            </div>

            <div className={`ofi-wh-tablewrap ${loading && data ? 'is-loading' : ''}`}>
                <div
                    ref={scrollRef}
                    className="ofi-wh-tablescroll"
                    tabIndex={0}
                    role="grid"
                    aria-rowcount={total}
                    aria-label={t('warehouse.products.title')}
                    onKeyDown={onTableKey}
                >
                    <table className="ofi-wh-table" data-unstyled-table>
                        <colgroup>
                            {COLUMNS.map((column) => <col key={column.key} style={column.width ? { width: column.width } : undefined} />)}
                        </colgroup>
                        <thead>
                            <tr>
                                {COLUMNS.map((column) => {
                                    const active = sort === column.key;
                                    const label = t(column.labelKey);
                                    return (
                                        <th
                                            key={column.key}
                                            className={column.numeric ? 'is-num' : ''}
                                            aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                        >
                                            <button
                                                type="button"
                                                className={`ofi-wh-th ofi-nosize ${active ? 'is-sorted' : ''}`}
                                                title={t('warehouse.products.sortBy', { column: label })}
                                                onClick={() => toggleSort(column.key)}
                                            >
                                                <span>{label}</span>
                                                {active && dir === 'desc' ? <ChevronDown /> : <ChevronUp />}
                                            </button>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {showSkeleton && Array.from({ length: 9 }, (_, index) => (
                                <tr key={`skel-${index}`} aria-hidden>
                                    {COLUMNS.map((column, cell) => (
                                        <td key={column.key} className={column.numeric ? 'is-num' : ''}>
                                            <span className="ofi-wh-skel" style={{ width: `${[62, 78, 54, 66, 58, 84, 30, 60][cell]}%`, marginLeft: column.numeric ? 'auto' : undefined }} />
                                        </td>
                                    ))}
                                </tr>
                            ))}

                            {!showSkeleton && error && !rows.length && (
                                <tr>
                                    <td colSpan={COLUMNS.length} style={{ height: 'auto', padding: 0 }}>
                                        <div className="ofi-wh-state is-error">
                                            <TriangleAlert />
                                            <b>{error}</b>
                                            <button type="button" className="ofi-wh-btn ofi-nosize" onClick={() => setReloadTick((tick) => tick + 1)}>
                                                {t('warehouse.products.retry')}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {!showSkeleton && !error && !rows.length && (
                                <tr>
                                    <td colSpan={COLUMNS.length} style={{ height: 'auto', padding: 0 }}>
                                        <div className="ofi-wh-state">
                                            <Package />
                                            <b>{filtered ? t('warehouse.products.noMatch') : t('warehouse.products.empty')}</b>
                                            {filtered && (
                                                <button type="button" className="ofi-wh-btn ofi-nosize" onClick={clearFilters}>
                                                    {t('warehouse.products.clearFilters')}
                                                </button>
                                            )}
                                            {!filtered && canManage && (
                                                <>
                                                    <span>{t('warehouse.products.emptyHint')}</span>
                                                    <button type="button" className="ofi-wh-btn is-primary ofi-nosize" onClick={() => navigate('/warehouse/products/new')}>
                                                        <Plus />
                                                        {t('warehouse.products.newCard')}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {!showSkeleton && rows.map((product, index) => (
                                <tr
                                    key={product.id}
                                    className="is-row"
                                    data-row-index={index}
                                    data-ofi-route={`/warehouse/products/${product.id}`}
                                    aria-selected={selected === index}
                                    onClick={() => { setSelected(index); open(product); }}
                                >
                                    <td>{product.erpCode ? <span className="ofi-wh-code">{product.erpCode}</span> : <Empty />}</td>
                                    <td className="is-name" title={product.name}>{product.name}</td>
                                    <td title={product.brand ?? undefined}>{product.brand ?? <Empty />}</td>
                                    <td title={product.modelNumber ?? undefined}>{product.modelNumber ?? <Empty />}</td>
                                    <td title={product.suppliers.map((entry) => entry.name).join(', ') || undefined}>
                                        {product.supplier ? (
                                            <span className="ofi-wh-supplier-cell">
                                                <span>{product.supplier.name}</span>
                                                {product.suppliers.length > 1 && <em>+{product.suppliers.length - 1}</em>}
                                            </span>
                                        ) : <Empty />}
                                    </td>
                                    <td className="ofi-wh-cell-sub" title={product.description ?? undefined}>
                                        {product.description ? product.description.replace(/\s+/g, ' ') : <Empty />}
                                    </td>
                                    <td className="is-num">
                                        <span className={`ofi-wh-qty ${product.quantity ? '' : 'is-zero'}`}>
                                            {product.serialRequired && (
                                                <span className="ofi-wh-sn" title={t('warehouse.products.serialBadgeHint')}>{t('warehouse.products.serialBadge')}</span>
                                            )}
                                            {fmtQuantity(product.quantity)}
                                        </span>
                                    </td>
                                    <td>{product.barcode ? <span className="ofi-wh-code is-dim">{product.barcode}</span> : <Empty />}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <footer className="ofi-wh-tablefoot">
                    <span>{total ? t('warehouse.products.pageInfo', { from, to, total }) : ''}</span>
                    <span className="ofi-wh-tablefoot__pager">
                        <button
                            type="button"
                            className="ofi-wh-btn is-small is-icon is-quiet ofi-nosize"
                            disabled={page <= 1 || loading}
                            aria-label={t('warehouse.products.prevPage')}
                            title={t('warehouse.products.prevPage')}
                            onClick={() => goPage(page - 1)}
                        >
                            <ChevronLeft />
                        </button>
                        <button
                            type="button"
                            className="ofi-wh-btn is-small is-icon is-quiet ofi-nosize"
                            disabled={page >= pageCount || loading}
                            aria-label={t('warehouse.products.nextPage')}
                            title={t('warehouse.products.nextPage')}
                            onClick={() => goPage(page + 1)}
                        >
                            <ChevronRight />
                        </button>
                    </span>
                </footer>
            </div>

            {scanOpen && (
                <BarcodeScannerDialog
                    title={t('warehouse.products.scanSearch')}
                    onClose={() => setScanOpen(false)}
                    onCode={(code) => {
                        // Ein Barcode bezeichnet das Stück genau — Text und Gruppen
                        // würden es nur verstecken.
                        setSearch('');
                        patchParams({ barcode: code, q: null, groups: null });
                    }}
                />
            )}
            {addOpen && <AddProductDialog onClose={closeAdd} onChanged={onAddChanged} />}
        </div>
    );
};

export default WarehouseProductsPage;
