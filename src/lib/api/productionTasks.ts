import i18n from '../../i18n';
import { t } from '../../i18n/translate';
import { apiClient } from '../axios';
import { readQuery, refreshQuery } from './queryCache';
import type {
    DeviceTasks,
    MyProductionTasks,
    ProductionTask,
    TaskActivityPage,
    TaskActivityQuery,
    TaskDeviceDirectory,
    TaskRequest,
    TaskRequestList,
    TaskPerson,
    TaskSection,
    TaskStandardsFile,
    TaskStatus,
    TaskTemplate,
    TaskTemplateInput,
    TaskTemplateSummary,
} from '../../types/productionTasks';

/**
 * ── GÖREVLENDİRME (26.09.2026) ───────────────────────────────────────────────
 * Vorlagen und die Aufgaben eines Geräts. Lesen über den gemeinsamen Speicher
 * (`readQuery`): ein zweites Öffnen zeichnet sofort, die Antwort des Servers
 * kommt still nach. Jede Schreibanfrage an /production macht die Einträge alt
 * (Tag `production`, siehe WRITE_TAGS in queryCache.ts).
 */

const TAGS = ['production'];
const PAGE_CACHE = { freshMs: 15_000, staleMs: 600_000, tags: TAGS };

/** Der Weg zu einer Unteraufgabe am Gerät. */
const subtaskPath = (deviceId: string, taskId: string, subtaskId: string): string =>
    `/production/devices/${encodeURIComponent(deviceId)}/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}`;

/** Der Weg zu einer EIGENEN Unteraufgabe («Görevlerim», 30.09.2026). */
const mySubtaskPath = (deviceId: string, taskId: string, subtaskId: string): string =>
    `/production/my-tasks/devices/${encodeURIComponent(deviceId)}/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}`;

/** Der Stand einer Unteraufgabe, dazu Notiz und Betrag beim Einsenden (02.10.2026) — nur, was gegeben ist. */
const statusBody = (status: TaskStatus, note?: string, fee?: number) => ({
    status,
    ...(note === undefined ? {} : { note }),
    ...(fee === undefined ? {} : { fee }),
});

