import { useEffect, useMemo, useRef, useState } from 'react';
import { LuPlus, LuUserPlus, LuX } from 'react-icons/lu';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { RoomDetail, TaskStatus } from '@/types/tasksModule';
import { useChatTaskSearch } from '../../hooks/useChatTaskSearch';
import { useTasksActorId, useTasksModuleStore } from '../../store/tasksModuleStore';
import { emitTasksChanged } from '../../utils/taskEvents';
import { statusTone } from '../../utils/taskFormat';
import { PeoplePicker } from '../shared/PeoplePicker';
import { truncateText } from './chatFormat';

const NAME_MAX = 80;

interface PickedTask {
    id: string;
    title: string;
    status: TaskStatus;
}

/**
 * «Yeni oda» (Leitung): Name, Teilnehmende, verknüpfte Aufgaben. Man selbst
 * gehört automatisch dazu (der Server trägt die anlegende Person ein).
 * `prefillTaskId` — aus der Aufgabe heraus geöffnet («Oda aç»): die Aufgabe ist
 * schon verknüpft und ihr Titel steht als Raumname da.
 */
export const NewRoomDialog = ({
    open,
    prefillTaskId,
    onClose,
    onCreated,
}: {
    open: boolean;
    prefillTaskId: string | null;
    onClose: () => void;
    onCreated: (room: RoomDetail) => void;
}) => {
    const me = useTasksActorId();
    const directory = useTasksModuleStore((state) => state.directory);
    const loadDirectory = useTasksModuleStore((state) => state.loadDirectory);

    const [name, setName] = useState('');
    const [memberIds, setMemberIds] = useState<string[]>([]);
    const [tasks, setTasks] = useState<PickedTask[]>([]);
    const [taskQuery, setTaskQuery] = useState('');
    const [peopleAnchor, setPeopleAnchor] = useState<HTMLElement | null>(null);
    const [busy, setBusy] = useState(false);
    const nameTouched = useRef(false);

    const { hits, loading } = useChatTaskSearch(taskQuery, open);

    // Jedes Öffnen beginnt leer.
    useEffect(() => {
        if (!open) return;
        setName('');
        setMemberIds([]);
        setTasks([]);
        setTaskQuery('');
        setPeopleAnchor(null);
        nameTouched.current = false;
        void loadDirectory();
    }, [open, loadDirectory]);

    // Aus einer Aufgabe geöffnet: Titel holen, verknüpfen, als Namen vorschlagen.
    useEffect(() => {
        if (!open || !prefillTaskId) return undefined;
        let cancelled = false;
        tasksApi.detail(prefillTaskId)
            .then(({ task }) => {
                if (cancelled) return;
                setTasks((previous) => (previous.some((entry) => entry.id === task.id)
                    ? previous
                    : [...previous, { id: task.id, title: task.title, status: task.status }]));
                if (!nameTouched.current) setName(task.title.slice(0, NAME_MAX));
            })
            .catch((error: unknown) => { if (!cancelled) toast.error(tasksErrorMessage(error)); });
        return () => { cancelled = true; };
    }, [open, prefillTaskId]);

    const directoryNames = useMemo(
        () => new Map((directory ?? []).map((person) => [person.id, person.name])),
        [directory],
    );

    const taskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
    const suggestions = hits.filter((hit) => !taskIds.has(hit.id));

    const trimmed = name.trim();
    const blocked = busy || !trimmed;

    const create = async () => {
        if (blocked) return;
        setBusy(true);
        try {
            const room = await tasksApi.createRoom({ name: trimmed, memberIds, taskIds: tasks.map((task) => task.id) });
            toast.success(t('tasksModule.chat.newRoom.created'));
            emitTasksChanged('chat');
            onCreated(room);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            title={t('tasksModule.chat.newRoom.title')}
            width={520}
            closeOnBackdrop={false}
            // Solange die Personenauswahl offen ist, gehört Escape ihr.
            closeOnEscape={!peopleAnchor}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose} disabled={busy}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={busy} disabled={blocked} onClick={() => void create()}>
                        {t('tasksModule.chat.newRoom.create')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="flex flex-col gap-3">
                <PopupField label={t('tasksModule.chat.newRoom.name')} required>
                    <input
                        autoFocus
                        value={name}
                        maxLength={NAME_MAX}
                        placeholder={t('tasksModule.chat.newRoom.namePlaceholder')}
                        onChange={(event) => {
                            nameTouched.current = true;
                            setName(event.target.value);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void create();
                            }
                        }}
                        className="ofi-cal-input w-full"
                    />
                </PopupField>

                <PopupField label={t('tasksModule.chat.newRoom.members')}>
                    <div className="ofi-gv-chat-chips">
                        {memberIds.map((id) => {
                            const personLabel = directoryNames.get(id) ?? t('tasksModule.common.unknownPerson');
                            return (
                                <span key={id} className="ofi-gv-chat-chip">
                                    <span className="ofi-gv-chat-chip__label">{personLabel}</span>
                                    <button
                                        type="button"
                                        className="ofi-gv-chat-chip__remove ofi-btn-plain"
                                        aria-label={t('tasksModule.chat.newRoom.removeMember', { name: personLabel })}
                                        onClick={() => setMemberIds((previous) => previous.filter((value) => value !== id))}
                                    >
                                        <LuX size={11} />
                                    </button>
                                </span>
                            );
                        })}
                        <button
                            type="button"
                            className="ofi-gv-add ofi-btn-plain"
                            onClick={(event) => setPeopleAnchor(peopleAnchor ? null : event.currentTarget)}
                        >
                            <LuUserPlus size={12} aria-hidden />
                            {t('tasksModule.chat.newRoom.addMember')}
                        </button>
                    </div>
                    <PopupNote className="mt-2">{t('tasksModule.chat.newRoom.youIncluded')}</PopupNote>
                </PopupField>

                <PopupField label={t('tasksModule.chat.newRoom.tasks')} hint={t('tasksModule.chat.newRoom.tasksHint')}>
                    {tasks.length > 0 && (
                        <div className="ofi-gv-chat-chips mb-2">
                            {tasks.map((task) => (
                                <span key={task.id} className="ofi-gv-chat-chip" title={task.title}>
                                    <i className={`ofi-gv-chat-dot is-${statusTone(task.status)}`} aria-hidden />
                                    <span className="ofi-gv-chat-chip__label">{truncateText(task.title, 32)}</span>
                                    <button
                                        type="button"
                                        className="ofi-gv-chat-chip__remove ofi-btn-plain"
                                        aria-label={t('tasksModule.chat.newRoom.removeTask', { title: task.title })}
                                        onClick={() => setTasks((previous) => previous.filter((entry) => entry.id !== task.id))}
                                    >
                                        <LuX size={11} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <input
                        type="search"
                        value={taskQuery}
                        onChange={(event) => setTaskQuery(event.target.value)}
                        placeholder={t('tasksModule.chat.newRoom.taskSearch')}
                        aria-label={t('tasksModule.chat.newRoom.taskSearch')}
                        className="ofi-cal-input w-full"
                    />
                    <div className="ofi-gv-chat-results" role="listbox">
                        {!suggestions.length && (
                            <div className="ofi-gv-picker__hint px-2 py-2">
                                {loading ? t('common.loading') : t('tasksModule.chat.newRoom.noTasks')}
                            </div>
                        )}
                        {suggestions.map((hit) => (
                            <button
                                key={hit.id}
                                type="button"
                                role="option"
                                aria-selected={false}
                                className="ofi-option-row ofi-gv-picker__row"
                                onClick={() => setTasks((previous) => [...previous, { id: hit.id, title: hit.title, status: hit.status }])}
                            >
                                <i className={`ofi-gv-chat-dot is-${statusTone(hit.status)}`} aria-hidden />
                                <span className="ofi-gv-picker__name" title={hit.title}>{hit.title}</span>
                                <LuPlus size={13} aria-hidden className="ofi-gv-chat-results__add" />
                            </button>
                        ))}
                    </div>
                </PopupField>
            </div>

            <PeoplePicker
                anchorEl={peopleAnchor}
                onClose={() => setPeopleAnchor(null)}
                selected={memberIds}
                onChange={setMemberIds}
                multiple
                excludeIds={me ? [me] : undefined}
            />
        </PopupDialog>
    );
};
