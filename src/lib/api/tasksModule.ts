import { apiClient } from '../axios';
import i18n from '@/i18n';
import { t } from '@/i18n/translate';
import type {
    ChatMessage,
    ChatMessagePage,
    ChatRoomList,
    ChatUnread,
    Checklist,
    ChecklistItem,
    ChecklistProgress,
    ClosedSession,
    ContentBlock,
    ContentDto,
    DailyReportSetting,
    DirectoryPerson,
    LabelColor,
    LabelDto,
    LiveOverview,
    ManualTaskStatus,
    PeopleMap,
    PersonStats,
    ReportRange,
    ReportRangeKey,
    RoomDetail,
    StartTimerResult,
    TaskActivity,
    TaskApprovalsResult,
    TaskAttachment,
    TaskComment,
    TaskDetailResult,
    TaskEnvelope,
    TaskIssue,
    TaskListParams,
    TaskListResult,
    TaskOnboarding,
    TaskPriority,
    TaskSearchHit,
    TasksBootstrap,
    TaskSettings,
    TasksSummary,
    WorkReport,
    ActiveTimerInfo,
    DailyReport,
    MyDailyReport,
} from '@/types/tasksModule';

/**
 * ── GÖREVLER / TASKS-MODUL: API (13.09.2026, Vorgabe Samet) ──────────────────
 *
 * EIN Zugang zu /api/v1/tasks für alle Seiten des Moduls. Die Seiten rufen nur
 * `tasksApi.*` — nie `apiClient` direkt —, damit Pfade und Formen an genau
 * einer Stelle stehen. Nicht verwechseln mit den CRM-Aufgaben (lib/api/crm.ts).
 */

const BASE = '/tasks';

/**
 * Kalendertag des Browsers (14.09.2026, Samet: «her gün baştan başlasın
 * sayaçlar»): Liste und Detail zeigen die Zeit DIESES Tages, die Summe aller
 * Tage steht im Rapport. Der Server kennt die Zeitzone des Browsers nicht —
 * darum gehen die Grenzen mit.
 */
export const todayParams = (now = new Date()): { dayFrom: string; dayTo: string } => {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setHours(23, 59, 59, 999);
    return { dayFrom: from.toISOString(), dayTo: to.toISOString() };
};

/* Ein Zeiger liegt meist kurz vor dem Klick auf einer Aufgabenzeile. Diese
   kleine Einweg-Vorladung startet den Detailaufruf bereits dort; die Seite
   verbraucht genau dieselbe Promise und entfernt sie danach sofort. Damit
   kann kein alter Detailstand spaetere Aenderungen ueberdecken. */
const detailPreloads = new Map<string, { createdAt: number; request: Promise<TaskDetailResult> }>();
const DETAIL_PRELOAD_MAX_AGE_MS = 15_000;
const detailCacheKey = (taskId: string): string => {
    const tenant = sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId') || '';
    return `${tenant}:${taskId}`;
};
const requestTaskDetail = (taskId: string): Promise<TaskDetailResult> =>
    apiClient.get<TaskDetailResult>(`${BASE}/${taskId}`, { params: todayParams() }).then((response) => response.data);
const preloadTaskDetail = (taskId: string): Promise<void> => {
    const key = detailCacheKey(taskId);
    const current = detailPreloads.get(key);
    if (current && Date.now() - current.createdAt < DETAIL_PRELOAD_MAX_AGE_MS) {
        return current.request.then(() => undefined, () => undefined);
    }
    const request = requestTaskDetail(taskId);
    detailPreloads.set(key, { createdAt: Date.now(), request });
    void request.catch(() => { if (detailPreloads.get(key)?.request === request) detailPreloads.delete(key); });
    return request.then(() => undefined, () => undefined);
};
const consumeTaskDetail = (taskId: string): Promise<TaskDetailResult> => {
    const key = detailCacheKey(taskId);
    const warmed = detailPreloads.get(key);
    detailPreloads.delete(key);
    return warmed && Date.now() - warmed.createdAt < DETAIL_PRELOAD_MAX_AGE_MS
        ? warmed.request
        : requestTaskDetail(taskId);
};

