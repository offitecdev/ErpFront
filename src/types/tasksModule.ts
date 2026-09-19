/**
 * ── GÖREVLER / TASKS-MODUL: Datenformen (13.09.2026, Vorgabe Samet) ──────────
 *
 * Wortgleich zu den Antworten von /api/v1/tasks (Erp_Backend
 * src/application/services/tasks/*). Zeitpunkte reisen als ISO-Zeichenkette.
 * Nicht verwechseln mit den CRM-Aufgaben (/crm/tasks, types/crm*).
 */

export type TaskStatus =
    | 'NOT_STARTED'
    | 'IN_PROGRESS'
    | 'REVIEW'
    | 'PENDING_APPROVAL'
    | 'COMPLETED'
    | 'BLOCKED'
    | 'REJECTED';

/** Was die Leitung von Hand setzen darf (Menü «Durum», Spalten der Pano). */
export type ManualTaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type ApprovalState = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type ReviewState = 'APPROVED' | 'PENDING' | 'REJECTED';
export type LabelColor = 'gray' | 'blue' | 'green' | 'orange' | 'red' | 'purple';

export interface PersonRef {
    id: string;
    name: string;
    /* Die Liste schickt nur id + Name; Detail, Chat usw. auch den Rest. */
    firstName?: string;
    lastName?: string;
    title?: string | null;
    active?: boolean;
}

export type PeopleMap = Record<string, PersonRef>;

export interface RunningSessionRef {
    employeeId: string;
    startedAt: string;
}

/**
 * Eine Zeile der Görevler-Liste — NUR was die Liste zeigt (14.09.2026, Samet:
 * «sadece gerekli olan veriler gelsin»). Alles Weitere trägt `TaskDetail`.
 */
export interface TaskRow {
    id: string;
    title: string;
    status: TaskStatus;
    effectiveStatus: TaskStatus;
    flagged: boolean;
    dueAt: string | null;
    completedAt: string | null;
    createdById: string;
    approvalState: ApprovalState;
    reviewState: ReviewState;
    /** Grund «nicht machbar» (Vorbelegung des Dialogs). */
    blockReason: string | null;
    /** Wer das Löschen beantragt hat (null = keine offene Anfrage). */
    deleteRequestedById: string | null;
    /** Gecikme açıklaması liegt vor (Text nur im Detail). */
    hasDelayReason?: boolean;
    assigneeIds: string[];
    labelIds: string[];
    checklist: { done: number; total: number };
    commentCount: number;
    attachmentCount: number;
    overdue: boolean;
    /** Nur die EIGENE laufende Messung — ihr Anteil steckt NICHT in `work.dayMs` (der Browser zählt sie ab dem Klick). */
    timer: { runningForMe: boolean; myStartedAt: string | null };
    /**
     * Zeit des TAGES bis `serverNow` — Leitung: alle Personen, sonst nur die eigenen;
     * `liveCount` zählt auch die eigene laufende Messung, ihre Zeit aber nicht (siehe `timer`).
     */
    work?: { dayMs: number; liveCount: number };
}

export interface TaskDetail extends Omit<TaskRow, 'timer' | 'work'> {
    /** Offene Fragen und Probleme — die Marke am Reiter «Sorular & Sorunlar». */
    openIssueCount: number;
    priority: TaskPriority;
    origin: 'MANAGER' | 'MEMBER';
    startAt: string | null;
    reminderAt: string | null;
    createdAt: string;
    updatedAt: string;
    boardPosition: number;
    timer: { runningForMe: boolean; myStartedAt: string | null };
    work?: { closedMs: number; liveMs: number; totalMs: number; live: RunningSessionRef[] };
    description: string | null;
    approval: {
        state: ApprovalState;
        requestedById: string | null;
        requestedAt: string | null;
        note: string | null;
        decidedById: string | null;
        decidedAt: string | null;
        decisionNote: string | null;
    };
    review: {
        state: ReviewState;
        requestedById: string | null;
        requestedAt: string | null;
        decidedById: string | null;
        decidedAt: string | null;
        note: string | null;
    };
    /** Offene Löschanfrage (requestedById null = keine). */
    deleteRequest: {
        requestedById: string | null;
        requestedAt: string | null;
        note: string | null;
    };
    /** Gecikme açıklaması einer verspätet fertig gemeldeten Aufgabe (reason null = keine). */
    delay?: {
        reason: string | null;
        byId: string | null;
        at: string | null;
    };
}

