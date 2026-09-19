import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LuCircleCheck, LuCopy, LuEllipsis, LuFlag, LuFlagOff, LuTrash2, LuUndo2 } from 'react-icons/lu';

import { DangerConfirmDialog } from '@/components/ui-shared/DangerConfirmDialog';
import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { ManualTaskStatus, TaskDetailResult } from '@/types/tasksModule';
import type { TaskDetailController } from '../../hooks/useTaskDetail';
import { useIsTasksManager } from '../../store/tasksModuleStore';
import { MANUAL_STATUSES, isTaskLate, statusLabel } from '../../utils/taskFormat';
import { TaskButton, TaskIconButton } from '../shared/TaskButton';
import { ReasonDialog } from '../shared/ReasonDialog';
import { TimerButton } from '../shared/TimerButton';
import { PopoverMenu, type MenuEntry } from './PopoverMenu';

/**
 * Handlungen im Kopf der Detailseite (Görevly taskDetail → setToolbar):
 * Start/Pause, «Tamamla» (das eine Blau) und ⋯ mit Bayrak, Durum, Kopyala,
 * Sil. Seit dem 16.09.2026 gibt es keine Abschlussanfrage mehr: wer messen
 * darf, schliesst selbst ab. Was sichtbar ist, entscheiden die Rechte des
 * Servers (`permissions`) — die Leitung erkennt die Seite zusätzlich am
 * Bootstrap.
 */
