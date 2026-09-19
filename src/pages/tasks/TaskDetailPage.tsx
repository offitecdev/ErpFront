import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { LoadingPanel } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksErrorCode, tasksErrorMessage } from '@/lib/api/tasksModule';
import '@/styles/modules/tasksDetail.css';
import '@/styles/modules/tasksIssues.css';
import { ActivityTab } from './components/detail/ActivityTab';
import { CommentsTab } from './components/detail/CommentsTab';
import { ContentTab } from './components/detail/ContentTab';
import { DetailActions } from './components/detail/DetailActions';
import { DetailBanners } from './components/detail/DetailBanners';
import { DetailHeader } from './components/detail/DetailHeader';
import { DetailRail } from './components/detail/DetailRail';
import { DetailTabs, type DetailTab } from './components/detail/DetailTabs';
import { FilesTab } from './components/detail/FilesTab';
import { IssuesTab } from './components/issues/IssuesTab';
import { TaskButton } from './components/shared/TaskButton';
import { TasksModuleShell } from './components/shared/TasksModuleShell';
import { useTaskDetail } from './hooks/useTaskDetail';
import { useIsTasksManager, useTasksModuleStore } from './store/tasksModuleStore';

/**
 * ── GÖREV DETAYI — /tasks/:taskId (Görevly views/taskDetail.js) ─────────────
 *
 * Dünne Seite: Daten aus `useTaskDetail`, links Kopf · Hinweise · Reiter,
 * rechts die Karten. Unter 1024px steht die Seitenleiste unter dem Inhalt.
 */
export const TaskDetailPage = () => {
    const { taskId = '' } = useParams();
    const navigate = useNavigate();
    /* Aus der Mail einer Frage: `/tasks/:id?issue=…` öffnet den Reiter und
       rollt genau diesen Faden in die Mitte (16.09.2026). */
    const [search] = useSearchParams();
    const focusIssueId = search.get('issue');
    const ctl = useTaskDetail(taskId);
    const isManager = useIsTasksManager();
    const onboarding = useTasksModuleStore((state) => state.bootstrap?.onboarding);
    const [tab, setTab] = useState<DetailTab>('content');
    /** Offene Fragen: der Reiter zählt selbst mit, ohne die Seite neu zu laden. */
    const [openIssues, setOpenIssues] = useState<number | null>(null);
    const { data, loading, error } = ctl;

    useEffect(() => { setTab(focusIssueId ? 'issues' : 'content'); setOpenIssues(null); }, [taskId, focusIssueId]);
    useEffect(() => { if (tab === 'activity' && !isManager) setTab('content'); }, [tab, isManager]);
    useEffect(() => {
        if (onboarding?.taskId === taskId) navigate(`/tasks/guide/${onboarding.guide}`, { replace: true });
    }, [navigate, onboarding, taskId]);

    const title = data?.task.title ?? t('tasksModule.nav.tasks');

    if (!data) {
        const code = tasksErrorCode(error);
        return (
            <TasksModuleShell title={title}>
                {loading || !error ? (
                    <LoadingPanel />
                ) : (
                    <div className="ofi-gv-panel">
                        <div className="ofi-gv-empty">
                            <div className="ofi-gv-empty__title">
                                {code === 'TASK_NOT_FOUND' || code === 'TASK_FORBIDDEN'
                                    ? t(`tasksModule.errors.${code}`)
                                    : t('tasksModule.detail.loadFailed')}
                            </div>
                            {code !== 'TASK_NOT_FOUND' && code !== 'TASK_FORBIDDEN' && <div>{tasksErrorMessage(error)}</div>}
                            <div className="ofi-gv-detail-error-actions">
                                <Link to="/tasks" className="ofi-gv-btn ofi-btn-plain">{t('tasksModule.detail.backToList')}</Link>
                                {code !== 'TASK_NOT_FOUND' && code !== 'TASK_FORBIDDEN' && (
                                    <TaskButton onClick={() => void ctl.reload(false)}>{t('tasksModule.detail.retry')}</TaskButton>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </TasksModuleShell>
        );
    }

    return (
        <TasksModuleShell title={title} actions={<DetailActions ctl={ctl} data={data} />}>
            <div className="ofi-gv-detail">
                <div className="ofi-gv-detail-main">
                    <DetailHeader ctl={ctl} data={data} />
                    <DetailBanners ctl={ctl} data={data} />
                    <DetailTabs
                        value={tab}
                        onChange={setTab}
                        commentCount={data.task.commentCount}
                        issueCount={openIssues ?? data.task.openIssueCount ?? 0}
                        fileCount={data.attachments.length}
                        showActivity={isManager}
                    />
                    {tab === 'content' && <ContentTab key={data.task.id} ctl={ctl} data={data} />}
                    {tab === 'comments' && <CommentsTab ctl={ctl} data={data} />}
                    {tab === 'issues' && (
                        <IssuesTab key={data.task.id} ctl={ctl} data={data} focusIssueId={focusIssueId} onOpenCount={setOpenIssues} />
                    )}
                    {tab === 'files' && <FilesTab ctl={ctl} data={data} />}
                    {tab === 'activity' && isManager && <ActivityTab taskId={data.task.id} people={data.people} />}
                </div>
                <DetailRail ctl={ctl} data={data} />
            </div>
        </TasksModuleShell>
    );
};
