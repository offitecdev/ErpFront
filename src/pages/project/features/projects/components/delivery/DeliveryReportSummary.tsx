import { CheckCircle, FileCheck02 as FileCheck, Image01 as ImageIcon, XCircle } from '@/components/icons/antIconCompat';

import type { DeliveryResponseItem } from '@/lib/api/project';
import { t } from '@/i18n/translate';

const Stat = ({ icon, value, label, tone }: { icon: React.ReactNode; value: number | string; label: string; tone: string }) => (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <span className={tone}>{icon}</span>
        <div className="leading-tight">
            <div className="text-[15px] font-semibold text-slate-900">{value}</div>
            <div className="text-[11px] text-slate-500">{label}</div>
        </div>
    </div>
);

/**
 * "Delivery Control Summary" card shown above the checklist: selected template,
 * completed / missing item counts, photo count and the save/signature status.
 */
export const DeliveryReportSummary = ({
    templateName,
    responses,
    photoCount,
    statusText,
    statusTone = 'text-amber-700',
}: {
    templateName?: string | null;
    responses: DeliveryResponseItem[];
    photoCount: number;
    statusText: string;
    statusTone?: string;
}) => {
    const total = responses.length;
    const completed = responses.filter((r) => r.status !== null).length;
    const missing = total - completed;

    return (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                    <FileCheck size={15} className="text-slate-500" />
                    {t('projects.delivery.controlSummary')}
                </div>
                <span className={`text-[11.5px] font-semibold ${statusTone}`}>{statusText}</span>
            </div>

            {templateName && <div className="text-[12px] text-slate-600">{templateName}</div>}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat icon={<CheckCircle size={16} />} value={`${completed}/${total}`} label={t('projects.delivery.completed')} tone="text-emerald-600" />
                <Stat icon={<XCircle size={16} />} value={missing} label={t('projects.delivery.missing')} tone="text-rose-600" />
                <Stat icon={<ImageIcon size={16} />} value={photoCount} label={t('projects.delivery.photos')} tone="text-sky-600" />
            </div>
        </div>
    );
};

export default DeliveryReportSummary;
