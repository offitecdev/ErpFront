import { t } from '@/i18n/translate';
import type { PeopleMap, TaskActivity, TaskStatus } from '@/types/tasksModule';
import { formatDuration, personName, statusLabel } from '../../utils/taskFormat';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const truncate = (value: string, max = 60): string => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

/**
 * Satz eines Verlaufseintrags (Görevly renderActivity) — in der Sprache der
 * Anwendung, nie der rohe Typ. Die Person steht davor (fett, im Baustein).
 */
export const activitySentence = (activity: TaskActivity, people: PeopleMap): string => {
    const meta = activity.meta ?? {};
    const key = `tasksModule.activity.${activity.type}`;
    let sentence: string;
    switch (activity.type) {
        case 'STATUS':
            sentence = text(meta.to)
                ? t('tasksModule.activity.STATUS_TO', { status: statusLabel(text(meta.to) as TaskStatus) })
                : t(key);
            break;
        case 'ASSIGNED':
        case 'UNASSIGNED':
            sentence = t(key, { person: personName(people, text(meta.employeeId)) });
            break;
        case 'ATTACHMENT':
            sentence = t(key, { count: typeof meta.count === 'number' ? meta.count : 1 });
            break;
        case 'TIMER_PAUSE':
            sentence = t(key, { duration: formatDuration(typeof meta.ms === 'number' ? meta.ms : 0) });
            break;
        case 'CHECK_DONE':
        case 'CHECK_UNDONE':
            sentence = t(key, { text: truncate(text(meta.text)) });
            break;
        case 'CHECKLIST_ADD':
            sentence = t(key, { title: truncate(text(meta.title)) });
            break;
        case 'BLOCKED':
            sentence = t(key, { reason: truncate(text(meta.reason), 120) });
            break;
        default:
            sentence = t(key);
    }
    const note = text(meta.note);
    return note ? t('tasksModule.activity.withNote', { sentence, note: truncate(note, 120) }) : sentence;
};
