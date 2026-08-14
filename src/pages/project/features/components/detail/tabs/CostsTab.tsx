import { memo, useMemo } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { PackagePlus, Receipt as ReceiptText, Trash01 as Trash2 } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { ColResizeHandle, ResizableCols } from '@/components/ui-shared/TableKit';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { tenderApi } from '@/lib/api/tender';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { getProjectDisplayOrders, scopedRecords } from '../../../utils/projectOrderScope';
import { displayExpenseType, durationFmt, money, numberFmt } from '../../../utils/projectFormatters';
import { getProjectUsedMaterials } from '../../../utils/projectMaterialUsage';

// The three cost kinds that can be charged to an order. Extra work (overtime past
// the tolerance) is measured on the tablet during the appointment — this screen
// only reports what the field reports produced, it no longer configures anything.
type CostKind = 'material' | 'work' | 'expense';

type CostRow = {
    id: string;
    kind: CostKind;
    label: string;
    detail?: string;
    date: string | null;
    amount: number;
};

type OrderGroup = {
    key: string;
    order: ProjectSalesOrder;
    rows: CostRow[];
    total: number;
};

const materialAmount = (item: any) => (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

// Every cost the project booked, in ONE table: extra materials, extra work and
// external expenses listed one below the other under the order they belong to.
// The order cell is merged across its rows, so an addon order's lines sit right
// next to its name, and the closing row totals the whole project.
export const CostsTab = memo(({
    project,
    order,
    onSaved,
    onGoFieldReports,
}: {
    project: ProjectDto;
    /** Only scopes the tender-included material list; the cost table spans every order. */
    order: ProjectSalesOrder | null;
    onSaved: () => Promise<void>;
    onGoFieldReports: () => void;
}) => {
    const tolerance = Number(project.overtimeTolerancePercent ?? 15);
    // Kalem sütunu da SÜRÜKLENEBİLİR (kullanıcı isteği): kendi genişliği vardır,
    // sağ kenarından tutulup sola/sağa çekilir. Genişlikler localStorage'da
    // saklandığı için sürüm anahtarı yükseltildi.
    const grid = useColumnWidths({
        storageKey: 'offitec:project-costs:col-widths:v2',
        defaults: { order: 190, item: 420, date: 110, amount: 150 },
        minPx: 72,
    });
    const orders = useMemo(() => getProjectDisplayOrders(project), [project]);

    // Rows of a single order. Addon orders read their parent's records through a
    // time window, so the same record matches both the addon and the base order —
    // the caller partitions them, this only builds.
    const rowsForOrder = (current: ProjectSalesOrder, primary: boolean): CostRow[] => {
        const extraMaterials = scopedRecords(project.extraMaterials, current, primary, orders) as any[];
        const reports = scopedRecords(project.reports, current, primary, orders) as any[];
        const expenses = scopedRecords(project.expenses, current, primary, orders) as any[];

        const byDate = (a: CostRow, b: CostRow) =>
            dayjs(a.date || 0).valueOf() - dayjs(b.date || 0).valueOf();

        const materialRows: CostRow[] = extraMaterials.map((item) => ({
            id: `material-${item.id}`,
            kind: 'material' as const,
            label: item.material?.name || item.article?.name || t('auto.malzeme'),
            detail: `${numberFmt(item.quantity)} ${t('auto.adet_x')} ${money(item.unitPrice)}${item.description ? ` · ${item.description}` : ''}`,
            date: item.addedAt || null,
            amount: materialAmount(item),
        })).sort(byDate);

        const workRows: CostRow[] = reports
            .filter((report) => Number(report.overtimeCost) > 0)
            .map((report) => ({
                id: `work-${report.id}`,
                kind: 'work' as const,
                label: t('projects.settings.overtimeShort', { tolerance }),
                detail: `${durationFmt(Number(report.overtimeMinutes || 0))} × ${money(report.overtimeHourlyRate)}`,
                date: report.workDate || report.reportDate || null,
                amount: Number(report.overtimeCost) || 0,
            }))
            .sort(byDate);

        const expenseRows: CostRow[] = expenses.map((expense) => ({
            id: `expense-${expense.id}`,
            kind: 'expense' as const,
            label: displayExpenseType(expense.expenseType),
            detail: expense.description || undefined,
            date: expense.expenseDate || null,
            amount: Number(expense.amount) || 0,
        })).sort(byDate);

        return [...materialRows, ...workRows, ...expenseRows];
    };

    // One group per order — main order first, then its addons in time order.
    // Addons claim their slice first (their window is the narrower, more specific
    // one); whatever is left on the base order is what no addon has billed yet.
    // Without that pass a record would be counted twice in the grand total.
    const groups = useMemo<OrderGroup[]>(() => {
        const claimed = new Set<string>();
        const addonRows = new Map<string, CostRow[]>();
        orders
            .filter((current) => Boolean(current.parentSalesOrderId))
            .forEach((addon) => {
                const rows = rowsForOrder(addon, false);
                rows.forEach((row) => claimed.add(row.id));
                addonRows.set(addon.id, rows);
            });

        return orders.map((current, index) => {
            // The first order also collects legacy records that were never
            // stamped with an order id.
            const rows = current.parentSalesOrderId
                ? addonRows.get(current.id) || []
                : rowsForOrder(current, index === 0).filter((row) => !claimed.has(row.id));

            return {
                key: current.id,
                order: current,
                rows,
                total: rows.reduce((sum, row) => sum + row.amount, 0),
            };
        }).filter((group) => group.rows.length > 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orders, project.extraMaterials, project.reports, project.expenses, tolerance]);

    const totals = useMemo(
        () => ({ total: groups.reduce((sum, group) => sum + group.total, 0) }),
        [groups],
    );

    // Tender-included materials are informational: they were priced with the offer,
    // so they never enter the cost totals above.
    const usedMaterials = useMemo(() => getProjectUsedMaterials(project, order), [project, order]);

    const removeUsedMaterial = async (item: any) => {
        const tenderId = order?.tenderId || project.tenderId;
        if (!tenderId) return;
        if (!confirm(t('auto.kullanilan_malzeme_kaldirilsin_mi'))) return;
        await tenderApi.removeMaterialMapping(tenderId, item.rawId);
        toast.success(t('auto.kullanilan_malzeme_kaldirildi'));
        await onSaved();
    };

    if (!groups.length && !usedMaterials.length) {
        return (
            <EmptyState
                icon={<ReceiptText size={28} />}
                title={t('projects.detail.noFieldReportsTitle')}
                description={t('projects.detail.costsComeFromReports')}
                action={(
                    <Button variant="primary" size="sm" onClick={onGoFieldReports}>
                        {t('projects.detail.goFieldReports')}
                    </Button>
                )}
            />
        );
    }

    return (
        <div className="space-y-4">
            {groups.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/15 dark:bg-transparent">
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <colgroup>
                            <ResizableCols keys={['order', 'item', 'date', 'amount'] as const} grid={grid} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="relative text-left">
                                    {t('projects.detail.colOrder')}
                                    <ColResizeHandle {...grid.resizeProps('order', 'right')} />
                                </th>
                                <th className="relative text-left">
                                    {t('projects.detail.colItem')}
                                    <ColResizeHandle {...grid.resizeProps('item', 'right')} />
                                </th>
                                <th className="relative text-left">
                                    {t('common.date')}
                                    <ColResizeHandle {...grid.resizeProps('date')} />
                                </th>
                                <th className="relative text-right">
                                    {t('projects.detail.colAmount')}
                                    <ColResizeHandle {...grid.resizeProps('amount')} />
                                </th>
                            </tr>
                        </thead>
                        {groups.map((group) => (
                            // One <tbody> per order: the merged order cell spans exactly
                            // the rows of that order, addons included.
                            <tbody key={group.key}>
                                {group.rows.map((row, index) => (
                                    <tr key={row.id}>
                                        {index === 0 && (
                                            // Inline style, not a utility class: the shared
                                            // table CSS pins `vertical-align: middle` from
                                            // outside Tailwind's layer and would win.
                                            // Kenar çizgisi de buradan: alt satırların İLK
                                            // hücresi kalem sütunu olduğu için `td + td`
                                            // kuralı orada çizgi çizmez ve sipariş sütununun
                                            // çizgisi yarıda kalırdı.
                                            <td
                                                rowSpan={group.rows.length}
                                                style={{ verticalAlign: 'top', borderRight: '1px solid var(--quote-grid-line)' }}
                                                className="font-semibold text-slate-800 dark:text-white"
                                            >
                                                {group.order.orderNumber}
                                            </td>
                                        )}
                                        <td>
                                            <div className="truncate font-semibold text-slate-800 dark:text-white">{row.label}</div>
                                            {row.detail && (
                                                <div className="truncate text-[11.5px] text-slate-500 dark:text-white/60">{row.detail}</div>
                                            )}
                                        </td>
                                        <td className="tabular-nums">
                                            {row.date ? dayjs(row.date).format('DD.MM.YYYY') : '—'}
                                        </td>
                                        <td className="text-right font-mono tabular-nums">{money(row.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        ))}
                        {/* Bottom line: the sum of every order, main plus addons. */}
                        <tfoot>
                            <tr className="bg-[#eef4ff] dark:bg-white/10">
                                <td colSpan={3} className="font-bold text-slate-900 dark:text-white">
                                    {t('projects.detail.grandTotal')}
                                </td>
                                <td className="text-right font-mono text-[13px] font-bold text-[#272f67] tabular-nums dark:text-white">
                                    {money(totals.total)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {usedMaterials.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/15 dark:bg-transparent">
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 dark:border-white/10 dark:bg-white/5">
                        <PackagePlus size={13} className="shrink-0 text-slate-400" />
                        <span className="text-[12px] font-semibold text-slate-800 dark:text-white">{t('auto.kullanilan_malzemeler')}</span>
                        <span className="text-[11px] text-slate-400">{t('auto.kullanilan_malzeme_fiyat_toplamina_eklenmez')}</span>
                    </div>
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <tbody>
                            {usedMaterials.map((item) => (
                                <tr key={item.id}>
                                    <td>
                                        <div className="truncate font-semibold text-slate-800 dark:text-white">{item.material?.name || t('auto.malzeme')}</div>
                                        <div className="truncate text-[11.5px] text-slate-500 dark:text-white/60">
                                            {item.material?.serialId || '-'} · {numberFmt(item.quantity)} {t('auto.adet_x')} {money(item.unitCost)} · {item.positionNumber}
                                        </div>
                                    </td>
                                    <td className="w-[150px] text-right font-mono tabular-nums text-slate-500 dark:text-white/60">
                                        {money(item.value)}
                                        <div className="text-[10.5px] font-normal">{t('auto.dahil_degil')}</div>
                                    </td>
                                    <td className="w-12 text-right">
                                        {(order?.tenderId || project.tenderId) && item.source === 'tender' && (
                                            <button
                                                type="button"
                                                aria-label={t('common.delete')}
                                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                                onClick={() => void removeUsedMaterial(item)}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
});
