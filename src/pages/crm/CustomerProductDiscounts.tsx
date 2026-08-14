import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Save01 as Save, Trash01 as TrashIcon, X as XIcon } from '@/components/icons/antIconCompat';

import { t as i18nT } from '@/i18n/translate';
import { customerApi } from '../../lib/api/customer';
import type { CustomerProductDiscountDto } from '../../lib/api/customer';
import { inventoryApi } from '../../lib/api/inventory';
import type { ArticleQuickPick } from '../../types/inventory';
import { Button } from '../../components/ui-shared/Button';
import { BottomSheet } from '../inventory/components/BottomSheet';
import { CELL_INPUT_CLASS, Pager, SearchBox, SectionCard, TableStateRow } from '../../components/ui-shared/TableKit';
import { CUSTOMER_ADD_ROW_BUTTON_CLASS } from './detail/customerDetail.constants';

/**
 * ── PREISLISTE (Produktrabatte) ─────────────────────────────────────────────
 *
 * Tabelle mit Listenpreis, Rabatt und Nettopreis. Der Rabatt wird DIREKT in der
 * Zelle eingegeben — ein Klick genügt, kein Umweg über ein Fenster.
 *
 * Gespeichert wird gesammelt: Änderungen sammeln sich lokal an und gehen mit
 * EINEM Request raus (`bulkSaveProductDiscounts`), dessen Antwort schon die
 * neue Liste ist. Vorher kostete jede Zeile einen POST plus einen vollständigen
 * GET — bei zehn Zeilen zwanzig Requests.
 *
 * Preise kommen mit der Liste mit (`salePrice`/`netPrice` am Datensatz); der
 * Artikelwähler benutzt den schlanken Suchpfad ohne Bestands-JOIN.
 */

const PAGE_SIZE = 12;

const fmtMoney = (value?: number | null) =>
    typeof value === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value)
        : '—';

const netOf = (salePrice?: number | null, discount = 0) =>
    typeof salePrice === 'number' ? Math.round(salePrice * (1 - discount / 100) * 100) / 100 : null;

const apiErrorMessage = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

/* ────────────────────────── Artikelwähler (Tabelle) ────────────────────────── */

/**
 * Auswahl mehrerer Artikel auf einmal — als von unten aufsteigendes Blatt
 * (`BottomSheet`), das über das "X" oben rechts geschlossen wird. Inhalt ist
 * eine Tabelle, keine Kartenliste; der Rabatt wird gleich in der Zeile
 * mitgegeben und alle Treffer landen zusammen in der Preisliste.
 */
