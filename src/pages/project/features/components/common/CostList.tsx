import { memo } from 'react';

import { Card } from '@/components/ui-shared/Card';
import { money } from '../../utils/projectFormatters';

// Pure list renderer; callers pass memoized `rows` so this only re-renders when the
// underlying scoped data actually changes.
export const CostList = memo(({ title, empty, rows }: { title: string; empty: string; rows: Array<{ id: string; title: string; meta: string; amount: number; note?: string }> }) => (
    <Card title={title} noPadding>
        {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-slate-900">{empty}</div>
        ) : (
            <div className="divide-y divide-slate-100">
                {rows.map((row) => (
                    <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_150px] items-start gap-4 px-4 py-3">
                        <div className="min-w-0">
                            <div className="font-medium text-slate-800">{row.title}</div>
                            <div className="text-[11.5px] text-slate-900">{row.meta}</div>
                            {row.note && <div className="mt-1 text-[12px] text-slate-900">{row.note}</div>}
                        </div>
                        <div className="text-right font-mono text-[12.5px] font-semibold text-slate-800">{money(row.amount)}</div>
                    </div>
                ))}
            </div>
        )}
    </Card>
));
