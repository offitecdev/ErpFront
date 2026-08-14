import { Clock } from '@/components/icons/antIconCompat';

const TONE_STYLES: Record<string, string> = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
};

/** Job status pill, shared with the appointment list rows. */
export const InstallationStatusBadge = ({ label, tone }: { label: string; tone: string }) => (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${TONE_STYLES[tone] || TONE_STYLES.slate}`}>{label}</span>
);

/**
 * Task-screen header: the "today's job" summary — order number, customer/project,
 * appointment time, technician and current status, with the primary action
 * (Finish & Send) on the right.
 */
export const InstallationTaskHeader = ({
    orderNumber,
    title,
    dateTimeText,
    technicianText,
    status,
    action,
}: {
    orderNumber?: string | null;
    title: string;
    dateTimeText: string;
    technicianText?: string;
    status: { label: string; tone: string };
    action?: React.ReactNode;
}) => (
    <div className="ofi-rep-panel rounded-xl p-3.5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
                <div className="font-mono text-[11px] font-semibold text-slate-500">{orderNumber ? orderNumber : '-'}</div>
                <div className="truncate text-[15px] font-semibold text-slate-950">{title || '-'}</div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-600">
                    <span className="flex items-center gap-1.5"><Clock size={12} />{dateTimeText}</span>
                    {technicianText && technicianText !== '-' && <span className="text-slate-500">· {technicianText}</span>}
                </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
                <InstallationStatusBadge label={status.label} tone={status.tone} />
                {action}
            </div>
        </div>
    </div>
);
