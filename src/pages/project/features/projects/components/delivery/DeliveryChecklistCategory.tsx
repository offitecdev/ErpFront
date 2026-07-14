import { useState } from 'react';
import { ChevronDown, ChevronRight } from '@/components/icons/antIconCompat';

import type { DeliveryResponseItem, DeliveryStatus } from '@/lib/api/project';
import { t } from '@/i18n/translate';

/** YES / NO / NA options with their tone, shared by every checklist row. */
export const STATUS_OPTIONS: Array<{ value: Exclude<DeliveryStatus, null>; labelKey: string; tone: string }> = [
    { value: 'YES', labelKey: 'projects.delivery.yes', tone: 'text-emerald-700' },
    { value: 'NO', labelKey: 'projects.delivery.no', tone: 'text-rose-700' },
    { value: 'NA', labelKey: 'projects.delivery.na', tone: 'text-slate-500' },
];

/**
 * A single collapsible checklist category: header shows completed/total, each
 * row keeps the YES/NO/NA options and its optional measurement input together.
 */
export const DeliveryChecklistCategory = ({
    title,
    items,
    onStatus,
    onMeasurement,
    defaultOpen = true,
}: {
    title: string;
    items: DeliveryResponseItem[];
    onStatus: (id: string, status: DeliveryStatus) => void;
    onMeasurement: (id: string, measurement: string) => void;
    defaultOpen?: boolean;
}) => {
    const [open, setOpen] = useState(defaultOpen);
    const completed = items.filter((r) => r.status !== null).length;
    const total = items.length;
    const done = total > 0 && completed === total;

    return (
        <div className="overflow-hidden rounded-lg border border-slate-200">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-left"
            >
                {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                <span className="flex-1 text-[12px] font-semibold text-slate-700">{title}</span>
                <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}
                >
                    {completed}/{total}
                </span>
            </button>

            {open && (
                <div className="divide-y divide-slate-100">
                    {items.map((r) => (
                        <div key={r.id} className="px-3 py-2.5">
                            <div className="text-[12.5px] text-slate-800">{r.label}</div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-3">
                                {STATUS_OPTIONS.map((opt) => (
                                    <label key={opt.value} className="flex items-center gap-1.5 text-[12px] font-medium">
                                        <input
                                            type="radio"
                                            name={`st-${r.id}`}
                                            checked={r.status === opt.value}
                                            onChange={() => onStatus(r.id, opt.value)}
                                        />
                                        <span className={opt.tone}>{t(opt.labelKey)}</span>
                                    </label>
                                ))}
                                {r.measurementEnabled && (
                                    <input
                                        type="text"
                                        value={r.measurement}
                                        placeholder={t('projects.delivery.measurementPlaceholder')}
                                        onChange={(e) => onMeasurement(r.id, e.target.value)}
                                        className="ml-auto h-8 min-w-[140px] flex-1 rounded-lg border border-slate-200 px-2 text-[12px] outline-none focus:border-slate-400"
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DeliveryChecklistCategory;
