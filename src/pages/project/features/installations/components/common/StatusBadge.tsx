import { memo } from 'react';

export const StatusBadge = memo(({ label, tone }: { label: string; tone: string }) => {
    const styles: Record<string, string> = {
        emerald:"border-emerald-200 bg-emerald-50 text-emerald-800",
        slate:'border-slate-200 bg-slate-50 text-slate-700',
        amber:"border-amber-200 bg-amber-50 text-amber-800",
        blue:"border-blue-200 bg-blue-50 text-blue-800",
    };
    return <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${styles[tone] || styles.slate}`}>{label}</span>;
});
