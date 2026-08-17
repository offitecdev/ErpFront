import dayjs from 'dayjs';
import type { TenderChangeLog } from '../../../../types/tender';

const logMergeKey = (log: TenderChangeLog) =>
    [log.actionType, log.fieldName || '', log.newValue || '', log.description || ''].join('|');

export const mergeTenderLogs = (incoming: TenderChangeLog[], existing: TenderChangeLog[], preserveExisting = false) => {
    const incomingKeys = new Set(incoming.map(logMergeKey));
    const merged = new Map<string, TenderChangeLog>();

    incoming.forEach((log) => merged.set(log.id, log));
    if (preserveExisting) {
        existing.forEach((log) => {
            if (log.id.startsWith('local-') && incomingKeys.has(logMergeKey(log))) return;
            if (!merged.has(log.id)) merged.set(log.id, log);
        });
    }

    return Array.from(merged.values()).sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf());
};
