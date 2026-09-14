import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Scan, Trash01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { DangerConfirmDialog } from '@/components/ui-shared/DangerConfirmDialog';
import { t } from '@/i18n/translate';
import { articleApi } from '@/lib/api/inventory';
// Telefon / Tablet / Schreibtisch — dieselben Schwellen wie im Kalender.
import { useCalViewport } from '@/pages/calendar/calendarShared';
import { useAuthStore } from '@/store/authStore';
import { QuickAddSheet } from '../quick-add/QuickAddSheet';
import { StockInPopup, type StockInArticle } from './StockInPopup';
import { ColResizeHandle, FILTER_INPUT_CLASS, FilterBar, Pager, ResizableCols, SearchBox, SectionCard, SortableTh, TableStateRow } from './primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { PRODUCTS_PAGE_SIZE, useArticlesList } from '../hooks/useArticlesList';
import { useLanguageTick } from '../hooks/useLanguageTick';
import { fmtMoney, fmtQty } from '../utils/format';

// Sürüklenebilir sütun genişlikleri. Ad sütunu burada YOKTUR: genişliği olmayan
// tek sütun odur ve artan yeri o emer.
// Reihenfolge (10.09.2026): ERP-Code, Bezeichnung, Modellnummer, Seriennummer,
// Barcode — dann Bestand und Preis.
const ARTICLE_LIST_COLUMN_WIDTHS = {
    code: 150,
    model: 136,
    serial: 136,
    barcode: 136,
    stock: 112,
    price: 120,
    actions: 64,
};
type ArticleListColumn = keyof typeof ARTICLE_LIST_COLUMN_WIDTHS;

/**
 * Ürün listesi — malzeme/ürün birleşmesinden (2026-08-14) beri TEK listedir:
 * eski malzemeler de burada yaşar, ürün/hizmet ayrımı satırdaki "Dienstleistung"
 * rozetiyle görünür (detay ekranındaki anahtar).
 *
 * Aktif/pasif DURUM kolonu kaldırıldı (kullanıcı isteği 2026-07-31): ürünlerin
 * aktiflik kavramı yok. Satıra tıklamak artık ürün detayını açar.
 */
