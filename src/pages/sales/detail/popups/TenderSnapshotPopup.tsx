import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

import { PopupCard, PopupEmpty } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { tenderApi, type TenderSnapshotDto } from '@/lib/api/tender';

/**
 * ── STAND BEIM AUFTRAG (16.09.2026, B4) ──────────────────────────────────────
 *
 * Geht ein Auftrag zurück in den Entwurf, zählt die Offerte eine Version hoch
 * und darf wieder geändert werden. Worauf die verschickte AB beruhte, hält
 * der Server als Schnappschuss fest — dieses Fenster zeigt ihn, nur zum Lesen:
 * Positionen, Mengen, Preise und die Auftragssumme von damals.
 */
export const TenderSnapshotPopup = ({
    open,
    tenderId,
    onClose,
    formatMoney,
}: {
    open: boolean;
    tenderId: string;
    onClose: () => void;
    formatMoney: (value: number) => string;
}) => {
    const [snapshots, setSnapshots] = useState<TenderSnapshotDto[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        tenderApi.listSnapshots(tenderId)
            .then((rows) => {
                if (cancelled) return;
                setSnapshots(rows);
                setActiveId(rows[0]?.id ?? null);
            })
            .catch(() => { if (!cancelled) { setSnapshots([]); setFailed(true); } });
        return () => { cancelled = true; };
    }, [open, tenderId]);

    const active = snapshots?.find((row) => row.id === activeId) ?? null;

    return (
        <PopupCard
            open={open}
            onClose={onClose}
            title={t('tenders.snapshot.title')}
            subtitle={active ? t('tenders.snapshot.subtitle', {
                version: active.version,
                order: active.orderNumber || '—',
                date: dayjs(active.createdAt).format('DD.MM.YYYY'),
            }) : undefined}
            width={720}
            closeOnOutside
        >
            {snapshots === null ? (
                <PopupEmpty>{t('common.loading')}</PopupEmpty>
            ) : !snapshots.length ? (
                <PopupEmpty>{failed ? t('tenders.snapshot.failed') : t('tenders.snapshot.empty')}</PopupEmpty>
            ) : (
                <>
                    {snapshots.length > 1 && (
                        <div className="mb-3 flex flex-wrap gap-1.5">
                            {snapshots.map((row) => (
                                <button
                                    key={row.id}
                                    type="button"
                                    className={`ofi-cal-btn ${row.id === activeId ? 'is-primary' : ''}`}
                                    onClick={() => setActiveId(row.id)}
                                >
                                    v{row.version} · {row.orderNumber || '—'}
                                </button>
                            ))}
                        </div>
                    )}
                    {active && (
                        <>
                            <p className="mb-2 text-[12px] text-slate-500 dark:text-white/60">
                                {t('tenders.snapshot.readOnly')}
                                {active.createdBy ? ` · ${active.createdBy}` : ''}
                            </p>
                            <div className="max-h-[52vh] overflow-auto">
                                <table className="w-full text-[12.5px]" data-unstyled-table data-no-col-resize>
                                    <thead>
                                        <tr className="text-left text-[11px] uppercase tracking-[0.04em] text-slate-400 dark:text-white/45">
                                            <th className="py-1.5 pr-2 font-medium">{t('invoices.colPos')}</th>
                                            <th className="py-1.5 pr-2 font-medium">{t('invoices.colDescription')}</th>
                                            <th className="py-1.5 pr-2 text-right font-medium">{t('invoices.colQty')}</th>
                                            <th className="py-1.5 pr-2 font-medium">{t('invoices.colUnit')}</th>
                                            <th className="py-1.5 pr-2 text-right font-medium">{t('invoices.colUnitPrice')}</th>
                                            <th className="py-1.5 text-right font-medium">{t('invoices.colDiscount')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {active.positions.map((row) => {
                                            const priced = row.unitPrice != null;
                                            return (
                                                <tr key={row.id} className="border-t border-[#eef0f2] text-slate-800 dark:border-white/10 dark:text-white/85">
                                                    <td className="py-1.5 pr-2 font-mono text-slate-400 dark:text-white/50">{row.positionNumber}</td>
                                                    <td
                                                        className={`py-1.5 pr-2 ${priced ? '' : 'font-semibold'}`}
                                                        style={{ paddingLeft: Math.max(0, Number(row.hierarchyLevel || 0) - 1) * 12 }}
                                                    >
                                                        {row.shortDescription}
                                                    </td>
                                                    <td className="py-1.5 pr-2 text-right tabular-nums">{priced ? row.quantity : ''}</td>
                                                    <td className="py-1.5 pr-2">{priced ? row.unit || '' : ''}</td>
                                                    <td className="py-1.5 pr-2 text-right tabular-nums">{priced ? formatMoney(Number(row.unitPrice)) : ''}</td>
                                                    <td className="py-1.5 text-right tabular-nums">{priced && row.discount ? `${Number(row.discount.toFixed(2))}%` : ''}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {active.totals?.orderTotal != null && (
                                <div className="mt-3 flex justify-end gap-3 border-t border-[#eef0f2] pt-2 text-[13px] dark:border-white/10">
                                    <span className="text-slate-500 dark:text-white/60">{t('tenders.snapshot.orderTotal')}</span>
                                    <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{formatMoney(Number(active.totals.orderTotal))}</span>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </PopupCard>
    );
};
