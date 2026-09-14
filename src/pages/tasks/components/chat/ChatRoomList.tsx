import { useMemo, useState } from 'react';
import { LuSearch, LuX } from 'react-icons/lu';

import { SkeletonBar } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksErrorMessage } from '@/lib/api/tasksModule';
import type { ChatRoomListItem, PeopleMap } from '@/types/tasksModule';
import { useNow } from '../../hooks/useNow';
import { localeTag } from '../../utils/taskFormat';
import { ChatRoomRow } from './ChatRoomRow';

/**
 * Linke Spalte: ein kleines Suchfeld (filtert nur die geladenen Namen) und die
 * Räume. Die Zeiten laufen im Minutentakt.
 */
export const ChatRoomList = ({
    rooms,
    people,
    me,
    activeRoomId,
    error,
    onRetry,
}: {
    rooms: ChatRoomListItem[] | null;
    people: PeopleMap;
    me: string;
    activeRoomId: string | undefined;
    error: unknown;
    onRetry: () => void;
}) => {
    const [query, setQuery] = useState('');
    const nowMs = useNow(60_000);
    const language = localeTag();

    const shown = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        if (!rooms || !needle) return rooms;
        return rooms.filter((room) => room.name.toLocaleLowerCase().includes(needle));
    }, [rooms, query]);

    return (
        <aside className="ofi-gv-chat__rooms" aria-label={t('tasksModule.chat.list.label')}>
            <div className="ofi-gv-chat-search">
                <LuSearch size={13} className="ofi-gv-chat-search__icon" aria-hidden />
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('tasksModule.chat.list.search')}
                    aria-label={t('tasksModule.chat.list.search')}
                    className="ofi-gv-chat-search__input"
                />
                {query && (
                    <button
                        type="button"
                        className="ofi-gv-chat-search__clear ofi-btn-plain"
                        aria-label={t('tasksModule.common.clear')}
                        onClick={() => setQuery('')}
                    >
                        <LuX size={12} />
                    </button>
                )}
            </div>

            <div className="ofi-gv-chat__roomlist">
                {rooms === null && !error && (
                    <div className="flex flex-col gap-3 p-3" role="status" aria-label={t('common.loading')}>
                        {[0, 1, 2, 3].map((row) => (
                            <div key={row} className="flex items-center gap-2.5">
                                <SkeletonBar width="36px" className="ofi-gv-chat-skeleton-tile" delayMs={row * 90} />
                                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                    <SkeletonBar width="62%" className="ofi-gv-chat-skeleton-line" delayMs={row * 90} />
                                    <SkeletonBar width="84%" className="ofi-gv-chat-skeleton-line" delayMs={row * 90 + 45} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {rooms === null && Boolean(error) && (
                    <div className="ofi-gv-chat-listnote">
                        <div>{tasksErrorMessage(error, 'tasksModule.chat.list.loadFailed')}</div>
                        <button type="button" className="ofi-gv-chat-linkbtn ofi-btn-plain" onClick={onRetry}>
                            {t('tasksModule.chat.retry')}
                        </button>
                    </div>
                )}

                {rooms !== null && !rooms.length && (
                    <div className="ofi-gv-chat-listnote">{t('tasksModule.chat.list.empty')}</div>
                )}

                {rooms !== null && rooms.length > 0 && shown && !shown.length && (
                    <div className="ofi-gv-chat-listnote">{t('tasksModule.chat.list.noMatch')}</div>
                )}

                {shown?.map((room) => (
                    <ChatRoomRow
                        key={room.id}
                        room={room}
                        people={people}
                        me={me}
                        active={room.id === activeRoomId}
                        nowMs={nowMs}
                        lang={language}
                    />
                ))}
            </div>
        </aside>
    );
};
