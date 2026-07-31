import clsx from 'clsx';

import type { DeliveryResponseItem, DeliveryStatus } from '@/lib/api/project';
import { groupResponsesByCategory } from '@/pages/project/features/projects/utils/deliveryReportUtils';
import { t } from '@/i18n/translate';

/**
 * Handover checklist with big one-tap "Done / Not done" states per item
 * (plus a small N/A escape), grouped by category.
 */
export const HandoverChecklist = ({
    responses,
    onStatus,
    onMeasurement,
    disabled,
}: {
    responses: DeliveryResponseItem[];
    onStatus: (id: string, status: DeliveryStatus) => void;
    onMeasurement: (id: string, measurement: string) => void;
    disabled?: boolean;
}) => (
    <div className="space-y-4">
        {groupResponsesByCategory(responses, t('projects.delivery.uncategorized')).map((group) => (
            <div key={group.category} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#17191c]">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-white/5 dark:bg-white/5">
                    <div className="text-[14px] font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">{group.category}</div>
                    <div className="text-[13px] font-bold text-slate-400">
                        {group.items.filter((x) => x.status !== null).length}/{group.items.length}
                    </div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {group.items.map((item) => (
                        <div key={item.id} className="space-y-2.5 px-5 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0 text-[15.5px] font-semibold text-slate-800 dark:text-slate-100">{item.label}</div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => onStatus(item.id, item.status === 'YES' ? null : 'YES')}
                                        className={clsx(
                                            'min-h-12 rounded-xl px-4 text-[14.5px] font-bold transition-colors disabled:opacity-50',
                                            item.status === 'YES'
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-800 dark:bg-white/10 dark:text-slate-300',
                                        )}
                                    >
                                        {t('montage.handover.done')}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => onStatus(item.id, item.status === 'NO' ? null : 'NO')}
                                        className={clsx(
                                            'min-h-12 rounded-xl px-4 text-[14.5px] font-bold transition-colors disabled:opacity-50',
                                            item.status === 'NO'
                                                ? 'bg-rose-600 text-white'
                                                : 'bg-slate-100 text-slate-600 hover:bg-rose-100 hover:text-rose-800 dark:bg-white/10 dark:text-slate-300',
                                        )}
                                    >
                                        {t('montage.handover.notDone')}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => onStatus(item.id, item.status === 'NA' ? null : 'NA')}
                                        className={clsx(
                                            'min-h-12 rounded-xl px-3 text-[13px] font-bold transition-colors disabled:opacity-50',
                                            item.status === 'NA'
                                                ? 'bg-slate-600 text-white'
                                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-400',
                                        )}
                                    >
                                        {t('projects.delivery.na')}
                                    </button>
                                </div>
                            </div>
                            {item.measurementEnabled && (
                                <input
                                    value={item.measurement || ''}
                                    disabled={disabled}
                                    onChange={(e) => onMeasurement(item.id, e.target.value)}
                                    placeholder={t('montage.handover.measurement')}
                                    className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] text-slate-900 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-50"
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        ))}
    </div>
);
