import { useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Search, TriangleAlert, X } from 'lucide-react';
import { DateField } from '@/components/ui-shared/DateField';
import { t } from '@/i18n/translate';
import type { MovementKind, MovementListItem } from '@/types/inventory';
/* Das Kleid des Depo (Tabelle, Werkzeugzeile, Token-Felder) — Vorgabe Samet,
   29.09.2026: «depoda kullandık ya, onun gibi». Nur die Formen kommen von
   dort; die Daten bleiben die des Lagers. */
import '@/styles/modules/warehouse.css';
import '@/styles/modules/stockMovements.css';
import { useLanguageTick } from './hooks/useLanguageTick';
import { MOVEMENTS_PAGE_SIZE, useMovementsList } from './hooks/useMovementsList';
import { MovementTypeFilter, PeriodFilter, type PeriodKey } from './movements/MovementFilters';
import { ORIGIN_LABEL, type MovementFilterValue } from './movements/movementLabels';
import { fmtDateTime, fmtQty } from './utils/format';

/**
 * ══ STOK HAREKETLERİ — EINE RUHIGE TABELLE (29.09.2026) ═════════════════════
 *
 * Vorgabe Samet: «Stok hareketleri de apple macOS temiz olsun … çok filtre
 * var, filtreleri çok azalt, sadece gerekli olanları … tablo çok büyük, çok
 * ağır … basit bir tablo olsun, girdi çıktı sadece, sütunları azalt.»
 *
 *   · Werkzeugzeile: EIN Suchfeld, «Hareket» (Giriş/Çıkış + Kaynak, mehrfach,
 *     die gläserne Auswahl des Depo) und «Dönem» (eine Schnellwahl; erst
 *     «Özel aralık» holt die zwei Kalenderfelder dazu).
 *   · Sieben Spalten: Tarih · ERP kodu · Ürün · Giriş · Çıkış · Kaynak · Kişi.
 *     Modell, Seriennummer, Barcode, Lager und die Spaltenwahl sind fort; die
 *     Suche findet Serie und Barcode trotzdem.
 *   · Die Definitionen (Zugang mit Menge 0, «Ürün tanımı») stehen NICHT mehr
 *     darin — sie waren 6 400 von 6 800 Zeilen und keine Bewegung der Ware.
 *     Sie bleiben in der Produktkarte sichtbar.
 */

/** Alles, was Ware bewegt — also jede Bewegung ausser der Definition. */
const REAL_KINDS: MovementKind[] = ['IN', 'OUT', 'TRANSFER', 'RETURN', 'ADJUSTMENT'];
/** Zugang in der Tabelle: Eingang, Rückgabe, Korrektur (sie bucht auf ein Ziel). */
const INBOUND_KINDS: MovementKind[] = ['IN', 'RETURN', 'ADJUSTMENT'];

const kindsFor = (directions: MovementFilterValue['directions']): MovementKind[] => {
    if (directions.length === 1) return directions[0] === 'IN' ? INBOUND_KINDS : ['OUT'];
    return REAL_KINDS;
};

const Blank = () => <span className="ofi-wh-empty-cell">—</span>;

const QtyCell = ({ movement, side }: { movement: MovementListItem; side: 'in' | 'out' }) => {
    // Eine Umbuchung ist weder Zu- noch Abgang: sie steht leise in «Giriş».
    if (movement.movementType === 'TRANSFER') {
        return side === 'in' ? <span className="ofi-smv-qty is-move">⇄ {fmtQty(movement.quantity)}</span> : null;
    }
    const out = movement.movementType === 'OUT';
    if ((side === 'out') !== out) return null;
    return (
        <span className={`ofi-smv-qty ${out ? 'is-out' : 'is-in'}`}>
            {out ? '−' : '+'}{fmtQty(movement.quantity)}
            {movement.article?.unit && <small>{movement.article.unit}</small>}
        </span>
    );
};

