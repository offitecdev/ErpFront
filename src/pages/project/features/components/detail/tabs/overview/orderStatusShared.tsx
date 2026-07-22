import type { DeliveryReportDto } from '@/lib/api/project';
import type { ProjectSalesOrder } from '@/types/project';

export type TechnicalState = 'completed' | 'ongoing' | 'pending';

// A delivery report decides the technical state: signed → done, drafted → ongoing.
export const orderTechnicalState = (
    order: ProjectSalesOrder,
    deliveryByOrderId: Map<string, DeliveryReportDto[]>,
): TechnicalState => {
    const key = order.id.startsWith('project-main-') ? '' : order.id;
    const rows = [...(deliveryByOrderId.get(key) || []), ...(key ? [] : deliveryByOrderId.get('') || [])];
    if (rows.some((row) => row.isSigned)) return 'completed';
    if (rows.length > 0) return 'ongoing';
    return 'pending';
};

// Horizontal completion bar (billed %). Thin mark, rounded data end.
export const BillingBar = ({ percent, thick = false }: { percent: number | null; thick?: boolean }) => {
    if (percent === null) return <span className="text-[11.5px] text-slate-400">—</span>;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    return (
        <div className="flex items-center gap-2">
            <div className={`${thick ? 'h-2.5' : 'h-1.5'} w-full min-w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10`}>
                <div
                    className={`h-full rounded-full ${clamped >= 100 ? 'bg-[#059669]' : 'bg-[#272f67]'}`}
                    style={{ width: `${clamped}%` }}
                />
            </div>
            <span className="w-10 shrink-0 text-right font-mono text-[11.5px] font-semibold text-slate-600">{clamped}%</span>
        </div>
    );
};
