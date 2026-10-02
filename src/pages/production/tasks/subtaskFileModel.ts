import { t } from '@/i18n/translate';
import type { ProductionTask, TaskFileAnalysis, TaskStatus, TaskSubtask, TaskSubtaskFile, TaskSubtaskRevisionRequest } from '@/types/productionTasks';

import { isSubtaskCompleted, SUBTASK_FILE_MAX_BYTES } from './taskModel';

/* Dateien an Unteraufgaben (28.09.2026) — was die Oberflächen teilen. */

/** Was die Geräteseite für Dateien und Abschluss bereitstellt. */
export interface SubtaskActions {
    isAdmin: boolean;
    /**
     * «Approve the task» zeigen — fehlt es, gilt `isAdmin`. Die Startseite (02.10.2026, Samet:
     * «I just want this button to be visible to admins on their dashboard also») setzt es für die
     * Verwaltung, ohne sonst als Verwaltung zu handeln (Dateien laufen dort über /my-tasks).
     */
    canApprove?: boolean;
    meId: string | null;
    /** Für die Unterzeile des Abschlussfensters. */
    deviceName: string;
    /** Eine Datei hochladen — mit `revisionOf` als neue Fassung einer vorhandenen (28.09.2026). */
    upload: (task: ProductionTask, subtask: TaskSubtask, file: File, revisionOf?: string, revisionNote?: string) => Promise<boolean>;
    removeFile: (task: ProductionTask, subtask: TaskSubtask, file: TaskSubtaskFile) => Promise<void>;
    openFile: (task: ProductionTask, subtask: TaskSubtask, file: TaskSubtaskFile) => void;
    /** Die Datei selbst (für das Vorschaubild). */
    loadFile: (task: ProductionTask, subtask: TaskSubtask, file: TaskSubtaskFile) => Promise<Blob>;
    /** «Approve the task» — mit den abgehakten Punkten der Checkliste (der Server prüft sie). */
    complete: (task: ProductionTask, subtask: TaskSubtask, note: string, checked: string[]) => Promise<boolean>;
    /** «Request revision» beim Prüfen der Dateien — zurück in Arbeit. */
    requestRevision: (task: ProductionTask, subtask: TaskSubtask, note: string) => Promise<boolean>;
    /** Der Stand einer Unteraufgabe — «Complete the task» setzt «wartet auf Freigabe». */
    setStatus: (task: ProductionTask, subtask: TaskSubtask, status: TaskStatus) => Promise<void>;
    /** Ein Punkt mehr in der Freigabe-Checkliste — aus «Approve the files»; der Stand bleibt. */
    addChecklistItem: (task: ProductionTask, subtask: TaskSubtask, text: string) => Promise<boolean>;
    /** Die Sperre aufheben (Klick auf das Schloss) — wartet danach wieder auf die Freigabe. */
    unlock: (task: ProductionTask, subtask: TaskSubtask) => Promise<boolean>;
    /**
     * Um das Entsperren BITTEN (30.09.2026) — wer an einer gesperrten Unteraufgabe steht und nicht
     * die Verwaltung ist: ein Klick auf das Schloss. Fehlt es, ist das Schloss nur ein Zeichen.
     */
    requestUnlock?: (task: ProductionTask, subtask: TaskSubtask, note: string) => Promise<boolean>;
    /** Die KI-Prüfung eines PDFs noch einmal (01.10.2026) — nur die Verwaltung; fehlt es, kein Knopf. */
    retryAnalysis?: (task: ProductionTask, subtask: TaskSubtask, file: TaskSubtaskFile) => Promise<boolean>;
}

/* ── KI-Prüfung der PDFs gegen die Standards (01.10.2026) ─────────────────── */

/** Wartet oder läuft die Prüfung? Dann fragt die Seite nach, bis sie fertig ist. */
export const isAnalysisActive = (analysis?: TaskFileAnalysis | null): boolean =>
    analysis?.status === 'QUEUED' || analysis?.status === 'RUNNING';

/** Läuft irgendwo in diesen Aufgaben eine Prüfung? */
export const hasActiveAnalysis = (tasks: ReadonlyArray<Pick<ProductionTask, 'subtasks'>>): boolean =>
    tasks.some((task) => task.subtasks.some((subtask) => subtask.files.some((file) => isAnalysisActive(file.analysis))));

/** So oft fragt die Seite nach, solange eine Prüfung läuft. */
export const ANALYSIS_POLL_MS = 5000;

const two = (value: number) => String(value).padStart(2, '0');

/** Datum und Uhrzeit, immer vollständig: «28.09.2026 14:05». */
export const formatDateTime = (iso: string | null): string => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
};

/** Dateien zu — wie der Server: freigegeben (gesperrt) oder «wartet auf Freigabe» (28.09.2026), für alle. */
export const filesLocked = (subtask: TaskSubtask): boolean => isSubtaskCompleted(subtask) || subtask.status === 'PENDING';

/** Wer darf hier hochladen? — wie der Server: gesperrt niemand, sonst die Verwaltung und wer an der Unteraufgabe steht. */
export const canUploadTo = (actions: SubtaskActions, subtask: TaskSubtask): boolean =>
    !filesLocked(subtask) && (actions.isAdmin || Boolean(actions.meId && subtask.assigneeIds.includes(actions.meId)));

/**
 * Die Dateien einer Unteraufgabe, nach Fassungen gruppiert (28.09.2026: «each file … can
 * have revised versions»): je Gruppe die aktuelle (höchste) Fassung und die früheren,
 * neueste zuerst. Reihenfolge der Gruppen: wie ihre erste Fassung hochgeladen wurde.
 */
