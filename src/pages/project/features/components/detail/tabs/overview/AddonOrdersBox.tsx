import { memo, useState } from 'react';
import dayjs from 'dayjs';
import { lazyToast as toast } from '@/lib/lazyToast';

import { Plus } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';
import type { BillingSummaryDto } from '@/types/billing';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { viewForSection, type ProjectDetailView } from '../../../../types/projectDetailNavigation';
import { money } from '../../../../utils/projectFormatters';
import { CardLink } from './CardLink';
import { linkRow } from './linkRow';
import { OverviewCard } from './OverviewCard';

export type AddonRow = {
    order: ProjectSalesOrder;
    cost: number;
    billed: number;
    remaining: number;
    summary: BillingSummaryDto | null;
};

/**
 * The add-on orders of this project: what each one costs, what has been invoiced
 * on it and what is still open — plus the extra work that has been captured but
 * never turned into an add-on order yet. That pending block is the point of the
 * box: it is money the project has already spent and cannot bill, and the button
 * turns it into a real add-on order in one step. It is also the ONLY coloured
 * surface of the overview, which is what makes it read as the thing to act on.
 *
 * EINE ZEILE WÄHLT IHREN AUFTRAG (19.08.2026): ein Klick stellt die ganze Seite
 * auf diesen Zusatzauftrag um — Kopfzeile, Reiter und Zahlen folgen mit. Das
 * ist der kürzeste Weg, den es dafür gibt; über die Auswahlliste oben sind es
 * drei. Der Verweis in der Kopfzeile führt in den Zusatzauftrags-Bereich.
 */
export const AddonOrdersBox = memo(({
    project,
    parentOrder,
    rows,
    pendingTotal,
    pendingCount,
    canCreate,
    onCreated,
    onSelectOrder,
    onNavigate,
}: {
    project: ProjectDto;
    parentOrder: ProjectSalesOrder | null;
    rows: AddonRow[];
    pendingTotal: number;
    pendingCount: number;
    canCreate: boolean;
    onCreated: (orderId: string) => Promise<void>;
    onSelectOrder: (orderId: string) => void;
    onNavigate: (view: ProjectDetailView) => void;
}) => {
    const [creating, setCreating] = useState(false);
    // Only a real parent order can carry an add-on; the synthetic "project-main-*"
    // placeholder has no row in the database to hang one off.
    const canCreateHere = canCreate
        && Boolean(parentOrder && !parentOrder.id.startsWith('project-main-'))
        && pendingTotal > 0;

    const createNow = async () => {
        if (!parentOrder) return;
        setCreating(true);
        try {
            const res = await projectApi.createAddonOrder(project.id, { parentSalesOrderId: parentOrder.id });
            toast.success(res.message || t('auto.ek_siparis_olusturuldu'));
            await onCreated(res.salesOrder.id);
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('auto.ek_siparis_olusturulamadi'));
        } finally {
            setCreating(false);
        }
    };

    return (
        <OverviewCard
            title={t('projects.detail.overview.addonsTitle')}
            action={(
                <CardLink
                    label={t('projects.detail.overview.addonsTitle')}
                    onOpen={() => onNavigate(viewForSection('addons'))}
                />
            )}
        >
            <table data-inv-table data-unstyled-table data-no-col-resize className="w-full">
                <thead>
                    <tr>
                        <th className="text-left">{t('projects.detail.colOrder')}</th>
                        <th className="w-32 text-right">{t('projects.detail.colAmount')}</th>
                        <th className="w-32 text-right">{t('billing.billed')}</th>
                        <th className="w-32 text-right">{t('billing.remaining')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={4}>
                                <div className="ofi-prj-empty">{t('projects.detail.overview.noAddons')}</div>
                            </td>
                        </tr>
                    ) : rows.map(({ order, cost, billed, remaining }) => (
                        <tr
                            key={order.id}
                            {...linkRow(
                                () => onSelectOrder(order.id),
                                `${order.orderNumber} · ${t('projects.detail.colAmount')} ${money(cost)} · ${t('billing.billed')} ${money(billed)} · ${t('billing.remaining')} ${money(remaining)}`,
                            )}
                        >
                            <td>
                                <span className="ofi-prj-cut ofi-prj-strong">{order.orderNumber}</span>
                                <span className="ofi-prj-sub">
                                    {dayjs(order.orderDate || order.createdAt).format('DD.MM.YYYY')}
                                </span>
                            </td>
                            <td className="ofi-prj-num">{money(cost)}</td>
                            <td className="ofi-prj-num is-billed">{money(billed)}</td>
                            <td className="ofi-prj-num">{money(remaining)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Extra work waiting for an add-on order that does not exist yet. */}
            {pendingTotal > 0 && (
                <div className="ofi-prj-pending">
                    <div className="ofi-prj-pending__row">
                        <div className="min-w-0">
                            <div className="ofi-prj-pending__title ofi-prj-cut">
                                {t('projects.detail.overview.pendingAddonTitle')}
                            </div>
                            <div className="ofi-prj-pending__hint">
                                {pendingCount} {t('projects.recordUnitMany')} · {t('projects.detail.overview.pendingAddonHint')}
                            </div>
                        </div>
                        <span className="ofi-prj-pending__sum">{money(pendingTotal)}</span>
                    </div>
                    <button
                        type="button"
                        disabled={!canCreateHere || creating}
                        onClick={createNow}
                        className="ofi-prj-btn is-primary mt-2.5"
                    >
                        <Plus size={14} />
                        {t('projects.detail.overview.createNow')}
                    </button>
                </div>
            )}
        </OverviewCard>
    );
});
