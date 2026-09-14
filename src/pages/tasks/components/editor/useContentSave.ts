import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { conflictContent, tasksApi, tasksErrorCode, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { ContentBlock, ContentDto } from '@/types/tasksModule';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 700;

/**
 * ── SPEICHERN DES INHALTS (optimistisch, mit Versionsschloss) ────────────────
 *
 * 700 ms nach der letzten Änderung geht der ganze Blockstand mit der zuletzt
 * bekannten Version an den Server (PUT /content, `baseVersion`). Es läuft nie
 * mehr als eine Speicherung; was währenddessen getippt wird, geht mit der
 * nächsten. 409 CONTENT_CONFLICT: jemand anderes war schneller — der Stand des
 * Servers ersetzt den lokalen, mit Hinweis.
 *
 * `runExclusive` ist für Handlungen, die den Inhalt AUF DEM SERVER ändern
 * (Checkliste anlegen/löschen): erst speichern, dann während der Handlung
 * nichts senden, sonst liefe die nächste Speicherung mit veralteter Version.
 */
export const useContentSave = ({
    taskId,
    initialVersion,
    getBlocks,
    onSaved,
    onConflict,
    busyRef,
}: {
    taskId: string;
    initialVersion: number;
    getBlocks: () => ContentBlock[];
    onSaved: (content: ContentDto) => void;
    onConflict: (content: ContentDto) => void;
    /** Für die Seite: «bitte den Inhalt beim Nachladen nicht ersetzen». */
    busyRef: MutableRefObject<boolean>;
}) => {
    const [status, setStatus] = useState<SaveStatus>('idle');
    const versionRef = useRef(initialVersion);
    const dirtyRef = useRef(false);
    const lockedRef = useRef(false);
    const failedRef = useRef(false);
    const timerRef = useRef<number | null>(null);
    const inFlightRef = useRef<Promise<void> | null>(null);
    const callbacksRef = useRef({ getBlocks, onSaved, onConflict });
    callbacksRef.current = { getBlocks, onSaved, onConflict };

    const syncBusy = useCallback(() => {
        busyRef.current = dirtyRef.current || lockedRef.current || inFlightRef.current !== null || timerRef.current !== null;
    }, [busyRef]);

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const flushRef = useRef<() => Promise<void>>(async () => undefined);

    const schedule = useCallback(() => {
        clearTimer();
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            if (lockedRef.current) return; // runExclusive plant nach der Handlung neu
            void flushRef.current();
        }, DEBOUNCE_MS);
        syncBusy();
    }, [clearTimer, syncBusy]);

    const flush = useCallback(async (): Promise<void> => {
        clearTimer();
        while (inFlightRef.current) await inFlightRef.current;
        if (!dirtyRef.current) {
            syncBusy();
            return;
        }
        dirtyRef.current = false;
        failedRef.current = false;
        const blocks = callbacksRef.current.getBlocks();
        const baseVersion = versionRef.current;
        setStatus('saving');
        const request = (async () => {
            try {
                const content = await tasksApi.saveContent(taskId, blocks, baseVersion);
                versionRef.current = content.version;
                callbacksRef.current.onSaved(content);
                setStatus(dirtyRef.current ? 'pending' : 'saved');
            } catch (error) {
                if (tasksErrorCode(error) === 'CONTENT_CONFLICT') {
                    const current = conflictContent(error);
                    dirtyRef.current = false;
                    if (current) {
                        versionRef.current = current.version;
                        callbacksRef.current.onConflict(current);
                    }
                    toast.error(t('tasksModule.errors.CONTENT_CONFLICT'));
                    setStatus('idle');
                } else {
                    // Der Stand bleibt «ungespeichert»; die nächste Änderung versucht es erneut.
                    dirtyRef.current = true;
                    failedRef.current = true;
                    toast.error(tasksErrorMessage(error));
                    setStatus('error');
                }
            }
        })();
        inFlightRef.current = request;
        syncBusy();
        await request;
        inFlightRef.current = null;
        if (dirtyRef.current && !failedRef.current && !lockedRef.current) schedule();
        syncBusy();
    }, [taskId, clearTimer, schedule, syncBusy]);

    flushRef.current = flush;

    const markDirty = useCallback(() => {
        dirtyRef.current = true;
        failedRef.current = false;
        setStatus('pending');
        if (!lockedRef.current) schedule();
        syncBusy();
    }, [schedule, syncBusy]);

    const runExclusive = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
        await flush();
        lockedRef.current = true;
        syncBusy();
        try {
            return await action();
        } finally {
            lockedRef.current = false;
            if (dirtyRef.current && !failedRef.current) schedule();
            syncBusy();
        }
    }, [flush, schedule, syncBusy]);

    const setVersion = useCallback((version: number) => { versionRef.current = version; }, []);

    // Seite verlassen / Tab verbergen: was noch aussteht, sofort senden.
    useEffect(() => {
        const onHidden = () => { if (document.hidden && dirtyRef.current) void flushRef.current(); };
        document.addEventListener('visibilitychange', onHidden);
        return () => {
            document.removeEventListener('visibilitychange', onHidden);
            if (dirtyRef.current || timerRef.current !== null) void flushRef.current();
            busyRef.current = false;
        };
    }, [busyRef]);

    return { status, versionRef, flush, markDirty, runExclusive, setVersion };
};
