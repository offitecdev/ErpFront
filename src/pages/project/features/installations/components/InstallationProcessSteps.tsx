import { Fragment } from 'react';
import { Check } from '@/components/icons/antIconCompat';

export type ProcessStep = { key: string; label: string; done: boolean };

/**
 * Horizontal process indicator for the technician job: the ordered stages
 * (field report → signature → sent) with the current stage highlighted and
 * completed / pending stages clearly distinguished. The first not-done stage is
 * the current one.
 */
export const InstallationProcessSteps = ({ steps }: { steps: ProcessStep[] }) => {
    const currentIndex = steps.findIndex((step) => !step.done);

    return (
        <div className="ofi-rep-panel flex items-center gap-2 overflow-x-auto rounded-xl px-3.5 py-3">
            {steps.map((step, index) => {
                const state = step.done ? 'done' : index === currentIndex ? 'current' : 'pending';
                const circle =
                    state === 'done'
                        ? 'bg-emerald-600 text-white'
                        : state === 'current'
                            ? 'bg-[#272f67] text-white'
                            : 'bg-slate-100 text-slate-400';
                const text =
                    state === 'done'
                        ? 'text-emerald-700'
                        : state === 'current'
                            ? 'text-slate-900'
                            : 'text-slate-400';
                return (
                    <Fragment key={step.key}>
                        <div className="flex shrink-0 items-center gap-2">
                            <span className={`flex size-6 items-center justify-center rounded-full text-[11px] font-bold ${circle}`}>
                                {state === 'done' ? <Check size={13} /> : index + 1}
                            </span>
                            <span className={`whitespace-nowrap text-[12.5px] font-semibold ${text}`}>{step.label}</span>
                        </div>
                        {index < steps.length - 1 && <span className="h-px w-6 shrink-0 bg-slate-200 sm:w-10" />}
                    </Fragment>
                );
            })}
        </div>
    );
};

export default InstallationProcessSteps;
