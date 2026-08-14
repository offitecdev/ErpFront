import clsx from 'clsx';

import { CheckCircle } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import type { MontageOrderRow } from '../types/montage';
import { dateFmt, timeRange } from '../utils/montageFormat';
import { StatusPill } from './StatusPill';

const HIGHLIGHT: Record<MontageOrderRow['highlight'], string> = {
    none: '',
    // Starting soon vs. past-due-but-unfinished rows get their own tint.
    soon: 'bg-rose-50 dark:bg-amber-500/10',
    overdue: 'bg-rose-50 dark:bg-rose-500/10',
};

/**
 * Orders table in the QUOTE-TABLE style (TenderDetail / Teklif satırları):
 * compact 13px rows, hairline column separators, small uppercase header band.
 * Rows still open the appointment sheet on tap. `showSignature` (completed
 * page) adds a customer-signature column derived from the row status.
 */
export const OrdersTable = ({
    rows,
    onOpen,
    showSignature = false,
}: {
    rows: MontageOrderRow[];
    onOpen: (row: MontageOrderRow) => void;
    showSignature?: boolean;
}) => (
    <div className="overflow-x-auto rounded-[3px] border border-slate-300 bg-white dark:border-white/10 dark:bg-[#17191c]" data-unstyled-table>
        <table data-montage-table data-unstyled-table className="min-w-[720px] text-left">
            <colgroup>
                <col style={{ width: showSignature ? '20%' : '22%' }} />
                <col style={{ width: showSignature ? '21%' : '24%' }} />
                <col style={{ width: showSignature ? '20%' : '23%' }} />
                <col style={{ width: '16%' }} />
                {showSignature && <col style={{ width: '11%' }} />}
                <col style={{ width: showSignature ? '12%' : '15%' }} />
            </colgroup>
            <thead className="dark:[&_th]:border-white/10 dark:[&_th]:bg-white/5 dark:[&_th]:text-slate-300">
                <tr>
                    <th>{t('auto.randevu')}</th>
                    <th>{t('montage.table.customer')}</th>
                    <th>{t('montage.table.project')}</th>
                    <th>{t('montage.table.order')}</th>
                    {showSignature && <th>{t('projects.delivery.customerSignature')}</th>}
                    <th className="text-right">{t('montage.table.status')}</th>
                </tr>
            </thead>
            <tbody className="dark:[&_td]:border-white/10">
                {rows.map((row) => (
                    <tr
                        key={row.id}
                        onClick={() => onOpen(row)}
                        className={clsx(
                            'cursor-pointer transition-colors hover:bg-slate-50/80 active:bg-slate-100 dark:hover:bg-white/5',
                            HIGHLIGHT[row.highlight],
                        )}
                    >
                        <td className="whitespace-nowrap text-slate-700 dark:text-slate-200">
                            <span className="font-semibold text-slate-900 dark:text-slate-50">{dateFmt(row.start)}</span>
                            <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
                            <span className="text-slate-500 dark:text-slate-400">{timeRange(row.start, row.end)}</span>
                        </td>
                        <td className="truncate font-medium text-slate-700 dark:text-slate-200">{row.customerName}</td>
                        <td className="truncate text-slate-600 dark:text-slate-300">{row.projectName}</td>
                        <td className="truncate text-slate-500 dark:text-slate-400">
                            {row.orderNumber}
                        </td>
                        {showSignature && (
                            <td className="whitespace-nowrap">
                                {row.status === 'completed' ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                        <CheckCircle size={12} />{t('projects.delivery.statusSigned')}
                                    </span>
                                ) : (
                                    <span className="text-[11px] font-semibold text-[#d30f15] dark:text-amber-300">
                                        {t('projects.delivery.statusUnsigned')}
                                    </span>
                                )}
                            </td>
                        )}
                        <td className="text-right">
                            <StatusPill status={row.status} className="!px-2 !py-0.5 !text-[10.5px] !font-semibold" />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);