export const DetailActions = ({ ctl, data }: { ctl: TaskDetailController; data: TaskDetailResult }) => {
    const navigate = useNavigate();
    const isManager = useIsTasksManager();
    const { task, permissions } = data;
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const [dialog, setDialog] = useState<'delay' | 'block' | 'delete' | 'deleteRequest' | null>(null);
    const [busy, setBusy] = useState(false);

    const run = async (fn: () => Promise<boolean>) => {
        setBusy(true);
        try {
            return await fn();
        } finally {
            setBusy(false);
        }
    };

    const setStatus = (status: ManualTaskStatus, reason?: string) => run(async () => {
        const result = await ctl.act(() => tasksApi.setStatus(task.id, status, reason));
        return result !== null;
    });

    const openItems = Math.max(0, task.checklist.total - task.checklist.done);
    // Überfällig hält der Abschluss einmal an: die Gecikme açıklaması ist Pflicht.
    const complete = (delayReason?: string) => run(async () => {
        const result = await ctl.act(() => tasksApi.complete(task.id, delayReason));
        if (result) {
            setDialog(null);
            toast.success(t('tasksModule.detail.completed'));
        }
        return result !== null;
    });

    const entries: MenuEntry[] = [];
    if (permissions.canFlag) {
        entries.push({
            key: 'flag',
            label: task.flagged ? t('tasksModule.detail.unflag') : t('tasksModule.detail.flag'),
            icon: task.flagged ? <LuFlagOff size={15} /> : <LuFlag size={15} />,
            onSelect: () => void ctl.act(() => tasksApi.update(task.id, { flagged: !task.flagged }), { reload: false }),
        });
    }
    if (isManager) {
        if (entries.length) entries.push({ kind: 'separator', key: 'sep-status' });
        entries.push({ kind: 'caption', key: 'status-caption', label: t('tasksModule.detail.statusCaption') });
        for (const status of MANUAL_STATUSES) {
            entries.push({
                key: `status-${status}`,
                label: statusLabel(status),
                checked: task.status === status,
                onSelect: () => {
                    if (status === 'BLOCKED') setDialog('block');
                    else if (task.status !== status) void setStatus(status);
                },
            });
        }
        entries.push({ kind: 'separator', key: 'sep-copy' });
        entries.push({
            key: 'duplicate',
            label: t('tasksModule.detail.duplicate'),
            icon: <LuCopy size={15} />,
            onSelect: () => void run(async () => {
                try {
                    const envelope = await tasksApi.duplicate(task.id);
                    ctl.notify('task');
                    toast.success(t('tasksModule.detail.duplicated'));
                    navigate(`/tasks/${envelope.task.id}`);
                    return true;
                } catch (error) {
                    toast.error(tasksErrorMessage(error));
                    return false;
                }
            }),
        });
    }
    /* Löschen nur Admins; alle anderen Beteiligten beantragen es (13.09.2026). */
    if (permissions.canDelete) {
        entries.push({ kind: 'separator', key: 'sep-delete' });
        entries.push({
            key: 'delete',
            label: t('tasksModule.detail.delete'),
            icon: <LuTrash2 size={15} />,
            danger: true,
            onSelect: () => setDialog('delete'),
        });
    } else if (permissions.canRequestDelete) {
        entries.push({ kind: 'separator', key: 'sep-delete' });
        entries.push({
            key: 'delete-request',
            label: t('tasksModule.deleteRequest.action'),
            icon: <LuTrash2 size={15} />,
            danger: true,
            onSelect: () => setDialog('deleteRequest'),
        });
    } else if (permissions.canCancelDeleteRequest) {
        entries.push({ kind: 'separator', key: 'sep-delete' });
        entries.push({
            key: 'delete-request-cancel',
            label: t('tasksModule.deleteRequest.withdraw'),
            icon: <LuUndo2 size={15} />,
            onSelect: () => void ctl.act(() => tasksApi.cancelDeleteRequest(task.id)),
        });
    }

    return (
        <>
            {permissions.canTrack && <TimerButton taskId={task.id} running={task.timer.runningForMe} taskTitle={task.title} />}
            {permissions.canComplete && (
                <TaskButton
                    variant="primary"
                    icon={<LuCircleCheck size={14} />}
                    disabled={busy}
                    onClick={() => (isTaskLate(task, Date.now()) ? setDialog('delay') : void complete())}
                >
                    {t('tasksModule.detail.complete')}
                </TaskButton>
            )}
            {entries.length > 0 && (
                <TaskIconButton
                    label={t('tasksModule.detail.more')}
                    active={Boolean(menuAnchor)}
                    onClick={(event) => setMenuAnchor(menuAnchor ? null : event.currentTarget)}
                >
                    <LuEllipsis size={16} />
                </TaskIconButton>
            )}

            <PopoverMenu
                anchorEl={menuAnchor}
                onClose={() => setMenuAnchor(null)}
                entries={entries}
                width={230}
                label={t('tasksModule.detail.more')}
            />

            {/* Nur die ÜBERFÄLLIGE Aufgabe fragt vor dem Abschluss nach (15.09.2026). */}
            <ReasonDialog
                open={dialog === 'delay'}
                onClose={() => setDialog(null)}
                onConfirm={(text) => void complete(text)}
                title={t('tasksModule.delay.dialogTitle')}
                subtitle={task.title}
                label={t('tasksModule.delay.label')}
                confirmLabel={t('tasksModule.detail.complete')}
                note={(
                    <>
                        {t('tasksModule.delay.dialogCallout')}
                        {openItems > 0 && <div>{t('tasksModule.detail.openItems', { count: openItems })}</div>}
                    </>
                )}
                required
                busy={busy}
            />

            <ReasonDialog
                open={dialog === 'block'}
                onClose={() => setDialog(null)}
                title={t('tasksModule.detail.blockTitle')}
                label={t('tasksModule.detail.reason')}
                confirmLabel={t('tasksModule.detail.blockConfirm')}
                initialValue={task.blockReason ?? ''}
                required
                danger
                busy={busy}
                onConfirm={(reason) => void setStatus('BLOCKED', reason).then((ok) => { if (ok) setDialog(null); })}
            />

            <ReasonDialog
                open={dialog === 'deleteRequest'}
                onClose={() => setDialog(null)}
                title={t('tasksModule.deleteRequest.dialogTitle')}
                subtitle={t('tasksModule.deleteRequest.dialogHint')}
                label={t('tasksModule.deleteRequest.noteLabel')}
                confirmLabel={t('tasksModule.deleteRequest.send')}
                danger
                busy={busy}
                onConfirm={(note) => void run(async () => {
                    const result = await ctl.act(() => tasksApi.requestDelete(task.id, note || undefined));
                    if (result) {
                        setDialog(null);
                        toast.success(t('tasksModule.deleteRequest.sent'));
                    }
                    return result !== null;
                })}
            />

            <DangerConfirmDialog
                open={dialog === 'delete'}
                title={t('tasksModule.detail.deleteTitle')}
                message={t('tasksModule.detail.deleteMessage', { title: task.title })}
                confirmLabel={t('tasksModule.detail.delete')}
                requirePassword={false}
                busy={busy}
                onCancel={() => setDialog(null)}
                onConfirm={() => void run(async () => {
                    try {
                        await tasksApi.remove(task.id);
                        setDialog(null);
                        ctl.notify('task');
                        toast.success(t('tasksModule.detail.deleted'));
                        navigate('/tasks', { replace: true });
                        return true;
                    } catch (error) {
                        toast.error(tasksErrorMessage(error));
                        return false;
                    }
                })}
            />
        </>
    );
};