/** Zeitpunkt für den Server: Date/ISO → ISO, leer → null. */
export const toIso = (value: Date | string | null | undefined): string | null => {
    if (value === null || value === undefined || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export interface TaskCreateInput {
    title: string;
    description?: string | null;
    assigneeIds?: string[];
    startAt?: string | null;
    dueAt?: string | null;
    reminderAt?: string | null;
    flagged?: boolean;
    labelIds?: string[];
    priority?: TaskPriority;
}

export type TaskUpdateInput = Partial<Omit<TaskCreateInput, 'assigneeIds' | 'labelIds'>>;

export interface ChecklistItemInput {
    text?: string;
    afterItemId?: string | null;
    assigneeId?: string | null;
    dueAt?: string | null;
    reminderAt?: string | null;
    flagged?: boolean;
}

export interface MoveTaskInput {
    status?: ManualTaskStatus;
    reason?: string;
    beforeTaskId?: string | null;
    afterTaskId?: string | null;
}

/**
 * EIN FADEN in «Sorular & Sorunlar». Personen und Aufgaben reisen als Liste:
 * mit Datei wird daraus multipart (jedes Feld eine Zeichenkette, Listen als
 * JSON-Text — der Server nimmt beides an).
 */
export interface IssueCreateInput {
    kind: TaskIssue['kind'];
    title: string;
    text?: string;
    important?: boolean;
    /** Markierte Personen IN DER REIHENFOLGE der Auswahl: die erste bekommt die Mail. */
    personIds?: string[];
    taskIds?: string[];
}

/** Körper eines Fadens: mit Dateien multipart, sonst JSON. */
const issueBody = (fields: Record<string, unknown>, files: File[]): FormData | Record<string, unknown> => {
    if (!files.length) return fields;
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue;
        form.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
    }
    for (const file of files) form.append('files', file, file.name);
    return form;
};

/** Text + Dateien als multipart (Feld `files`); ohne Dateien reicht JSON. */
const textWithFiles = (text: string, files: File[]): FormData | { text: string } => {
    if (!files.length) return { text };
    const form = new FormData();
    form.append('text', text);
    for (const file of files) form.append('files', file, file.name);
    return form;
};

const rangeParams = (range: ReportRangeKey | { from: string; to: string }) =>
    typeof range === 'string' ? { range } : { from: range.from, to: range.to };

export const tasksApi = {
    /* ── Modul ──────────────────────────────────────────────────────────── */
    bootstrap: () => apiClient.get<TasksBootstrap>(`${BASE}/bootstrap`).then((r) => r.data),
    summary: () => apiClient.get<TasksSummary>(`${BASE}/summary`).then((r) => r.data),
    completeOnboarding: () => apiClient.post<TaskOnboarding>(`${BASE}/onboarding/complete`, {}).then((r) => r.data),

    /* ── Aufgaben ───────────────────────────────────────────────────────── */
    list: (params: TaskListParams = {}) =>
        apiClient.get<TaskListResult>(BASE, { params: { ...params, flagged: params.flagged ? 1 : undefined } }).then((r) => r.data),
    search: (q: string, filter: TaskListParams['filter'] = 'all') =>
        apiClient.get<{ data: TaskSearchHit[] }>(BASE, { params: { view: 'search', q, filter } }).then((r) => r.data.data),
    approvals: () => apiClient.get<TaskApprovalsResult>(`${BASE}/approvals`).then((r) => r.data),
    detail: consumeTaskDetail,
    /** Maus/Fokus-Vorladen fuer eine gefuehlt sofortige Navigation. */
    prefetchDetail: preloadTaskDetail,
    create: (input: TaskCreateInput) => apiClient.post<TaskEnvelope>(BASE, input).then((r) => r.data),
    update: (taskId: string, patch: TaskUpdateInput) => apiClient.patch<TaskEnvelope>(`${BASE}/${taskId}`, patch).then((r) => r.data),
    remove: (taskId: string) => apiClient.delete(`${BASE}/${taskId}`).then(() => undefined),
    duplicate: (taskId: string, title?: string) =>
        apiClient.post<TaskEnvelope>(`${BASE}/${taskId}/duplicate`, title ? { title } : {}).then((r) => r.data),
    setStatus: (taskId: string, status: ManualTaskStatus, reason?: string) =>
        apiClient.post<TaskEnvelope>(`${BASE}/${taskId}/status`, reason ? { status, reason } : { status }).then((r) => r.data),
    block: (taskId: string, reason: string | null) =>
        apiClient.post<TaskEnvelope>(`${BASE}/${taskId}/block`, { reason }).then((r) => r.data),
    /**
     * Direkt abschliessen (16.09.2026) — keine Anfrage, keine Freigabe.
     * Überfällig: `delayReason` ist Pflicht (Server: DELAY_REASON_REQUIRED).
     */
    complete: (taskId: string, delayReason?: string) =>
        apiClient.post<TaskEnvelope>(`${BASE}/${taskId}/complete`, delayReason ? { delayReason } : {}).then((r) => r.data),
    /** Löschen beantragen (Nicht-Admins); ein Admin bestätigt mit `remove` oder lehnt ab. */
    requestDelete: (taskId: string, note?: string) =>
        apiClient.post<TaskEnvelope>(`${BASE}/${taskId}/delete-request`, note ? { note } : {}).then((r) => r.data),
    cancelDeleteRequest: (taskId: string) =>
        apiClient.delete<TaskEnvelope>(`${BASE}/${taskId}/delete-request`).then((r) => r.data),
    rejectDelete: (taskId: string, note?: string) =>
        apiClient.post<TaskEnvelope>(`${BASE}/${taskId}/delete-request/reject`, note ? { note } : {}).then((r) => r.data),
    /** «Ortak ekle»: GENAU EINE Person sofort als Verantwortliche aufnehmen — keine Anfrage. */
    addPartner: (taskId: string, employeeId: string) =>
        apiClient.post<TaskEnvelope>(`${BASE}/${taskId}/partners`, { employeeId }).then((r) => r.data),
    setAssignees: (taskId: string, employeeIds: string[]) =>
        apiClient.put<TaskEnvelope>(`${BASE}/${taskId}/assignees`, { employeeIds }).then((r) => r.data),
    setLabels: (taskId: string, labelIds: string[]) =>
        apiClient.put<TaskEnvelope>(`${BASE}/${taskId}/labels`, { labelIds }).then((r) => r.data),
    move: (taskId: string, input: MoveTaskInput) =>
        apiClient.post<TaskEnvelope>(`${BASE}/${taskId}/move`, input).then((r) => r.data),
    activity: (taskId: string) =>
        apiClient.get<{ data: TaskActivity[]; people: PeopleMap }>(`${BASE}/${taskId}/activity`).then((r) => r.data),

    /* ── Zeitmessung ────────────────────────────────────────────────────── */
    startTimer: (taskId: string) =>
        apiClient.post<{ timer: StartTimerResult; serverNow: string }>(`${BASE}/${taskId}/timer/start`, {}).then((r) => r.data),
    pauseTimer: (taskId: string) =>
        apiClient.post<{ stopped: ClosedSession | null; serverNow: string }>(`${BASE}/${taskId}/timer/pause`, {}).then((r) => r.data),
    pauseAnyTimer: () =>
        apiClient.post<{ stopped: ClosedSession | null; serverNow: string }>(`${BASE}/timer/pause`, {}).then((r) => r.data),
    activeTimer: () =>
        apiClient.get<{ active: ActiveTimerInfo | null; serverNow: string }>(`${BASE}/timer/active`).then((r) => r.data),

    /* ── Inhalt und Checklisten ─────────────────────────────────────────── */
    saveContent: (taskId: string, blocks: ContentBlock[], baseVersion: number) =>
        apiClient.put<{ content: ContentDto }>(`${BASE}/${taskId}/content`, { blocks, baseVersion }).then((r) => r.data.content),
    addChecklist: (taskId: string, input: { title?: string; appendBlock?: boolean; afterBlockId?: string | null }) =>
        apiClient.post<{ checklist: Checklist; content?: ContentDto }>(`${BASE}/${taskId}/checklists`, input).then((r) => r.data),
    renameChecklist: (checklistId: string, title: string) =>
        apiClient.patch<{ checklist: Checklist }>(`${BASE}/checklists/${checklistId}`, { title }).then((r) => r.data),
    deleteChecklist: (checklistId: string) =>
        apiClient.delete<{ content: ContentDto; progress: ChecklistProgress }>(`${BASE}/checklists/${checklistId}`).then((r) => r.data),
    checkAll: (checklistId: string) =>
        apiClient.post<{ checklist: Checklist; progress: ChecklistProgress }>(`${BASE}/checklists/${checklistId}/check-all`, {}).then((r) => r.data),
    clearDone: (checklistId: string) =>
        apiClient.post<{ checklist: Checklist; progress: ChecklistProgress }>(`${BASE}/checklists/${checklistId}/clear-done`, {}).then((r) => r.data),
    addItem: (checklistId: string, input: ChecklistItemInput & { text: string; id?: string }) =>
        apiClient.post<{ item: ChecklistItem; progress: ChecklistProgress; task?: { assigneeIds: string[] } }>(
            `${BASE}/checklists/${checklistId}/items`, input,
        ).then((r) => r.data),
    updateItem: (itemId: string, patch: ChecklistItemInput) =>
        apiClient.patch<{ item: ChecklistItem; progress: ChecklistProgress; task?: { assigneeIds: string[] } }>(
            `${BASE}/checklist-items/${itemId}`, patch,
        ).then((r) => r.data),
    toggleItem: (itemId: string, done?: boolean) =>
        apiClient.post<{ item: ChecklistItem; progress: ChecklistProgress }>(
            `${BASE}/checklist-items/${itemId}/toggle`, done === undefined ? {} : { done },
        ).then((r) => r.data),
    moveItem: (itemId: string, direction: 'up' | 'down') =>
        apiClient.post<{ checklist: Checklist }>(`${BASE}/checklist-items/${itemId}/move`, { direction }).then((r) => r.data),
    deleteItem: (itemId: string) =>
        apiClient.delete<{ progress: ChecklistProgress }>(`${BASE}/checklist-items/${itemId}`).then((r) => r.data),

    /* ── Kommentare und Dateien ─────────────────────────────────────────── */
    comments: (taskId: string) =>
        apiClient.get<{ data: TaskComment[]; people: PeopleMap }>(`${BASE}/${taskId}/comments`).then((r) => r.data),
    addComment: (taskId: string, text: string, files: File[] = []) =>
        apiClient.post<{ comment: TaskComment; people: PeopleMap }>(`${BASE}/${taskId}/comments`, textWithFiles(text, files)).then((r) => r.data),
    deleteComment: (commentId: string) => apiClient.delete(`${BASE}/comments/${commentId}`).then(() => undefined),
    /* ── Sorular & Sorunlar ─────────────────────────────────────────────── */
    issues: (taskId: string) =>
        apiClient.get<{ data: TaskIssue[]; people: PeopleMap }>(`${BASE}/${taskId}/issues`).then((r) => r.data),
    createIssue: (taskId: string, input: IssueCreateInput, files: File[] = []) =>
        apiClient.post<{ issue: TaskIssue; people: PeopleMap }>(
            `${BASE}/${taskId}/issues`,
            // Echtes `true`/`false`: als JSON eine Wahrheit, als multipart «true»/«false».
            // Eine 1 kam auf dem Server als Zahl an und fiel durch die Prüfung («Girilen bilgiler geçersiz»).
            issueBody({ ...input, important: Boolean(input.important) }, files),
        ).then((r) => r.data),
    replyToIssue: (issueId: string, text: string, files: File[] = [], personIds: string[] = []) =>
        apiClient.post<{ issue: TaskIssue; people: PeopleMap }>(
            `${BASE}/issues/${issueId}/replies`,
            issueBody({ text, personIds }, files),
        ).then((r) => r.data),
    setIssueResolved: (issueId: string, resolved: boolean) =>
        apiClient.post<{ issue: TaskIssue }>(`${BASE}/issues/${issueId}/status`, { resolved }).then((r) => r.data.issue),
    deleteIssue: (issueId: string) => apiClient.delete(`${BASE}/issues/${issueId}`).then(() => undefined),

    attachments: (taskId: string) =>
        apiClient.get<{ data: TaskAttachment[] }>(`${BASE}/${taskId}/attachments`).then((r) => r.data.data),
    uploadAttachments: (taskId: string, files: File[]) => {
        const form = new FormData();
        for (const file of files) form.append('files', file, file.name);
        return apiClient.post<{ data: TaskAttachment[] }>(`${BASE}/${taskId}/attachments`, form).then((r) => r.data.data);
    },
    deleteAttachment: (attachmentId: string) => apiClient.delete(`${BASE}/attachments/${attachmentId}`).then(() => undefined),

    /* ── Etiketten ──────────────────────────────────────────────────────── */
    labels: () => apiClient.get<{ data: LabelDto[] }>(`${BASE}/labels`).then((r) => r.data.data),
    createLabel: (name: string, color?: LabelColor) =>
        apiClient.post<{ label: LabelDto }>(`${BASE}/labels`, color ? { name, color } : { name }).then((r) => r.data.label),
    updateLabel: (labelId: string, patch: { name?: string; color?: LabelColor }) =>
        apiClient.patch<{ label: LabelDto }>(`${BASE}/labels/${labelId}`, patch).then((r) => r.data.label),
    deleteLabel: (labelId: string) => apiClient.delete(`${BASE}/labels/${labelId}`).then(() => undefined),

    /* ── Canlı: wer heute woran arbeitet (Tagesgrenzen des Browsers) ───── */
    live: (day: { from: string; to: string }) =>
        apiClient.get<LiveOverview>(`${BASE}/live`, { params: day }).then((r) => r.data),

    /* ── Personen ───────────────────────────────────────────────────────── */
    directory: () => apiClient.get<{ data: DirectoryPerson[] }>(`${BASE}/people/directory`).then((r) => r.data.data),
    peopleStats: (range: ReportRangeKey | { from: string; to: string } = '30') =>
        apiClient.get<{ data: PersonStats[]; range: ReportRange; serverNow: string }>(`${BASE}/people`, { params: rangeParams(range) }).then((r) => r.data),

    /* ── Berichte ───────────────────────────────────────────────────────── */
    /** `fromDate`/`toDate` (YYYY-MM-DD): mit ihnen kommen die Gün sonu raporları dazu. */
    workReport: (from: string, to: string, person = '', days?: { fromDate: string; toDate: string }) =>
        apiClient.get<WorkReport>(`${BASE}/reports/work`, { params: { from, to, ...(person ? { person } : {}), ...(days ?? {}) } }).then((r) => r.data),

    /* ── Gün sonu raporu (jede Person, eigener Rapport) ─────────────────── */
    myDailyReport: (params: { date: string; from: string; to: string; weekStart: string }) =>
        apiClient.get<MyDailyReport>(`${BASE}/daily-reports/me`, { params }).then((r) => r.data),
    saveDailyReport: (input: { date: string; from: string; to: string; body: string }) =>
        apiClient.put<{ report: DailyReport }>(`${BASE}/daily-reports/me`, input).then((r) => r.data.report),
    /** Bild/PDF/Datei für das Blatt eines Tages — sie hängt an keiner Aufgabe. */
    uploadDailyReportFiles: (day: { date: string; from: string; to: string }, files: File[]) => {
        const form = new FormData();
        form.append('date', day.date);
        form.append('from', day.from);
        form.append('to', day.to);
        for (const file of files) form.append('files', file, file.name);
        return apiClient.post<{ data: TaskAttachment[] }>(`${BASE}/daily-reports/me/files`, form).then((r) => r.data.data);
    },
    dailyReportSetting: () =>
        apiClient.get<{ settings: DailyReportSetting }>(`${BASE}/daily-reports/settings`).then((r) => r.data.settings),
    saveDailyReportSetting: (settings: DailyReportSetting) =>
        apiClient.put<{ settings: DailyReportSetting }>(`${BASE}/daily-reports/settings`, settings).then((r) => r.data.settings),

    /* ── Einstellungen ──────────────────────────────────────────────────── */
    settings: () => apiClient.get<{ settings: TaskSettings }>(`${BASE}/settings/me`).then((r) => r.data.settings),
    saveSettings: (settings: TaskSettings) =>
        apiClient.put<{ settings: TaskSettings }>(`${BASE}/settings/me`, settings).then((r) => r.data.settings),

    /* ── Chat ───────────────────────────────────────────────────────────── */
    rooms: () => apiClient.get<ChatRoomList>(`${BASE}/chat/rooms`).then((r) => r.data),
    room: (roomId: string) => apiClient.get<RoomDetail>(`${BASE}/chat/rooms/${roomId}`).then((r) => r.data),
    createRoom: (input: { name: string; memberIds: string[]; taskIds: string[] }) =>
        apiClient.post<{ room: RoomDetail }>(`${BASE}/chat/rooms`, input).then((r) => r.data.room),
    renameRoom: (roomId: string, name: string) =>
        apiClient.patch<{ room: RoomDetail }>(`${BASE}/chat/rooms/${roomId}`, { name }).then((r) => r.data.room),
    deleteRoom: (roomId: string) => apiClient.delete(`${BASE}/chat/rooms/${roomId}`).then(() => undefined),
    addRoomMember: (roomId: string, employeeId: string) =>
        apiClient.post<{ room: RoomDetail }>(`${BASE}/chat/rooms/${roomId}/members`, { employeeId }).then((r) => r.data.room),
    removeRoomMember: (roomId: string, employeeId: string) =>
        apiClient.delete<{ room: RoomDetail }>(`${BASE}/chat/rooms/${roomId}/members/${employeeId}`).then((r) => r.data.room),
    linkRoomTask: (roomId: string, taskId: string) =>
        apiClient.post<{ room: RoomDetail }>(`${BASE}/chat/rooms/${roomId}/tasks`, { taskId }).then((r) => r.data.room),
    unlinkRoomTask: (roomId: string, taskId: string) =>
        apiClient.delete<{ room: RoomDetail }>(`${BASE}/chat/rooms/${roomId}/tasks/${taskId}`).then((r) => r.data.room),
    messages: (roomId: string, cursor: { after?: string; before?: string; limit?: number } = {}) =>
        apiClient.get<ChatMessagePage>(`${BASE}/chat/rooms/${roomId}/messages`, { params: cursor }).then((r) => r.data),
    sendMessage: (roomId: string, text: string, files: File[] = []) =>
        apiClient.post<{ message: ChatMessage; people: PeopleMap }>(`${BASE}/chat/rooms/${roomId}/messages`, textWithFiles(text, files)).then((r) => r.data),
    deleteMessage: (messageId: string) => apiClient.delete(`${BASE}/chat/messages/${messageId}`).then(() => undefined),
    markRoomRead: (roomId: string) =>
        apiClient.post<{ ok: true; unreadTotal: number }>(`${BASE}/chat/rooms/${roomId}/read`, {}).then((r) => r.data),
    unread: () => apiClient.get<ChatUnread>(`${BASE}/chat/unread`).then((r) => r.data),
};

/**
 * Adresse einer Moduldatei für <img>/<a>. Der Browser sendet dort keinen
 * X-Tenant-Id-Kopf — die ausgewählte Firma reist darum in der Abfrage mit
 * (der Server prüft sie wie den Kopf).
 */
export const attachmentUrl = (attachment: Pick<TaskAttachment, 'contentPath'> & { url?: string | null }, download = false): string => {
    // Bilder und PDFs in R2 kommen direkt von Cloudflare; Downloads und alles andere über den Server.
    if (!download && attachment.url) return attachment.url;
    const base = String(apiClient.defaults.baseURL || '').replace(/\/+$/, '');
    const tenantId = sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId') || '';
    const params = new URLSearchParams();
    if (tenantId) params.set('tenantId', tenantId);
    if (download) params.set('download', '1');
    const query = params.toString();
    return `${base}${attachment.contentPath}${query ? `?${query}` : ''}`;
};

/**
 * Dieselbe Adresse, aber vollständig (mit Herkunft) — der Rapport und sein PDF
 * drucken sie als anklickbaren Link (16.09.2026).
 */
export const absoluteAttachmentUrl = (attachment: Pick<TaskAttachment, 'contentPath'> & { url?: string | null }): string => {
    const url = attachmentUrl(attachment);
    return /^https?:/i.test(url) ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
};

/**
 * Fehlertext einer Antwort: der Server liefert `{ error, code }`. Für bekannte
 * Codes steht ein übersetzter Satz unter `tasksModule.errors.<CODE>`, sonst
 * der übergebene Rückfall. Den Satz des Servers (deutsch) zeigen wir nie —
 * die Oberfläche spricht nur die gewählte Sprache.
 */
export const tasksErrorMessage = (error: unknown, fallbackKey = 'tasksModule.errors.generic'): string => {
    const data = (error as { response?: { data?: { code?: unknown } } })?.response?.data;
    const code = typeof data?.code === 'string' ? data.code : '';
    if (code && i18n.exists(`tasksModule.errors.${code}`)) return t(`tasksModule.errors.${code}`);
    return t(fallbackKey);
};

/** Fehlercode einer Antwort (für Sonderfälle wie CONTENT_CONFLICT). */
export const tasksErrorCode = (error: unknown): string => {
    const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
    return typeof code === 'string' ? code : '';
};

/** Aktueller Inhalt aus einer 409-CONTENT_CONFLICT-Antwort. */
export const conflictContent = (error: unknown): ContentDto | null => {
    const content = (error as { response?: { data?: { content?: unknown } } })?.response?.data?.content;
    return content && typeof content === 'object' ? (content as ContentDto) : null;
};
