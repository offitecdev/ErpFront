import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LuCircleCheck, LuHourglass, LuTrash2, LuTriangleAlert } from 'react-icons/lu';

import { DangerConfirmDialog } from '@/components/ui-shared/DangerConfirmDialog';

import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { TaskDetailResult } from '@/types/tasksModule';
import type { TaskDetailController } from '../../hooks/useTaskDetail';
import { useNow } from '../../hooks/useNow';
import { useIsTasksManager } from '../../store/tasksModuleStore';
import { personName, relativeTime, smartDate } from '../../utils/taskFormat';
import { ReasonDialog } from '../shared/ReasonDialog';
import { TaskButton } from '../shared/TaskButton';

type Tone = 'review' | 'alert' | 'done' | 'progress';
type DialogKind = 'editBlock' | 'rejectDelete' | 'approveDelete';

const Banner = ({ tone, icon, title, text, actions }: {
    tone: Tone;
    icon: ReactNode;
    title: string;
    text?: ReactNode;
    actions?: ReactNode;
}) => (
    <div className={`ofi-gv-banner is-${tone}`} role="status">
        <span className="ofi-gv-banner__icon">{icon}</span>
        <div className="ofi-gv-banner__body">
            <div className="ofi-gv-banner__title">{title}</div>
            {text ? <div className="ofi-gv-banner__text">{text}</div> : null}
        </div>
        {actions ? <div className="ofi-gv-banner__actions">{actions}</div> : null}
    </div>
);

/**
 * Hinweisstreifen unter dem Kopf, in dieser Reihenfolge: Löschanfrage →
 * Gecikme açıklaması → nicht machbar → erledigt. Abschlussanfragen gibt es
 * seit dem 16.09.2026 nicht mehr — abgeschlossen wird direkt.
 */
export const DetailBanners = ({ ctl, data }: { ctl: TaskDetailController; data: TaskDetailResult }) => {
    const isManager = useIsTasksManager();
    const navigate = useNavigate();
    const now = useNow(60_000);
    const { task, permissions, people } = data;
    const [dialog, setDialog] = useState<DialogKind | null>(null);
    const [busy, setBusy] = useState(false);

    const run = async (fn: () => ReturnType<typeof tasksApi.update>) => {
        setBusy(true);
        const result = await ctl.act(fn);
        setBusy(false);
        if (result) setDialog(null);
        return result;
    };

    const banners: ReactNode[] = [];

    if (task.deleteRequest?.requestedById) {
        const parts = [
            personName(people, task.deleteRequest.requestedById),
            relativeTime(task.deleteRequest.requestedAt, now),
            task.deleteRequest.note ?? '',
        ].filter(Boolean);
        banners.push(
            <Banner
                key="delete-request"
                tone="alert"
                icon={<LuTrash2 size={16} />}
                title={t('tasksModule.deleteRequest.bannerTitle')}
                text={parts.join(' · ')}
                actions={permissions.canDelete ? (
                    <>
                        <TaskButton disabled={busy} onClick={() => setDialog('rejectDelete')}>
                            {t('tasksModule.deleteRequest.reject')}
                        </TaskButton>
                        <TaskButton variant="danger" disabled={busy} onClick={() => setDialog('approveDelete')}>
                            {t('tasksModule.deleteRequest.approve')}
                        </TaskButton>
                    </>
                ) : permissions.canCancelDeleteRequest ? (
                    <TaskButton disabled={busy} onClick={() => void run(() => tasksApi.cancelDeleteRequest(task.id))}>
                        {t('tasksModule.deleteRequest.withdraw')}
                    </TaskButton>
                ) : undefined}
            />,
        );
    }

    /* Gecikme açıklaması: bleibt stehen, auch nach Freigabe/Ablehnung (15.09.2026, Samet). */
    if (task.delay?.reason) {
        const by = [personName(people, task.delay.byId), relativeTime(task.delay.at, now)].filter(Boolean).join(' · ');
        banners.push(
            <Banner
                key="delay-reason"
                tone="alert"
                icon={<LuHourglass size={16} />}
                title={t('tasksModule.delay.bannerTitle')}
                text={(
                    <>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{task.delay.reason}</div>
                        {by && <div>{by}</div>}
                    </>
                )}
            />,
        );
    }

    if (task.status === 'BLOCKED' && task.blockReason) {
        banners.push(
            <Banner
                key="blocked"
                tone="alert"
                icon={<LuTriangleAlert size={16} />}
                title={t('tasksModule.detail.banner.blockedTitle')}
                text={task.blockReason}
                actions={isManager ? (
                    <TaskButton disabled={busy} onClick={() => setDialog('editBlock')}>{t('common.edit')}</TaskButton>
                ) : undefined}
            />,
        );
    }

    if (task.status === 'COMPLETED') {
        banners.push(
            <Banner
                key="completed"
                tone="done"
                icon={<LuCircleCheck size={16} />}
                title={t('tasksModule.detail.banner.completedTitle')}
                text={smartDate(task.completedAt, true, now)}
                actions={isManager ? (
                    <TaskButton disabled={busy} onClick={() => void run(() => tasksApi.setStatus(task.id, 'IN_PROGRESS'))}>
                        {t('tasksModule.detail.reopen')}
                    </TaskButton>
                ) : undefined}
            />,
        );
    }

    return (
        <>
            {banners.length > 0 && <div className="ofi-gv-detail-banners">{banners}</div>}

            <ReasonDialog
                open={dialog === 'rejectDelete'}
                onClose={() => setDialog(null)}
                title={t('tasksModule.deleteRequest.rejectTitle')}
                label={t('tasksModule.detail.reason')}
                confirmLabel={t('tasksModule.deleteRequest.reject')}
                busy={busy}
                onConfirm={(note) => void run(() => tasksApi.rejectDelete(task.id, note || undefined))}
            />
            <DangerConfirmDialog
                open={dialog === 'approveDelete'}
                title={t('tasksModule.detail.deleteTitle')}
                message={t('tasksModule.detail.deleteMessage', { title: task.title })}
                confirmLabel={t('tasksModule.deleteRequest.approve')}
                requirePassword={false}
                busy={busy}
                onCancel={() => setDialog(null)}
                onConfirm={() => void (async () => {
                    setBusy(true);
                    try {
                        await tasksApi.remove(task.id);
                        setDialog(null);
                        ctl.notify('task');
                        toast.success(t('tasksModule.detail.deleted'));
                        navigate('/tasks', { replace: true });
                    } catch (error) {
                        toast.error(tasksErrorMessage(error));
                    } finally {
                        setBusy(false);
                    }
                })()}
            />
            <ReasonDialog
                open={dialog === 'editBlock'}
                onClose={() => setDialog(null)}
                title={t('tasksModule.detail.editBlockTitle')}
                subtitle={t('tasksModule.detail.editBlockHint')}
                label={t('tasksModule.detail.reason')}
                confirmLabel={t('common.save')}
                initialValue={task.blockReason ?? ''}
                busy={busy}
                onConfirm={(reason) => void run(() => tasksApi.block(task.id, reason || null))}
            />
        </>
    );
};
