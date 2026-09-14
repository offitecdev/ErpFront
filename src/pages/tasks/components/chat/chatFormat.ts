import { t } from '@/i18n/translate';
import type { ChatMessage, ChatRoomListItem, PeopleMap } from '@/types/tasksModule';
import { personName, smartDate } from '../../utils/taskFormat';

/**
 * ── SOHBET: ANZEIGE-HILFEN ───────────────────────────────────────────────────
 *
 * Systemnachrichten stehen in der Sprache der Leserin: der Satz kommt aus
 * `meta.event`, die Namen aus der Personenkarte. `text` des Servers ist nur
 * das deutsche Rückfallnetz für unbekannte Ereignisse.
 */

/** Nachrichten derselben Person innerhalb dieses Abstands bilden eine Gruppe. */
export const GROUP_WINDOW_MS = 5 * 60_000;

export const MAX_CHAT_FILES = 10;
export const MAX_CHAT_FILE_BYTES = 12 * 1024 * 1024;

/** Zwei Buchstaben für die Raumkachel: «Web Yenileme» → «WY», «Montage» → «MO». */
export const roomInitials = (name: string): string => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '·';
    const letters = words.length > 1
        ? `${Array.from(words[0])[0] ?? ''}${Array.from(words[1])[0] ?? ''}`
        : Array.from(words[0]).slice(0, 2).join('');
    return letters.toLocaleUpperCase();
};

export const firstName = (people: PeopleMap | undefined, id: string | null | undefined): string => {
    if (!id) return '';
    return people?.[id]?.firstName || personName(people, id);
};

export const truncateText = (text: string, max: number): string => {
    const chars = Array.from(text);
    return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text;
};

export const systemMessageText = (
    meta: ChatMessage['meta'],
    fallback: string,
    people: PeopleMap | undefined,
): string => {
    const actor = personName(people, meta?.actorId) || t('tasksModule.common.unknownPerson');
    const target = personName(people, meta?.targetId) || t('tasksModule.common.unknownPerson');
    switch (meta?.event) {
        case 'ROOM_CREATED':
            return t('tasksModule.chat.system.ROOM_CREATED', { actor });
        case 'MEMBER_ADDED':
            return t('tasksModule.chat.system.MEMBER_ADDED', { actor, target });
        case 'MEMBER_REMOVED':
            return t('tasksModule.chat.system.MEMBER_REMOVED', { actor, target });
        case 'TASK_LINKED':
            return t('tasksModule.chat.system.TASK_LINKED', { actor, task: meta.taskTitle || '' });
        default:
            return fallback;
    }
};

/** Vorschauzeile der Raumliste. */
export const roomPreview = (room: ChatRoomListItem, people: PeopleMap, me: string): string => {
    const last = room.lastMessage;
    if (!last) return t('tasksModule.chat.list.noMessages');
    if (last.type === 'SYSTEM') return systemMessageText(last.meta, last.text, people);
    const body = last.text || (last.hasAttachments ? t('tasksModule.chat.list.file') : '');
    const name = last.senderId === me ? t('tasksModule.chat.list.you') : firstName(people, last.senderId);
    return name ? t('tasksModule.chat.list.preview', { name, text: body }) : body;
};

const dayKey = (iso: string): string => {
    const date = new Date(iso);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

export type ChatListItem =
    | { kind: 'day'; key: string; label: string }
    | { kind: 'system'; key: string; message: ChatMessage }
    | { kind: 'text'; key: string; message: ChatMessage; own: boolean; first: boolean; last: boolean };

const continues = (previous: ChatMessage | undefined, next: ChatMessage | undefined): boolean => {
    if (!previous || !next) return false;
    return previous.type === 'TEXT'
        && next.type === 'TEXT'
        && previous.senderId === next.senderId
        && dayKey(previous.createdAt) === dayKey(next.createdAt)
        && Date.parse(next.createdAt) - Date.parse(previous.createdAt) <= GROUP_WINDOW_MS;
};

/** Tagestrenner, Systemzeilen und Gruppen (Name/Avatar nur am Anfang, Zeit am Ende). */
export const buildChatItems = (messages: readonly ChatMessage[], me: string, nowMs: number): ChatListItem[] => {
    const items: ChatListItem[] = [];
    let currentDay = '';
    messages.forEach((message, index) => {
        const day = dayKey(message.createdAt);
        if (day !== currentDay) {
            currentDay = day;
            items.push({ kind: 'day', key: `day-${day}`, label: smartDate(message.createdAt, false, nowMs) });
        }
        if (message.type === 'SYSTEM') {
            items.push({ kind: 'system', key: message.id, message });
            return;
        }
        items.push({
            kind: 'text',
            key: message.id,
            message,
            own: Boolean(me) && message.senderId === me,
            first: !continues(messages[index - 1], message),
            last: !continues(message, messages[index + 1]),
        });
    });
    return items;
};
