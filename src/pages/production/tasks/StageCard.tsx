import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Check, ChevronDown, ChevronRight, ChevronUp, Clock3, FileText, Lock, Paperclip, Play, Plus, ShieldCheck, Square, Trash2, X } from 'lucide-react';

import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import type { ProductionTask, TaskArea, TaskSectionStage, TaskStage, TaskStatus, TaskSubtask } from '@/types/productionTasks';

import { FlagGlyph } from '../device/deviceGlyphs';
import { CompleteSubtaskDialog } from './CompleteSubtaskDialog';
import { NameInput } from './InlineName';
import { UnlockRequestDialog } from './UnlockRequestDialog';
import { PeopleCell, type PersonNames } from './PeopleCell';
import { SubtaskDetail } from './SubtaskFiles';
import { latestFiles, type SubtaskActions } from './subtaskFileModel';
import {
    formatDay,
    formatPercent,
    isSubtaskCompleted,
    overallOf,
    parsePercent,
    pendingApprovals,
    roundPercent,
    stageLabel,
    needsPdfFirst,
    subtaskCode,
    subtaskSectionWeight,
    TASK_LIMITS,
    TASK_STATUSES,
    taskProgress,
    taskSectionWeight,
} from './taskModel';

type Mode = 'template' | 'device';

/** Die zwei Pflichtfelder einer Unteraufgabe (28.09.2026: «required fields: Document, Approval»). */
export type SubtaskFlag = 'requiresDocument' | 'requiresApproval';

const FLAGS: ReadonlyArray<{ flag: SubtaskFlag; labelKey: string; Icon: typeof FileText }> = [
    { flag: 'requiresDocument', labelKey: 'productionTasks.subtask.document', Icon: FileText },
    { flag: 'requiresApproval', labelKey: 'productionTasks.subtask.approval', Icon: ShieldCheck },
];

const statusTone = (status: TaskStatus): string =>
    status === 'DONE' ? 'is-done'
        : status === 'PENDING' ? 'is-pending'
            : status === 'REVISION' ? 'is-revision'
                : status === 'IN_PROGRESS' ? 'is-progress' : 'is-todo';

/** Was man an einer eigenen Stufe der Vorlage tun kann (umbenennen, verschieben, löschen). */
export interface StageTools {
    /** Nur bei eigenen Stufen — die festen tragen ihren Namen aus der Übersetzung. */
    onRename?: (name: string) => void;
    isNameTaken: (name: string) => boolean;
    /** Die Stufen stehen untereinander — verschoben wird nach oben und unten. */
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onRemove: () => void;
}

/**
 * Ein Tag in seiner Spalte; solange keiner gesetzt ist, ein «-» (28.09.2026:
 * «at first the dates in the table should come empty») — auch der Beginn
 * zeigt dann nicht mehr den Tag des Anlegens.
 */
const DayCell = ({ day }: { day: string | null }) =>
    (day ? <span className="ofi-ptk-day">{formatDay(day)}</span> : <span className="ofi-ptk-day is-empty">-</span>);

/** Die Pflichtfelder einer Unteraufgabe — nur zu lesen, in der letzten Spalte. */
const RequiredCell = ({ flags }: { flags: typeof FLAGS }) => (
    <span role="cell" className="ofi-ptk-cell-required">
        {flags.map(({ flag, labelKey, Icon }) => (
            <span key={flag} className="ofi-ptk-flagtag" title={t('productionTasks.subtask.requiredHint', { field: t(labelKey) })}>
                <Icon aria-hidden />
                {t(labelKey)}
            </span>
        ))}
    </span>
);

/**
 * Der Stand einer Aufgabe: eine farbige Kapsel. Wer ihn setzen darf (am
 * Gerät: wer in der Aufgabe steht — die Verwaltung nicht von Hand,
 * 29.09.2026), bekommt ein kleines Aufklappmenü in derselben Kapsel. Nur am Gerät — die Vorlage zeigt keinen
 * Stand (28.09.2026). Unteraufgaben tragen ihren eigenen.
 */
