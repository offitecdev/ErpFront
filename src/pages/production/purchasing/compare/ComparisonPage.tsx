import { useEffect, useState } from 'react';
import { ChevronLeft, FileText, Sparkles, Trophy } from 'lucide-react';

import { t } from '@/i18n/translate';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { productionBomErrorText } from '@/lib/api/productionBom';
import { purchasingApi } from '@/lib/api/purchasing';
import type { ComparisonSupplier, PriceComparison } from '@/types/purchasing';

import { openQuoteFile } from '../../bom/device/bomFiles';
import { fmtPrice, shortDate, shownPurchaseCode } from '../../bom/bomFormat';
import { whenText } from '../purchasingModel';
import { Failure, KindPill, Loading } from '../purchasingUi';
import { ComparisonMatrix, type Measure } from './ComparisonMatrix';
import { initialSelection, type Selection } from './comparisonSelection';
import { OrderFromComparison } from './OrderFromComparison';

const P = 'productionBom.purchasing.comparison';

/** «Teslim 2 hafta · Ödeme 30 gün · Geçerli 30.10.» — was ein Angebot ausser dem Preis sagt. */
const factsOf = (supplier: ComparisonSupplier): Array<{ key: string; label: string; value: string }> => [
    { key: 'delivery', label: t(`${P}.delivery`), value: supplier.deliveryTime },
    { key: 'payment', label: t(`${P}.payment`), value: supplier.paymentTerms },
    { key: 'validity', label: t(`${P}.validity`), value: supplier.validity },
    { key: 'contact', label: t(`${P}.contact`), value: [supplier.contactName, supplier.contactEmail].filter(Boolean).join(' · ') },
].filter((entry) => entry.value);

/**
 * ── DIE SEITE EINES FİYAT KARŞILAŞTIRMASI (29.09.2026, umgebaut 30.09.2026) ─
 *
 * Oben: zurück, der Talep, rechts das Menü der gespeicherten Vergleiche. Je
 * Angebot eine Karte, die Empfehlung der KI und die Tabelle — seit dem
 * 30.09.2026 WÄHLBAR («oradan seçim yapabiliyoruz, seçili olarak geliyor en
 * uygun teklif»): je Zeile ein Angebot, unten die Leiste «Siparişleri oluştur
 * ve gönder» — je Lieferant eine Bestellung, jede als PDF an ihn.
 */
