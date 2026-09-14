import { useEffect, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LuArrowLeft, LuArrowRight, LuCheck, LuCircleCheck, LuClock3, LuFileText, LuListChecks, LuMessageSquare, LuPlay, LuShieldCheck, LuUsers } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { tasksApi } from '@/lib/api/tasksModule';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { emitTasksChanged } from '../../utils/taskEvents';
import { dropTaskListCaches } from '../../utils/tasksCache';
import { TaskButton } from '../shared/TaskButton';
import { TasksModuleShell } from '../shared/TasksModuleShell';

export interface TaskGuideStep {
    key: string;
    icon: ComponentType<{ size?: number }>;
}

export const TaskGuidePage = ({ guide, steps }: { guide: 'admin' | 'member'; steps: TaskGuideStep[] }) => {
    useLanguageTick();
    const navigate = useNavigate();
    const bootstrap = useTasksModuleStore((state) => state.bootstrap);
    const setOnboarding = useTasksModuleStore((state) => state.setOnboarding);
    const setSummary = useTasksModuleStore((state) => state.setSummary);
    const [step, setStep] = useState(0);
    const [finishing, setFinishing] = useState(false);
    const onboarding = bootstrap?.onboarding;
    const expectedGuide = bootstrap?.actor.isSystemAdmin ? 'admin' : 'member';
    const active = steps[step] ?? steps[0];

    useEffect(() => {
        if (bootstrap && expectedGuide !== guide) navigate(`/tasks/guide/${expectedGuide}`, { replace: true });
    }, [bootstrap, expectedGuide, guide, navigate]);

    const finish = async () => {
        if (onboarding?.completed) {
            navigate('/tasks');
            return;
        }
        setFinishing(true);
        try {
            const result = await tasksApi.completeOnboarding();
            setOnboarding(result);
            dropTaskListCaches();
            if (bootstrap) {
                setSummary({ ...bootstrap.summary, openCount: Math.max(0, bootstrap.summary.openCount - 1) });
            }
            emitTasksChanged('task', result.taskId);
            toast.success(t('tasksModule.onboarding.completedToast'));
            navigate('/tasks', { replace: true });
        } catch {
            toast.error(t('tasksModule.onboarding.error'));
        } finally {
            setFinishing(false);
        }
    };

    if (!active) return null;
    const Icon = active.icon;
    const base = `tasksModule.onboarding.${guide}`;
    const last = step === steps.length - 1;

    return (
        <TasksModuleShell
            title={t(`${base}.title`)}
            actions={<TaskButton icon={<LuArrowLeft size={14} />} onClick={() => navigate('/tasks')}>{t('tasksModule.onboarding.backToTasks')}</TaskButton>}
        >
            <main className={`ofi-gv-guide is-${guide}`}>
                <header className="ofi-gv-guide__hero">
                    <span className="ofi-gv-guide__rolemark" aria-hidden>{guide === 'admin' ? <LuShieldCheck size={28} /> : <LuUsers size={28} />}</span>
                    <div>
                        <span className="ofi-gv-guide__eyebrow">{t('tasksModule.onboarding.firstBadge')}</span>
                        <h2>{t(`${base}.title`)}</h2>
                        <p>{t(`${base}.subtitle`)}</p>
                    </div>
                </header>

                <div className="ofi-gv-guide__body">
                    <nav className="ofi-gv-guide__steps" aria-label={t(`${base}.title`)}>
                        {steps.map((entry, index) => {
                            const StepIcon = entry.icon;
                            return (
                                <button key={entry.key} type="button" className={index === step ? 'is-active' : index < step ? 'is-done' : ''} onClick={() => setStep(index)}>
                                    <span>{index < step ? <LuCheck size={15} /> : <StepIcon size={15} />}</span>
                                    <b>{t(`${base}.steps.${entry.key}.title`)}</b>
                                </button>
                            );
                        })}
                    </nav>

                    <section className="ofi-gv-guide__stage" aria-live="polite">
                        <div className="ofi-gv-guide__demo" aria-hidden>
                            <div className="ofi-gv-guide__demo-top">
                                <span className="ofi-gv-guide__demo-dot" />
                                <span className="ofi-gv-guide__demo-dot" />
                                <span className="ofi-gv-guide__demo-dot" />
                                <span className="ofi-gv-guide__demo-spacer" />
                                <span className="ofi-gv-guide__demo-button"><LuPlay size={12} />{t('tasksModule.onboarding.demo.newTask')}</span>
                            </div>
                            <div className="ofi-gv-guide__demo-card">
                                <span className="ofi-gv-guide__demo-check"><LuCheck size={12} /></span>
                                <div className="ofi-gv-guide__demo-lines"><i /><i /></div>
                                <span className="ofi-gv-guide__demo-chip"><LuClock3 size={12} />{t('tasksModule.onboarding.demo.timer')}</span>
                            </div>
                            <div className="ofi-gv-guide__demo-meta">
                                <span><LuUsers size={13} />{t('tasksModule.onboarding.demo.assignees')}</span>
                                <span><LuListChecks size={13} />{t('tasksModule.onboarding.demo.checklist')}</span>
                                <span><LuMessageSquare size={13} />{t('tasksModule.onboarding.demo.comment')}</span>
                                <span>{guide === 'admin' ? <><LuFileText size={13} />{t('tasksModule.onboarding.demo.report')}</> : <><LuCircleCheck size={13} />{t('tasksModule.onboarding.demo.approval')}</>}</span>
                            </div>
                        </div>

                        <div className="ofi-gv-guide__popup">
                            <div className="ofi-gv-guide__popup-icon"><Icon size={24} /></div>
                            <span>{t('tasksModule.onboarding.stepCounter', { current: step + 1, total: steps.length })}</span>
                            <h3>{t(`${base}.steps.${active.key}.title`)}</h3>
                            <p>{t(`${base}.steps.${active.key}.text`)}</p>
                        </div>

                        <footer className="ofi-gv-guide__actions">
                            <TaskButton disabled={step === 0 || finishing} icon={<LuArrowLeft size={14} />} onClick={() => setStep((value) => Math.max(0, value - 1))}>
                                {t('tasksModule.onboarding.previous')}
                            </TaskButton>
                            {last ? (
                                <TaskButton variant="primary" disabled={finishing} icon={<LuCircleCheck size={14} />} onClick={() => void finish()}>
                                    {finishing ? t('tasksModule.onboarding.finishing') : t('tasksModule.onboarding.finish')}
                                </TaskButton>
                            ) : (
                                <TaskButton variant="primary" icon={<LuArrowRight size={14} />} onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>
                                    {t('tasksModule.onboarding.next')}
                                </TaskButton>
                            )}
                        </footer>
                    </section>
                </div>
            </main>
        </TasksModuleShell>
    );
};
