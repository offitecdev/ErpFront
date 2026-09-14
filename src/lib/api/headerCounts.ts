import { fetchBatch, type BatchResults } from './batch';

/**
 * All header badge figures in ONE request: the apps menu (leave requests, mail,
 * tasks, reminders) and the bell (notifications). They used to be five separate
 * requests, sent before the page's own data (see utils/onIdle `afterPageSettled`).
 *
 * The apps menu and the bell ask independently; a request younger than
 * `SHARE_MS` with the same scope is shared, so both badges still cost only one
 * round trip. A figure whose endpoint refused (module not enabled, missing
 * permission) comes back `undefined` — the caller keeps showing 0.
 */

const GETS = {
    leaves: '/personnel/leaves/counts?view=incoming',
    notifications: '/notifications/unread-count',
    mail: '/mail/messages/stats?view=unread-count',
    tasks: '/crm/tasks?kind=TASK&scope=me&status=OPEN&page=1&pageSize=1&view=count',
    reminders: '/crm/reminders/due?view=count',
};

export type HeaderCounts = {
    leavesIncoming?: number;
    unreadNotifications?: number;
    unreadMail?: number;
    openTasks?: number;
    dueReminders?: number;
};

const SHARE_MS = 3000;
let shared: { at: number; crm: boolean; promise: Promise<HeaderCounts> } | null = null;

const numberField = (results: BatchResults, get: string, field: string): number | undefined => {
    const entry = results[get];
    if (!entry || entry.status < 200 || entry.status >= 300) return undefined;
    const value = Number((entry.body as Record<string, unknown> | null)?.[field]);
    return Number.isFinite(value) ? value : undefined;
};

export const fetchHeaderCounts = (crm: boolean): Promise<HeaderCounts> => {
    const now = performance.now();
    if (shared && shared.crm === crm && now - shared.at < SHARE_MS) return shared.promise;

    const gets = [GETS.leaves, GETS.notifications, ...(crm ? [GETS.mail, GETS.tasks, GETS.reminders] : [])];
    const promise = fetchBatch(gets).then((results) => ({
        leavesIncoming: numberField(results, GETS.leaves, 'incoming'),
        unreadNotifications: numberField(results, GETS.notifications, 'count'),
        ...(crm ? {
            unreadMail: numberField(results, GETS.mail, 'unreadInbox'),
            openTasks: numberField(results, GETS.tasks, 'total'),
            dueReminders: numberField(results, GETS.reminders, 'count'),
        } : {}),
    }));
    shared = { at: now, crm, promise };
    promise.catch(() => { if (shared?.promise === promise) shared = null; });
    return promise;
};