export const productionTasksApi = {
    templates: async (): Promise<TaskTemplateSummary[]> =>
        ((await apiClient.get('/production/task-templates')).data as { items: TaskTemplateSummary[] }).items,
    template: async (id: string): Promise<TaskTemplate> =>
        (await apiClient.get(`/production/task-templates/${encodeURIComponent(id)}`)).data,
    createTemplate: async (input: TaskTemplateInput): Promise<TaskTemplate> =>
        (await apiClient.post('/production/task-templates', input)).data,
    saveTemplate: async (id: string, input: TaskTemplateInput): Promise<TaskTemplate> =>
        (await apiClient.put(`/production/task-templates/${encodeURIComponent(id)}`, input)).data,
    removeTemplate: async (id: string): Promise<void> => {
        await apiClient.delete(`/production/task-templates/${encodeURIComponent(id)}`);
    },

    deviceTasks: async (deviceId: string): Promise<DeviceTasks> =>
        (await apiClient.get(`/production/devices/${encodeURIComponent(deviceId)}/tasks`)).data,
    /** Eine Vorlage auf das Gerät legen; `replace` ersetzt einen bestehenden Plan. */
    loadTemplate: async (deviceId: string, templateId: string, replace: boolean): Promise<DeviceTasks> =>
        (await apiClient.post(`/production/devices/${encodeURIComponent(deviceId)}/tasks`, { templateId, replace })).data,
    /** Die Personen einer Unteraufgabe (29.09.2026) — nur die Verwaltung; die Aufgabe zeigt danach ihre Summe. */
    assignSubtask: async (deviceId: string, taskId: string, subtaskId: string, assigneeIds: string[]): Promise<{ task: ProductionTask; people: TaskPerson[] }> =>
        (await apiClient.patch(
            `/production/devices/${encodeURIComponent(deviceId)}/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}`,
            { assigneeIds },
        )).data,
    /**
     * Die Aufgaben des Geräts anpassen — nur die Kopie am Gerät, nie die
     * Vorlage (28.09.2026). Schickt ALLE Aufgaben; neue ohne bekannte Kennung.
     */
    updateTasks: async (deviceId: string, tasks: ProductionTask[], sections?: TaskSection[]): Promise<DeviceTasks> =>
        // `sections` (30.09.2026): die Gewichte der Stufen — ohne bleiben sie, wie sie sind.
        (await apiClient.put(`/production/devices/${encodeURIComponent(deviceId)}/tasks`, sections ? { tasks, sections } : { tasks })).data,
    /** Eine neue Stufe in der Kopie am Gerät — nur solange der Bereich unter 100 % wiegt (28.09.2026). */
    addStage: async (deviceId: string, area: string, name: string): Promise<DeviceTasks> =>
        (await apiClient.post(`/production/devices/${encodeURIComponent(deviceId)}/stages`, { area, name })).data,
    /** Der Stand einer Unteraufgabe — nur wer an ihr steht (29.09.2026); die Aufgabe folgt ihren Unteraufgaben. */
    // `note` (02.10.2026): die kurze Notiz beim Einsenden — ohne bleibt die von vorher.
    // `fee` (02.10.2026): der Betrag (CHF) mit «Ücret girilsin» — ohne bleibt der von vorher.
    setSubtaskStatus: async (deviceId: string, taskId: string, subtaskId: string, status: TaskStatus, note?: string, fee?: number): Promise<{ task: ProductionTask }> =>
        (await apiClient.patch(
            `/production/devices/${encodeURIComponent(deviceId)}/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}/status`,
            statusBody(status, note, fee),
        )).data,
    /** «Complete the task» — nur die Verwaltung; mit kurzer Notiz. */
    completeSubtask: async (deviceId: string, taskId: string, subtaskId: string, note: string, checked: string[]): Promise<{ task: ProductionTask }> =>
        // `checked`: die abgehakten Punkte der Freigabe-Checkliste — der Server prüft, dass alle dabei sind.
        (await apiClient.post(`${subtaskPath(deviceId, taskId, subtaskId)}/complete`, { note, checked })).data,
    /** Ein Punkt mehr in der Freigabe-Checkliste — aus der Prüfansicht, nur die Verwaltung; der Stand bleibt. */
    addChecklistItem: async (deviceId: string, taskId: string, subtaskId: string, text: string): Promise<{ task: ProductionTask }> =>
        (await apiClient.post(`${subtaskPath(deviceId, taskId, subtaskId)}/checklist`, { text })).data,
    /** Die Standards als PDF hochladen (01.10.2026) — nur die Verwaltung; an die Unteraufgabe kommt es mit dem Speichern. */
    uploadStandardsFile: async (file: File): Promise<{ file: TaskStandardsFile }> => {
        const form = new FormData();
        form.append('file', file, file.name);
        return (await apiClient.post('/production/task-standards', form)).data;
    },
    /** Das PDF der Standards. */
    standardsFile: async (standards: TaskStandardsFile): Promise<Blob> =>
        (await apiClient.get('/production/task-standards/file', { params: { ref: standards.ref, name: standards.name }, responseType: 'blob' })).data,
    /** Die KI-Prüfung eines PDFs gegen die Standards noch einmal (01.10.2026) — nur die Verwaltung. */
    retryFileAnalysis: async (deviceId: string, taskId: string, subtaskId: string, fileId: string): Promise<{ task: ProductionTask }> =>
        (await apiClient.post(`${subtaskPath(deviceId, taskId, subtaskId)}/files/${encodeURIComponent(fileId)}/analysis`, {})).data,
    /** Die Sperre aufheben — nur die Verwaltung; wartet danach wieder auf die Freigabe. */
    unlockSubtask: async (deviceId: string, taskId: string, subtaskId: string): Promise<{ task: ProductionTask }> =>
        (await apiClient.post(`${subtaskPath(deviceId, taskId, subtaskId)}/unlock`, {})).data,
    /** «Request revision» — nur die Verwaltung: zurück in Arbeit, mit dem, was zu ändern ist. */
    requestSubtaskRevision: async (deviceId: string, taskId: string, subtaskId: string, note: string): Promise<{ task: ProductionTask }> =>
        (await apiClient.post(`${subtaskPath(deviceId, taskId, subtaskId)}/revision`, { note })).data,
    /** Eine Datei an eine Unteraufgabe (PDF/Foto). */
    uploadSubtaskFile: async (
        deviceId: string,
        taskId: string,
        subtaskId: string,
        file: File,
        revisionOf?: string,
        revisionNote?: string,
    ): Promise<{ task: ProductionTask }> => {
        const form = new FormData();
        // Zuerst die Felder, dann die Datei — multer liest die Felder vor der Datei.
        if (revisionOf) form.append('revisionOf', revisionOf);
        if (revisionNote) form.append('revisionNote', revisionNote);
        form.append('file', file, file.name);
        return (await apiClient.post(`${subtaskPath(deviceId, taskId, subtaskId)}/files`, form)).data;
    },
    subtaskFile: async (deviceId: string, taskId: string, subtaskId: string, fileId: string): Promise<Blob> =>
        (await apiClient.get(`${subtaskPath(deviceId, taskId, subtaskId)}/files/${encodeURIComponent(fileId)}`, { responseType: 'blob' })).data,
    removeSubtaskFile: async (deviceId: string, taskId: string, subtaskId: string, fileId: string): Promise<{ task: ProductionTask }> =>
        (await apiClient.delete(`${subtaskPath(deviceId, taskId, subtaskId)}/files/${encodeURIComponent(fileId)}`)).data,
    /** Der Stand einer Aufgabe — die Verwaltung und wer in der Aufgabe steht. */
    setStatus: async (deviceId: string, taskId: string, status: TaskStatus): Promise<{ task: ProductionTask }> =>
        (await apiClient.patch(
            `/production/devices/${encodeURIComponent(deviceId)}/tasks/${encodeURIComponent(taskId)}/status`,
            { status },
        )).data,
    /**
     * Eine Seite des Verlaufs einer Stufe (30.09.2026), neueste zuerst — nur die
     * Verwaltung; gefiltert nach Arten, Person und Zeitraum.
     */
    // `area`/`stage` null (30.09.2026): der Verlauf des ganzen Geräts.
    activities: async (deviceId: string, area: string | null, stage: string | null, query: TaskActivityQuery): Promise<TaskActivityPage> =>
        (await apiClient.get(`/production/devices/${encodeURIComponent(deviceId)}/activities`, {
            params: {
                ...(area && stage ? { area, stage } : {}),
                page: query.page,
                ...(query.pageSize ? { pageSize: query.pageSize } : {}),
                ...(query.kinds?.length ? { kinds: query.kinds.join(',') } : {}),
                ...(query.actorId ? { actorId: query.actorId } : {}),
                ...(query.from ? { from: query.from } : {}),
                ...(query.to ? { to: query.to } : {}),
            },
        })).data,
    /* ── «Görevlerim» (30.09.2026): die eigenen Aufgaben — ohne Produktionsrechte, nur Eigenes ── */
    myTasks: async (): Promise<MyProductionTasks> => (await apiClient.get('/production/my-tasks')).data,
    mySubtaskStatus: async (deviceId: string, taskId: string, subtaskId: string, status: TaskStatus, note?: string, fee?: number): Promise<{ task: ProductionTask }> =>
        (await apiClient.patch(`${mySubtaskPath(deviceId, taskId, subtaskId)}/status`, statusBody(status, note, fee))).data,
    myUploadSubtaskFile: async (
        deviceId: string,
        taskId: string,
        subtaskId: string,
        file: File,
        revisionOf?: string,
        revisionNote?: string,
    ): Promise<{ task: ProductionTask }> => {
        const form = new FormData();
        // Zuerst die Felder, dann die Datei — multer liest die Felder vor der Datei.
        if (revisionOf) form.append('revisionOf', revisionOf);
        if (revisionNote) form.append('revisionNote', revisionNote);
        form.append('file', file, file.name);
        return (await apiClient.post(`${mySubtaskPath(deviceId, taskId, subtaskId)}/files`, form)).data;
    },
    mySubtaskFile: async (deviceId: string, taskId: string, subtaskId: string, fileId: string): Promise<Blob> =>
        (await apiClient.get(`${mySubtaskPath(deviceId, taskId, subtaskId)}/files/${encodeURIComponent(fileId)}`, { responseType: 'blob' })).data,
    myRemoveSubtaskFile: async (deviceId: string, taskId: string, subtaskId: string, fileId: string): Promise<{ task: ProductionTask }> =>
        (await apiClient.delete(`${mySubtaskPath(deviceId, taskId, subtaskId)}/files/${encodeURIComponent(fileId)}`)).data,
    /* ── Anfragen an die Verwaltung (30.09.2026) ── */
    /** Bitte um Entsperren — auf dem Gerät (mit Produktionsrecht). */
    requestUnlock: async (deviceId: string, taskId: string, subtaskId: string, note: string): Promise<{ request: TaskRequest }> =>
        (await apiClient.post(`${subtaskPath(deviceId, taskId, subtaskId)}/unlock-request`, { note })).data,
    /** … und über «Görevlerim» (ohne Produktionsrecht). */
    myRequestUnlock: async (deviceId: string, taskId: string, subtaskId: string, note: string): Promise<{ request: TaskRequest }> =>
        (await apiClient.post(`${mySubtaskPath(deviceId, taskId, subtaskId)}/unlock-request`, { note })).data,
    /** Die Anfragen einer Stufe — nur die Verwaltung. */
    // `area`/`stage` null (30.09.2026): die Anfragen des ganzen Geräts.
    requests: async (deviceId: string, area: string | null, stage: string | null, status: 'open' | 'solved' | 'all'): Promise<TaskRequestList> =>
        (await apiClient.get(`/production/devices/${encodeURIComponent(deviceId)}/requests`, {
            params: { ...(area && stage ? { area, stage } : {}), status },
        })).data,
    /** Projekte und Geräte mit Aufgaben, samt offener Anfragen — nur die Verwaltung (30.09.2026). */
    taskDevices: async (): Promise<TaskDeviceDirectory> => (await apiClient.get('/production/task-devices')).data,
    /** «Mark as solved» — nur die Verwaltung. */
    solveRequest: async (deviceId: string, requestId: string): Promise<{ request: TaskRequest }> =>
        (await apiClient.post(`/production/devices/${encodeURIComponent(deviceId)}/requests/${encodeURIComponent(requestId)}/solve`, {})).data,
    unload: async (deviceId: string): Promise<void> => {
        await apiClient.delete(`/production/devices/${encodeURIComponent(deviceId)}/tasks`);
    },
};

