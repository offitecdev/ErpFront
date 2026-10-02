/**
 * ── GÖREVLENDİRME DER PRODUKTION (26.09.2026) — die Antworten von /production ──
 * Spiegel von Erp_Backend/src/application/use-cases/production/productionTaskReadModel.ts
 * (und den Regeln in domain/services/productionTasks.ts).
 *
 * Seit dem 28.09.2026 bringt jede Vorlage ihre Bereiche mit (`sections`):
 * Name, Anteil und die Stufen in der Reihenfolge des Weges. Die Vorlagen von
 * vorher tragen die festen Bereiche Mekanik / Elektrik mit den festen Stufen.
 */

/** Die zwei festen Bereiche — die Vorlagen von vorher und die BOM hängen an ihnen. */
export type BuiltInArea = 'MECHANICAL' | 'ELECTRICAL';

/** Die Kennung eines Bereichs («bölüm»): ein fester oder ein eigener der Vorlage («s-…»). */
export type TaskArea = string;

/**
 * Die festen Arbeitsstufen der zwei Wege (27.09.2026):
 * Mekanik equipment · drawing · approval · bom · production · test · final,
 * Elektrik circuit · approval · bom · panel · test · final.
 */
export type BuiltInStage =
    | 'equipment'
    | 'circuit'
    | 'drawing'
    | 'approval'
    | 'bom'
    | 'production'
    | 'panel'
    | 'test'
    | 'final';

/** Die Kennung einer Stufe: eine feste oder eine eigene des Bereichs («g-…»). */
export type TaskStage = string;

export interface TaskSectionStage {
    key: TaskStage;
    /** Leer bei den festen Stufen — ihr Name kommt aus der Übersetzung. */
    name: string;
    /**
     * Gewicht der Stufe im Bereich, in Prozent (30.09.2026: «the weights of the task only should
     * fill the weight of its stage») — die Stufen eines Bereichs ergeben 100 %.
     */
    weight: number;
}

export interface TaskSection {
    key: TaskArea;
    /** Leer bei den festen Bereichen — ihr Name kommt aus der Übersetzung. */
    name: string;
    /** Anteil an der Gesamtfertigstellung, in Prozent. */
    share: number;
    /** In der Reihenfolge des Weges. */
    stages: TaskSectionStage[];
}

/** Der Stand einer Aufgabe am Gerät (28.09.2026); in der Vorlage immer TODO. */
/** PENDING = fertig, wartet auf die Freigabe der Verwaltung (28.09.2026, nur mit «Approval»). */
/** REVISION (28.09.2026) = von der Verwaltung zur Überarbeitung zurückgegeben (nur an Unteraufgaben). */
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVISION' | 'PENDING' | 'DONE';

/** Ein Kalendertag `YYYY-MM-DD`. */
export type TaskDay = string;

/**
 * Eine Unteraufgabe — mit Beginn und Termin (innerhalb der Tage ihrer
 * Aufgabe) und den zwei Pflichtfeldern «Document» und «Approval».
 */
/** Eine Datei an einer Unteraufgabe am Gerät (28.09.2026). */
export interface TaskSubtaskFile {
    id: string;
    /** Fassungen derselben Datei (28.09.2026): gleiche `groupId` (die Kennung der ersten Fassung). */
    groupId: string;
    /** 1, 2, 3 … — die höchste Fassung einer Gruppe ist die aktuelle. */
    version: number;
    /** Was sich in dieser Fassung geändert hat (ab Fassung 2 Pflicht); null bei der ersten. */
    revisionNote: string | null;
    name: string;
    type: string;
    size: number;
    uploadedById: string | null;
    uploadedByName: string | null;
    /** Zeitpunkt (ISO). */
    uploadedAt: string;
    /** Die KI-Prüfung gegen die Standards der Dokumente (01.10.2026) — null/fehlt: nie geprüft. */
    analysis?: TaskFileAnalysis | null;
}

/** Das PDF mit den Standards einer Unteraufgabe (01.10.2026) — `ref` ist der Verweis des Servers. */
export interface TaskStandardsFile {
    ref: string;
    name: string;
    size: number;
    /** Zeitpunkt (ISO). */
    uploadedAt: string;
}

export type TaskFileAnalysisStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
export type TaskFileAnalysisVerdict = 'PASS' | 'FAIL' | 'UNCLEAR';
export type TaskFileAnalysisResult = 'MET' | 'NOT_MET' | 'UNCLEAR';