export interface TaskPermissions {
    isAssignee: boolean;
    isCreator: boolean;
    canSee: boolean;
    canEdit: boolean;
    canTrack: boolean;
    canEditContent: boolean;
    canUpload: boolean;
    canComment: boolean;
    canFlag: boolean;
    /** Direkt abschliessen: Verantwortliche und Leitung einer offenen Aufgabe (16.09.2026). */
    canComplete: boolean;
    canManage: boolean;
    /** Nur Admins löschen … */
    canDelete: boolean;
    /** … alle anderen Beteiligten beantragen es. */
    canRequestDelete: boolean;
    canCancelDeleteRequest: boolean;
    /** Verantwortliche zuweisen/entfernen — nur die Administratorrolle. */
    canAssign?: boolean;
    /** «Ortak ekle»: EINE Person direkt hinzufügen (Nicht-Admin, verantwortlich, offene Aufgabe). */
    canAddPartner?: boolean;
}

export interface TaskEnvelope {
    task: TaskDetail;
    people: PeopleMap;
    serverNow: string;
}

export interface LabelDto {
    id: string;
    name: string;
    color: LabelColor;
    /** Nur für die Leitung. */
    usageCount?: number;
}

export interface ActiveTimerInfo {
    taskId: string;
    taskTitle: string;
    /** Firma der Aufgabe — kann eine andere als die ausgewählte sein. */
    tenantId: string;
    startedAt: string;
}

export interface TasksSummary {
    openCount: number;
    overdueCount: number;
    dueTodayCount: number;
    pendingApprovalCount: number;
    unreadChatCount: number;
    activeTimer: ActiveTimerInfo | null;
    serverNow: string;
}

export interface TasksBootstrap {
    /** `seesAll`: Admin — sieht alle Aufgaben; alle anderen nur zugewiesene/angelegte. */
    actor: { employeeId: string; isManager: boolean; canDelete: boolean; seesAll: boolean; isSystemAdmin?: boolean };
    labels: LabelDto[];
    settings: { reminderLeadMinutes: number };
    summary: TasksSummary;
    onboarding: TaskOnboarding;
    serverNow: string;
}

export interface TaskOnboarding {
    taskId: string;
    completed: boolean;
    version: string;
    guide: 'admin' | 'member';
}

export type TaskListFilter = 'open' | 'done' | 'late' | 'all';
/** Zeitraum der Liste: Bugün / Bu hafta / Bu ay / Tümü. */
export type TaskListPeriod = 'today' | 'week' | 'month' | 'all';
export type TaskListScope = 'all' | 'mine';
export type TaskListView = 'list' | 'board' | 'search';
export type TaskListSort = 'due' | 'created' | 'title' | 'status' | 'priority';

export interface TaskListParams {
    filter?: TaskListFilter;
    scope?: TaskListScope;
    view?: TaskListView;
    sort?: TaskListSort;
    dir?: 'asc' | 'desc';
    assigneeId?: string;
    labelId?: string;
    status?: TaskStatus;
    flagged?: boolean;
    q?: string;
    /** ISO-Grenzen des Zeitraums (beide oder keine). */
    from?: string;
    to?: string;
    /** Kalendertag des Browsers — die Zeilen zeigen die Zeit dieses Tages. */
    dayFrom?: string;
    dayTo?: string;
    page?: number;
    pageSize?: number;
}

export interface TaskListResult {
    data: TaskRow[];
    total: number;
    page: number;
    pageSize: number;
    /** Nur Anzeigenamen. */
    people: PeopleMap;
    serverNow: string;
}

export interface TaskSearchHit {
    id: string;
    title: string;
    status: TaskStatus;
    dueAt: string | null;
}

export interface TaskApprovalsResult {
    /** Offene Löschanfragen — nur Admins bekommen sie; Abschlussanfragen gibt es nicht mehr. */
    deleteRequests: TaskDetail[];
    people: PeopleMap;
    serverNow: string;
}

/* ── Inhalt (Blockeditor) ─────────────────────────────────────────────── */

export type BlockType = 'p' | 'h2' | 'h3' | 'bullet' | 'number' | 'quote' | 'divider' | 'table' | 'checklist' | 'image' | 'file';

