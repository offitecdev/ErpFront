import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { productionErrorText } from '@/lib/api/production';
import type { PurchaseOrderRow } from '@/types/inventory';
import { QuantityStepper } from '../components/QuantityStepper';
import { fmtDate, fmtQty } from '../utils/format';

/**
 * ══ MAL KABUL — SİPARİŞİN AYNISI, ALTTA TEK BAR (Samet, 29.09.2026) ═══════
 *
 * «Sipariş verdik, siparişi onayladık, mal kabule geçtiğinde mal kabul ekranı
 *  olacak siparişin aynısı ama stoğa aktarmalıyız; altta sabit bir bar, macOS
 *  SwiftUI, temiz, direkt onaylayıp ‹stoğa gönderildi› statüsüne geçmeli.»
 *
 * Sipariş onaylanırken sunucu her satırın ürününü stokta 0 adetle açtı
 * (`definePurchaseOrderArticles`). Bu sekme yalnızca MİKTAR yazar: her satırda
 * «Gelen» alanı kalan miktarla dolu gelir, alttaki barda TEK düğme var —
 * «Onayla ve stoğa gönder». Hepsi geldiyse sipariş STOĞA GÖNDERİLDİ olur;
 * bir satır eksik yazıldıysa kalan kısmı MAL KABULDE bekler ve bir sonraki
 * teslimatta aynı ekrandan eklenir. Stokta olmayan ürünü `/receive` yine açar.
 */