/**
 * Die KI-Prüfung eines PDFs (01.10.2026): beim Schicken zur Freigabe prüft gpt-5.4-mini
 * die Datei gegen die Standards der Unteraufgabe — nur ein Rat für die Verwaltung.
 */
export interface TaskFileAnalysis {
    status: TaskFileAnalysisStatus;
    /** Die Standards, gegen die geprüft wurde. */
    standards: string;
    /** … und das PDF der Standards (sein `ref`), falls eines dabei war. */
    standardsFileRef?: string | null;
    /** Zeitpunkte (ISO). */
    requestedAt: string;
    finishedAt: string | null;
    verdict: TaskFileAnalysisVerdict | null;
    summary: string | null;
    checks: Array<{ standard: string; result: TaskFileAnalysisResult; reason: string }>;
    model: string | null;
    /** Warum sie scheiterte (GPT_NOT_CONFIGURED, GPT_QUOTA, ANALYSIS_INTERRUPTED …). */
    errorCode: string | null;
    /** Derselbe Bericht je Sprache der Oberfläche (02.10.2026); ältere Berichte ohne. */
    i18n?: Partial<Record<'tr' | 'en' | 'de', { summary: string | null; checks: Array<{ standard: string; reason: string }> }>> | null;
}

/** Ein Punkt der Freigabe-Checkliste einer Unteraufgabe (28.09.2026). */
export interface TaskSubtaskChecklistItem {
    id: string;
    text: string;
}

export interface TaskSubtask {
    id: string;
    /** Der Stand am Gerät (28.09.2026); in der Vorlage immer TODO. */
    status: TaskStatus;
    name: string;
    /** Der Tag des Anlegens — Beginn, solange keiner gesetzt ist. */
    createdAt: TaskDay | null;
    /** Gewicht als Anteil an der AUFGABE, in Prozent (zusammen höchstens 100 %); null = ohne. */
    weight: number | null;
    startDate: TaskDay | null;
    dueDate: TaskDay | null;
    /** Wer an der Unteraufgabe arbeitet (29.09.2026) — Personen stehen nur hier, nicht an der Aufgabe. */
    assigneeIds: string[];
    requiresDocument: boolean;
    requiresApproval: boolean;
    /** Die Freigabe-Checkliste (nur mit «Approval», sonst leer). */
    approvalChecklist: TaskSubtaskChecklistItem[];
    /** Die Standards der Dokumente (01.10.2026) — freier Text mit Zeilen, nur mit «Document», sonst null. */
    documentStandards: string | null;
    /** Die Standards als PDF (01.10.2026) — dazu oder statt des Textes; die KI nimmt beides. Nur mit «Document». */
    documentStandardsFile?: TaskStandardsFile | null;
    /** Dateien am Gerät (in der Vorlage keine). */
    files: TaskSubtaskFile[];
    /** Abgeschlossen («Complete the task», die Verwaltung) — danach gesperrt. */
    completedById: string | null;
    completedByName: string | null;
    completedAt: string | null;
    completionNote: string | null;
    /** Zurück zur Überarbeitung («Request revision», die Verwaltung) — der Abschluss leert es. */
    revisionById: string | null;
    revisionByName: string | null;
    revisionAt: string | null;
    revisionNote: string | null;
    /** Jede Rückgabe zur Überarbeitung, älteste zuerst — bleibt auch nach der Freigabe (28.09.2026). */
    revisionHistory: TaskSubtaskRevisionRequest[];
    /** Gearbeitete Sekunden (abgeschlossene Runden) und Beginn der laufenden (02.10.2026). */
    workSeconds?: number;
    workStartedAt?: string | null;
}

/** Eine Rückgabe zur Überarbeitung (28.09.2026): wer, wann (ISO), was zu ändern war. */
export interface TaskSubtaskRevisionRequest {
    byId: string | null;
    byName: string | null;
    at: string;
    note: string | null;
}

