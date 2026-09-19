import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { DangerConfirmDialog } from '@/components/ui-shared/DangerConfirmDialog';
import { SkeletonBar } from '@/components/ui-shared/Loader';
import { PopupActions, PopupButton, PopupDialog, PopupNote } from '@/components/ui-shared/PopupKit';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { Switch } from '@/components/ui-shared/Switch';
import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { PeopleMap, TaskDetail, TaskEnvelope } from '@/types/tasksModule';
import { useIsTasksAdmin, useTasksActorId, useTasksModuleStore } from '../../store/tasksModuleStore';
import { emitTasksChanged } from '../../utils/taskEvents';
import { isoToTimeInput, priorityLabel } from '../../utils/taskFormat';
import { DateTimeField } from '../shared/DateTimeField';
import {
    TASK_PRIORITIES,
    draftFromTask,
    dueBeforeStart,
    emptyDraft,
    sameIdSet,
    scalarPatch,
    type TaskDraft,
} from './taskDraft';
import { AssigneeChips, LabelChips, SheetRow } from './TaskSheetFields';

/**
 * «Yeni görev» / «Görevi düzenle» (Görevly `V.taskSheet`) als Mac-Blatt.
 * Neu legt an und öffnet die Aufgabe; Bearbeiten lädt die Aufgabe (die Zeile
 * der Liste kennt die Beschreibung nicht) und sendet nur, was sich geändert
 * hat: Felder, Etiketten, Personen — in dieser Reihenfolge.
 * Ohne Administratorrolle entsteht ein Görev-Talep («wartet auf Freigabe»): der
 * gelbe Hinweis warnt, noch nicht damit zu beginnen, und der Administrator
 * entscheidet «uygun / uygun değil» in «Onaylar». Wer anlegt, ist immer selbst
 * verantwortlich (fester Chip «Siz»); weitere Personen wählt die Leitung.
 */