/* ── Lesen mit Speicher ───────────────────────────────────────────────────── */

const templatesKey = 'production:task-templates';

export const readTaskTemplates = (
    onValue: (value: TaskTemplateSummary[], fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(templatesKey, productionTasksApi.templates, PAGE_CACHE, onValue, onError);

export const refreshTaskTemplates = () => refreshQuery(templatesKey, productionTasksApi.templates, PAGE_CACHE);

export const readTaskTemplate = (
    id: string,
    onValue: (value: TaskTemplate, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(`production:task-template:${id}`, () => productionTasksApi.template(id), PAGE_CACHE, onValue, onError);

/**
 * Die Antwort eines Speicherns gleich in den Speicher legen: wer danach zur
 * Vorlage (oder zum Gerät) zurückkommt, sieht nicht kurz den alten Stand.
 */
export const primeTaskTemplate = (template: TaskTemplate) =>
    refreshQuery(`production:task-template:${template.id}`, async () => template, PAGE_CACHE);

export const primeDeviceTasks = (deviceId: string, value: DeviceTasks) =>
    refreshQuery(`production:device-tasks:${deviceId}`, async () => value, PAGE_CACHE);

export const readDeviceTasks = (
    deviceId: string,
    onValue: (value: DeviceTasks, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(`production:device-tasks:${deviceId}`, () => productionTasksApi.deviceTasks(deviceId), PAGE_CACHE, onValue, onError);

export const refreshDeviceTasks = (deviceId: string) =>
    refreshQuery(`production:device-tasks:${deviceId}`, () => productionTasksApi.deviceTasks(deviceId), PAGE_CACHE);

/* ── Fehler ──────────────────────────────────────────────────────────────── */

export const productionTaskErrorOf = (error: unknown): { code: string | null; params: Record<string, string | number> | null } => {
    const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;
    return {
        code: typeof data?.code === 'string' ? data.code : null,
        params: (data?.params as Record<string, string | number>) ?? null,
    };
};

/**
 * Die Meldung zu einer Antwort: kennt die Oberfläche die Kennung
 * (productionTasks.err.*), steht ihre Übersetzung da — sonst die Rückfallmeldung.
 * Den deutschen Text des Servers zeigen wir nie (eine Sprache auf dem Schirm).
 */
export const productionTaskErrorText = (error: unknown, fallbackKey = 'productionTasks.err.generic'): string => {
    const failure = productionTaskErrorOf(error);
    const key = failure.code ? `productionTasks.err.${failure.code}` : '';
    if (key && i18n.exists(key)) return t(key, failure.params ?? undefined);
    return t(fallbackKey);
};
