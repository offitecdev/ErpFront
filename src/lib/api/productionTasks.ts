import i18n from '../../i18n';
import { t } from '../../i18n/translate';
import { apiClient } from '../axios';
import { readQuery, refreshQuery } from './queryCache';
import type {
    DeviceTasks,
    ProductionTask,
    TaskPerson,
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
    assign: async (deviceId: string, taskId: string, assigneeIds: string[]): Promise<{ task: ProductionTask; people: TaskPerson[] }> =>
        (await apiClient.patch(
            `/production/devices/${encodeURIComponent(deviceId)}/tasks/${encodeURIComponent(taskId)}`,
            { assigneeIds },
        )).data,
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