export const ArticleListView = ({
    copyPrefix,
    createPath,
    bulkCreatePath,
    detailPath,
}: {
    /** 'inv.products' — metin yaprağı. */
    copyPrefix: string;
    createPath: string;
    /** Toplu ekleme tablosunun yolu — "Ekle"nin ALTINDA ikinci düğme olarak çıkar. */
    bulkCreatePath: string;
    /** Satıra tıklanınca açılacak detay kökü ('/inventory/articles'). */
    detailPath: string;
}) => {
    useLanguageTick();
    const navigate = useNavigate();
    const list = useArticlesList();
    const permissions = useAuthStore((state) => state.permissions);
    // Yönetici rolü sormadan siler; diğer BÜTÜN hesaplar kendi parolasıyla
    // onaylar (kullanıcı isteği 17.08.2026). Burası yalnızca pencerede parola
    // alanı çıkacak mı onu belirler — sunucu rolü kendisi de doğrular.
    const isSystemAdmin = useAuthStore((state) => state.isSystemAdmin);
    const canCreate = permissions.includes('inventory.articles.create');
    const canDelete = permissions.includes('inventory.articles.delete');
    const canTransfer = permissions.includes('inventory.transfer');
    // Schnellerfassung (02.09.2026): Foto → Text → Produkt, Codes vom System.
    // Auf dem Telefon ist sie der EINZIGE Knopf im Kopf; die zwei Formularwege
    // bleiben dem grösseren Schirm. Wer nur Bestand buchen darf, sieht sie
    // auch — dort bucht sie Eingänge auf vorhandene Produkte.
    const canQuickAdd = canCreate || canTransfer;
    const viewport = useCalViewport();
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const closeQuickAdd = (added: number) => {
        setQuickAddOpen(false);
        if (added > 0) list.reload({ silent: true });
    };
    /* ZUGANG JE ZEILE (11.09.2026, Samet): das Plus neben dem Produktnamen
       öffnet sofort das kleine Fenster «Zugang buchen» für GENAU diesen
       Artikel — kein Umweg mehr über «vorhanden» und die Suche in der
       Schnellerfassung. Der Bestand der Zeile springt ohne Neuladen nach. */
    const [stockIn, setStockIn] = useState<StockInArticle | null>(null);
    const onStockBooked = (article: StockInArticle, quantity: number) => {
        list.patchItem(article.id, { totalQuantity: article.totalQuantity + quantity });
        list.reload({ silent: true });
    };

    /** İşaretli satırlar (sayfalar arası korunur) — toplu silmenin seçimi. */
    const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
    /** Onay penceresi neyi soruyor: tek satır mı, seçimin tamamı mı. */
    const [pending, setPending] = useState<{ ids: string[]; name?: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [dialogError, setDialogError] = useState<string | null>(null);

    // Arama/filtre görünen satırları değiştirir; artık görünmeyen bir seçim
    // yanlışlıkla silinmesin diye seçim sıfırlanır.
    useEffect(() => {
        setSelected((current) => (current.size ? new Set() : current));
    }, [list.search, list.filters]);

    const pageIds = useMemo(() => list.items.map((item) => item.id), [list.items]);
    const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
    const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

    const toggleRow = (id: string) => setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    const togglePage = () => setSelected((current) => {
        const next = new Set(current);
        if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
        else pageIds.forEach((id) => next.add(id));
        return next;
    });

    // Sürüklenebilir sütunlar: ad sütununun genişliği yoktur, kalan yeri o emer.
    // Koddaki tutamaç SAĞ kenardadır (ad sütununun solunda kaldığı için).
    const grid = useColumnWidths<ArticleListColumn>({
        storageKey: 'offitec:inv-articles:col-widths:v3',
        defaults: ARTICLE_LIST_COLUMN_WIDTHS,
        minPx: 72,
    });

    const codeLabel = t('inv.columns.serialCode');
    const nameLabel = t('inv.columns.productName');

    /**
     * Silme onayı artık `window.confirm` değil: yönetici dışındaki hesaplar
     * parolasını girerek onaylar (kullanıcı isteği 17.08.2026), bu yüzden tek
     * satır da toplu seçim de AYNI onay penceresinden geçer.
     */
    const confirmDelete = async (password: string) => {
        if (!pending) return;
        const ids = pending.ids;
        setDeleting(true);
        setDialogError(null);
        try {
            // Tek satırda tekil uç kullanılır: denetim kaydı "toplu silme" değil,
            // gerçekte olan işlemi göstersin.
            if (ids.length === 1) await articleApi.delete(ids[0]!, password || undefined);
            else await articleApi.bulkDelete(ids, password || undefined);

            toast.success(ids.length === 1
                ? t(`${copyPrefix}.deleted`)
                : t('inv.bulkDelete.done', { count: ids.length }));

            // Satırlar BEKLEMEDEN düşer (kullanıcı isteği 2026-08-07): tablo
            // "yükleniyor" durumuna girmez. Sayfanın 15'e tamamlanması (ve son
            // sayfadaki son satırda bir önceki sayfaya dönüş) arkada sessizce olur.
            const removedFromPage = pageIds.filter((id) => ids.includes(id)).length;
            ids.forEach((id) => list.removeItem(id));
            setSelected((current) => {
                const next = new Set(current);
                ids.forEach((id) => next.delete(id));
                return next;
            });
            setPending(null);
            if (removedFromPage >= list.items.length && list.page > 1) list.setPage(list.page - 1);
            else list.reload({ silent: true });
        } catch (error: any) {
            const data = error?.response?.data;
            // Parola hatası pencereyi KAPATMAZ — kullanıcı tekrar dener.
            if (data?.code === 'PASSWORD_WRONG') setDialogError(t('common.dangerConfirm.passwordWrong'));
            else if (data?.code === 'PASSWORD_REQUIRED') setDialogError(t('common.dangerConfirm.passwordRequired'));
            else {
                toast.error(data?.error || t(ids.length === 1 ? `${copyPrefix}.deleteFailed` : 'inv.bulkDelete.failed'));
                setPending(null);
            }
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t(`${copyPrefix}.title`)}
                action={viewport.phone
                    ? (canQuickAdd && (
                        // Telefon: NUR die Schnellerfassung (Vorgabe 02.09.2026) —
                        // die Formularseiten sind für den Daumen kein Weg.
                        <button type="button" className="ofi-qa-launch is-phone" onClick={() => setQuickAddOpen(true)}>
                            <Scan size={18} />
                            {t('inv.quickAdd.button')}
                        </button>
                    ))
                    : (canQuickAdd || canCreate) && (
                        <div className="flex items-start gap-2">
                            {canQuickAdd && (
                                <button type="button" className="ofi-qa-launch" onClick={() => setQuickAddOpen(true)}>
                                    <Scan size={16} />
                                    {t('inv.quickAdd.button')}
                                </button>
                            )}
                            {canCreate && (
                                // Tekli ekleme üstte, toplu ekleme hemen ALTINDA (kullanıcı
                                // isteği 2026-08-07): iki ayrı sayfaya giden iki düğme.
                                <div className="flex flex-col items-stretch gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => navigate(createPath)}
                                        className="ofi-btn-brand flex items-center justify-center gap-1.5 rounded-md bg-[#0a7aff] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#0066e0]"
                                    >
                                        <Plus size={14} />
                                        {t(`${copyPrefix}.addButton`)}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => navigate(bulkCreatePath)}
                                        className="flex items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3.5 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:border-[#0066e0] hover:text-[#0066e0] dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                                    >
                                        <Plus size={13} />
                                        {t(`${copyPrefix}.bulkAddButton`)}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
            />
            <QuickAddSheet open={quickAddOpen} onClose={closeQuickAdd} />
            <StockInPopup article={stockIn} onClose={() => setStockIn(null)} onBooked={onStockBooked} />

            <FilterBar>
                <SearchBox
                    value={list.search}
                    onChange={list.setSearch}
                    placeholder={t(`${copyPrefix}.searchPlaceholder`)}
                />

                {/* Seçim şeridi: yalnızca bir şey seçiliyken görünür, arama
                    kutusunun yanında durur — tablo yerinden oynamaz. */}
                {selected.size > 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-white/15 dark:bg-white/5">
                        <span className="text-[12px] font-semibold text-slate-700 dark:text-white/80">
                            {t('inv.bulkDelete.selected', { count: selected.size })}
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelected(new Set())}
                            className="text-[11.5px] font-medium text-slate-500 underline-offset-2 transition-colors hover:text-slate-800 hover:underline dark:text-white/60 dark:hover:text-white"
                        >
                            {t('inv.bulkDelete.clearSelection')}
                        </button>
                        {canDelete && (
                            <button
                                type="button"
                                onClick={() => { setDialogError(null); setPending({ ids: [...selected] }); }}
                                className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-red-700"
                            >
                                <Trash01 size={13} />
                                {t('inv.bulkDelete.deleteSelected')}
                            </button>
                        )}
                    </div>
                )}
            </FilterBar>

            <SectionCard title={t(`${copyPrefix}.sectionTitle`, { count: list.total })}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        {/* Seçim sütunu SABİT: sürüklenebilir sütun kümesinin
                            dışındadır, böylece kayıtlı genişlikler bozulmaz.
                            Hücre dolgusu `px-0` ile sıfırlanır (inv-table'ın ilk
                            sütuna verdiği 18px sol dolgu kutuyu dışarı taşırdı). */}
                        {canDelete && <col style={{ width: 46 }} />}
                        <col ref={grid.setColRef('code')} style={{ width: grid.widths.code }} />
                        {/* Ad sütunu: genişliği yok, kalan yeri emer. */}
                        <col />
                        <ResizableCols keys={['model', 'serial', 'barcode', 'stock', 'price', 'actions'] as const} grid={grid} />
                    </colgroup>
                    <thead>
                        <tr>
                            {canDelete && (
                                <th className="px-0 text-center">
                                    <input
                                        type="checkbox"
                                        aria-label={t('inv.bulkDelete.selectAll')}
                                        checked={allOnPageSelected}
                                        ref={(element) => {
                                            // Sayfanın bir kısmı seçiliyse kutu "kararsız" görünür.
                                            if (element) element.indeterminate = selectedOnPage > 0 && !allOnPageSelected;
                                        }}
                                        onChange={togglePage}
                                        disabled={pageIds.length === 0}
                                        className="size-3.5 cursor-pointer accent-[#0a7aff] disabled:cursor-not-allowed disabled:opacity-40"
                                    />
                                </th>
                            )}
                            <SortableTh label={codeLabel} sortKey="articleCode" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-left" {...grid.resizeProps('code')} />
                            <SortableTh label={nameLabel} sortKey="name" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-left" />
                            <SortableTh label={t('inv.columns.modelNumber')} sortKey="modelNumber" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-left" {...grid.resizeProps('model')} />
                            <SortableTh label={t('inv.columns.serialNumber')} sortKey="serialNumber" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-left" {...grid.resizeProps('serial')} />
                            <SortableTh label={t('inv.columns.barcode')} sortKey="barcode" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-left" {...grid.resizeProps('barcode')} />
                            <SortableTh label={t('inv.columns.currentStock')} sortKey="totalQuantity" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-right" {...grid.resizeProps('stock')} />
                            <SortableTh label={t('inv.columns.salePrice')} sortKey="salePrice" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-right" {...grid.resizeProps('price')} />
                            <th className="relative text-right">
                                <ColResizeHandle {...grid.resizeProps('actions')} />
                            </th>
                        </tr>
                        {/* Kolon filtre satırı — eski listeyle aynı kriterler (kod / ad). */}
                        <tr data-filter-row>
                            {canDelete && <th />}
                            <th className="pb-1.5">
                                <input
                                    value={list.filters.code}
                                    onChange={(event) => list.setFilters({ ...list.filters, code: event.target.value })}
                                    placeholder={t('inv.filters.code')}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            <th className="pb-1.5">
                                <input
                                    value={list.filters.name}
                                    onChange={(event) => list.setFilters({ ...list.filters, name: event.target.value })}
                                    placeholder={t('inv.filters.name')}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            {/* Filtresi olmayan sütunlar kendi (boş) hücrelerini
                                alır ki sütun çizgileri burada da kesilmesin. */}
                            <th />
                            <th />
                            <th />
                            <th />
                            <th />
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {(list.loading || list.items.length === 0) && (
                            <TableStateRow colSpan={canDelete ? 9 : 8} loading={list.loading} emptyText={list.error || t(`${copyPrefix}.empty`)} />
                        )}
                        {!list.loading && list.items.map((article) => {
                            const critical = article.criticalStockLevel > 0 && article.totalQuantity <= article.criticalStockLevel;
                            const checked = selected.has(article.id);
                            return (
                                <tr
                                    key={article.id}
                                    onClick={() => navigate(`${detailPath}/${article.id}`)}
                                    className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${checked ? 'bg-[#eef2fb] dark:bg-white/10' : ''}`}
                                >
                                    {canDelete && (
                                        // Kutuya tıklamak satırı açmamalı: hem hücre hem kutu durdurur.
                                        <td className="px-0 text-center" onClick={(event) => event.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                aria-label={t('inv.bulkDelete.selectRow')}
                                                checked={checked}
                                                onChange={() => toggleRow(article.id)}
                                                className="size-3.5 cursor-pointer accent-[#0a7aff]"
                                            />
                                        </td>
                                    )}
                                    <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">{article.articleCode}</td>
                                    <td className="text-slate-800 dark:text-white">
                                        <span className="flex items-center gap-2">
                                            {article.name}
                                            {/* Das Plus: Zugang buchen, ohne die Zeile zu öffnen. */}
                                            {canTransfer && article.itemType !== 'SERVICE' && (
                                                <button
                                                    type="button"
                                                    aria-label={t('inv.stockIn.title')}
                                                    title={t('inv.stockIn.title')}
                                                    onClick={(event) => { event.stopPropagation(); setStockIn(article); }}
                                                    className="ofi-lager-rowplus inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-500 transition-colors hover:border-[#0a7aff] hover:text-[#0a7aff] dark:border-white/20 dark:text-white/60 dark:hover:border-[#0a7aff] dark:hover:text-[#0a7aff]"
                                                >
                                                    <Plus size={12} />
                                                </button>
                                            )}
                                            {/* Hizmet olarak işaretli kalemler listede rozetle ayrışır. */}
                                            {article.itemType === 'SERVICE' && (
                                                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                                                    {t('inv.detail.kindService')}
                                                </span>
                                            )}
                                        </span>
                                    </td>
                                    <td className="font-mono text-[12.5px] text-slate-600 dark:text-white/70">{article.modelNumber || '—'}</td>
                                    <td className="font-mono text-[12.5px] text-slate-600 dark:text-white/70">{article.serialNumber || '—'}</td>
                                    <td className="font-mono text-[12.5px] text-slate-600 dark:text-white/70">{article.supplierBarcode || article.systemBarcode || '—'}</td>
                                    <td className={`text-right font-mono text-[13px] ${critical ? 'font-bold text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-white/80'}`}>
                                        {fmtQty(article.totalQuantity)} {article.unit}
                                    </td>
                                    <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtMoney(article.salePrice)}</td>
                                    <td className="text-right">
                                        {canDelete && (
                                            <button
                                                type="button"
                                                aria-label={t(`${copyPrefix}.delete`)}
                                                disabled={deleting && pending?.ids.includes(article.id)}
                                                // Satır tıklaması detayı açar; silme onu tetiklememeli.
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setDialogError(null);
                                                    setPending({ ids: [article.id], name: article.name });
                                                }}
                                                className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-500/15"
                                            >
                                                <Trash01 size={13} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={list.page}
                        totalPages={list.totalPages}
                        total={list.total}
                        pageSize={PRODUCTS_PAGE_SIZE}
                        onPage={list.setPage}
                    />
                </div>
            </SectionCard>

            <DangerConfirmDialog
                open={Boolean(pending)}
                title={pending && pending.ids.length === 1 ? t(`${copyPrefix}.delete`) : t('inv.bulkDelete.title')}
                message={pending && pending.ids.length === 1
                    ? t('inv.bulkDelete.textOne', { name: pending.name ?? '' })
                    : t('inv.bulkDelete.text', { count: pending?.ids.length ?? 0 })}
                busy={deleting}
                error={dialogError}
                requirePassword={!isSystemAdmin}
                onCancel={() => { if (!deleting) { setPending(null); setDialogError(null); } }}
                onConfirm={(password) => void confirmDelete(password)}
            />
        </div>
    );
};