export const ComparisonPage = ({ comparisonId, onBack, onSwitch, onOpenDocument, onOrdered }: {
    comparisonId: string;
    onBack: () => void;
    onSwitch: (comparisonId: string) => void;
    onOpenDocument: (purchaseOrderId: string) => void;
    onOrdered: () => void;
}) => {
    const [data, setData] = useState<PriceComparison | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reload, setReload] = useState(0);
    const [measure, setMeasure] = useState<Measure>('unit');
    const [selection, setSelection] = useState<Selection>({});

    useEffect(() => {
        let alive = true;
        purchasingApi.comparison(comparisonId)
            .then((value) => {
                if (!alive) return;
                setData(value);
                setSelection(initialSelection(value.result));
                setError(null);
            })
            .catch((failure) => { if (alive) setError(productionBomErrorText(failure, 'productionBom.err.loadFailed')); });
        return () => { alive = false; };
    }, [comparisonId, reload]);

    const nav = (
        <header className="ofi-buy-nav">
            <button type="button" className="ofi-buy-back ofi-nosize" onClick={onBack}>
                <ChevronLeft aria-hidden />
                {data?.request.requestNumber ?? t('common.back')}
            </button>
        </header>
    );
    if (!data) return <>{nav}{error ? <Failure text={error} retry={() => setReload((value) => value + 1)} /> : <Loading />}</>;

    const { result, request } = data;
    const suppliers = result.suppliers;
    /* Das Menü der gespeicherten Vergleiche — der geöffnete steht immer darin. */
    const saved = data.others.some((entry) => entry.id === data.id)
        ? data.others
        : [{
            id: data.id,
            createdAt: data.createdAt,
            createdByName: data.createdByName,
            suppliers: suppliers.map((supplier) => ({ supplierName: supplier.supplierName, code: supplier.code, total: supplier.total, currency: supplier.currency, complete: supplier.complete })),
            bestSupplier: result.bestSupplier,
            lineCount: result.lines.length,
        }, ...data.others];
    const bestCount = suppliers.map((_, index) => result.lines.filter((line) => line.best === index).length);
    /* Was nicht bestellt würde (am Lager, schon bestellt, keine Karte) — gleich hier sichtbar, nicht erst nach dem Senden. */
    const skip = new Set(Object.entries(data.orderable ?? {}).flatMap(([lineId, entry]) => (entry.reason ? [lineId] : [])));
    const quantities = Object.fromEntries(Object.entries(data.orderable ?? {}).flatMap(([lineId, entry]) => (!entry.reason && entry.quantity > 0 ? [[lineId, entry.quantity]] : [])));
    const context = [
        request.project ? [request.project.number, request.project.name].filter(Boolean).join(' · ') : null,
        request.device ? `${request.device.name}${request.device.position ? ` (${t('productionBom.purchasing.position', { value: request.device.position })})` : ''}` : null,
    ].filter(Boolean);

    return (
        <>
            <header className="ofi-buy-nav ofi-buy-cmphead">
                <button type="button" className="ofi-buy-back ofi-nosize" onClick={onBack}>
                    <ChevronLeft aria-hidden />
                    {request.requestNumber}
                </button>
                <span className="ofi-buy-cmphead__pick">
                    {saved.length > 1 && (
                        <SelectMenu
                            value={data.id}
                            ariaLabel={t(`${P}.switch`)}
                            listWidth={400}
                            buttonClassName="ofi-cal-input ofi-buy-cmpselect"
                            options={saved.map((entry) => {
                                const best = entry.bestSupplier !== null ? entry.suppliers[entry.bestSupplier] : undefined;
                                return {
                                    value: entry.id,
                                    label: `${whenText(entry.createdAt)} · ${entry.suppliers.map((supplier) => supplier.supplierName).join(', ')}`,
                                    hint: best && best.total > 0 ? fmtPrice(best.total, best.currency) : undefined,
                                };
                            })}
                            onChange={(next) => { if (next !== data.id) onSwitch(next); }}
                        />
                    )}
                </span>
            </header>

            <section className="ofi-buy-cmptitle">
                <div>
                    <h1>{t(suppliers.length === 1 ? `${P}.titleSingle` : `${P}.title`)}</h1>
                    <p>{[...context, whenText(data.createdAt), data.createdByName].filter(Boolean).join(' · ')}</p>
                </div>
                <KindPill kind="PRICE" />
            </section>

            <div className={`ofi-buy-cmpcards is-${Math.min(4, Math.max(1, suppliers.length))}`}>
                {suppliers.map((supplier, index) => {
                    const best = result.bestSupplier === index;
                    return (
                        <article key={supplier.purchaseOrderId} className={`ofi-buy-cmpcard${best ? ' is-best' : ''}`}>
                            <header>
                                <b title={supplier.supplierName}>{supplier.supplierName}</b>
                                {best && (
                                    <span className="ofi-buy-bestbadge">
                                        <Trophy aria-hidden />
                                        {result.bestSupplierBy === 'ai' ? t(`${P}.recommended`) : t(`${P}.bestOffer`)}
                                    </span>
                                )}
                            </header>
                            <small className="ofi-buy-cmpcard__codes">
                                {[shownPurchaseCode(supplier.code),
                                    supplier.offerNumber ? t(`${P}.offerNo`, { number: supplier.offerNumber }) : null,
                                    supplier.offerDate ? shortDate(supplier.offerDate) : null].filter(Boolean).join(' · ')}
                            </small>
                            <strong className="ofi-buy-cmpcard__total">{supplier.total > 0 ? fmtPrice(supplier.total, supplier.currency) : '—'}</strong>
                            <span className={`ofi-buy-cmpcard__cover${supplier.complete ? ' is-ok' : ''}`}>
                                {t(`${P}.covered`, { done: supplier.pricedLines, total: supplier.askedLines ?? result.lines.length })}
                                {bestCount[index]! > 0 && <em>{t(`${P}.bestLines`, { count: bestCount[index] })}</em>}
                            </span>
                            {factsOf(supplier).length > 0 && (
                                <dl className="ofi-buy-cmpcard__facts">
                                    {factsOf(supplier).map((fact) => (
                                        <div key={fact.key}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
                                    ))}
                                </dl>
                            )}
                            {supplier.notes && <p className="ofi-buy-cmpcard__note">{supplier.notes}</p>}
                            <button type="button" className="ofi-buy-btn ofi-nosize" onClick={() => void openQuoteFile(supplier.purchaseOrderId)}>
                                <FileText aria-hidden />
                                {t(`${P}.openPdf`)}
                            </button>
                        </article>
                    );
                })}
            </div>

            {result.summary && (
                <section className="ofi-buy-aibox">
                    <span className="ofi-buy-aibox__icon"><Sparkles aria-hidden /></span>
                    <div>
                        <b>{t(`${P}.aiTitle`)}</b>
                        <p>{result.summary}</p>
                    </div>
                </section>
            )}

            <ComparisonMatrix
                result={result}
                orderable={data.orderable ?? null}
                selection={selection}
                onPick={(bomLineId, supplier) => setSelection((current) => ({ ...current, [bomLineId]: supplier }))}
                measure={measure}
                onMeasure={setMeasure}
                disabled={request.status === 'CANCELLED'}
            />
            {data.model && <p className="ofi-buy-cmpmodel">{t(`${P}.model`, { model: data.model })}</p>}

            <OrderFromComparison
                comparisonId={data.id}
                result={result}
                selection={selection}
                skip={skip}
                quantities={quantities}
                canOrder={request.status !== 'CANCELLED' && !data.bom?.consumed}
                bom={data.bom ?? null}
                onDone={onOrdered}
                onOpenDocument={onOpenDocument}
            />
        </>
    );
};
