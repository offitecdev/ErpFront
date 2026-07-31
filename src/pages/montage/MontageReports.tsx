import { useState } from 'react';

import { Clipboard, SearchLg } from '@/components/icons/antIconCompat';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { t } from '@/i18n/translate';
import type { MontageReportOrderListItem } from '@/types/project';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';

import { MontageHeader } from './components/MontageHeader';
import { MontagePager } from './components/MontagePager';
import { ReportOrderSheet } from './components/ReportOrderSheet';
import { useMontageReports } from './hooks/useMontageReports';
import { dateFmt } from './utils/montageFormat';

export const MontageReports = () => {
    const { loading, rows, total, page, setPage, search, setSearch } = useMontageReports();
    const [selectedOrder, setSelectedOrder] = useState<MontageReportOrderListItem | null>(null);

    return (
        <div className="space-y-4">
            <MontageHeader title={t('montage.home.reports')} subtitle={`${total} ${t('projects.orders')}`} backTo="/montage" />

            <section className="overflow-hidden rounded-[3px] border border-slate-200 bg-white dark:border-white/10 dark:bg-[#17191c]">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#1f2654] px-3 py-2.5 text-white dark:border-white/10 dark:bg-amber-500">
                    <div>
                        <div className="text-[13px] font-bold">Rapor oluştur</div>
                        <div className="text-[11px] text-white/70">Saha raporu bulunan siparişi seçin.</div>
                    </div>
                    <div className="relative w-full sm:w-72">
                        <SearchLg size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t('common.search')}
                            className="h-9 w-full rounded-[3px] border border-white/25 bg-white pl-9 pr-3 text-[13px] text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-white/35"
                        />
                    </div>
                </header>

                <div className="border-b border-slate-200 px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-[#1f2654] dark:border-white/10 dark:text-amber-300">
                    {t('projects.orders')}
                </div>

                {loading ? (
                    <div className="flex h-48 items-center justify-center gap-2 text-[13px] text-slate-500">
                        <span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654] dark:border-t-amber-500" />
                        {t('common.loading')}
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState icon={<Clipboard size={30} />} title={t('montage.reports.empty')} description={t('montage.reports.emptyHint')} />
                ) : (
                    <div className="overflow-x-auto" data-unstyled-table>
                        <table data-montage-table data-unstyled-table className="min-w-[720px] text-left">
                            <colgroup>
                                <col style={{ width: '24%' }} />
                                <col style={{ width: '34%' }} />
                                <col style={{ width: '20%' }} />
                                <col style={{ width: '22%' }} />
                            </colgroup>
                            <thead className="dark:[&_th]:border-white/10 dark:[&_th]:bg-white/5 dark:[&_th]:text-slate-300">
                                <tr>
                                    <th>{t('montage.table.order')}</th>
                                    <th>{t('montage.table.customer')} / {t('montage.table.project')}</th>
                                    <th>{t('projects.saha_raporlari')}</th>
                                    <th>{t('montage.table.date')}</th>
                                </tr>
                            </thead>
                            <tbody className="dark:[&_td]:border-white/10">
                                {rows.map((row) => (
                                    <tr
                                        key={row.salesOrderId}
                                        onClick={() => setSelectedOrder(row)}
                                        className="cursor-pointer hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-white/5"
                                    >
                                        <td className="font-semibold text-slate-900 dark:text-slate-50">
                                            {localizeTenderNumbersInText(row.orderNumber)}
                                        </td>
                                        <td>
                                            <span className="font-medium text-slate-700 dark:text-slate-200">{row.customerName}</span>
                                            <span className="mx-1.5 text-slate-300">·</span>
                                            <span className="text-slate-500 dark:text-slate-400">{row.projectName}</span>
                                        </td>
                                        <td className="text-slate-600 dark:text-slate-300">{row.fieldReportCount}</td>
                                        <td className="text-slate-500 dark:text-slate-400">{dateFmt(row.latestReportDate)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {!loading && rows.length > 0 && <MontagePager page={page} total={total} onPage={setPage} />}
            <ReportOrderSheet order={selectedOrder} onClose={() => setSelectedOrder(null)} />
        </div>
    );
};