export interface FileGroup { latest: TaskSubtaskFile; older: TaskSubtaskFile[] }
export const fileGroups = (files: readonly TaskSubtaskFile[]): FileGroup[] => {
    const groups = new Map<string, TaskSubtaskFile[]>();
    for (const file of files) {
        const key = file.groupId || file.id;
        groups.set(key, [...(groups.get(key) ?? []), file]);
    }
    return [...groups.values()].map((list) => {
        const sorted = [...list].sort((a, b) => (b.version || 1) - (a.version || 1));
        return { latest: sorted[0], older: sorted.slice(1) };
    });
};

/**
 * Der Verlauf der Prüfung (28.09.2026: «if a revision is asked show that and specify the
 * revised version and order them by their dates»): alle hochgeladenen Fassungen und alle
 * Rückgaben zur Überarbeitung in EINER Liste, nach Datum (älteste zuerst). Eine Rückgabe
 * kennt die Fassungen, die danach (und vor der nächsten Rückgabe) kamen — die überarbeiteten;
 * eine Fassung kennt die Rückgabe, auf die sie antwortet.
 */
export type ReviewEntry =
    | { kind: 'upload'; at: string; file: TaskSubtaskFile; answers: TaskSubtaskRevisionRequest | null }
    | { kind: 'request'; at: string; request: TaskSubtaskRevisionRequest; revised: TaskSubtaskFile[] };

export const reviewTimeline = (subtask: Pick<TaskSubtask, 'files' | 'revisionHistory' | 'revisionAt' | 'revisionByName' | 'revisionById' | 'revisionNote'>): ReviewEntry[] => {
    // Ältere Daten kennen nur die letzte Rückgabe (ohne Verlauf) — dann gilt sie allein.
    const requests = [...(subtask.revisionHistory?.length
        ? subtask.revisionHistory
        : subtask.revisionAt
            ? [{ byId: subtask.revisionById, byName: subtask.revisionByName, at: subtask.revisionAt, note: subtask.revisionNote }]
            : [])].sort((a, b) => a.at.localeCompare(b.at));
    const answering = (file: TaskSubtaskFile) =>
        [...requests].reverse().find((request) => request.at < file.uploadedAt) ?? null;
    const entries: ReviewEntry[] = [
        ...subtask.files.map((file): ReviewEntry => ({ kind: 'upload', at: file.uploadedAt, file, answers: answering(file) })),
        ...requests.map((request, index): ReviewEntry => ({
            kind: 'request',
            at: request.at,
            request,
            revised: subtask.files
                .filter((file) => file.uploadedAt > request.at && (!requests[index + 1] || file.uploadedAt < requests[index + 1].at))
                .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)),
        })),
    ];
    return entries.sort((a, b) => a.at.localeCompare(b.at));
};

/** Die letzte Rückgabe zur Überarbeitung — und die Fassungen, die darauf kamen. */
export const lastRevisionRequest = (timeline: readonly ReviewEntry[]) =>
    [...timeline].reverse().find((entry): entry is Extract<ReviewEntry, { kind: 'request' }> => entry.kind === 'request') ?? null;

/** Nur die aktuellen Fassungen — das, was geprüft und gezählt wird. */
export const latestFiles = (files: readonly TaskSubtaskFile[]): TaskSubtaskFile[] => fileGroups(files).map((group) => group.latest);

export const isPdf = (file: { type: string }): boolean => file.type === 'application/pdf';
export const isImage = (file: { type: string }): boolean => file.type.startsWith('image/');

/** Vor dem Senden prüfen, was der Server ohnehin prüft — die Meldung kommt sofort. */
export const fileProblem = (file: File): string | null => {
    // Nur PDF (28.09.2026) — wie der Server.
    if (!isPdf(file)) return t('productionTasks.files.badType');
    if (file.size > SUBTASK_FILE_MAX_BYTES) return t('productionTasks.files.tooLarge');
    return null;
};

/** «heute 08:50», «gestern 17:10» oder «26.09.2026 08:50». */
export const formatMoment = (iso: string | null): string => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const time = `${two(date.getHours())}:${two(date.getMinutes())}`;
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (same(date, today)) return t('productionTasks.files.today', { time });
    if (same(date, yesterday)) return t('productionTasks.files.yesterday', { time });
    return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()} ${time}`;
};

/**
 * Wer darf eine neue Fassung dieser Datei hochladen? (30.09.2026: «they can't delete or modify
 * them») — wie der Server: die Verwaltung, sonst nur, wer die erste Fassung hochgeladen hat.
 */
export const canReviseFile = (actions: SubtaskActions, subtask: TaskSubtask, group: FileGroup): boolean => {
    if (!canUploadTo(actions, subtask)) return false;
    if (actions.isAdmin) return true;
    const original = [group.latest, ...group.older].reduce((first, file) => ((file.version || 1) < (first.version || 1) ? file : first), group.latest);
    return Boolean(actions.meId && original.uploadedById === actions.meId);
};

/** Wer darf diese Datei entfernen? — wie der Server: gesperrt niemand, sonst die Verwaltung oder wer sie hochgeladen hat. */
export const canRemoveFile = (actions: SubtaskActions, subtask: TaskSubtask, file: TaskSubtaskFile): boolean =>
    !filesLocked(subtask) && (
        actions.isAdmin
        || Boolean(actions.meId && subtask.assigneeIds.includes(actions.meId) && file.uploadedById === actions.meId)
    );
