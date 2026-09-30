import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Lock, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { PopupActions, PopupButton, PopupDialog, PopupNote } from '@/components/ui-shared/PopupKit';
import { productionBomErrorText } from '@/lib/api/productionBom';
import { purchasingApi } from '@/lib/api/purchasing';
import type { ComparisonResult, ComparisonSkip, PriceComparison } from '@/types/purchasing';

import { fmtPrice } from '../../bom/bomFormat';
import { DispatchSheet } from '../dispatch/DispatchSheet';
import { useDispatchQueue } from '../dispatch/useDispatchQueue';
import { picksBySupplier, selectionPayload, type Selection } from './comparisonSelection';

const P = 'productionBom.purchasing.orderFromCompare';

/**
 * ── «SİPARİŞ OLUŞTUR» AUS DEM VERGLEICH (30.09.2026, Vorgabe Samet) ────────
 * «Tedarikçi özelinde biz sipariş oluştur butonuna basınca … her birine ayrı
 *  sipariş PDF'i gidiyor.» Unten die Leiste mit der Auswahl; ein Klick zeigt
 * je Lieferant, was er bestellt bekommt; «Oluştur ve gönder» legt die
 * Bestellungen an (Preis, Rabatt, Angebotsnummer, Ansprechpartner aus dem
 * Angebot) und schickt jede als PDF — im Fenster der Sendung sichtbar.
 */
/** Der Weg zur BOM (Geräteseite, Reiter BOM, genau diese BOM) — dort wird sie freigegeben. */
const bomPath = (bom: NonNullable<PriceComparison['bom']>): string => {
    const query = new URLSearchParams();
    if (bom.area === 'ELECTRICAL') query.set('area', 'electrical');
    query.set('stage', 'bom');
    query.set('bom', bom.id);
    return `/production/orders/${encodeURIComponent(bom.productionProjectId)}/devices/${encodeURIComponent(bom.productionItemId)}?${query.toString()}`;
};

