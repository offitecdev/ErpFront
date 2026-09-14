import { useEffect, useMemo } from 'react';

import { PopupCard } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { ChatMember, PeopleMap } from '@/types/tasksModule';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { personName } from '../../utils/taskFormat';

/**
 * Die Teilnehmenden eines Raums — ein schwebendes Lesefenster. Die Rolle
 * («Yönetici») kommt aus dem Personalverzeichnis des Moduls.
 */
export const ChatMembersCard = ({
    open,
    onClose,
    members,
    people,
    me,
}: {
    open: boolean;
    onClose: () => void;
    members: ChatMember[];
    people: PeopleMap;
    me: string;
}) => {
    const directory = useTasksModuleStore((state) => state.directory);
    const loadDirectory = useTasksModuleStore((state) => state.loadDirectory);

    useEffect(() => { if (open) void loadDirectory(); }, [open, loadDirectory]);

    const roleNames = useMemo(
        () => new Map((directory ?? []).map((person) => [person.id, person.roleName])),
        [directory],
    );

    const sorted = useMemo(
        () => [...members].sort((a, b) => personName(people, a.employeeId).localeCompare(personName(people, b.employeeId))),
        [members, people],
    );

    return (
        <PopupCard
            open={open}
            onClose={onClose}
            title={t('tasksModule.chat.members.title')}
            subtitle={t('tasksModule.chat.head.members', { count: members.length })}
            width={340}
            closeOnOutside
        >
            <ul className="ofi-gv-chat-members">
                {sorted.map((member) => {
                    const name = personName(people, member.employeeId);
                    const title = people[member.employeeId]?.title;
                    return (
                        <li key={member.employeeId} className="ofi-gv-chat-members__row">
                            <span className="ofi-gv-chat-members__main">
                                <span className="ofi-gv-chat-members__name">{name}</span>
                                {title && <span className="ofi-gv-chat-members__title">{title}</span>}
                            </span>
                            {member.employeeId === me && <span className="ofi-gv-chat-members__tag">{t('tasksModule.chat.members.you')}</span>}
                            {roleNames.get(member.employeeId) && <span className="ofi-gv-chat-members__tag">{roleNames.get(member.employeeId)}</span>}
                        </li>
                    );
                })}
            </ul>
        </PopupCard>
    );
};
