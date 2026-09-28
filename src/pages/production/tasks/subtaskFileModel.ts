import { t } from '@/i18n/translate';
import type { ProductionTask, TaskSubtask, TaskSubtaskFile } from '@/types/productionTasks';

import { isSubtaskCompleted, SUBTASK_FILE_ACCEPT, SUBTASK_FILE_MAX_BYTES } from './taskModel';

/* Dateien an Unteraufgaben (28.09.2026) — was die Oberflächen teilen. */

/** Was die Geräteseite für Dateien und Abschluss bereitstellt. */
export interface SubtaskActions {
    isAdmin: boolean;
    meId: string | null;
    /** Für die Unterzeile des Abschlussfensters. */
    deviceName: string;
    upload: (task: ProductionTask, subtask: TaskSubtask, file: File) => Promise<boolean>;
    removeFile: (task: ProductionTask, subtask: TaskSubtask, file: TaskSubtaskFile) => Promise<void>;
    openFile: (task: ProductionTask, subtask: TaskSubtask, file: TaskSubtaskFile) => void;
    /** Die Datei selbst (für das Vorschaubild). */
    loadFile: (task: ProductionTask, subtask: TaskSubtask, file: TaskSubtaskFile) => Promise<Blob>;
    complete: (task: ProductionTask, subtask: TaskSubtask, note: string) => Promise<boolean>;
}

/** Wer darf hier hochladen? — wie der Server. */
export const canUploadTo = (actions: SubtaskActions, task: ProductionTask, subtask: TaskSubtask): boolean =>
    actions.isAdmin || (!isSubtaskCompleted(subtask) && Boolean(actions.meId && task.assigneeIds.includes(actions.meId)));

export const isPdf = (file: { type: string }): boolean => file.type === 'application/pdf';
export const isImage = (file: { type: string }): boolean => file.type.startsWith('image/');

/** Vor dem Senden prüfen, was der Server ohnehin prüft — die Meldung kommt sofort. */
export const fileProblem = (file: File, pdfOnly = false): string | null => {
    if (pdfOnly ? !isPdf(file) : !SUBTASK_FILE_ACCEPT.split(',').includes(file.type)) {
        return t(pdfOnly ? 'productionTasks.complete.pdfOnly' : 'productionTasks.files.badType');
    }
    if (file.size > SUBTASK_FILE_MAX_BYTES) return t('productionTasks.files.tooLarge');
    return null;
};

const two = (value: number) => String(value).padStart(2, '0');

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

/** Wer darf diese Datei entfernen? — wie der Server. */
export const canRemoveFile = (actions: SubtaskActions, task: ProductionTask, subtask: TaskSubtask, file: TaskSubtaskFile): boolean =>
    actions.isAdmin || (
        !isSubtaskCompleted(subtask)
        && Boolean(actions.meId && task.assigneeIds.includes(actions.meId) && file.uploadedById === actions.meId)
    );
