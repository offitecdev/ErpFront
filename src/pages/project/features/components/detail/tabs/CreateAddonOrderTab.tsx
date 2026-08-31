import { memo, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { AlertTriangle, Receipt as ReceiptText, X } from '@/components/icons/antIconCompat';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { projectApi } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { getOrderRecordDate } from '../../../utils/projectOrderScope';
import { getPendingAddonRequests } from '../../../utils/projectTotals';
import { money } from '../../../utils/projectFormatters';

/**
 * „Zusatzauftrag" — die Seite, auf der aus den seit dem letzten Zusatzauftrag
 * aufgelaufenen Kosten der nächste entsteht.
 *
 * Sie trägt seit 19.08.2026 das Kleid des Rechnungsmoduls (Vorgabe Samet: „für
 * den Zusatzauftrag denselben modernen Stil wie bei der Rechnung"): eine
 * `.ofi-inv-card` mit Kopfstreifen, darunter das Tatsachenraster der
 * Auftragsnummern und EINE Tabelle mit den drei Kostenarten. Die drei
 * Zwischensummen und die Gesamtsumme standen vorher in zwei verschiedenen
 * Kästen — einmal als Beschriftung/Wert-Paare, einmal als Summenliste, deren
 * letzte Zahl in einer gelben Pille sass und darum aus der Spalte fiel. Jetzt
 * ist es eine Zahlenspalte, und alle vier Beträge fluchten (Vorgabe: „die
 * Summen sollen fluchten").
 *
 * Die künftige Auftragsnummer steht als eigene Marke IM Knopf und klebt nicht
 * mehr am Verb („…-N2Erstellen" → „Erstellen  AB-2026-10035-N2").
 */
export const CreateAddonOrderTab = memo(({
    project,
    order,
    orders,
    canCreate,
    onCreated,
    onChanged,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    orders: ProjectSalesOrder[];
    canCreate: boolean;
    onCreated: (orderId: string) => Promise<void>;
    onChanged: () => void | Promise<void>;
}) => {
    const [loading, setLoading] = useState(false);
    const [dismissingId, setDismissingId] = useState<string | null>(null);
    // Single memo over all the addon scoping/aggregation so the filters, sort and
    // reduces only re-run when the project or the order selection actually changes.
    const {
        parentOrder, pendingRequests, latestAddon, nextOrderNumber,
        expenseTotal, materialTotal, overtimeTotal, total,
        expenseCount, materialCount, overtimeCount,
    } = useMemo(() => {
        const parentOrder = order?.parentSalesOrderId
            ? orders.find((candidate) => candidate.id === order.parentSalesOrderId) || null
            : order;
        const pendingRequests = getPendingAddonRequests(project, order, orders);
        const addons = parentOrder
            ? orders
                .filter((candidate) => candidate.parentSalesOrderId === parentOrder.id)
                .sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf())
            : [];
        const latestAddon = addons[addons.length - 1] || null;
        const start = latestAddon ? dayjs(latestAddon.createdAt).valueOf() : null;
        const nextOrderNumber = parentOrder ? `${parentOrder.orderNumber}-N${addons.length + 1}` : '-';
        const afterLatestAddon = (record: any) => {
            if (!parentOrder || record.salesOrderId !== parentOrder.id) return false;
            if (start === null) return true;
            const rawDate = getOrderRecordDate(record);
            return rawDate ? dayjs(rawDate).valueOf() > start : false;
        };
        const pendingExpenses = (project.expenses || []).filter(afterLatestAddon);
        const pendingExtraMaterials = (project.extraMaterials || []).filter(afterLatestAddon);
        const pendingReports = (project.reports || []).filter(afterLatestAddon);
        const expenseTotal = pendingExpenses.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
        const materialTotal = pendingExtraMaterials.reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
        const overtimeTotal = pendingReports.reduce((sum: number, item: any) => sum + Number(item.overtimeCost || 0), 0);
        const total = expenseTotal + materialTotal + overtimeTotal;
        return {
            parentOrder, pendingRequests, latestAddon, nextOrderNumber,
            expenseTotal, materialTotal, overtimeTotal, total,
            expenseCount: pendingExpenses.length,
            materialCount: pendingExtraMaterials.length,
            // Nur Rapporte MIT Überzeit zählen — ein Rapport ohne Überzeitkosten
            // bringt nichts in den Zusatzauftrag ein.
            overtimeCount: pendingReports.filter((report: any) => Number(report.overtimeCost) > 0).length,
        };
    }, [project, order, orders]);

    if (!parentOrder) {
        return <EmptyState icon={<ReceiptText size={28} />} title={t('auto.siparis_secin')} description={t('auto.ek_siparis_olusturmak_icin_once_sol_menuden_bir_')} />;
    }

    // Die Kostenarten in der Reihenfolge, in der sie auf dem Schirm gelesen
    // werden — je eine Zeile, alle Beträge in EINER rechtsbündigen Spalte.
    const costRows = [
        { key: 'expense', label: t('auto.harici_gider'), count: expenseCount, amount: expenseTotal },
        { key: 'material', label: t('auto.ek_malzeme'), count: materialCount, amount: materialTotal },
        { key: 'overtime', label: t('auto.ek_iscilik'), count: overtimeCount, amount: overtimeTotal },
    ];
    const totalCount = expenseCount + materialCount + overtimeCount;

    const create = async () => {
        setLoading(true);
        try {
            const res = await projectApi.createAddonOrder(project.id, { parentSalesOrderId: parentOrder.id });
            toast.success(res.message || t('auto.ek_siparis_olusturuldu'));
            await onCreated(res.salesOrder.id);
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('auto.ek_siparis_olusturulamadi'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="ofi-inv-scope space-y-4">
            {/* Offene Anfrage des Technikers — sie steht ÜBER der Karte, weil sie
                der Grund ist, überhaupt hier zu sein. */}
            {pendingRequests.length > 0 && (
                <section className="ofi-inv-card">
                    <header className="ofi-inv-card__head">
                        <span className="ofi-inv-card__title">
                            <AlertTriangle size={14} />
                            <span className="truncate">{t('projects.addonRequestPending')}</span>
                        </span>
                    </header>
                    <div className="ofi-inv-card__body">
                        {pendingRequests.map((request) => (
                            <div key={request.id} className="ofi-inv-row">
                                <div className="ofi-inv-row__main">
                                    <div className="ofi-inv-row__title">
                                        {t('projects.addonRequestBy', { name: request.requestedByName || t('projects.teknisyen') })}
                                    </div>
                                    <div className="ofi-inv-row__meta">{dayjs(request.createdAt).format('DD.MM.YYYY HH:mm')}</div>
                                    {request.note && <div className="ofi-inv-row__note">{request.note}</div>}
                                </div>
                                <div className="flex flex-none items-center gap-2">
                                    <span className="ofi-inv-row__value">{money(request.total)}</span>
                                    <button
                                        type="button"
                                        className="ofi-inv-glyph is-danger"
                                        title={t('projects.addonRequestDismiss')}
                                        aria-label={t('projects.addonRequestDismiss')}
                                        disabled={dismissingId === request.id}
                                        onClick={async () => {
                                            setDismissingId(request.id);
                                            try {
                                                await projectApi.resolveAddonRequest(request.id, 'DISMISSED');
                                                await onChanged();
                                            } catch (e: any) {
                                                toast.error(e.response?.data?.error || t('projects.addonRequestDismissFailed'));
                                            } finally {
                                                setDismissingId(null);
                                            }
                                        }}
                                    >
                                        {dismissingId === request.id ? <span aria-hidden className="ofi-tp-spinner" /> : <X size={14} />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className="ofi-inv-card">
                <header className="ofi-inv-card__head">
                    <span className="ofi-inv-card__title">
                        <ReceiptText size={14} />
                        <span className="truncate">{t('auto.ek_siparis_olustur')}</span>
                    </span>
                    {/* Die Nummer ist eine eigene Marke — Verb und Nummer sind zwei
                        Dinge und dürfen nicht aneinanderkleben (Vorgabe 19.08.2026). */}
                    <div className="ofi-inv-card__actions">
                        <button
                            type="button"
                            className="ofi-inv-btn is-primary"
                            disabled={!canCreate || total <= 0 || loading}
                            onClick={() => void create()}
                        >
                            {loading ? <span aria-hidden className="ofi-tp-spinner" /> : <ReceiptText size={13} />}
                            {t('common.create')}
                            <span className="ofi-inv-chip">{nextOrderNumber}</span>
                        </button>
                    </div>
                </header>

                <div className="ofi-inv-card__body">
                    {/* Woran der neue Zusatzauftrag hängt: Hauptauftrag, seine eigene
                        künftige Nummer, der vorherige. Beschriftung über Wert. */}
                    <dl className="ofi-prj-facts">
                        <div className="ofi-prj-facts__cell">
                            <dt className="ofi-prj-facts__label">{t('auto.ana_siparis')}</dt>
                            <dd className="ofi-prj-facts__value is-strong">{parentOrder.orderNumber}</dd>
                        </div>
                        <div className="ofi-prj-facts__cell">
                            <dt className="ofi-prj-facts__label">{t('auto.yeni_ek_siparis')}</dt>
                            <dd className="ofi-prj-facts__value is-strong">{nextOrderNumber}</dd>
                        </div>
                        <div className="ofi-prj-facts__cell">
                            <dt className="ofi-prj-facts__label">{t('auto.onceki_ek_siparis')}</dt>
                            <dd className={`ofi-prj-facts__value${latestAddon?.orderNumber ? '' : ' is-empty'}`}>
                                {latestAddon?.orderNumber || '—'}
                            </dd>
                        </div>
                    </dl>

                    <table data-inv-table data-unstyled-table data-no-col-resize className="w-full">
                        <thead>
                            <tr>
                                <th className="text-left">{t('common.type')}</th>
                                <th className="w-32 text-right">{t('projects.recordUnitMany')}</th>
                                <th className="w-40 text-right">{t('projects.detail.colAmount')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {costRows.map((row) => (
                                <tr key={row.key}>
                                    <td><span className="ofi-inv-name">{row.label}</span></td>
                                    <td className="ofi-inv-num ofi-inv-muted">{row.count}</td>
                                    <td className="ofi-inv-num">{money(row.amount)}</td>
                                </tr>
                            ))}
                            <tr className="ofi-inv-total">
                                <td><span className="ofi-inv-name">{t('common.total')}</span></td>
                                <td className="ofi-inv-num ofi-inv-muted">{totalCount}</td>
                                <td className="ofi-inv-num is-strong">{money(total)}</td>
                            </tr>
                        </tbody>
                    </table>

                    {!canCreate && <p className="ofi-inv-note is-warn">{t('auto.ek_siparis_olusturma_yetkiniz_yok')}</p>}
                    {canCreate && total <= 0 && <p className="ofi-inv-note">{t('projects.addonNothingToBill')}</p>}
                </div>
            </section>
        </div>
    );
});