export const ReceivePanel = ({ order, canTransfer, codeSchemeId, onOrderChanged }: {
    order: PurchaseOrderRow;
    canTransfer: boolean;
    /** Kodsuz satırlar için Ayarlar'da seçilen kod aralığı (yoksa geçici kod). */
    codeSchemeId: string | null;
    onOrderChanged: (next: PurchaseOrderRow) => void;
}) => {
    const [busy, setBusy] = useState(false);
    /** Satır indeksi → şimdi gelen miktar. Yazılmamış satır = kalanın tamamı. */
    const [typed, setTyped] = useState<Record<number, number>>({});

    const lines = useMemo(
        () => order.items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => String(item.name || '').trim() || String(item.code || '').trim()),
        [order.items],
    );
    const orderedOf = (index: number) => Number(order.items[index]?.quantity) || 0;
    const receivedOf = (index: number) => Number(order.items[index]?.receivedQuantity) || 0;
    const remainingOf = (index: number) => Math.max(0, orderedOf(index) - receivedOf(index));
    const incomingOf = (index: number) => Math.min(remainingOf(index), typed[index] ?? remainingOf(index));

    const completed = order.status === 'COMPLETED';
    const editable = canTransfer && !completed;
    const doneCount = lines.filter(({ index }) => remainingOf(index) <= 0).length;
    const booking = lines.filter(({ index }) => incomingOf(index) > 0);
    const bookingQty = booking.reduce((sum, { index }) => sum + incomingOf(index), 0);
    const fillsAll = lines.every(({ index }) => incomingOf(index) >= remainingOf(index));

    const submit = async () => {
        if (!booking.length || busy) return;
        setBusy(true);
        try {
            const result = await purchaseOrdersApi.receive(order.id, {
                lines: booking.map(({ index }) => ({ index, quantity: incomingOf(index) })),
                ...(codeSchemeId ? { codeSchemeId } : {}),
            });
            onOrderChanged(result.order);
            setTyped({});
            if (result.errors.length) toast.error(result.errors.map((entry) => entry.error).join(' · '));
            else if (result.order.status === 'COMPLETED') toast.success(t('inv.orders.receive.sentToStock'));
            else toast.success(t('inv.orders.receive.partialSent', { count: result.processedCount }));
        } catch (error) {
            toast.error(productionErrorText(error, t('inv.orders.saveFailed')));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="ofi-rcv">
            <p className="ofi-rcv-hint">
                {t(completed ? 'inv.orders.receive.hintDone' : 'inv.orders.receive.hintZero')}
            </p>
            <div className="ofi-rcv-card">
                <div className="ofi-rcv-scroll">
                    <table className="ofi-rcv-table">
                        <colgroup>
                            <col style={{ width: 44 }} />
                            <col style={{ width: 150 }} />
                            <col />
                            <col style={{ width: 80 }} />
                            <col style={{ width: 96 }} />
                            <col style={{ width: 96 }} />
                            {!completed && <col style={{ width: 140 }} />}
                            <col style={{ width: 104 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="is-num">#</th>
                                <th>{t('inv.columns.serialCode')}</th>
                                <th>{t('inv.columns.productName')}</th>
                                <th>{t('inv.columns.unit')}</th>
                                <th className="is-num">{t('inv.orders.receive.orderedColumn')}</th>
                                <th className="is-num">{t('inv.orders.receive.inStockColumn')}</th>
                                {!completed && <th className="is-num">{t('inv.orders.receive.incomingColumn')}</th>}
                                <th>{t('inv.orders.receive.stateColumn')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map(({ item, index }, position) => {
                                const remaining = remainingOf(index);
                                const received = receivedOf(index);
                                const state = remaining <= 0 ? 'done' : received > 0 ? 'partial' : 'open';
                                return (
                                    <tr key={`${index}-${item.code || item.name}`} className={state === 'done' ? 'is-done' : undefined}>
                                        <td className="is-num is-mute">{position + 1}</td>
                                        <td className="is-mono">
                                            {item.code || <span className="is-mute">{t('inv.orders.receive.codeAuto')}</span>}
                                        </td>
                                        <td className="is-name">{item.name}</td>
                                        <td className="is-mute">{item.unit || '—'}</td>
                                        <td className="is-num is-mono">{fmtQty(orderedOf(index))}</td>
                                        <td className="is-num is-mono">{fmtQty(received)}</td>
                                        {!completed && (
                                            <td className="is-num">
                                                {editable && remaining > 0 ? (
                                                    <QuantityStepper
                                                        value={incomingOf(index)}
                                                        min={0}
                                                        onChange={(next) => setTyped((current) => ({
                                                            ...current,
                                                            [index]: Math.min(remaining, Math.max(0, next)),
                                                        }))}
                                                    />
                                                ) : (
                                                    <span className="is-mono is-mute">{fmtQty(0)}</span>
                                                )}
                                            </td>
                                        )}
                                        <td>
                                            <span className={`ofi-rcv-pill is-${state}`}>
                                                {t(`inv.orders.receive.state.${state}`)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ══ DER BALKEN UNTEN ═══════════════════════════════════════════
                Klebt am unteren Rand der Seitenfläche (sticky, nicht fixed —
                im Dock-Modus liegt unten das Dock). Glas wie eine macOS-
                Werkzeugleiste: links, was jetzt ins Lager geht, rechts EIN
                Knopf. Nach dem Einlagern wird er grün und ruhig. */}
            <div className={`ofi-rcv-bar${completed ? ' is-done' : ''}`} role="region" aria-label={t('inv.orders.receive.title')}>
                {completed ? (
                    <div className="ofi-rcv-bar__done">
                        <CheckCircle size={18} />
                        <b>{t('inv.orders.status.completed')}</b>
                        {order.stockedAt && <span>{fmtDate(order.stockedAt)}</span>}
                    </div>
                ) : (
                    <>
                        <div className="ofi-rcv-bar__info">
                            <b>{t('inv.orders.receive.barSummary', { lines: booking.length, qty: fmtQty(bookingQty) })}</b>
                            <span>{t('inv.orders.receive.progress', { done: doneCount, total: lines.length })}</span>
                        </div>
                        {editable && (
                            <div className="ofi-rcv-bar__actions">
                                {!fillsAll && (
                                    <button type="button" className="ofi-rcv-link" disabled={busy} onClick={() => setTyped({})}>
                                        {t('inv.orders.receive.fillAll')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="ofi-rcv-primary"
                                    disabled={busy || !booking.length}
                                    onClick={() => void submit()}
                                >
                                    {busy
                                        ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        : <CheckCircle size={16} />}
                                    {t('inv.orders.receive.confirmButton')}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
