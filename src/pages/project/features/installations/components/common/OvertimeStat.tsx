import { memo } from 'react';

export const OvertimeStat = memo(({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) => (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        <div className={`mt-0.5 font-mono text-[12.5px] font-semibold ${tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div>
    </div>
));