const StatusCell = ({
    status,
    busy,
    options = TASK_STATUSES,
    needsPdf = false,
    onChange,
}: {
    status: TaskStatus;
    busy?: boolean;
    /** Die angebotenen Stände — «wartet auf Freigabe» steht nie in der Liste, nur als aktueller Wert. */
    options?: readonly TaskStatus[];
    /** «Document» ohne PDF: fertig melden geht noch nicht (28.09.2026). */
    needsPdf?: boolean;
    onChange?: (status: TaskStatus) => void;
}) => {
    if (!onChange) {
        return <span className={`ofi-ptk-status-pill ${statusTone(status)}`}>{t(`productionTasks.status.${status}`)}</span>;
    }
    return (
        <select
            className={`ofi-ptk-status-pill is-select ${statusTone(status)} ${busy ? 'is-busy' : ''}`}
            value={status}
            aria-label={t('productionTasks.table.status')}
            onChange={(event) => onChange(event.target.value as TaskStatus)}
        >
            {/* Ein Stand ausserhalb der Liste (etwa «wartet auf Freigabe») steht nur im
                geschlossenen Menü — in der Liste erscheint er nicht (28.09.2026). */}
            {!options.includes(status) && (
                <option value={status} hidden>{t(`productionTasks.status.${status}`)}</option>
            )}
            {options.map((entry) => {
                const blocked = needsPdf && entry === 'DONE' && entry !== status;
                return (
                    <option key={entry} value={entry} disabled={blocked}>
                        {blocked
                            ? t('productionTasks.subtask.needsPdf', { status: t(`productionTasks.status.${entry}`) })
                            : t(`productionTasks.status.${entry}`)}
                    </option>
                );
            })}
        </select>
    );
};

/** Kam der Klick aus einem Bedienelement der Zeile (Menü, Knopf, Personen)? Dann klappt sie nicht. */
const fromControl = (event: MouseEvent<HTMLElement>): boolean =>
    Boolean((event.target as HTMLElement).closest('button, select, input, textarea, a, [role="button"], [role="combobox"], [role="listbox"]'));

/**
 * Ein kleiner Kreis vor dem Kürzel (28.09.2026): wie viel der Unteraufgaben
 * erledigt ist — voll und grün, wenn alle erledigt sind.
 */
const ProgressRing = ({ ratio, complete, label }: { ratio: number; complete: boolean; label: string }) => {
    const radius = 6.5;
    const length = 2 * Math.PI * radius;
    return (
        <svg className={`ofi-ptk-ring ${complete ? 'is-complete' : ''}`} viewBox="0 0 16 16" width="16" height="16" role="img" aria-label={label}>
            <circle className="ofi-ptk-ring__track" cx="8" cy="8" r={radius} />
            <circle
                className="ofi-ptk-ring__value"
                cx="8"
                cy="8"
                r={radius}
                strokeDasharray={length}
                strokeDashoffset={length * (1 - Math.min(1, Math.max(0, ratio)))}
            />
        </svg>
    );
};

/** Der Stand einer Aufgabe mit Unteraufgaben: ein Balken und «3/5 alt görev» — grün, wenn alle erledigt sind. */
const ProgressCell = ({ done, total, complete }: { done: number; total: number; complete: boolean }) => (
    <span className={`ofi-ptk-progress ${complete ? 'is-complete' : ''}`}>
        <span className="ofi-ptk-progress__bar" aria-hidden>
            <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </span>
        <small>{t('productionTasks.table.subtasksDone', { done, total })}</small>
    </span>
);

/**
 * ── DIE GÖREVLENDİRME-KARTE EINER STUFE (26.09.2026, Vorgabe Samet) ────────
 *
 * «Her aşamada büyük olmayacak şekilde görevlendirme kartı olması lazım.»
 *
 * Seit dem 28.09.2026 eine TABELLE («the stage card should look like tables»):
 * oben die Stufe mit Nummer (bzw. Fahne), Name und — ganz rechts am Rand —
 * ihrem Gewicht und Beitrag; darunter die Spaltenköpfe und je Aufgabe eine
 * Zeile: Kürzel · Aufgabe · Angelegt · Beginn · Termin · Gewicht · Beitrag ·
 * Stand · Personen · Pflicht — die drei Tage nur am Gerät, eine Vorlage trägt
 * keine. Die Unteraufgaben stehen darunter, ihr Name
 * in derselben Flucht wie der der Aufgabe; ihre Pflichtfelder «Document» /
 * «Approval» in der letzten Spalte, nur zu LESEN (geändert wird im Fenster
 * der Aufgabe). Kürzel, Aufgabe, Personen und Pflicht stehen links in einer
 * Flucht; Tage, Gewicht, Beitrag und Stand mittig in ihrer Spalte.
 *
 *   template  in der Vorlage: ein Klick auf den Namen öffnet die Aufgabe,
 *             Personen stehen an den Unteraufgaben (29.09.2026),
 *             der Stand zeigt den Anfang (Yapılacak), unten «+ Görev ekle»;
 *             eine eigene Stufe heisst, wie man sie im Kopf tippt, und lässt
 *             sich verschieben und löschen
 *   device    am Gerät: Personen setzt die Verwaltung — nur an den
 *             Unteraufgaben (29.09.2026), die Aufgabe zeigt ihre Summe; den
 *             Stand setzt nur, wer an der Unteraufgabe steht, die Verwaltung
 *             nicht von Hand. Eigene Aufgaben der lesenden Person tragen ein
 *             blaues Zeichen. Auf der Tafel der Zuweisungen öffnet die
 *             Verwaltung eine Aufgabe (mit Tagen) und legt neue an — nur für
 *             dieses Gerät (28.09.2026)
 */
