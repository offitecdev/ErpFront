import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

import { InvoicePopup } from '@/components/billing/InvoicePopup';
import { PackagePlus, Plus } from '@/components/icons/antIconCompat';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { t } from '@/i18n/translate';
import { addonOrdersApi, type AddonOrderListItemDto } from '@/lib/api/addonOrders';
import { lazyToast as toast } from '@/lib/lazyToast';
import { openAmount } from '@/lib/orderBillingTotals';
import { money } from '@/pages/project/features/utils/projectFormatters';

import { addonCreatePath, type AddonEditorParent } from './addonEditorRoute';
import { AddonOrderPdfButton } from './AddonOrderPdfButton';

const fmtDate = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY') : '-');

const billingVariant = (percent: number): 'active' | 'warning' | 'info' =>
    percent >= 100 ? 'active' : percent <= 0 ? 'warning' : 'info';
const billingLabel = (percent: number) =>
    percent <= 0 ? t('crm.faturalanmadi') : t('crm.partially_billed', { percent: Math.round(percent) });

/**
 * ── «ZUSATZAUFTRÄGE» AUS DEM RAPPORT ─────────────────────────────────────────
 * Vorgabe Samet (05.09.2026): «ein Knopf ‹Zusatzaufträge›, erreichbar über die
 * Rapporte, um sie zu finden.» Dieses Fenster IST dieser Knopf: die Nachträge
 * des Hauptauftrags, an dem der Rapport hängt — Nummer, Tag, Betrag,
 * Verrechnungsstand und je Zeile der eigene Beleg (Nachtrag-PDF in drei
 * Sprachen). Es ist die schwebende Karte des Rechnungsmoduls, damit es über
 * dem Rapport-Fenster wie auf dem Montage-Bildschirm gleich aussieht.
 *
 * Wer Nachträge anlegen darf (`canCreate`), legt hier auch einen FREIEN an
 * (eigene Positionen, eigener NT-Code). Büroflächen geben `onOpenAddon` mit —
 * ein Klick auf die Zeile führt in die Auftragsansicht; der Monteur hat diese
 * Seiten nicht und bekommt nur die Liste mit den Belegen.
 */
export const AddonOrdersPopup = ({ open, onClose, parentOrder, canCreate = false, onOpenAddon, zIndex }: {
    open: boolean;
    onClose: () => void;
    parentOrder: AddonEditorParent | null;
    canCreate?: boolean;
    onOpenAddon?: (addon: AddonOrderListItemDto) => void;
    /** Über einer anderen schwebenden Karte geöffnet → höher stapeln. */
    zIndex?: number;
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [rows, setRows] = useState<AddonOrderListItemDto[]>([]);
    const [loading, setLoading] = useState(false);
    const parentId = parentOrder?.id ?? null;

    useEffect(() => {
        if (!open || !parentId) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const list = await addonOrdersApi.list({ parentSalesOrderId: parentId });
                if (!cancelled) setRows(list);
            } catch (error: unknown) {
                const failure = error as { response?: { data?: { error?: string } }; message?: string };
                if (!cancelled) {
                    toast.error(failure?.response?.data?.error || failure?.message || t('crm.orders_yuklenemedi'));
                    setRows([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, parentId]);

    if (!open) return null;

    return (
        <>
            <InvoicePopup
                open={open}
                size="compact"
                title={t('crm.addon.popupTitle')}
                subtitle={parentOrder?.orderNumber || undefined}
                onClose={onClose}
                zIndex={zIndex}
                closeOnOutside={false}
                /* Anlegen ist eine SEITE, kein zweites Fenster über diesem
                   (Vorgabe 05.09.2026) — der Rückweg führt genau hierher. */
                headerActions={canCreate && parentOrder ? (
                    <button
                        type="button"
                        className="ofi-inv-btn is-primary"
                        onClick={() => navigate(addonCreatePath(parentOrder, `${location.pathname}${location.search}`))}
                    >
                        <Plus size={13} />
                        {t('crm.addon.newTitle')}
                    </button>
                ) : undefined}
            >
                <div className="ofi-inv-pop__pad">
                    <table data-inv-table data-unstyled-table data-no-col-resize className="w-full">
                        <thead>
                            <tr>
                                <th className="text-left">{t('projects.addonOrder')}</th>
                                <th className="w-32 text-right">{t('projects.detail.colAmount')}</th>
                                <th className="w-36 text-right">{t('billing.remaining')}</th>
                                <th className="w-12" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading && rows.length === 0 && (
                                <tr><td colSpan={4} className="ofi-inv-empty">{t('common.loading')}</td></tr>
                            )}
                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="ofi-inv-empty">
                                        <span className="inline-flex items-center gap-2"><PackagePlus size={15} />{t('crm.addon.popupEmpty')}</span>
                                    </td>
                                </tr>
                            )}
                            {rows.map((addon) => {
                                const total = Number(addon.billingSummary?.baseAmount ?? addon.totalAmount) || 0;
                                const billed = Number(addon.billingSummary?.billedAmount) || 0;
                                const percent = Number(addon.billingSummary?.billedPercent) || 0;
                                const remaining = openAmount(addon.billingSummary?.billedPercent, total, billed);
                                return (
                                    <tr
                                        key={addon.id}
                                        className={onOpenAddon ? 'is-link' : undefined}
                                        onClick={onOpenAddon ? () => onOpenAddon(addon) : undefined}
                                        title={onOpenAddon ? t('crm.addon.openOrder') : undefined}
                                    >
                                        <td>
                                            <span className="ofi-inv-name">{addon.orderNumber}</span>
                                            <span className="ofi-inv-sub">
                                                {`${addon.revisionNumber ? `${addon.revisionNumber}. ` : ''}${t('projects.addonOrder')} · ${fmtDate(addon.orderDate || addon.createdAt)}`}
                                            </span>
                                            <div className="mt-1">
                                                <StatusChip variant={billingVariant(percent)}>{billingLabel(percent)}</StatusChip>
                                            </div>
                                        </td>
                                        <td className="ofi-inv-num is-strong">{money(total)}</td>
                                        <td className={`ofi-inv-num ${remaining > 0 ? 'is-open' : 'is-billed'}`}>{money(remaining)}</td>
                                        <td className="text-right">
                                            <AddonOrderPdfButton addon={addon} variant="icon" />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </InvoicePopup>
        </>
    );
};