const ProductPickerSheet = ({
    open,
    existingArticleIds,
    onClose,
    onAdd,
}: {
    open: boolean;
    existingArticleIds: Set<string>;
    onClose: () => void;
    onAdd: (rows: Array<{ article: ArticleQuickPick; discount: number }>) => void;
}) => {
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<ArticleQuickPick[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [picked, setPicked] = useState<Record<string, string>>({});

    useEffect(() => {
        const timer = window.setTimeout(() => { setDebounced(search); setPage(1); }, 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        inventoryApi.articlesQuickPick({ page, pageSize: PAGE_SIZE, search: debounced || undefined })
            .then((result) => {
                if (cancelled) return;
                setItems(result.items);
                setTotal(result.total);
            })
            .catch(() => { if (!cancelled) { setItems([]); setTotal(0); } })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, page, debounced]);

    useEffect(() => {
        if (!open) { setPicked({}); setSearch(''); setPage(1); }
    }, [open]);

    const confirm = () => {
        const rows = Object.entries(picked)
            .map(([articleId, raw]) => {
                const article = items.find((item) => item.id === articleId);
                const discount = Number(String(raw).replace(',', '.'));
                return article && Number.isFinite(discount) && discount >= 0 && discount <= 100
                    ? { article, discount }
                    : null;
            })
            .filter((row): row is { article: ArticleQuickPick; discount: number } => row !== null);
        if (rows.length === 0) {
            toast.error(i18nT('crm.productDiscountPickNone'));
            return;
        }
        onAdd(rows);
        onClose();
    };

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <BottomSheet
            open={open}
            title={i18nT('crm.productDiscountAdd')}
            subtitle={i18nT('crm.productDiscountPickHint')}
            onClose={onClose}
            width={1080}
            height={720}
            footer={
                <>
                    <span className="text-[12px] text-slate-500 dark:text-white/60">
                        {`${Object.keys(picked).length} / ${items.length}`}
                    </span>
                    <Button variant="primary" icon={<Plus size={13} />} onClick={confirm}>{i18nT('common.add')}</Button>
                </>
            }
        >
            <div className="space-y-2 p-4">
                <SearchBox value={search} onChange={setSearch} placeholder={i18nT('crm.productDiscountSearch')} autoFocus />
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="w-36 text-left">{i18nT('crm.productDiscountColArticle')}</th>
                            <th className="text-left">{i18nT('common.name')}</th>
                            <th className="w-32 text-right">{i18nT('crm.listPrice')}</th>
                            <th className="w-32 text-right">{i18nT('crm.discountPercent')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || items.length === 0) && (
                            <TableStateRow colSpan={4} loading={loading} emptyText={i18nT('crm.productDiscountEmpty')} />
                        )}
                        {!loading && items.map((article) => {
                            const already = existingArticleIds.has(article.id);
                            return (
                                <tr key={article.id} className={already ? 'opacity-50' : 'transition-colors hover:bg-slate-50 dark:hover:bg-white/5'}>
                                    <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">{article.articleCode || '—'}</td>
                                    <td className="truncate text-slate-800 dark:text-white/85">{article.name}</td>
                                    <td className="text-right font-mono tabular-nums">{fmtMoney(article.salePrice)}</td>
                                    <td className="text-right">
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            step="0.1"
                                            disabled={already}
                                            value={picked[article.id] ?? ''}
                                            placeholder={already ? i18nT('crm.alreadyInList') : '0'}
                                            onChange={(event) => {
                                                const next = event.target.value;
                                                setPicked((current) => {
                                                    const copy = { ...current };
                                                    if (next === '') delete copy[article.id];
                                                    else copy[article.id] = next;
                                                    return copy;
                                                });
                                            }}
                                            className={`${CELL_INPUT_CLASS} text-right`}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
            </div>
        </BottomSheet>
    );
};

/* ─────────────────────────────── Preisliste ─────────────────────────────── */

/** Eine Zeile der Preisliste; `id` fehlt bei noch nicht gespeicherten Zeilen. */
interface DiscountRow {
    id: string | null;
    articleId: string;
    articleCode: string | null;
    articleName: string | null;
    salePrice: number | null;
    discount: number;
}

const toRow = (dto: CustomerProductDiscountDto): DiscountRow => ({
    id: dto.id,
    articleId: dto.articleId,
    articleCode: dto.articleCode ?? null,
    articleName: dto.articleName ?? null,
    salePrice: dto.salePrice ?? null,
    discount: dto.discount,
});

export const CustomerProductDiscounts = ({ customerId }: { customerId: string }) => {
    const [rows, setRows] = useState<DiscountRow[]>([]);
    const [saved, setSaved] = useState<DiscountRow[]>([]);
    const [deletedIds, setDeletedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
    const [filter, setFilter] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await customerApi.listProductDiscounts(customerId);
            const mapped = result.map(toRow);
            setRows(mapped);
            setSaved(mapped);
            setDeletedIds([]);
        } catch {
            toast.error(i18nT('crm.productDiscountLoadError'));
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    useEffect(() => { void load(); }, [load]);

    const dirty = useMemo(() => {
        if (deletedIds.length > 0) return true;
        if (rows.length !== saved.length) return true;
        const savedByArticle = new Map(saved.map((row) => [row.articleId, row.discount]));
        return rows.some((row) => savedByArticle.get(row.articleId) !== row.discount);
    }, [rows, saved, deletedIds]);

    const setDiscount = (articleId: string, value: number) =>
        setRows((current) => current.map((row) => (row.articleId === articleId ? { ...row, discount: value } : row)));

    const removeRow = (row: DiscountRow) => {
        setRows((current) => current.filter((item) => item.articleId !== row.articleId));
        if (row.id) setDeletedIds((current) => [...current, row.id!]);
    };

    const addFromPicker = (picked: Array<{ article: ArticleQuickPick; discount: number }>) => {
        setRows((current) => [
            ...picked.map(({ article, discount }) => ({
                id: null,
                articleId: article.id,
                articleCode: article.articleCode ?? null,
                articleName: article.name,
                salePrice: article.salePrice ?? null,
                discount,
            })),
            ...current,
        ]);
    };

    /** Alles auf einmal: ein Request, dessen Antwort die neue Liste ist. */
    const saveAll = async () => {
        if (!dirty) return;
        const savedByArticle = new Map(saved.map((row) => [row.articleId, row.discount]));
        const upserts = rows
            .filter((row) => savedByArticle.get(row.articleId) !== row.discount)
            .map((row) => ({ articleId: row.articleId, discount: row.discount }));
        try {
            setSaving(true);
            const result = await customerApi.bulkSaveProductDiscounts(customerId, { upserts, deleteIds: deletedIds });
            const mapped = result.map(toRow);
            setRows(mapped);
            setSaved(mapped);
            setDeletedIds([]);
            setEditingArticleId(null);
            toast.success(i18nT('crm.productDiscountsSaved'));
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('crm.productDiscountSaveError')));
        } finally {
            setSaving(false);
        }
    };

    const discard = () => {
        setRows(saved);
        setDeletedIds([]);
        setEditingArticleId(null);
    };

    const visible = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        if (!needle) return rows;
        return rows.filter((row) =>
            (row.articleCode ?? '').toLowerCase().includes(needle)
            || (row.articleName ?? '').toLowerCase().includes(needle));
    }, [rows, filter]);

    const existingArticleIds = useMemo(() => new Set(rows.map((row) => row.articleId)), [rows]);

    return (
        <>
            <SectionCard
                title={`${i18nT('crm.tab_productDiscounts')} (${rows.length})`}
                action={
                    <div className="flex items-center gap-2">
                        <SearchBox value={filter} onChange={setFilter} placeholder={i18nT('common.search')} className="w-52" />
                        <Button variant="secondary" size="sm" icon={<Plus size={12} />} onClick={() => setPickerOpen(true)}>
                            {i18nT('crm.productDiscountAdd')}
                        </Button>
                    </div>
                }
            >
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="w-36 text-left">{i18nT('crm.productDiscountColArticle')}</th>
                            <th className="text-left">{i18nT('common.name')}</th>
                            {/* Preis, Rabatt und Nettopreis haben je eine eigene, breite
                                Spalte — der Rabattwert quetscht sich nicht mehr neben
                                den Preis. */}
                            <th className="w-36 text-right">{i18nT('crm.listPrice')}</th>
                            <th className="w-32 text-right">{i18nT('crm.discountPercent')}</th>
                            <th className="w-36 text-right">{i18nT('crm.netPrice')}</th>
                            <th className="w-16 text-right" />
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || visible.length === 0) && (
                            <TableStateRow colSpan={6} loading={loading} emptyText={i18nT('crm.productDiscountEmpty')} />
                        )}
                        {!loading && visible.map((row) => {
                            const editing = editingArticleId === row.articleId;
                            const changed = saved.find((item) => item.articleId === row.articleId)?.discount !== row.discount;
                            return (
                                <tr
                                    key={row.articleId}
                                    className={`group transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${
                                        changed ? 'bg-amber-50/60 dark:bg-amber-400/5' : ''
                                    }`}
                                >
                                    <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">{row.articleCode || '—'}</td>
                                    <td className="truncate text-slate-800 dark:text-white/85">{row.articleName || '—'}</td>
                                    <td className="text-right font-mono text-[13px] tabular-nums text-slate-600 dark:text-white/70">
                                        {fmtMoney(row.salePrice)}
                                    </td>
                                    {/* Ein Klick auf den Rabatt macht ihn zum Eingabefeld. */}
                                    <td className="text-right" onClick={() => setEditingArticleId(row.articleId)}>
                                        {editing ? (
                                            <input
                                                autoFocus
                                                type="number"
                                                min={0}
                                                max={100}
                                                step="0.1"
                                                value={row.discount}
                                                onChange={(event) => setDiscount(row.articleId, Number(event.target.value))}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') { event.preventDefault(); void saveAll(); }
                                                    if (event.key === 'Escape') setEditingArticleId(null);
                                                }}
                                                onBlur={() => setEditingArticleId(null)}
                                                className={`${CELL_INPUT_CLASS} text-right`}
                                            />
                                        ) : (
                                            <span className="cursor-text font-mono text-[13px] font-semibold tabular-nums text-[#1f2654] dark:text-sky-300">
                                                {row.discount}%
                                            </span>
                                        )}
                                    </td>
                                    <td className="text-right font-mono text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">
                                        {fmtMoney(netOf(row.salePrice, row.discount))}
                                    </td>
                                    <td className="text-right">
                                        <button
                                            type="button"
                                            onClick={() => removeRow(row)}
                                            title={i18nT('common.delete')}
                                            className="inline-flex size-6 items-center justify-center rounded-[2px] text-slate-300 opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100"
                                        >
                                            <TrashIcon size={13} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}

                        {/* Leerzeile: das "+" öffnet den Artikelwähler. */}
                        <tr className="bg-slate-50/60 dark:bg-white/[0.02]">
                            {/* Knopf UND Beschriftung in DERSELBEN Zelle, rechts —
                                dieselbe Anlege-Zeile wie in den Tabellen der
                                Kundenübersicht. */}
                            <td colSpan={6}>
                                <div className="flex items-center gap-2.5">
                                    <button
                                        type="button"
                                        onClick={() => setPickerOpen(true)}
                                        title={i18nT('crm.productDiscountAdd')}
                                        aria-label={i18nT('crm.productDiscountAdd')}
                                        className={CUSTOMER_ADD_ROW_BUTTON_CLASS}
                                    >
                                        <Plus size={18} />
                                    </button>
                                    <span className="text-[12.5px] text-slate-400 dark:text-white/40">
                                        {i18nT('crm.productDiscountAddHint')}
                                    </span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* Speichern-Leiste: alle offenen Änderungen gehen in EINEM Request raus. */}
                {dirty && (
                    <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                        <span className="mr-auto text-[12px] text-slate-500 dark:text-white/60">
                            {i18nT('crm.unsavedChanges')}
                        </span>
                        <Button variant="secondary" size="sm" icon={<XIcon size={12} />} onClick={discard}>
                            {i18nT('common.cancel')}
                        </Button>
                        <Button variant="primary" size="sm" loading={saving} icon={<Save size={12} />} onClick={() => void saveAll()}>
                            {i18nT('common.save')}
                        </Button>
                    </div>
                )}
            </SectionCard>

            <ProductPickerSheet
                open={pickerOpen}
                existingArticleIds={existingArticleIds}
                onClose={() => setPickerOpen(false)}
                onAdd={addFromPicker}
            />
        </>
    );
};