/**
 * Das Gewicht der Stufe im Bereich als Feld (30.09.2026) — übernommen beim Verlassen oder mit
 * Enter, Escape verwirft. Unlesbares (nicht 0…100) springt auf den alten Wert zurück.
 */
const StageWeightField = ({ value, label, onCommit }: { value: number; label: string; onCommit: (weight: number) => void }) => {
    const shown = String(value).replace('.', ',');
    const [text, setText] = useState<string | null>(null);
    const current = text ?? shown;
    const invalid = parsePercent(current) === null;
    const commit = () => {
        const parsed = parsePercent(current);
        setText(null);
        if (parsed !== null && parsed !== value) onCommit(parsed);
    };
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') { setText(null); event.currentTarget.blur(); }
    };
    return (
        <span className={`ofi-ptk-percent is-compact ofi-ptk-stageweight ${invalid ? 'is-invalid' : ''}`}>
            <input
                className="ofi-ptk-input is-num"
                value={current}
                inputMode="decimal"
                aria-label={label}
                title={label}
                onChange={(event) => setText(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={commit}
                onKeyDown={onKeyDown}
            />
            <span aria-hidden>%</span>
        </span>
    );
};

export const StageCard = ({
    area,
    stage,
    number,
    tasks,
    share,
    names,
    mode,
    editable,
    staff,
    staffLoading,
    meId,
    busyTaskId,
    onAssignSubtask,
    onStatus,
    onSubtaskStatus,
    canSetStatus,
    subtaskActions,
    onOpenTask,
    onAddTask,
    tools,
    addDisabledReason,
    onClose,
    showStageWeight = false,
    onStageWeight,
    hidePending = false,
    focusSubtaskId = null,
}: {
    area: TaskArea;
    stage: TaskSectionStage;
    /** Die Nummer der Stufe im Weg (leer bei der Fahne). */
    number: number | null;
    tasks: ProductionTask[];
    /** Anteil des Bereichs an der Gesamtfertigstellung. */
    share: number;
    names: PersonNames;
    mode: Mode;
    editable: boolean;
    staff: StaffDirectoryRow[];
    staffLoading: boolean;
    meId?: string | null;
    busyTaskId?: string | null;
    /**
     * Die Personen einer Unteraufgabe setzen (29.09.2026: «only assign people to
     * subtasks»). Die Zeile der Aufgabe zeigt alle Personen ihrer Unteraufgaben, nur zu lesen.
     */
    onAssignSubtask?: (task: ProductionTask, subtask: TaskSubtask, assigneeIds: string[]) => void;
    /** Am Gerät: den Stand einer Aufgabe setzen. */
    onStatus?: (task: ProductionTask, status: TaskStatus) => void;
    /** Am Gerät: den Stand einer Unteraufgabe setzen (die Aufgabe folgt ihren Unteraufgaben). */
    onSubtaskStatus?: (task: ProductionTask, subtask: TaskSubtask, status: TaskStatus) => void;
    /** Darf die lesende Person den Stand DIESER Aufgabe (subtask null) bzw. Unteraufgabe setzen? */
    canSetStatus?: (task: ProductionTask, subtask: TaskSubtask | null) => boolean;
    /**
     * Auf den Stufen des Geräts (28.09.2026): die Unteraufgaben sind zu, ein
     * Klick auf die Aufgabe klappt sie auf; ein Klick auf eine Unteraufgabe
     * zeigt ihre Dateien und — mit «Approval», für die Verwaltung —
     * «Complete the task». Die Tafel der Zuweisungen zeigt alles offen.
     */
    subtaskActions?: SubtaskActions;
    onOpenTask?: (task: ProductionTask) => void;
    onAddTask?: (area: TaskArea, stage: TaskStage) => void;
    /** Die Stufe selbst bearbeiten (nur in der Vorlage). */
    tools?: StageTools;
    /** Steht ein Grund da, ist «+ Görev ekle» gesperrt (der Bereich hat kein Gewicht mehr frei). */
    addDisabledReason?: string;
    /** Mit ✕ im Kopf — die aufgeklappte Glaskarte der Stufen (27.09.2026). */
    onClose?: () => void;
    /**
     * Am Gerät das Gewicht der Stufe zeigen (28.09.2026): auf den Arbeitsstufen nicht
     * (dort immer 100 %), in der Tafel der Zuweisungen schon. Die Vorlage zeigt es immer.
     */
    showStageWeight?: boolean;
    /** Das Gewicht der Stufe im Bereich ändern (30.09.2026) — Vorlage und Tafel der Zuweisungen. */
    onStageWeight?: (weight: number) => void;
    /** Ohne das Zeichen «wartet auf Freigabe» (30.09.2026, «Görevlerim»: das gehört zu den Anfragen). */
    hidePending?: boolean;
    /** Diese Unteraufgabe gleich zeigen (30.09.2026, «Go to subtask»): Aufgabe auf, Unteraufgabe gewählt, in Sicht. */
    focusSubtaskId?: string | null;
}) => {
    /* Seit dem 30.09.2026 trägt die Stufe ihr eigenes Gewicht im Bereich; ihre Aufgaben ergeben
       zusammen 100 % der STUFE («the weights of the task only should fill the weight of its stage»). */
    const weight = stage.weight ?? 0;
    const taskSum = roundPercent(tasks.reduce((sum, task) => sum + task.weight, 0));
    const tasksOff = tasks.length > 0 && Math.abs(taskSum - 100) > 0.01;
    // Tage und Stand gibt es nur am Gerät — eine Vorlage trägt keine (28.09.2026).
    const onDevice = mode === 'device';
    const stageName = stageLabel(stage);
    const isFinish = number === null;
    // Alle Aufgaben der Stufe erledigt: die Nummer wird ein grüner Kreis mit Haken.
    const stageDone = onDevice && tasks.length > 0 && tasks.every((task) => task.status === 'DONE');
    const collapsible = onDevice && Boolean(subtaskActions);
    const pending = onDevice && !hidePending ? pendingApprovals(tasks) : 0;
    // «At first hide the subtasks» — aufgeklappte Aufgaben, die gezeigte Unteraufgabe, das Abschlussfenster.
    const focusTaskId = focusSubtaskId ? tasks.find((task) => task.subtasks.some((subtask) => subtask.id === focusSubtaskId))?.id ?? null : null;
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(focusTaskId ? [focusTaskId] : []));
    const [shownSubtask, setShownSubtask] = useState<string | null>(() => (focusTaskId ? focusSubtaskId : null));
    // Die gesuchte Unteraufgabe in die Mitte holen — einmal, nach dem ersten Zeichnen.
    useEffect(() => {
        if (!focusTaskId || !focusSubtaskId) return undefined;
        const timer = window.setTimeout(() => {
            document.querySelector(`[data-subtask-row="${CSS.escape(focusSubtaskId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 350);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [completing, setCompleting] = useState<{ taskId: string; subtaskId: string } | null>(null);
    const toggleTask = (taskId: string) => setExpanded((current) => {
        const next = new Set(current);
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
        return next;
    });
    // Die Sperre aufheben (28.09.2026): ein Klick der Verwaltung auf das Schloss — mit Rückfrage.
    const [unlocking, setUnlocking] = useState<{ task: ProductionTask; subtask: TaskSubtask } | null>(null);
    // Um das Entsperren bitten (30.09.2026): ein Klick der Leute der Unteraufgabe auf das Schloss.
    const [requestingUnlock, setRequestingUnlock] = useState<{ task: ProductionTask; subtask: TaskSubtask; label: string; awaiting: boolean } | null>(null);
    const completingTask = completing ? tasks.find((task) => task.id === completing.taskId) : undefined;
    const completingIndex = completingTask ? completingTask.subtasks.findIndex((subtask) => subtask.id === completing?.subtaskId) : -1;

    return (
        <section className={`ofi-ptk-card ${tasks.length ? '' : 'is-empty'}`} aria-label={stageName} data-stage={stage.key}>
            <header className="ofi-ptk-card__head">
                <span className={`ofi-ptk-stagenum ${stageDone ? 'is-done' : isFinish ? 'is-flag' : ''}`} aria-hidden>
                    {stageDone ? <Check size={12} strokeWidth={3} /> : isFinish ? <FlagGlyph size={11} strokeWidth={2} /> : number}
                </span>
                {tools?.onRename ? (
                    <NameInput
                        className="ofi-ptk-card__titleinput"
                        value={stage.name}
                        maxLength={TASK_LIMITS.stageName}
                        ariaLabel={t('productionTasks.template.stageName')}
                        placeholder={t('productionTasks.template.stageName')}
                        isTaken={tools.isNameTaken}
                        onCommit={tools.onRename}
                    />
                ) : (
                    <h3 className="ofi-ptk-card__title">{stageName}</h3>
                )}
                {pending > 0 && (
                    <span className="ofi-ptk-pendingtag" title={t('productionTasks.stage.pendingHint', { count: pending })}>
                        <Clock3 aria-hidden />
                        {t('productionTasks.stage.pending', { count: pending })}
                    </span>
                )}
                {tools && (
                    <span className="ofi-ptk-card__tools">
                        <button
                            type="button"
                            className="ofi-ptk-toolbtn ofi-nosize"
                            disabled={!tools.onMoveUp}
                            title={t('productionTasks.template.moveUp')}
                            aria-label={t('productionTasks.template.moveUp')}
                            onClick={tools.onMoveUp}
                        >
                            <ChevronUp aria-hidden />
                        </button>
                        <button
                            type="button"
                            className="ofi-ptk-toolbtn ofi-nosize"
                            disabled={!tools.onMoveDown}
                            title={t('productionTasks.template.moveDown')}
                            aria-label={t('productionTasks.template.moveDown')}
                            onClick={tools.onMoveDown}
                        >
                            <ChevronDown aria-hidden />
                        </button>
                        <button
                            type="button"
                            className="ofi-ptk-toolbtn is-danger ofi-nosize"
                            title={t('productionTasks.template.removeStage')}
                            aria-label={t('productionTasks.template.removeStage')}
                            onClick={tools.onRemove}
                        >
                            <Trash2 aria-hidden />
                        </button>
                    </span>
                )}
                {/* Gewicht und Beitrag der Stufe ganz rechts am Rand der Karte. Auf den Arbeitsstufen
                    des Geräts nur der Beitrag (28.09.2026: das Gewicht steht dort immer auf 100 %) —
                    die Zuweisungen zeigen es (showStageWeight). */}
                {(tasks.length > 0 || onStageWeight) && (
                    <span
                        className="ofi-ptk-card__sum"
                        title={onDevice && !showStageWeight ? undefined : t('productionTasks.stage.sumHint', {
                            weight: formatPercent(weight),
                            overall: formatPercent(overallOf(weight, share), true),
                        })}
                    >
                        {/* Die Aufgaben ergeben nicht 100 % der Stufe — gleich hier sichtbar. */}
                        {tasksOff && (!onDevice || showStageWeight) && (
                            <em className="ofi-ptk-card__tasksum" title={t('productionTasks.stage.tasksOff', { sum: formatPercent(taskSum) })}>
                                {t('productionTasks.stage.tasksSum', { sum: formatPercent(taskSum) })}
                            </em>
                        )}
                        {onStageWeight ? (
                            <StageWeightField
                                value={weight}
                                label={t('productionTasks.stage.weightAria', { stage: stageName })}
                                onCommit={onStageWeight}
                            />
                        ) : (!onDevice || showStageWeight) && <b>{formatPercent(weight)}</b>}
                        <small>{t('productionTasks.overallShort', { value: formatPercent(overallOf(weight, share), true) })}</small>
                    </span>
                )}
                {onClose && (
                    <button
                        type="button"
                        className="ofi-ptk-card__close ofi-nosize"
                        aria-label={t('productionTasks.stageFloat.close')}
                        title={t('productionTasks.stageFloat.close')}
                        onClick={onClose}
                    >
                        <X aria-hidden />
                    </button>
                )}
            </header>

            {tasks.length ? (
                <div className="ofi-ptk-tablewrap">
                    <div className={`ofi-ptk-table ${onDevice ? '' : 'is-template'}`} role="table" aria-label={stageName}>
                        <div className="ofi-ptk-row is-head" role="row">
                            <span role="columnheader" className="is-left">{t('productionTasks.table.code')}</span>
                            <span role="columnheader" className="is-left">{t('productionTasks.table.task')}</span>
                            {onDevice && (
                                <>
                                    <span role="columnheader">{t('productionTasks.table.created')}</span>
                                    <span role="columnheader">{t('productionTasks.table.start')}</span>
                                    <span role="columnheader">{t('productionTasks.table.due')}</span>
                                </>
                            )}
                            <span role="columnheader">{t('productionTasks.table.weight')}</span>
                            <span role="columnheader">{t('productionTasks.table.overall')}</span>
                            {/* Der Stand gehört zur Arbeit am Gerät — die Vorlage zeigt ihn nicht. */}
                            {onDevice && <span role="columnheader">{t('productionTasks.table.status')}</span>}
                            {/* Personen und Pflicht: Überschrift mittig (28.09.2026). */}
                            <span role="columnheader">{t('productionTasks.table.people')}</span>
                            <span role="columnheader">{t('productionTasks.table.required')}</span>
                        </div>
                        {tasks.map((task) => {
                            const mine = Boolean(meId && task.assigneeIds.includes(meId));
                            // Beitrag: Gewicht in der Stufe × Gewicht der Stufe × Anteil des Bereichs (30.09.2026).
                            const inSection = taskSectionWeight(weight, task.weight);
                            const overall = formatPercent(overallOf(inSection, share), true);
                            const statusEditable = onDevice && (canSetStatus?.(task, null) ?? false);
                            const progress = taskProgress(task);
                            const foldable = collapsible && task.subtasks.length > 0;
                            const isOpen = !collapsible || expanded.has(task.id);
                            return (
                                <div key={task.id} className={`ofi-ptk-group-rows ${mine ? 'is-mine' : ''}`} role="rowgroup">
                                    <div
                                        className={`ofi-ptk-row ${foldable ? 'is-foldable' : ''} ${foldable && isOpen ? 'is-unfolded' : ''}`}
                                        role="row"
                                        onClick={foldable ? (event) => { if (!fromControl(event)) toggleTask(task.id); } : undefined}
                                    >
                                        <span role="cell" className="ofi-ptk-code">
                                            {foldable && (
                                                <button
                                                    type="button"
                                                    className="ofi-ptk-fold ofi-nosize"
                                                    aria-expanded={isOpen}
                                                    aria-label={t(isOpen ? 'productionTasks.subtask.collapse' : 'productionTasks.subtask.expand', { code: task.code })}
                                                    title={t(isOpen ? 'productionTasks.subtask.collapse' : 'productionTasks.subtask.expand', { code: task.code })}
                                                    onClick={() => toggleTask(task.id)}
                                                >
                                                    <ChevronRight aria-hidden />
                                                </button>
                                            )}
                                            {onDevice && (
                                                <ProgressRing
                                                    ratio={progress.ratio}
                                                    complete={progress.complete}
                                                    label={task.subtasks.length
                                                        ? t('productionTasks.table.subtasksDone', { done: progress.done, total: progress.total })
                                                        : t(`productionTasks.status.${task.status}`)}
                                                />
                                            )}
                                            {task.code}
                                        </span>
                                        <span role="cell" className="ofi-ptk-cell-name">
                                            {editable && onOpenTask ? (
                                                <button
                                                    type="button"
                                                    className="ofi-ptk-task__open ofi-nosize"
                                                    title={t('productionTasks.task.edit')}
                                                    onClick={() => onOpenTask(task)}
                                                >
                                                    {task.name}
                                                </button>
                                            ) : (
                                                <span className="ofi-ptk-task__name" title={task.name}>{task.name}</span>
                                            )}
                                            {mine && <span className="ofi-ptk-mine" title={t('productionTasks.people.mine')}>{t('productionTasks.people.meShort')}</span>}
                                        </span>
                                        {onDevice && (
                                            <>
                                                <span role="cell"><DayCell day={task.createdAt} /></span>
                                                <span role="cell"><DayCell day={task.startDate} /></span>
                                                <span role="cell"><DayCell day={task.dueDate} /></span>
                                            </>
                                        )}
                                        <span
                                            role="cell"
                                            className="ofi-ptk-weight"
                                            title={t('productionTasks.task.weightHint', { weight: formatPercent(task.weight), overall })}
                                        >
                                            {formatPercent(task.weight)}
                                        </span>
                                        <span role="cell" className="ofi-ptk-overall">{overall}</span>
                                        {onDevice && (
                                            <span role="cell">
                                                {/* Mit Unteraufgaben folgt die Aufgabe ihnen: Balken und «3/5». */}
                                                {task.subtasks.length ? (
                                                    <ProgressCell done={progress.done} total={progress.total} complete={progress.complete} />
                                                ) : (
                                                    <StatusCell
                                                        status={task.status}
                                                        busy={busyTaskId === task.id}
                                                        onChange={statusEditable && onStatus ? (next) => onStatus(task, next) : undefined}
                                                    />
                                                )}
                                            </span>
                                        )}
                                        <span role="cell" className="ofi-ptk-cell-people">
                                            {/* Alle Personen der Unteraufgaben — nur zu lesen (29.09.2026). */}
                                            <PeopleCell
                                                ids={task.assigneeIds}
                                                names={names}
                                                editable={false}
                                                staff={staff}
                                                staffLoading={staffLoading}
                                                meId={meId}
                                            />
                                        </span>
                                        <span role="cell" className="ofi-ptk-cell-required" />
                                    </div>
                                    {isOpen && task.subtasks.map((subtask, index) => {
                                        const shown = shownSubtask === subtask.id;
                                        const completed = isSubtaskCompleted(subtask);
                                        // Wartet auf die Freigabe: ebenfalls gesperrt (28.09.2026).
                                        const awaiting = !completed && subtask.status === 'PENDING';
                                        const locked = completed || awaiting;
                                        const lockLabel = t(awaiting ? 'productionTasks.subtask.lockedAwaiting' : 'productionTasks.subtask.locked');
                                        // ▶ / ■ nur für wer an der Unteraufgabe steht (29.09.2026).
                                        const subtaskEditable = onDevice && (canSetStatus?.(task, subtask) ?? false);
                                        return (
                                        <div key={subtask.id} className="ofi-ptk-subgroup">
                                        <div
                                            className={`ofi-ptk-row is-sub ${subtaskActions ? 'is-clickable' : ''} ${shown ? 'is-shown' : ''}`}
                                            data-subtask-row={subtask.id}
                                            role="row"
                                            onClick={subtaskActions ? (event) => { if (!fromControl(event)) setShownSubtask(shown ? null : subtask.id); } : undefined}
                                        >
                                            <span role="cell" className={`ofi-ptk-code is-sub ${onDevice ? 'has-lockslot' : ''} ${foldable ? 'is-under-fold' : ''}`}>
                                                {/* Senkrecht unter dem Fortschrittskreis der Aufgabe (28.09.2026):
                                                    offen ▶ «Start» (wer an der Unteraufgabe steht) · freigegeben 🔒.
                                                    Der Platz bleibt immer frei, damit die Kürzel untereinander stehen. */}
                                                {onDevice && (
                                                    <span className="ofi-ptk-lockslot">
                                                        {!completed && subtask.status === 'TODO' && subtaskEditable && onSubtaskStatus && (
                                                            <button
                                                                type="button"
                                                                className="ofi-ptk-lockbtn is-start ofi-nosize"
                                                                disabled={busyTaskId === task.id}
                                                                title={t('productionTasks.subtask.start')}
                                                                aria-label={t('productionTasks.subtask.start')}
                                                                onClick={() => onSubtaskStatus(task, subtask, 'IN_PROGRESS')}
                                                            >
                                                                <Play aria-hidden />
                                                            </button>
                                                        )}
                                                        {/* ■ Stopp (28.09.2026): in Arbeit → wieder offen. */}
                                                        {!completed && subtask.status === 'IN_PROGRESS' && subtaskEditable && onSubtaskStatus && (
                                                            <button
                                                                type="button"
                                                                className="ofi-ptk-lockbtn is-stop ofi-nosize"
                                                                disabled={busyTaskId === task.id}
                                                                title={t('productionTasks.subtask.stop')}
                                                                aria-label={t('productionTasks.subtask.stop')}
                                                                onClick={() => onSubtaskStatus(task, subtask, 'TODO')}
                                                            >
                                                                <Square aria-hidden />
                                                            </button>
                                                        )}
                                                        {/* Gesperrt: freigegeben — oder wartet auf die Freigabe (28.09.2026, dann gelb). */}
                                                        {locked && (subtaskActions?.isAdmin ? (
                                                            <button
                                                                type="button"
                                                                className={`ofi-ptk-lockbtn ofi-nosize ${awaiting ? 'is-awaiting' : ''}`}
                                                                title={`${lockLabel} · ${t('productionTasks.subtask.unlock')}`}
                                                                aria-label={t('productionTasks.subtask.unlock')}
                                                                onClick={() => setUnlocking({ task, subtask })}
                                                            >
                                                                <Lock aria-hidden />
                                                            </button>
                                                        ) : subtaskActions?.requestUnlock && subtaskEditable ? (
                                                            /* Wer an ihr steht, bittet um das Entsperren (30.09.2026: «send unlock
                                                               requests to the admins by clicking on the lock icon»). */
                                                            <button
                                                                type="button"
                                                                className={`ofi-ptk-lockbtn ofi-nosize ${awaiting ? 'is-awaiting' : ''}`}
                                                                title={`${lockLabel} · ${t('productionTasks.requests.unlockAsk')}`}
                                                                aria-label={t('productionTasks.requests.unlockAsk')}
                                                                onClick={() => setRequestingUnlock({ task, subtask, label: `${subtaskCode(task.code, index)} · ${subtask.name}`, awaiting })}
                                                            >
                                                                <Lock aria-hidden />
                                                            </button>
                                                        ) : (
                                                            <Lock role="img" aria-label={lockLabel} className={awaiting ? 'is-awaiting' : undefined}>
                                                                {/* SVG kennt kein title-Attribut — der Hinweis steht im <title>. */}
                                                                <title>{lockLabel}</title>
                                                            </Lock>
                                                        ))}
                                                    </span>
                                                )}
                                                {subtaskCode(task.code, index)}
                                            </span>
                                            <span role="cell" className="ofi-ptk-cell-name">
                                                {subtaskActions ? (
                                                    <button
                                                        type="button"
                                                        className="ofi-ptk-sub__open ofi-nosize"
                                                        aria-expanded={shown}
                                                        title={t('productionTasks.subtask.showFiles')}
                                                        onClick={() => setShownSubtask(shown ? null : subtask.id)}
                                                    >
                                                        <span className="ofi-ptk-task__name">{subtask.name}</span>
                                                        {latestFiles(subtask.files).length > 0 && (
                                                            <span className="ofi-ptk-sub__files" aria-label={t('productionTasks.files.count', { count: latestFiles(subtask.files).length })}>
                                                                <Paperclip aria-hidden />
                                                                {latestFiles(subtask.files).length}
                                                            </span>
                                                        )}
                                                    </button>
                                                ) : (
                                                    <span className="ofi-ptk-task__name" title={subtask.name}>{subtask.name}</span>
                                                )}
                                            </span>
                                            {onDevice && (
                                                <>
                                                    <span role="cell"><DayCell day={subtask.createdAt} /></span>
                                                    <span role="cell"><DayCell day={subtask.startDate} /></span>
                                                    <span role="cell"><DayCell day={subtask.dueDate} /></span>
                                                </>
                                            )}
                                            {/* Anteil an der Aufgabe; der Beitrag rechnet über das Gewicht der Aufgabe. */}
                                            <span
                                                role="cell"
                                                className="ofi-ptk-weight is-sub"
                                                title={subtask.weight === null ? undefined : t('productionTasks.subtask.weightOfTask', {
                                                    weight: formatPercent(subtask.weight),
                                                    section: formatPercent(subtaskSectionWeight(taskSectionWeight(weight, task.weight), subtask.weight)),
                                                })}
                                            >
                                                {subtask.weight === null ? '' : formatPercent(subtask.weight)}
                                            </span>
                                            <span role="cell" className="ofi-ptk-overall">
                                                {subtask.weight === null ? '' : formatPercent(overallOf(subtaskSectionWeight(taskSectionWeight(weight, task.weight), subtask.weight), share), true)}
                                            </span>
                                            {onDevice && (
                                                <span role="cell">
                                                    {/* Nur zu lesen (28.09.2026: «no one can change statuses manually»):
                                                        ▶ vorne startet, «Complete the task» sendet zur Freigabe,
                                                        «Approve the task» gibt frei. */}
                                                    <StatusCell
                                                        status={subtask.status}
                                                        busy={busyTaskId === task.id}
                                                        needsPdf={needsPdfFirst(subtask)}
                                                    />
                                                </span>
                                            )}
                                            {/* Personen stehen an der Unteraufgabe (29.09.2026); die Verwaltung setzt sie. */}
                                            <span role="cell" className="ofi-ptk-cell-people">
                                                <PeopleCell
                                                    ids={subtask.assigneeIds}
                                                    names={names}
                                                    editable={editable && Boolean(onAssignSubtask)}
                                                    staff={staff}
                                                    staffLoading={staffLoading}
                                                    meId={meId}
                                                    busy={busyTaskId === task.id}
                                                    onCommit={onAssignSubtask ? (next) => onAssignSubtask(task, subtask, next) : undefined}
                                                />
                                            </span>
                                            <RequiredCell flags={FLAGS.filter(({ flag }) => subtask[flag])} />
                                        </div>
                                        {shown && subtaskActions && (
                                            <div className="ofi-ptk-row is-detail" role="row">
                                                <div role="cell" className="ofi-ptk-detailcell">
                                                    <SubtaskDetail
                                                        task={task}
                                                        subtask={subtask}
                                                        actions={subtaskActions}
                                                        onComplete={() => setCompleting({ taskId: task.id, subtaskId: subtask.id })}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <p className="ofi-ptk-card__empty">{t('productionTasks.stage.noTasks')}</p>
            )}

            {editable && onAddTask && (
                <button
                    type="button"
                    className="ofi-ptk-addtask ofi-nosize"
                    disabled={Boolean(addDisabledReason)}
                    title={addDisabledReason}
                    onClick={() => onAddTask(area, stage.key)}
                >
                    <Plus aria-hidden />
                    {t('productionTasks.task.add')}
                </button>
            )}

            {completingTask && completingIndex >= 0 && subtaskActions && (
                <CompleteSubtaskDialog
                    task={completingTask}
                    subtask={completingTask.subtasks[completingIndex]}
                    code={subtaskCode(completingTask.code, completingIndex)}
                    stageName={stageName}
                    names={names}
                    actions={subtaskActions}
                    onClose={() => setCompleting(null)}
                />
            )}
            <ConfirmDialog
                closeOnBackdrop={false}
                open={unlocking !== null}
                tone="primary"
                title={t('productionTasks.subtask.unlockTitle')}
                message={unlocking ? t('productionTasks.subtask.unlockText', { name: unlocking.subtask.name }) : undefined}
                confirmLabel={t('productionTasks.subtask.unlockConfirm')}
                cancelLabel={t('productionTasks.actions.cancel')}
                onCancel={() => setUnlocking(null)}
                onConfirm={() => {
                    const target = unlocking;
                    setUnlocking(null);
                    if (target && subtaskActions) void subtaskActions.unlock(target.task, target.subtask);
                }}
            />
            {requestingUnlock && subtaskActions?.requestUnlock && (
                <UnlockRequestDialog
                    subtaskLabel={requestingUnlock.label}
                    awaiting={requestingUnlock.awaiting}
                    onSend={(note) => subtaskActions.requestUnlock?.(requestingUnlock.task, requestingUnlock.subtask, note) ?? Promise.resolve(false)}
                    onClose={() => setRequestingUnlock(null)}
                />
            )}
        </section>
    );
};