export interface ProductionTask {
    id: string;
    area: TaskArea;
    stage: TaskStage;
    code: string;
    name: string;
    /** Gewicht innerhalb des Bereichs, in Prozent. */
    weight: number;
    /** Alle Personen ihrer Unteraufgaben (29.09.2026) — nur zu lesen; ohne Unteraufgaben leer. */
    assigneeIds: string[];
    /** Beginn und Termin (28.09.2026) — frei lassbar. */
    startDate: TaskDay | null;
    dueDate: TaskDay | null;
    /** Der Tag des Anlegens (am Gerät: des Ladens) — Beginn, solange keiner gesetzt ist. */
    createdAt: TaskDay | null;
    status: TaskStatus;
    subtasks: TaskSubtask[];
}

export interface TaskPerson {
    id: string;
    name: string;
    /** false: ausgetreten, gesperrt oder nicht mehr in dieser Firma. */
    active: boolean;
}

/** Eine Stufe (30.09.2026): ihr Gewicht und was ihre Aufgaben zusammen wiegen (in der Stufe). */
export interface TaskStageCheck {
    stage: TaskStage;
    weight: number;
    taskCount: number;
    taskWeightSum: number;
    ok: boolean;
}

export interface TaskAreaCheck {
    area: TaskArea;
    share: number;
    taskCount: number;
    /** Die Gewichte der STUFEN zusammen (30.09.2026). */
    weightSum: number;
    ok: boolean;
    stages: TaskStageCheck[];
}

export interface TaskTemplateCheck {
    valid: boolean;
    sharesSum: number;
    sharesOk: boolean;
    areas: TaskAreaCheck[];
}

export interface TaskTemplateSummary {
    id: string;
    name: string;
    sections: TaskSection[];
    taskCount: number;
    check: TaskTemplateCheck;
    /** Auf so vielen Geräten liegt eine Kopie dieser Vorlage. */
    usedBy: number;
    isExample: boolean;
    updatedAt: string;
}

export interface TaskTemplate {
    id: string;
    name: string;
    sections: TaskSection[];
    tasks: ProductionTask[];
    people: TaskPerson[];
    check: TaskTemplateCheck;
    isExample: boolean;
    createdAt: string;
    updatedAt: string;
    updatedByName: string | null;
}

/** Was die Vorlage beim Speichern schickt. */
export interface TaskTemplateInput {
    name: string;
    sections: TaskSection[];
    tasks: Array<Omit<ProductionTask, 'id' | 'status'>>;
}

export interface DeviceTaskPlan {
    id: string;
    templateId: string | null;
    templateName: string;
    /** Die Bereiche und Stufen, wie sie beim Laden galten — der Weg des Geräts. */
    sections: TaskSection[];
    loadedAt: string;
    loadedByName: string | null;
}

export interface DeviceTasks {
    device: {
        id: string;
        projectId: string;
        name: string;
        positionNumber: string | null;
        projectNumber: string;
        projectName: string;
    };
    plan: DeviceTaskPlan | null;
    tasks: ProductionTask[];
    people: TaskPerson[];
}

/**
 * ── DER VERLAUF EINER STUFE (30.09.2026) ─────────────────────────────────────
 * Spiegel von `ProductionTaskActivityDto` (ProductionDeviceTasksUseCase.ts):
 * wer was wann tat. Kürzel und Namen stehen, wie sie IN DEM AUGENBLICK
 * hiessen; `details` trägt, was ein Klick zeigt (je nach Art).
 */
export type TaskActivityKind =
    | 'SUBTASK_STARTED'
    | 'SUBTASK_STOPPED'
    | 'SUBTASK_SUBMITTED'
    | 'SUBTASK_DONE'
    | 'SUBTASK_APPROVED'
    | 'REVISION_REQUESTED'
    | 'SUBTASK_UNLOCKED'
    | 'CHECKLIST_ITEM_ADDED'
    | 'FILE_UPLOADED'
    | 'FILE_DELETED'
    | 'SUBTASK_ASSIGNED'
    | 'TASK_CREATED'
    | 'TASK_UPDATED'
    | 'TASK_DELETED'
    | 'TASK_MOVED'
    | 'TASK_STATUS'
    | 'SUBTASK_CREATED'
    | 'SUBTASK_UPDATED'
    | 'SUBTASK_DELETED'
    | 'STAGE_ADDED'
    | 'UNLOCK_REQUESTED'
    | 'REQUEST_SOLVED'
    | 'PLAN_LOADED'
    | 'PLAN_REMOVED';

