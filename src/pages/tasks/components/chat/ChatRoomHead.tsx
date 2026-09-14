import { useMemo, useState } from 'react';
import { LuArrowLeft, LuEllipsis, LuLink, LuUserPlus } from 'react-icons/lu';

import { DangerConfirmDialog } from '@/components/ui-shared/DangerConfirmDialog';
import { SkeletonBar } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import type { PeopleMap } from '@/types/tasksModule';
import type { ChatRoomApi } from '../../hooks/useChatRoom';
import { TaskIconButton } from '../shared/TaskButton';
import { PeopleNames } from '../shared/TaskMarks';
import { PeoplePicker } from '../shared/PeoplePicker';
import { ChatMembersCard } from './ChatMembersCard';
import { ChatRenameDialog } from './ChatRenameDialog';
import { ChatRoomMenu } from './ChatRoomMenu';
import { ChatRoomTile } from './ChatRoomTile';
import { ChatTaskLinkPicker } from './ChatTaskLinkPicker';

/**
 * Kopf des offenen Raums: Kachel, Name, «N katılımcı · M ilişkili görev», die
 * ersten vier Avatare. Die Leitung hat daneben «Kişiler» (Mitglieder sofort
 * hinzufügen/entfernen) und «Görev bağla»; das ⋯ zeigt allen die
 * Teilnehmenden und der Leitung Umbenennen und Löschen.
 */
export const ChatRoomHead = ({
    room,
    fallbackName,
    people,
    me,
    canManage,
    compact,
    onBack,
    onDeleted,
}: {
    room: ChatRoomApi;
    fallbackName: string;
    people: PeopleMap;
    me: string;
    canManage: boolean;
    compact: boolean;
    onBack: () => void;
    onDeleted: () => void;
}) => {
    const [peopleAnchor, setPeopleAnchor] = useState<HTMLElement | null>(null);
    const [linkAnchor, setLinkAnchor] = useState<HTMLElement | null>(null);
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const [membersOpen, setMembersOpen] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);

    const detail = room.detail;
    const name = detail?.room.name ?? fallbackName;
    const memberIds = useMemo(() => detail?.members.map((member) => member.employeeId) ?? [], [detail]);
    const taskCount = detail?.tasks.length ?? 0;

    const toggleMembers = (next: string[]) => {
        if (room.busy) return;
        const added = next.find((id) => !memberIds.includes(id));
        const removed = memberIds.find((id) => !next.includes(id));
        if (added) void room.addMember(added);
        else if (removed) void room.removeMember(removed);
    };

    const caption = detail
        ? [
            t('tasksModule.chat.head.members', { count: memberIds.length }),
            taskCount ? t('tasksModule.chat.head.tasks', { count: taskCount }) : '',
        ].filter(Boolean).join(' · ')
        : '';

    return (
        <header className="ofi-gv-chat-head">
            {compact && (
                <TaskIconButton label={t('tasksModule.chat.head.back')} onClick={onBack}>
                    <LuArrowLeft size={16} />
                </TaskIconButton>
            )}
            <ChatRoomTile name={name || ' '} size="sm" />
            <div className="ofi-gv-chat-head__main">
                <h2 className="ofi-gv-chat-head__name" title={name}>
                    {name || <SkeletonBar width="140px" className="ofi-gv-chat-skeleton-line" />}
                </h2>
                <div className="ofi-gv-chat-head__caption">
                    {detail ? caption : <SkeletonBar width="110px" className="ofi-gv-chat-skeleton-line" />}
                </div>
            </div>

            {detail && (
                <div className="ofi-gv-chat-head__tools">
                    <span className="ofi-gv-chat-head__avatars">
                        <PeopleNames ids={memberIds} people={people} max={3} />
                    </span>
                    {canManage && (
                        <>
                            <TaskIconButton
                                label={t('tasksModule.chat.head.people')}
                                active={Boolean(peopleAnchor)}
                                onClick={(event) => setPeopleAnchor(peopleAnchor ? null : event.currentTarget)}
                            >
                                <LuUserPlus size={15} />
                            </TaskIconButton>
                            <TaskIconButton
                                label={t('tasksModule.chat.head.linkTask')}
                                active={Boolean(linkAnchor)}
                                onClick={(event) => setLinkAnchor(linkAnchor ? null : event.currentTarget)}
                            >
                                <LuLink size={15} />
                            </TaskIconButton>
                        </>
                    )}
                    <TaskIconButton
                        label={t('tasksModule.chat.head.more')}
                        active={Boolean(menuAnchor)}
                        onClick={(event) => setMenuAnchor(menuAnchor ? null : event.currentTarget)}
                    >
                        <LuEllipsis size={16} />
                    </TaskIconButton>
                </div>
            )}

            {canManage && detail && (
                <>
                    <PeoplePicker
                        anchorEl={peopleAnchor}
                        onClose={() => setPeopleAnchor(null)}
                        selected={memberIds}
                        onChange={toggleMembers}
                        multiple
                        excludeIds={me ? [me] : undefined}
                    />
                    <ChatTaskLinkPicker
                        anchorEl={linkAnchor}
                        onClose={() => setLinkAnchor(null)}
                        linked={detail.tasks}
                        busy={room.busy}
                        onToggle={(taskId, link) => { void (link ? room.linkTask(taskId) : room.unlinkTask(taskId)); }}
                    />
                    <ChatRenameDialog
                        open={renameOpen}
                        name={detail.room.name}
                        busy={room.busy}
                        onClose={() => setRenameOpen(false)}
                        onSave={(nextName) => {
                            void room.rename(nextName).then((saved) => { if (saved) setRenameOpen(false); });
                        }}
                    />
                    <DangerConfirmDialog
                        open={deleteOpen}
                        title={t('tasksModule.chat.delete.title')}
                        message={t('tasksModule.chat.delete.message', { name: detail.room.name })}
                        confirmLabel={t('tasksModule.chat.delete.confirm')}
                        busy={room.busy}
                        requirePassword={false}
                        onCancel={() => setDeleteOpen(false)}
                        onConfirm={() => {
                            void room.remove().then((deleted) => {
                                if (!deleted) return;
                                setDeleteOpen(false);
                                onDeleted();
                            });
                        }}
                    />
                </>
            )}

            <ChatRoomMenu
                anchorEl={menuAnchor}
                onClose={() => setMenuAnchor(null)}
                canManage={canManage}
                onMembers={() => setMembersOpen(true)}
                onRename={() => setRenameOpen(true)}
                onDelete={() => setDeleteOpen(true)}
            />
            {detail && (
                <ChatMembersCard
                    open={membersOpen}
                    onClose={() => setMembersOpen(false)}
                    members={detail.members}
                    people={people}
                    me={me}
                />
            )}
        </header>
    );
};
