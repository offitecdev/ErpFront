import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Package } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import type { PurchaseOrderRow } from '@/types/inventory';
import { SectionCard } from '../components/primitives';
import { fmtDateTime, fmtQty } from '../utils/format';

const errorText = (err: unknown): string =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error
    || (err as Error)?.message
    || 'error';

/**
 * ══ «STOĞA GİDENLER» (Vorgabe Samet, 22.09.2026) ══════════════════════════
 *
 * «Stoğa gidenler olarak ayrı bir tab de olacak, orada GERİ GÖNDERME butonu
 *  olacak; geri gönderince gidecek.»
 *
 * Was hier steht, liegt schon im Lager: jede Zeile trägt ihre gebuchte Menge
 * und den Zeitpunkt. «Geri gönder» nimmt GENAU DIESE Zeile zurück — ihre
 * Eingangsbewegungen werden zurückgesarrt, der Bestand fällt, und die Zeile
 * erscheint wieder im Reiter «Mal kabul». Das Löschen des GANZEN Wareneingangs
 * steht oben in der Kopfzeile; hier geht es um die einzelne Zeile.
 *
 * Die Rückfrage ist ein Streifen in der Zeile, kein Fenster — wie überall in
 * diesem Modul.
 */
export const StockedPanel = ({ order, canTransfer, onOrderChanged }: {
    order: PurchaseOrderRow;
    canTransfer: boolean;
    onOrderChanged: (next: PurchaseOrderRow) => void;
}) => {
    const [busy, setBusy] = useState<number | null>(null);
    const [ask, setAsk] = useState<number | null>(null);

    const stocked = useMemo(
        () => order.items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => (Number(item.receivedQuantity) || 0) > 0),
        [order.items],
    );

    const sendBack = async (index: number) => {
        setAsk(null);
        setBusy(index);
        try {
            const result = await purchaseOrdersApi.revertReceiveLine(order.id, index);
            onOrderChanged(result.order);
            toast.success(t('inv.orders.stocked.sentBack'));
        } catch (err) {
            toast.error(errorText(err));
        } finally {
            setBusy(null);
        }
    };

    if (!stocked.length) {
        return (
            <SectionCard>
                <div className="ofi-ows-empty">
                    <Package size={26} />
                    <span>{t('inv.orders.stocked.empty')}</span>
                </div>
            </SectionCard>
        );
    }

    return (
        <SectionCard title={t('inv.orders.stocked.sectionTitle', { count: stocked.length })}>
            <div className="overflow-x-auto">
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full min-w-[720px]">
                    <colgroup>
                        <col style={{ width: 150 }} />
                        <col />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 180 }} />
                        <col style={{ width: 210 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('inv.columns.serialCode')}</th>
                            <th className="text-left">{t('inv.columns.productName')}</th>
                            <th className="text-right">{t('inv.orders.receive.receivedColumn')}</th>
                            <th className="text-left">{t('inv.orders.stocked.at')}</th>
                            <th className="text-right">{t('common.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stocked.map(({ item, index }) => (
                            <Fragment key={`${index}-${item.code || item.name}`}>
                                <tr>
                                    <td className="font-mono text-[12.5px] text-slate-500 dark:text-white/60">{item.code || '—'}</td>
                                    <td className="text-slate-800 dark:text-white">{item.name}</td>
                                    <td className="text-right font-mono text-[12.5px]">{fmtQty(Number(item.receivedQuantity) || 0)}</td>
                                    <td className="font-mono text-[12px] text-slate-500 dark:text-white/60">
                                        {item.receivedAt ? fmtDateTime(item.receivedAt) : '—'}
                                    </td>
                                    <td>
                                        {canTransfer && (
                                            <span className="flex items-center justify-end">
                                                <button
                                                    type="button"
                                                    disabled={busy !== null}
                                                    onClick={() => setAsk(ask === index ? null : index)}
                                                    className={`ofi-ows-rowbtn flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                                        ask === index
                                                            ? 'border-red-300 text-red-600 dark:border-red-500/40 dark:text-red-300'
                                                            : 'border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-600 dark:border-white/20 dark:text-white/70 dark:hover:text-red-300'
                                                    }`}
                                                >
                                                    {busy === index
                                                        ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                        : <ArrowLeft size={14} />}
                                                    {t('inv.orders.stocked.sendBack')}
                                                </button>
                                            </span>
                                        )}
                                    </td>
                                </tr>
                                {/* ── DIE RÜCKFRAGE BEKOMMT IHRE EIGENE ZEILE ──────────
                                    In der schmalen Handlungsspalte lief der Satz über
                                    den Rand und die beiden Knöpfe lagen übereinander.
                                    Hier hat er die ganze Breite — und steht trotzdem
                                    direkt unter der Zeile, um die es geht. */}
                                {ask === index && (
                                    <tr className="bg-red-50/60 dark:bg-red-500/10">
                                        <td colSpan={5}>
                                            <span className="flex flex-wrap items-center gap-3 text-[12.5px] font-medium text-red-700 dark:text-red-200">
                                                <AlertTriangle size={14} className="shrink-0" />
                                                <span className="min-w-0 flex-1">{t('inv.orders.stocked.sendBackConfirm')}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setAsk(null)}
                                                    className="ofi-ows-rowbtn h-8 shrink-0 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-600 dark:border-white/20 dark:bg-transparent dark:text-white/70"
                                                >
                                                    {t('common.cancel')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void sendBack(index)}
                                                    className="ofi-ows-rowbtn h-8 shrink-0 whitespace-nowrap rounded-md bg-red-600 px-3 font-semibold text-white transition-colors hover:bg-red-700"
                                                >
                                                    {t('common.confirm')}
                                                </button>
                                            </span>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </SectionCard>
    );
};