export interface TaskActivity {
    id: string;
    kind: TaskActivityKind;
    /** Zeitpunkt (ISO). */
    at: string;
    actorId: string | null;
    actorName: string | null;
    /** null: das ganze Gerät (Vorlage geladen/entfernt). */
    area: TaskArea | null;
    stage: TaskStage | null;
    taskId: string | null;
    taskCode: string | null;
    taskName: string | null;
    subtaskId: string | null;
    subtaskCode: string | null;
    subtaskName: string | null;
    details: Record<string, unknown> | null;
}

/** Eine Seite des Verlaufs (30.09.2026: Seiten und Zeitraum). */
export interface TaskActivityPage {
    items: TaskActivity[];
    /** Wie viele Zeilen der Filter insgesamt trifft. */
    total: number;
    page: number;
    pageSize: number;
    /** Wer in dieser Stufe je etwas tat — für den Filter «Person». */
    actors: Array<{ id: string; name: string }>;
}

/** Was vom Verlauf gezeigt wird: Seite, Arten, Person, Zeitraum (ISO, `to` ausschliesslich). */
export interface TaskActivityQuery {
    page: number;
    pageSize?: number;
    kinds?: readonly string[];
    actorId?: string;
    from?: string;
    to?: string;
}

/**
 * «Görevlerim» auf der Startseite (30.09.2026) — Spiegel von `MyProductionTasksDto`:
 * je Projekt die Geräte, an denen die Person an Unteraufgaben steht, mit NUR diesen Aufgaben.
 */
export interface MyProductionTasks {
    projects: Array<{
        id: string;
        projectNumber: string;
        projectName: string;
        devices: Array<{
            device: DeviceTasks['device'];
            plan: { templateName: string; sections: TaskSection[] };
            tasks: ProductionTask[];
        }>;
    }>;
    people: TaskPerson[];
}

/**
 * Anfragen an die Verwaltung (30.09.2026) — Spiegel von `ProductionTaskRequestDto`:
 * APPROVAL = zur Freigabe geschickt, UNLOCK = Bitte um das Aufheben der Sperre.
 */
export type TaskRequestKind = 'APPROVAL' | 'UNLOCK';
export type TaskRequestResolution = 'MANUAL' | 'APPROVED' | 'REVISION' | 'UNLOCKED';

export interface TaskRequest {
    id: string;
    kind: TaskRequestKind;
    /** Bereich und Stufe — die Liste des ganzen Geräts nennt sie. */
    area: TaskArea;
    stage: TaskStage;
    taskId: string;
    taskCode: string;
    taskName: string;
    subtaskId: string;
    subtaskCode: string;
    subtaskName: string;
    note: string | null;
    requestedById: string | null;
    requestedByName: string | null;
    /** Zeitpunkte (ISO). */
    createdAt: string;
    solvedAt: string | null;
    solvedByName: string | null;
    resolution: TaskRequestResolution | null;
}

export interface TaskRequestList {
    items: TaskRequest[];
    /** Wie viele Anfragen der Stufe noch offen sind. */
    openCount: number;
}

/** Projekte und Geräte mit Aufgaben (30.09.2026) — die Auswahl für Anfragen und Verlauf auf der Startseite. */
export interface TaskDeviceDirectory {
    projects: Array<{
        id: string;
        projectNumber: string;
        projectName: string;
        openRequests: number;
        /** Die Einheiten mit Aufgaben: Vorlage, Zahl der Aufgaben, offene Anfragen. */
        devices: Array<{ id: string; name: string; positionNumber: string | null; templateName: string; taskCount: number; openRequests: number }>;
    }>;
}

/** Eine offene Unteraufgabe einer Person (02.10.2026) — «wer arbeitet schon woran» beim Zuweisen. */
export interface TaskWorkloadItem {
    projectId: string;
    projectNumber: string;
    projectName: string;
    deviceId: string;
    deviceName: string;
    positionNumber: string | null;
    area: string;
    sectionName: string;
    stage: string;
    stageName: string;
    taskCode: string;
    taskName: string;
    subtaskName: string;
    status: TaskStatus;
    dueDate: string | null;
}

export interface TaskWorkload {
    people: Record<string, TaskWorkloadItem[]>;
}

/** Eine Vorlage der Dokument-Standards (02.10.2026). */
export interface TaskStandardsTemplate {
    id: string;
    name: string;
    text: string | null;
    file: TaskStandardsFile | null;
    updatedAt: string;
}
