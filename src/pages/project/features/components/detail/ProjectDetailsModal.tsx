import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import type { ProjectDto } from '@/types/project';

import type { calculateProjectTotals } from '../../utils/projectTotals';
import { money } from '../../utils/projectFormatters';

export const ProjectDetailsModal = ({
    project,
    totals,
    onClose,
}: {
    project: ProjectDto;
    totals: ReturnType<typeof calculateProjectTotals>;
    onClose: () => void;
}) => {
    const rows: Array<{ label: string; value: number; total?: boolean }> = [
        { label: t('auto.siparis_tutari'), value: totals.orderBudget },
        { label: t('auto.ek_iscilik'), value: totals.overtime },
        { label: t('auto.harici_gider'), value: totals.expenses },
        { label: t('auto.malzeme'), value: totals.extraMaterials },
        { label: t('common.total'), value: totals.total, total: true },
    ];
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose} role="presentation">
            <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                    <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{t('common.detail')}</p>
                        <h2 className="mt-0.5 truncate text-[18px] font-semibold tracking-tight text-slate-900">{localizeTenderNumbersInText(project.projectName)}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Close"
                    >
                        <X size={24} />
                    </button>
                </div>
                <dl className="divide-y divide-slate-100 px-6 py-2">
                    {rows.map((row) => (
                        <div key={row.label} className={`flex items-center justify-between gap-4 py-2.5 text-[13px] ${row.total ? 'font-semibold text-slate-950' : ''}`}>
                            <dt className={`shrink-0 ${row.total ? 'text-slate-900' : 'font-medium text-slate-500'}`}>{row.label}</dt>
                            <dd className={`min-w-0 truncate text-right font-mono ${row.total ? 'text-[15px] text-slate-950' : 'font-semibold text-slate-900'}`}>{money(row.value)}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </div>
    );
};
