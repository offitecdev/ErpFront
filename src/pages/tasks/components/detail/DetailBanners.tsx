import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LuCircleCheck, LuCircleX, LuClock, LuShieldCheck, LuTrash2, LuTriangleAlert } from 'react-icons/lu';

import { DangerConfirmDialog } from '@/components/ui-shared/DangerConfirmDialog';

import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { TaskDetailResult } from '@/types/tasksModule';
import type { TaskDetailController } from '../../hooks/useTaskDetail';
import { useNow } from '../../hooks/useNow';
import { useIsTasksAdmin, useIsTasksManager, useTasksActorId } from '../../store/tasksModuleStore';
import { formatDuration, personName, relativeTime, smartDate } from '../../utils/taskFormat';
import { ReasonDialog } from '../shared/ReasonDialog';
import { TaskButton } from '../shared/TaskButton';

type Tone = 'review' | 'alert' | 'done' | 'progress';
type DialogKind = 'rejectReview' | 'rejectCompletion' | 'editBlock' | 'rejectDelete' | 'approveDelete';

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
 * Hinweisstreifen unter dem Kopf, in Görevlys Reihenfolge: Vorschlag in
 * Prüfung → Vorschlag abgelehnt → Abschluss wartet → Abschluss abgelehnt →
 * nicht machbar → erledigt. Entscheiden darf nur die Leitung; wer den
 * Abschluss beantragt hat, kann ihn zurückziehen.
 */
export const DetailBanners = ({ ctl, data }: { ctl: TaskDetailController; data: TaskDetailResult }) => {
    const isManager = useIsTasksManager();
    // Görev-Talepe entscheidet nur die Administratorrolle (14.09.2026).
    const isAdmin = useIsTasksAdmin();
    const me = useTasksActorId();
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

    if (task.review.state === 'PENDING') {
        banners.push(
            <Banner
                key="review"
                tone="review"
                icon={<LuShieldCheck size={16} />}
                title={t('tasksModule.detail.banner.reviewTitle')}
                // Wer nicht freigibt, liest die Warnung: noch nicht beginnen.
                text={isAdmin ? t('tasksModule.detail.banner.reviewText') : t('tasksModule.detail.banner.reviewWaitText')}
                actions={isAdmin ? (
                    <>
                        <TaskButton variant="danger" disabled={busy} onClick={() => setDialog('rejectReview')}>
                            {t('tasksModule.review.notSuitable')}
                        </TaskButton>
                        <TaskButton variant="primary" disabled={busy} onClick={() => void run(() => tasksApi.approveReview(task.id))}>
                            {t('tasksModule.review.suitable')}
                        </TaskButton>
                    </>
                ) : undefined}
            />,
        );
    }

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

    if (task.review.state === 'REJECTED') {
        const worked = task.work?.totalMs ?? 0;
        // Wer den Talep gestellt hat, soll am Görev erklären, wie viel Zeit verloren ging.
        const isRequester = (task.review.requestedById || task.createdById) === me;
        banners.push(
            <Banner
                key="review-rejected"
                tone="alert"
                icon={<LuCircleX size={16} />}
                title={t('tasksModule.detail.banner.reviewRejectedTitle')}
                text={(
                    <>
                        <div>{task.review.note || t('tasksModule.detail.banner.noReason')}</div>
                        {worked > 0 && <div>{t('tasksModule.review.lostTime', { time: formatDuration(worked) })}</div>}
                        {isRequester && <div>{t('tasksModule.review.explainLoss')}</div>}
                    </>
                )}
            />,
        );
    }

    if (task.approval.state === 'PENDING') {
        const parts = [
            personName(people, task.approval.requestedById),
            relativeTime(task.approval.requestedAt, now),
            task.approval.note ?? '',
        ].filter(Boolean);
        banners.push(
            <Banner
                key="approval"
                tone="review"
                icon={<LuClock size={16} />}
                title={t('tasksModule.detail.banner.approvalTitle')}
                text={parts.join(' · ')}
                actions={permissions.canApproveCompletion ? (
                    <>
                        <TaskButton variant="danger" disabled={busy} onClick={() => setDialog('rejectCompletion')}>
                            {t('tasksModule.detail.reject')}
                        </TaskButton>
                        <TaskButton variant="primary" disabled={busy} onClick={() => void run(() => tasksApi.approveCompletion(task.id))}>
                            {t('tasksModule.detail.approve')}
                        </TaskButton>
                    </>
                ) : permissions.canCancelCompletionRequest ? (
                    <TaskButton disabled={busy} onClick={() => void run(() => tasksApi.cancelCompletionRequest(task.id))}>
                        {t('tasksModule.detail.withdraw')}
                    </TaskButton>
                ) : undefined}
            />,
        );
    }

    if (task.approval.state === 'REJECTED' && task.status !== 'COMPLETED') {
        banners.push(
            <Banner
                key="approval-rejected"
                tone="alert"
                icon={<LuTriangleAlert size={16} />}
                title={t('tasksModule.detail.banner.approvalRejectedTitle')}
                text={task.approval.decisionNote || t('tasksModule.detail.banner.fixRequested')}
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
                open={dialog === 'rejectReview'}
                onClose={() => setDialog(null)}
                title={t('tasksModule.detail.rejectReviewTitle')}
                label={t('tasksModule.detail.reason')}
                confirmLabel={t('tasksModule.review.notSuitable')}
                required
                danger
                busy={busy}
                onConfirm={(note) => void run(() => tasksApi.rejectReview(task.id, note))}
            />
            <ReasonDialog
                open={dialog === 'rejectCompletion'}
                onClose={() => setDialog(null)}
                title={t('tasksModule.detail.rejectCompletionTitle')}
                label={t('tasksModule.detail.reason')}
                confirmLabel={t('tasksModule.detail.reject')}
                required
                danger
                busy={busy}
                onConfirm={(note) => void run(() => tasksApi.rejectCompletion(task.id, note))}
            />
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