export const TaskSheet = ({
    open,
    taskId,
    onClose,
    onCreated,
    onSaved,
    onDeleted,
}: {
    open: boolean;
    /** Gesetzt = Bearbeiten. */
    taskId: string | null;
    onClose: () => void;
    onCreated: (task: TaskDetail) => void;
    onSaved: (envelope: TaskEnvelope) => void;
    onDeleted: (taskId: string) => void;
}) => {
    // Sofort freigegeben ist nur, was die Administratorrolle anlegt — alles andere ist ein Görev-Talep.
    const isAdmin = useIsTasksAdmin();
    const me = useTasksActorId();
    const canDelete = useTasksModuleStore((state) => Boolean(state.bootstrap?.actor.canDelete));
    const serverOffsetMs = useTasksModuleStore((state) => state.serverOffsetMs);
    const refreshSummary = useTasksModuleStore((state) => state.refreshSummary);

    const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft(Date.now()));
    const [original, setOriginal] = useState<TaskDetail | null>(null);
    const [people, setPeople] = useState<PeopleMap>({});
    const [canEdit, setCanEdit] = useState(true);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showErrors, setShowErrors] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const titleRef = useRef<HTMLInputElement>(null);

    // Der Aufrufer reicht `onClose` meist als neue Funktion — das Laden soll davon nicht neu starten.
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; });

    useEffect(() => {
        if (!open) return undefined;
        setShowErrors(false);
        setConfirmDelete(false);
        setOriginal(null);
        setPeople({});
        setCanEdit(true);
        if (!taskId) {
            // Versatz direkt aus dem Store: ein neuer Wert darf den Entwurf nicht zurücksetzen.
            setDraft(emptyDraft(Date.now() + useTasksModuleStore.getState().serverOffsetMs));
            return undefined;
        }
        let cancelled = false;
        setLoading(true);
        tasksApi.detail(taskId)
            .then((result) => {
                if (cancelled) return;
                setOriginal(result.task);
                setPeople(result.people);
                setCanEdit(result.permissions.canEdit);
                setDraft(draftFromTask(result.task));
            })
            .catch((error) => {
                if (cancelled) return;
                toast.error(tasksErrorMessage(error));
                onCloseRef.current();
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, taskId]);

    /* Escape selbst geführt: steht ein Menü des Fensters offen (Person,
       Etikett, Datum, Priorität) oder die Löschfrage, schliesst nur DAS —
       der Entwurf geht nicht mit verloren. */
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || confirmDelete) return;
            if (document.querySelector('.ofi-quick-pop')) return;
            onCloseRef.current();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, confirmDelete]);

    const editing = Boolean(taskId);
    const nowMs = Date.now() + serverOffsetMs;
    const patch = (next: Partial<TaskDraft>) => setDraft((current) => ({ ...current, ...next }));
    const titleMissing = !draft.title.trim();
    const dueError = dueBeforeStart(draft);
    const readOnly = editing && (loading || !canEdit);

    const create = async (title: string) => {
        const envelope = await tasksApi.create({
            title,
            description: draft.description.trim() || null,
            // Die eigene Person trägt der Server immer ein; nur die Administratorrolle weist weitere zu (15.09.2026).
            assigneeIds: isAdmin ? draft.assigneeIds.filter((id) => id !== me) : undefined,
            startAt: draft.startAt,
            dueAt: draft.dueAt,
            reminderAt: draft.reminderAt,
            labelIds: draft.labelIds,
            priority: draft.priority,
            flagged: draft.flagged,
        });
        emitTasksChanged('task', envelope.task.id);
        void refreshSummary();
        onCreated(envelope.task);
    };

    const update = async (base: TaskDetail, title: string) => {
        let current = base;
        let latest: TaskEnvelope | null = null;
        try {
            const fields = scalarPatch({ ...draft, title }, current);
            if (Object.keys(fields).length) {
                latest = await tasksApi.update(current.id, fields);
                current = latest.task;
            }
            if (!sameIdSet(draft.labelIds, current.labelIds)) {
                latest = await tasksApi.setLabels(current.id, draft.labelIds);
                current = latest.task;
            }
            if (isAdmin && !sameIdSet(draft.assigneeIds, current.assigneeIds)) {
                latest = await tasksApi.setAssignees(current.id, draft.assigneeIds);
                current = latest.task;
            }
        } finally {
            // Schlägt ein Schritt fehl, sendet der nächste Versuch nur noch den Rest.
            setOriginal(current);
        }
        if (!latest) {
            onClose();
            return;
        }
        emitTasksChanged('task', current.id);
        void refreshSummary();
        toast.success(t('tasksModule.list.toast.saved'));
        onSaved(latest);
    };

    const save = async () => {
        setShowErrors(true);
        const title = draft.title.trim();
        if (!title) {
            titleRef.current?.focus();
            return;
        }
        if (dueError || saving || readOnly) return;
        setSaving(true);
        try {
            if (original) await update(original, title);
            else await create(title);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!original) return;
        setDeleting(true);
        try {
            await tasksApi.remove(original.id);
            emitTasksChanged('task', original.id);
            void refreshSummary();
            toast.success(t('tasksModule.list.toast.deleted'));
            setConfirmDelete(false);
            onDeleted(original.id);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setDeleting(false);
        }
    };

    const footer = (
        <PopupActions
            start={editing && canDelete && original ? (
                <PopupButton variant="danger" disabled={saving} onClick={() => setConfirmDelete(true)}>
                    {t('common.delete')}
                </PopupButton>
            ) : undefined}
        >
            <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
            <PopupButton variant="primary" loading={saving} disabled={readOnly || dueError} onClick={() => void save()}>
                {editing ? t('common.save') : t('tasksModule.list.sheet.create')}
            </PopupButton>
        </PopupActions>
    );

    return (
        <>
            <PopupDialog
                open={open}
                onClose={onClose}
                // Auch ohne Leitungsrecht heisst es «Yeni görev» (14.09.2026, Samet) — der Hinweis unten sagt, dass die Freigabe fehlt.
                title={editing ? t('tasksModule.list.sheet.editTitle') : t('tasksModule.list.sheet.createTitle')}
                width={560}
                closeOnBackdrop={false}
                closeOnEscape={false}
                footer={footer}
            >
                {editing && loading ? (
                    <div className="ofi-gv-list-sheet" aria-busy>
                        {[70, 90, 55, 80].map((width) => (
                            <SkeletonBar key={width} width={`${width}%`} className="ofi-gv-list-sheet__skeleton" />
                        ))}
                    </div>
                ) : (
                    <div className="ofi-gv-list-sheet">
                        {editing && !canEdit && <PopupNote tone="warning">{t('tasksModule.errors.TASK_EDIT_FORBIDDEN')}</PopupNote>}

                        <SheetRow
                            label={t('tasksModule.list.sheet.title')}
                            required
                            error={showErrors && titleMissing ? t('tasksModule.list.sheet.titleRequired') : null}
                        >
                            <input
                                ref={titleRef}
                                autoFocus
                                value={draft.title}
                                maxLength={200}
                                placeholder={t('tasksModule.list.sheet.titlePlaceholder')}
                                aria-label={t('tasksModule.list.sheet.title')}
                                className="ofi-cal-input w-full"
                                onChange={(event) => patch({ title: event.target.value })}
                                onKeyDown={(event) => {
                                    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                                    event.preventDefault();
                                    void save();
                                }}
                            />
                        </SheetRow>

                        <SheetRow label={t('tasksModule.list.sheet.description')}>
                            <textarea
                                rows={3}
                                value={draft.description}
                                maxLength={5000}
                                placeholder={t('tasksModule.list.sheet.descriptionPlaceholder')}
                                aria-label={t('tasksModule.list.sheet.description')}
                                className="ofi-cal-input w-full resize-y"
                                onChange={(event) => patch({ description: event.target.value })}
                            />
                        </SheetRow>

                        {/* Neu: die eigene Person steht fest drin (der Server trägt sie immer ein,
                            14.09.2026) — die Leitung wählt weitere dazu, ein Teammitglied sieht nur sich. */}
                        {(isAdmin || !editing) && (
                            <SheetRow label={t('tasksModule.list.sheet.assignees')}>
                                <AssigneeChips
                                    ids={draft.assigneeIds}
                                    people={people}
                                    onChange={(assigneeIds) => patch({ assigneeIds })}
                                    selfId={editing ? undefined : me || undefined}
                                    canPick={isAdmin}
                                />
                            </SheetRow>
                        )}

                        <SheetRow label={t('tasksModule.list.sheet.start')}>
                            <DateTimeField
                                value={draft.startAt}
                                onChange={(startAt) => patch({ startAt })}
                                label={t('tasksModule.list.sheet.start')}
                                defaultTime={isoToTimeInput(new Date(nowMs).toISOString())}
                            />
                        </SheetRow>

                        <SheetRow label={t('tasksModule.list.sheet.due')} error={dueError ? t('tasksModule.errors.DUE_BEFORE_START') : null}>
                            <DateTimeField value={draft.dueAt} onChange={(dueAt) => patch({ dueAt })} label={t('tasksModule.list.sheet.due')} />
                        </SheetRow>

                        <SheetRow label={t('tasksModule.list.sheet.reminder')}>
                            <DateTimeField value={draft.reminderAt} onChange={(reminderAt) => patch({ reminderAt })} label={t('tasksModule.list.sheet.reminder')} />
                        </SheetRow>

                        <SheetRow label={t('tasksModule.list.sheet.labels')}>
                            <LabelChips ids={draft.labelIds} onChange={(labelIds) => patch({ labelIds })} />
                        </SheetRow>

                        <SheetRow label={t('tasksModule.list.sheet.priority')}>
                            <SelectMenu
                                panelClassName="ofi-gv-select"
                                value={draft.priority}
                                options={TASK_PRIORITIES.map((priority) => ({ value: priority, label: priorityLabel(priority) }))}
                                onChange={(priority) => patch({ priority: priority as TaskDraft['priority'] })}
                                ariaLabel={t('tasksModule.list.sheet.priority')}
                                className="ofi-gv-list-sheet__priority"
                                listWidth={180}
                            />
                        </SheetRow>

                        <SheetRow label={t('tasksModule.list.sheet.flag')}>
                            <div className="ofi-gv-list-sheet__inline">
                                <Switch checked={draft.flagged} onChange={(flagged) => patch({ flagged })} label={t('tasksModule.list.sheet.flag')} />
                            </div>
                        </SheetRow>
                    </div>
                )}
            </PopupDialog>

            <DangerConfirmDialog
                open={confirmDelete}
                title={t('tasksModule.list.delete.title')}
                message={original?.title}
                confirmLabel={t('common.delete')}
                requirePassword={false}
                busy={deleting}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => void remove()}
            />
        </>
    );
};