export interface ContentBlock {
    id: string;
    type: BlockType;
    /** Bereinigtes Inline-HTML bei Textblöcken — nie maskiert anzeigen. */
    text: string;
    meta: {
        align?: 'left' | 'center' | 'right';
        rows?: string[][];
        /** Tabelle: px je Spalte; bei `fit` nur Gewichte. */
        colWidths?: number[];
        /** Tabelle eingepasst: Notizbreite oder Fensterbreite. Fehlt = feste px-Breiten. */
        fit?: 'note' | 'window';
        /** Tabelle: Hintergrund je Zelle («#rrggbb» oder leer), wie `rows` geformt. */
        cellBg?: string[][];
        /** Tabelle: senkrechte Ausrichtung je Zelle (leer = oben). */
        cellVAlign?: Array<Array<'' | 'top' | 'middle' | 'bottom'>>;
        groupId?: string;
        attId?: string;
        /** Bild: Anzeigebreite in px (fehlt = natürliche Grösse, höchstens 420px hoch). */
        width?: number;
        /** Bild: sichtbarer Ausschnitt in Anteilen des Originals. */
        crop?: ImageCrop;
        /** Bild: Breite/Höhe des Originals (Rahmen des Ausschnitts). */
        ratio?: number;
    };
}

export interface ImageCrop {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface ContentDto {
    blocks: ContentBlock[];
    /** 0 = noch nie gespeichert. */
    version: number;
    updatedAt: string | null;
    updatedById: string | null;
}

/* ── Checklisten ──────────────────────────────────────────────────────── */

export interface ChecklistItem {
    id: string;
    checklistId: string;
    text: string;
    position: number;
    done: boolean;
    doneAt: string | null;
    doneById: string | null;
    assigneeId: string | null;
    dueAt: string | null;
    reminderAt: string | null;
    flagged: boolean;
    createdById: string | null;
    createdAt: string;
}

export interface Checklist {
    id: string;
    title: string;
    position: number;
    createdById: string | null;
    createdAt: string;
    progress: { done: number; total: number };
    items: ChecklistItem[];
}

export interface ChecklistProgress {
    done: number;
    total: number;
}

/* ── Dateien, Kommentare ──────────────────────────────────────────────── */

export interface TaskAttachment {
    id: string;
    kind: 'TASK' | 'COMMENT' | 'CHAT' | 'ISSUE' | 'DAILY';
    fileName: string;
    contentType: string;
    sizeBytes: number;
    isImage: boolean;
    isPdf: boolean;
    uploadedById: string | null;
    createdAt: string;
    /** API-Pfad ohne Präfix: `/tasks/attachments/<id>/content`. */
    contentPath: string;
    /** Cloudflare-Adresse (Bilder/PDFs in R2), sonst null. */
    url?: string | null;
}

export interface TaskComment {
    id: string;
    authorId: string;
    /** Klartext. */
    text: string;
    createdAt: string;
    attachments: TaskAttachment[];
    canDelete: boolean;
}

/* ── Sorular & Sorunlar ───────────────────────────────────────────────── */

/** «Sorular» (Frage) und «Sorunlar» (Problem) — die zwei Reiter der Kapsel. */
export type IssueKind = 'QUESTION' | 'ISSUE';
export type IssueStatus = 'OPEN' | 'RESOLVED';

/** TO = die zuerst markierte Person (An-Feld der Mail), CC = alle weiteren. */
export interface IssuePerson {
    employeeId: string;
    role: 'TO' | 'CC';
}

/** Eine im Faden markierte ANDERE Aufgabe. */
export interface IssueLink {
    taskId: string;
    title: string;
    status: TaskStatus;
}

/** Eine Sprechblase: die Frage selbst oder eine Antwort. Dateien stehen DARIN. */
export interface IssueMessage {
    id: string;
    authorId: string;
    text: string;
    createdAt: string;
    attachments: TaskAttachment[];
    isOpening: boolean;
}

export interface TaskIssue {
    id: string;
    taskId: string;
    kind: IssueKind;
    /** Die farbige Überschrift über der Blase. */
    title: string;
    status: IssueStatus;
    important: boolean;
    authorId: string;
    createdAt: string;
    lastMessageAt: string;
    resolvedById: string | null;
    resolvedAt: string | null;
    people: IssuePerson[];
    links: IssueLink[];
    messages: IssueMessage[];
    canReply: boolean;
    canResolve: boolean;
    canDelete: boolean;
}

/* ── Detail ───────────────────────────────────────────────────────────── */

export type ForecastReason = 'NEEDS_CHECKLIST' | 'NOT_ENOUGH_DATA' | 'ALL_DONE';

export interface TaskForecast {
    ok: boolean;
    completed: boolean;
    predictedAt: string | null;
    calendarDays: number | null;
    delayDays: number | null;
    late: boolean;
    total: number;
    done: number;
    remaining: number;
    reasonCode: ForecastReason | null;
}

export interface WorkBreakdownEntry {
    employeeId: string;
    /** Alle Tage. */
    ms: number;
    /** Nur der Kalendertag der Anfrage — die Ansicht zeigt den Tag, die Summe steht im Rapport. */
    dayMs: number;
    sessions: number;
    first: string;
    last: string;
    live: boolean;
}

export interface WorkDto {
    totalMs: number;
    closedMs: number;
    liveMs: number;
    /** Zeit des Kalendertags über alle gezeigten Personen. */
    dayMs: number;
    breakdown: WorkBreakdownEntry[];
}

export interface ChatRoomRef {
    id: string;
    name: string;
}

export interface TaskDetailResult {
    task: TaskDetail;
    permissions: TaskPermissions;
    content: ContentDto;
    checklists: Checklist[];
    attachments: TaskAttachment[];
    /** Mit dem Detail vorgeladen, damit der Kommentar-Reiter sofort oeffnet. */
    comments: TaskComment[];
    chatRooms: ChatRoomRef[];
    forecast: TaskForecast;
    /** null für Teammitglieder. */
    work: WorkDto | null;
    people: PeopleMap;
    serverNow: string;
}

export type TaskActivityType =
    | 'CREATED' | 'DUPLICATED' | 'UPDATED' | 'STATUS' | 'ASSIGNED' | 'UNASSIGNED' | 'COMMENT' | 'ATTACHMENT'
    | 'TIMER_START' | 'TIMER_PAUSE' | 'CHECK_DONE' | 'CHECK_UNDONE' | 'CHECKLIST_ADD'
    | 'COMPLETION_REQUESTED' | 'COMPLETION_APPROVED' | 'COMPLETION_REJECTED' | 'COMPLETION_CANCELLED'
    | 'REVIEW_APPROVED' | 'REVIEW_REJECTED' | 'BLOCKED';

export interface TaskActivity {
    id: string;
    type: TaskActivityType;
    actorId: string | null;
    meta: Record<string, unknown> | null;
    createdAt: string;
}

/* ── Zeitmessung ──────────────────────────────────────────────────────── */

export interface StartTimerResult {
    taskId: string;
    startedAt: string;
    alreadyRunning: boolean;
    status: TaskStatus;
    statusChanged: boolean;
    switchedFrom: { taskId: string; title: string; tenantId: string; durationMs: number; discarded: boolean } | null;
}

export interface ClosedSession {
    taskId: string;
    tenantId: string;
    employeeId: string;
    durationMs: number;
    discarded: boolean;
}

/* ── Personen, Etiketten, Einstellungen ───────────────────────────────── */

export interface DirectoryPerson {
    id: string;
    firstName: string;
    lastName: string;
    name: string;
    title: string | null;
    /** Rolle(n) im System, z. B. «Administrator» — statt eines erfundenen «Yönetici». */
    roleName: string | null;
    isManager: boolean;
}

export interface ReportRange {
    key: '7' | '30' | '90' | 'all' | 'custom';
    from: string | null;
    to: string;
}

export interface PersonStats {
    employeeId: string;
    name: string;
    title: string | null;
    roleName: string | null;
    isManager: boolean;
    openCount: number;
    completedCount: number;
    overdueCount: number;
    ms: number;
    checkDone: number;
    activeTask: { taskId: string; title: string; startedAt: string } | null;
}

export interface TaskSettings {
    reminderLeadMinutes: number;
}

/** Gün sonu raporu je Firma: Zeitfenster («HH:MM», Browserzeit) Mo–Fr, in dem der Rapport geschrieben wird. */
export interface DailyReportSetting {
    promptTime: string;
    endTime: string;
}

/* ── Chat ─────────────────────────────────────────────────────────────── */

export interface ChatRoom {
    id: string;
    name: string;
    createdById: string | null;
    createdAt: string;
    lastMessageAt: string | null;
}

export interface ChatMember {
    employeeId: string;
    addedById: string | null;
    createdAt: string;
}

export interface ChatRoomTask {
    id: string;
    title: string;
    status: TaskStatus;
    canOpen: boolean;
}

export interface RoomDetail {
    room: ChatRoom;
    members: ChatMember[];
    tasks: ChatRoomTask[];
    people: PeopleMap;
}

export type ChatSystemEvent = 'ROOM_CREATED' | 'MEMBER_ADDED' | 'MEMBER_REMOVED' | 'TASK_LINKED';

export interface ChatMessage {
    id: string;
    roomId: string;
    type: 'TEXT' | 'SYSTEM';
    senderId: string | null;
    /** Klartext; bei SYSTEM nur das Rückfallnetz — `meta.event` übersetzen. */
    text: string;
    meta: { event?: ChatSystemEvent; actorId?: string; targetId?: string; taskId?: string; taskTitle?: string } | null;
    createdAt: string;
    attachments: TaskAttachment[];
    canDelete: boolean;
}

export interface ChatRoomListItem {
    id: string;
    name: string;
    memberCount: number;
    taskCount: number;
    unreadCount: number;
    lastMessage: {
        id: string;
        type: 'TEXT' | 'SYSTEM';
        senderId: string | null;
        text: string;
        meta: ChatMessage['meta'];
        hasAttachments: boolean;
        createdAt: string;
    } | null;
    lastMessageAt: string | null;
    createdAt: string;
}

export interface ChatRoomList {
    data: ChatRoomListItem[];
    people: PeopleMap;
    serverNow: string;
}

export interface ChatMessagePage {
    data: ChatMessage[];
    hasMore: boolean;
    people: PeopleMap;
    serverNow: string;
}

export interface ChatUnread {
    total: number;
    rooms: Record<string, number>;
}

/* ── Berichte ──────────────────────────────────────────────────────────── */

/**
 * Arbeitsrapport EINER Person, Tag/Woche (GET /tasks/reports/work).
 * 16.09.2026 (Samet): «sadece gün gün, gün sonunda neler yaptı» — der Rapport
 * ist nur noch die Sammlung der Gün sonu raporları des Zeitraums.
 */
export interface WorkReportSession {
    taskId: string;
    startedAt: string;
    /** null = läuft noch. */
    endedAt: string | null;
    ms: number;
}

export interface WorkReport {
    from: string;
    to: string;
    generatedAt: string;
    employee: PersonRef;
    /** Gün sonu raporları im Zeitraum — optional, solange ein älterer Server antwortet. */
    dailyReports?: DailyReport[];
    /** Messungen im Zeitraum; der Browser teilt sie auf seine Kalendertage auf. */
    sessions?: WorkReportSession[];
    /** Titel der Aufgaben aus `sessions`. */
    tasks?: Record<string, { id: string; title: string }>;
}

/* ── Gün sonu raporu (GET/PUT /tasks/daily-reports/me) ──────────────────── */

export interface DailyTaskTime {
    taskId: string;
    title: string;
    ms: number;
}

export interface DailyReport {
    /** Kalendertag des Browsers, YYYY-MM-DD. */
    date: string;
    /** Das freie Blatt in Markdown (alte Rapporte: ihre Punkte als «- …»-Zeilen). */
    body: string;
    /** Bilder, PDF und Dateien des Tages — im Rapport anklickbare Adressen. */
    files: TaskAttachment[];
    /** Beim Speichern aus den Messungen des Tages kopiert (nicht mehr angezeigt). */
    taskTimes: DailyTaskTime[];
    totalMs: number;
    submittedAt: string;
}

export interface MyDailyReport {
    date: string;
    report: DailyReport | null;
    /** Dateien des Tages, auch ohne gespeicherten Rapport. */
    files: TaskAttachment[];
    /** Live aus den Messungen des Tages. */
    taskTimes: DailyTaskTime[];
    totalMs: number;
    week: Array<{ date: string; submitted: boolean; totalMs: number }>;
    serverNow: string;
}

export type ReportRangeKey = '7' | '30' | '90' | 'all';

/* ── Canlı (GET /tasks/live) — wer heute woran arbeitet ─────────────────── */

export interface LiveSession {
    id: string;
    taskId: string;
    taskTitle: string;
    startedAt: string;
    /** null = läuft. */
    endedAt: string | null;
    /** Anteil innerhalb des Tages, Stand `serverNow`. */
    durationMs: number;
}

export interface LivePerson {
    employeeId: string;
    name: string;
    title: string | null;
    isManager: boolean;
    running: { sessionId: string; taskId: string; taskTitle: string; taskStatus: TaskStatus; startedAt: string } | null;
    /** Stand `serverNow` — eine laufende Messung zählt bis dahin mit. */
    todayMs: number;
    sessions: LiveSession[];
    completedToday: Array<{ taskId: string; title: string; completedAt: string }>;
    lastActiveAt: string | null;
}

export interface LiveOverview {
    day: { from: string; to: string };
    serverNow: string;
    taskLabels: Record<string, Array<Pick<LabelDto, 'id' | 'name' | 'color'>>>;
    people: LivePerson[];
}