export const StockMovementsPage = () => {
    useLanguageTick();
    const searchRef = useRef<HTMLInputElement>(null);
    const [filter, setFilter] = useState<MovementFilterValue>({ directions: [], origins: [] });
    const kinds = useMemo(() => kindsFor(filter.directions), [filter.directions]);
    const list = useMovementsList({ kinds, origins: filter.origins });

    /* «Özel aralık» ist eine eigene Wahl: sie bleibt stehen, auch wenn die
       getippten Tage zufällig einer Schnellwahl gleichen. */
    const [custom, setCustom] = useState(false);
    const period: PeriodKey = custom ? 'custom' : (list.quickRange ?? 'custom');
    const pickPeriod = (next: PeriodKey) => {
        if (next === 'custom') { setCustom(true); return; }
        setCustom(false);
        list.setQuickRange(next);
    };

    const filtered = Boolean(list.search.trim() || filter.directions.length || filter.origins.length || list.dateFrom || list.dateTo);
    const clearAll = () => {
        list.setSearch('');
        setFilter({ directions: [], origins: [] });
        setCustom(false);
        list.setQuickRange('all');
    };

    const firstLoad = list.loading && !list.items.length;
    const from = list.total ? (list.page - 1) * MOVEMENTS_PAGE_SIZE + 1 : 0;
    const to = Math.min(list.total, list.page * MOVEMENTS_PAGE_SIZE);

    return (
        <div className="ofi-wh ofi-smv">
            <header className="ofi-wh-head">
                <h1 className="ofi-wh-head__title">{t('inv.movements.title')}</h1>
                {!firstLoad && <span className="ofi-wh-head__count">{t('inv.movements.count', { count: list.total })}</span>}
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
                        value={list.search}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={t('inv.movements.searchPlaceholder')}
                        aria-label={t('inv.movements.searchPlaceholder')}
                        onChange={(event) => list.setSearch(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape' && list.search) { event.preventDefault(); list.setSearch(''); }
                        }}
                    />
                    {list.search && (
                        <button
                            type="button"
                            className="ofi-wh-search__clear ofi-nosize"
                            aria-label={t('inv.movements.clearSearch')}
                            onClick={() => { list.setSearch(''); searchRef.current?.focus(); }}
                        >
                            <X />
                        </button>
                    )}
                </div>

                <MovementTypeFilter value={filter} onChange={setFilter} />
                <PeriodFilter value={period} onChange={pickPeriod} />

                {period === 'custom' && (
                    <div className="ofi-smv-range" role="group" aria-label={t('inv.movements.customRange')}>
                        <DateField
                            value={list.dateFrom}
                            onChange={list.setDateFrom}
                            max={list.dateTo || undefined}
                            ariaLabel={t('inv.movements.dateFrom')}
                            placeholder={t('inv.movements.dateFrom')}
                            buttonClassName="ofi-smv-date ofi-nosize"
                        />
                        <span className="ofi-smv-range__dash" aria-hidden>–</span>
                        <DateField
                            value={list.dateTo}
                            onChange={list.setDateTo}
                            min={list.dateFrom || undefined}
                            ariaLabel={t('inv.movements.dateTo')}
                            placeholder={t('inv.movements.dateTo')}
                            buttonClassName="ofi-smv-date ofi-nosize"
                        />
                    </div>
                )}
            </div>

            <div className={`ofi-wh-tablewrap ${list.loading && list.items.length ? 'is-loading' : ''}`}>
                <div className="ofi-wh-tablescroll">
                    <table className="ofi-wh-table" data-unstyled-table aria-label={t('inv.movements.title')}>
                        <colgroup>
                            <col style={{ width: 142 }} />
                            <col style={{ width: 150 }} />
                            <col />
                            <col style={{ width: 112 }} />
                            <col style={{ width: 112 }} />
                            <col style={{ width: 250 }} />
                            <col style={{ width: 150 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th><span className="ofi-smv-th">{t('inv.columns.dateTime')}</span></th>
                                <th><span className="ofi-smv-th">{t('inv.columns.erpCode')}</span></th>
                                <th><span className="ofi-smv-th">{t('inv.columns.productName')}</span></th>
                                <th className="is-num"><span className="ofi-smv-th">{t('inv.movement.in')}</span></th>
                                <th className="is-num"><span className="ofi-smv-th">{t('inv.movement.out')}</span></th>
                                <th><span className="ofi-smv-th">{t('inv.movements.originLabel')}</span></th>
                                <th><span className="ofi-smv-th">{t('inv.columns.employee')}</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {firstLoad && Array.from({ length: 8 }, (_, index) => (
                                <tr key={`skel-${index}`} aria-hidden>
                                    {[58, 70, 64, 40, 40, 72, 56].map((width, cell) => (
                                        <td key={cell} className={cell === 3 || cell === 4 ? 'is-num' : ''}>
                                            <span className="ofi-wh-skel" style={{ width: `${width}%`, marginLeft: cell === 3 || cell === 4 ? 'auto' : undefined }} />
                                        </td>
                                    ))}
                                </tr>
                            ))}

                            {!list.loading && !list.items.length && (
                                <tr>
                                    <td colSpan={7} style={{ height: 'auto', padding: 0 }}>
                                        {list.error ? (
                                            <div className="ofi-wh-state is-error">
                                                <TriangleAlert />
                                                <b>{list.error}</b>
                                                <button type="button" className="ofi-wh-btn ofi-nosize" onClick={list.reload}>
                                                    {t('inv.movements.retry')}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="ofi-wh-state">
                                                <ArrowLeftRight />
                                                <b>{t('inv.movements.empty')}</b>
                                                {filtered && (
                                                    <button type="button" className="ofi-wh-btn ofi-nosize" onClick={clearAll}>
                                                        {t('inv.movements.clearFilters')}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )}

                            {!firstLoad && list.items.map((movement) => {
                                const article = movement.article;
                                const employee = movement.employee ? `${movement.employee.firstName} ${movement.employee.lastName}`.trim() : '';
                                const originText = t(ORIGIN_LABEL[movement.origin] ?? ORIGIN_LABEL.MANUAL);
                                // Woher / wohin: der Lieferant, sonst die Notiz der Bewegung.
                                const note = movement.supplier?.companyName || movement.description || '';
                                return (
                                    <tr key={movement.id}>
                                        <td className="ofi-smv-date-cell">{fmtDateTime(movement.transactionDate)}</td>
                                        <td>{article?.articleCode ? <span className="ofi-wh-code">{article.articleCode}</span> : <Blank />}</td>
                                        <td className="is-name" title={article?.name || undefined}>{article?.name || <Blank />}</td>
                                        <td className="is-num"><QtyCell movement={movement} side="in" /></td>
                                        <td className="is-num"><QtyCell movement={movement} side="out" /></td>
                                        <td title={[originText, note].filter(Boolean).join(' · ')}>
                                            {originText}
                                            {note && <span className="ofi-wh-cell-sub"> · {note}</span>}
                                        </td>
                                        <td className="ofi-wh-cell-sub" title={employee || undefined}>{employee || <Blank />}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <footer className="ofi-wh-tablefoot">
                    <span>{list.total ? t('inv.movements.pageInfo', { from, to, total: list.total }) : ''}</span>
                    <span className="ofi-wh-tablefoot__pager">
                        <button
                            type="button"
                            className="ofi-wh-btn is-small is-icon is-quiet ofi-nosize"
                            disabled={list.page <= 1 || list.loading}
                            aria-label={t('inv.movements.prevPage')}
                            title={t('inv.movements.prevPage')}
                            onClick={() => list.setPage(list.page - 1)}
                        >
                            <ChevronLeft />
                        </button>
                        <button
                            type="button"
                            className="ofi-wh-btn is-small is-icon is-quiet ofi-nosize"
                            disabled={list.page >= list.totalPages || list.loading}
                            aria-label={t('inv.movements.nextPage')}
                            title={t('inv.movements.nextPage')}
                            onClick={() => list.setPage(list.page + 1)}
                        >
                            <ChevronRight />
                        </button>
                    </span>
                </footer>
            </div>
        </div>
    );
};
