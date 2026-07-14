import { memo } from 'react';
import type React from 'react';

// Pure key/value card; callers pass memoized `rows` so it stays put across unrelated updates.
export const InfoCard = memo(({ title, rows }: { title: string; rows: Array<[string, React.ReactNode]> }) => (
    <div className="rounded-md border border-slate-200/70 bg-white p-4">
        <div className="mb-3 text-[12px] font-semibold text-slate-900">{title}</div>
        <div className="space-y-2">
            {rows.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 text-[12.5px] last:border-0 last:pb-0">
                    <span className="text-slate-900">{label}</span>
                    <span className="max-w-[65%] text-right text-slate-800">{value}</span>
                </div>
            ))}
        </div>
    </div>
));
