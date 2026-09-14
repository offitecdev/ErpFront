import { Link, useNavigate } from 'react-router-dom';
import { LuMessageSquare, LuPlus } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { ChatRoomRef } from '@/types/tasksModule';
import { TaskButton } from '../shared/TaskButton';

/**
 * «Sohbet»: Räume, die mit dieser Aufgabe verknüpft sind (nur die, in denen
 * man selbst Mitglied ist — der Server filtert). Die Leitung öffnet von hier
 * einen neuen Raum; die Chatseite übernimmt Name und Verknüpfung aus der
 * Adresse (`?newRoomTask=`).
 */
export const RailChatCard = ({ taskId, rooms, canCreate }: { taskId: string; rooms: ChatRoomRef[]; canCreate: boolean }) => {
    const navigate = useNavigate();
    if (!rooms.length && !canCreate) return null;

    return (
        <section className="ofi-gv-panel ofi-gv-detail-card">
            <header className="ofi-gv-panel__head">
                <LuMessageSquare size={14} className="ofi-gv-muted" />
                <span>{t('tasksModule.detail.chat.title')}</span>
            </header>
            <div className="ofi-gv-panel__body ofi-gv-detail-rooms">
                {rooms.length ? rooms.map((room) => (
                    <Link key={room.id} to={`/tasks/chat/${room.id}`} className="ofi-gv-detail-room">
                        <LuMessageSquare size={13} />
                        <span className="truncate">{room.name}</span>
                    </Link>
                )) : (
                    <div className="ofi-gv-caption">{t('tasksModule.detail.chat.empty')}</div>
                )}
                {canCreate && (
                    <TaskButton
                        icon={<LuPlus size={14} />}
                        className="ofi-gv-detail-rooms__add"
                        onClick={() => navigate(`/tasks/chat?newRoomTask=${encodeURIComponent(taskId)}`)}
                    >
                        {t('tasksModule.detail.chat.open')}
                    </TaskButton>
                )}
            </div>
        </section>
    );
};