export const OrderFromComparison = ({ comparisonId, result, selection, skip, quantities, canOrder, bom, onDone, onOpenDocument }: {
    comparisonId: string;
    result: ComparisonResult;
    selection: Selection;
    /** Zeilen, die nicht bestellt würden (am Lager, schon bestellt, keine Karte). */
    skip: ReadonlySet<string>;
    /** Die Bestellmenge je Zeile, wo der Server sie kennt (freigegebene BOM). */
    quantities: Readonly<Record<string, number>>;
    canOrder: boolean;
    /** Die BOM des Talep: ist sie noch ein Entwurf, wird hier erst nach der Freigabe bestellt (30.09.2026). */
    bom: PriceComparison['bom'];
    onDone: () => void;
    onOpenDocument: (purchaseOrderId: string) => void;
}) => {
    const navigate = useNavigate();
    const picks = picksBySupplier(result, selection, skip, quantities);
    /* Gewählt, aber nichts davon würde bestellt (alles am Lager oder schon bestellt). */
    const allSkipped = !picks.length && result.lines.some((line) => skip.has(line.bomLineId) && selection[line.bomLineId] !== null && selection[line.bomLineId] !== undefined);
    const lineCount = picks.reduce((sum, pick) => sum + pick.lines.length, 0);
    const [review, setReview] = useState(false);
    /* «Sipariş numarası yoksa orada manuel ekleme yeri olsun» (30.09.2026): die Angebotsnummer
       je Lieferant — vorbelegt mit der, die die KI im Angebot las; ohne sie geht die Bestellung nicht hinaus. */
    const [quotes, setQuotes] = useState<Record<number, string>>({});
    const [creating, setCreating] = useState(false);
    const [sheet, setSheet] = useState(false);
    const [skipped, setSkipped] = useState<ComparisonSkip[]>([]);
    const queue = useDispatchQueue([]);
    const currencies = new Set(picks.map((pick) => result.suppliers[pick.supplier]!.currency));
    const sum = picks.reduce((total, pick) => total + pick.total, 0);

    const create = async () => {
        if (creating || !picks.length) return;
        setCreating(true);
        try {
            const typed = Object.fromEntries(Object.entries(quotes).map(([index, value]) => [index, value.trim()]).filter(([, value]) => value));
            const response = await purchasingApi.ordersFromComparison(comparisonId, selectionPayload(selection, result, skip), typed);
            setSkipped(response.skipped);
            if (!response.orders.length) {
                toast.error(t(`${P}.nothingCreated`));
                return;
            }
            const cards = response.orders.map((order) => ({
                purchaseOrderId: order.purchaseOrderId,
                code: order.code,
                supplierName: order.supplierName,
                detail: [t(`${P}.lines`, { count: order.lineCount }), order.total > 0 ? fmtPrice(order.total, order.currency) : null].filter(Boolean).join(' · '),
                phase: 'waiting' as const,
                to: order.email,
                fileName: null,
                mailId: null,
                problem: null,
                error: null,
            }));
            queue.setCards(cards);
            setReview(false);
            setSheet(true);
            void queue.run(cards.map((card) => card.purchaseOrderId));
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setCreating(false);
        }
    };

    if (!canOrder) return null;
    /* «Bu durumda bu işlem yapılamaz» war die Antwort am Ende (30.09.2026, Samet: «bu ne saçma hata»):
       angefragt und verglichen wird schon im Entwurf, bestellt erst aus der freigegebenen BOM — das
       steht jetzt VOR dem Knopf, samt dem Weg zur BOM. Die Auswahl bleibt bis dahin stehen. */
    if (bom && !bom.approved) {
        return (
            <div className="ofi-buy-orderbar is-locked" role="status">
                <span className="ofi-buy-orderbar__lock" aria-hidden><Lock /></span>
                <span className="ofi-buy-orderbar__text">
                    <b>{t(`${P}.bomDraft`, { bom: bom.number ?? '' })}</b>
                    <small>{t(`${P}.bomDraftHint`)}</small>
                </span>
                <button type="button" className="ofi-buy-btn ofi-nosize" onClick={() => navigate(bomPath(bom))}>
                    {t(`${P}.openBom`)}
                    <ArrowRight aria-hidden />
                </button>
                <button type="button" className="ofi-buy-btn is-primary ofi-nosize" disabled title={t(`${P}.bomDraftHint`)}>
                    <ShoppingCart aria-hidden />
                    {t(`${P}.button`)}
                </button>
            </div>
        );
    }
    return (
        <>
            <div className={`ofi-buy-orderbar${picks.length ? '' : ' is-empty'}`}>
                <span className="ofi-buy-orderbar__text">
                    <b>{picks.length ? t(`${P}.summary`, { lines: lineCount, suppliers: picks.length }) : t(allSkipped ? `${P}.allSkipped` : `${P}.nothing`)}</b>
                    <small>{currencies.size === 1 && sum > 0 ? fmtPrice(sum, [...currencies][0]!) : t(`${P}.hint`)}</small>
                </span>
                <button type="button" className="ofi-buy-btn is-primary ofi-nosize" disabled={!picks.length || creating} onClick={() => {
                    setQuotes(Object.fromEntries(picks.map((pick) => [pick.supplier, result.suppliers[pick.supplier]?.offerNumber ?? ''])));
                    setReview(true);
                }}>
                    <ShoppingCart aria-hidden />
                    {t(`${P}.button`)}
                </button>
            </div>

            <PopupDialog
                open={review}
                title={t(`${P}.reviewTitle`)}
                subtitle={t(`${P}.reviewSubtitle`, { count: picks.length })}
                icon={<ShoppingCart size={18} />}
                width={560}
                closeOnBackdrop={!creating}
                closeOnEscape={!creating}
                onClose={() => { if (!creating) setReview(false); }}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setReview(false)} disabled={creating}>{t('productionBom.common.cancel')}</PopupButton>
                        <PopupButton variant="primary" loading={creating} onClick={() => void create()}>{t(`${P}.confirm`)}</PopupButton>
                    </PopupActions>
                )}
            >
                <ul className="ofi-buy-orderreview">
                    {picks.map((pick) => {
                        const supplier = result.suppliers[pick.supplier]!;
                        return (
                            <li key={supplier.purchaseOrderId}>
                                <span className="ofi-buy-orderreview__icon"><Building2 aria-hidden /></span>
                                <span className="ofi-buy-orderreview__text">
                                    <b>{supplier.supplierName}</b>
                                    <small>{pick.lines.map((line) => line.name).join(', ')}</small>
                                    <label className={`ofi-buy-orderreview__quote${(quotes[pick.supplier] ?? '').trim() ? '' : ' is-missing'}`}>
                                        <span>{t(`${P}.quoteLabel`)}</span>
                                        <input
                                            value={quotes[pick.supplier] ?? ''}
                                            maxLength={120}
                                            spellCheck={false}
                                            autoComplete="off"
                                            placeholder={t(`${P}.quotePlaceholder`)}
                                            disabled={creating}
                                            onChange={(event) => setQuotes((current) => ({ ...current, [pick.supplier]: event.target.value }))}
                                        />
                                    </label>
                                </span>
                                <span className="ofi-buy-orderreview__sum">
                                    <b>{pick.total > 0 ? fmtPrice(pick.total, supplier.currency) : '—'}</b>
                                    <small>{t(`${P}.lines`, { count: pick.lines.length })}</small>
                                </span>
                            </li>
                        );
                    })}
                </ul>
                <PopupNote>{t(`${P}.reviewNote`)}</PopupNote>
            </PopupDialog>

            <DispatchSheet
                open={sheet}
                title={t(`${P}.sheetTitle`)}
                subtitle={t(`${P}.sheetSubtitle`)}
                cards={queue.cards}
                running={queue.running}
                onClose={() => { setSheet(false); onDone(); }}
                onRetry={(id) => void queue.run([id])}
                onOpenDocument={(id) => { setSheet(false); onOpenDocument(id); }}
            >
                {skipped.length > 0 && (
                    <div className="ofi-dsp-note">
                        <b>{t(`${P}.skippedTitle`, { count: skipped.length })}</b>
                        {skipped.map((entry) => (
                            <span key={entry.bomLineId}>{entry.name} — {t(`${P}.skip.${entry.reason}`)}</span>
                        ))}
                    </div>
                )}
            </DispatchSheet>
        </>
    );
};
