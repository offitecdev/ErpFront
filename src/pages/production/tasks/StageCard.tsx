import { useState, type MouseEvent } from 'react';
import { Check, ChevronDown, ChevronRight, ChevronUp, Clock3, FileText, Paperclip, Plus, ShieldCheck, Trash2, X } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import type { ProductionTask, TaskArea, TaskSectionStage, TaskStage, TaskStatus, TaskSubtask } from '@/types/productionTasks';

import { FlagGlyph } from '../device/deviceGlyphs';
import { CompleteSubtaskDialog } from './CompleteSubtaskDialog';
import { NameInput } from './InlineName';
import { PeopleCell, type PersonNames } from './PeopleCell';
import { SubtaskDetail } from './SubtaskFiles';
import type { SubtaskActions } from './subtaskFileModel';
import {
    formatDay,
    formatPercent,
    isSubtaskCompleted,
    overallOf,
    pendingApprovals,
    roundPercent,
    stageLabel,
    needsPdfFirst,
    subtaskCode,
    subtaskSectionWeight,
    TASK_LIMITS,
    TASK_STATUSES,
    taskProgress,
} from './taskModel';

type Mode = 'template' | 'device';

/** Die zwei Pflichtfelder einer Unteraufgabe (28.09.2026: «required fields: Document, Approval»). */
export type SubtaskFlag = 'requiresDocument' | 'requiresApproval';

const FLAGS: ReadonlyArray<{ flag: SubtaskFlag; labelKey: string; Icon: typeof FileText }> = [
    { flag: 'requiresDocument', labelKey: 'productionTasks.subtask.document', Icon: FileText },
    { flag: 'requiresApproval', labelKey: 'productionTasks.subtask.approval', Icon: ShieldCheck },
];

const statusTone = (status: TaskStatus): string =>
    status === 'DONE' ? 'is-done' : status === 'PENDING' ? 'is-pending' : status === 'IN_PROGRESS' ? 'is-progress' : 'is-todo';

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
 * Gerät: die Verwaltung und wer in der Aufgabe steht), bekommt ein kleines
 * Aufklappmenü in derselben Kapsel. Nur am Gerät — die Vorlage zeigt keinen
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
 *             der Stand zeigt den Anfang (Yapılacak), unten «+ Görev ekle»;
 *             eine eigene Stufe heisst, wie man sie im Kopf tippt, und lässt
 *             sich verschieben und löschen
 *   device    am Gerät: Personen setzt die Verwaltung, den Stand die
 *             Verwaltung und wer in der Aufgabe steht; eigene Aufgaben der
 *             lesenden Person tragen ein blaues Zeichen. Auf der Tafel der
 *             Zuweisungen öffnet die Verwaltung eine Aufgabe (mit Tagen) und
 *             legt neue an — nur für dieses Gerät (28.09.2026)
 */
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
    onAssign,
    onStatus,
    onSubtaskStatus,
    canSetStatus,
    subtaskActions,
    onOpenTask,
    onAddTask,
    tools,
    addDisabledReason,
    onClose,
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
    onAssign?: (task: ProductionTask, assigneeIds: string[]) => void;
    /** Am Gerät: den Stand einer Aufgabe setzen. */
    onStatus?: (task: ProductionTask, status: TaskStatus) => void;
    /** Am Gerät: den Stand einer Unteraufgabe setzen (die Aufgabe folgt ihren Unteraufgaben). */
    onSubtaskStatus?: (task: ProductionTask, subtask: TaskSubtask, status: TaskStatus) => void;
    /** Darf die lesende Person den Stand DIESER Aufgabe setzen? */
    canSetStatus?: (task: ProductionTask) => boolean;
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
}) => {
    const weight = roundPercent(tasks.reduce((sum, task) => sum + task.weight, 0));
    // Tage und Stand gibt es nur am Gerät — eine Vorlage trägt keine (28.09.2026).
    const onDevice = mode === 'device';
    const stageName = stageLabel(stage);
    const isFinish = number === null;
    // Alle Aufgaben der Stufe erledigt: die Nummer wird ein grüner Kreis mit Haken.
    const stageDone = onDevice && tasks.length > 0 && tasks.every((task) => task.status === 'DONE');
    const collapsible = onDevice && Boolean(subtaskActions);
    const pending = onDevice ? pendingApprovals(tasks) : 0;
    // «At first hide the subtasks» — aufgeklappte Aufgaben, die gezeigte Unteraufgabe, das Abschlussfenster.
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
    const [shownSubtask, setShownSubtask] = useState<string | null>(null);
    const [completing, setCompleting] = useState<{ taskId: string; subtaskId: string } | null>(null);
    const toggleTask = (taskId: string) => setExpanded((current) => {
        const next = new Set(current);
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
        return next;
    });
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
                {/* Gewicht und Beitrag der Stufe ganz rechts am Rand der Karte. */}
                {tasks.length > 0 && (
                    <span
                        className="ofi-ptk-card__sum"
                        title={t('productionTasks.stage.sumHint', {
                            weight: formatPercent(weight),
                            overall: formatPercent(overallOf(weight, share), true),
                        })}
                    >
                        <b>{formatPercent(weight)}</b>
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
                            <span role="columnheader" className="is-left">{t('productionTasks.table.people')}</span>
                            <span role="columnheader" className="is-left">{t('productionTasks.table.required')}</span>
                        </div>
                        {tasks.map((task) => {
                            const mine = Boolean(meId && task.assigneeIds.includes(meId));
                            const overall = formatPercent(overallOf(task.weight, share), true);
                            const statusEditable = onDevice && (canSetStatus?.(task) ?? false);
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
                                            <PeopleCell
                                                ids={task.assigneeIds}
                                                names={names}
                                                editable={editable && Boolean(onAssign)}
                                                staff={staff}
                                                staffLoading={staffLoading}
                                                meId={meId}
                                                busy={busyTaskId === task.id}
                                                onCommit={onAssign ? (next) => onAssign(task, next) : undefined}
                                            />
                                        </span>
                                        <span role="cell" className="ofi-ptk-cell-required" />
                                    </div>
                                    {isOpen && task.subtasks.map((subtask, index) => {
                                        const shown = shownSubtask === subtask.id;
                                        const completed = isSubtaskCompleted(subtask);
                                        return (
                                        <div key={subtask.id} className="ofi-ptk-subgroup">
                                        <div
                                            className={`ofi-ptk-row is-sub ${subtaskActions ? 'is-clickable' : ''} ${shown ? 'is-shown' : ''}`}
                                            role="row"
                                            onClick={subtaskActions ? (event) => { if (!fromControl(event)) setShownSubtask(shown ? null : subtask.id); } : undefined}
                                        >
                                            <span role="cell" className="ofi-ptk-code is-sub">{subtaskCode(task.code, index)}</span>
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
                                                        {subtask.files.length > 0 && (
                                                            <span className="ofi-ptk-sub__files" aria-label={t('productionTasks.files.count', { count: subtask.files.length })}>
                                                                <Paperclip aria-hidden />
                                                                {subtask.files.length}
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
                                                    section: formatPercent(subtaskSectionWeight(task.weight, subtask.weight)),
                                                })}
                                            >
                                                {subtask.weight === null ? '' : formatPercent(subtask.weight)}
                                            </span>
                                            <span role="cell" className="ofi-ptk-overall">
                                                {subtask.weight === null ? '' : formatPercent(overallOf(subtaskSectionWeight(task.weight, subtask.weight), share), true)}
                                            </span>
                                            {onDevice && (
                                                <span role="cell">
                                                    {/* Abgeschlossen: den Stand ändert niemand mehr (28.09.2026). */}
                                                    <StatusCell
                                                        status={subtask.status}
                                                        busy={busyTaskId === task.id}
                                                        needsPdf={needsPdfFirst(subtask)}
                                                        onChange={statusEditable && onSubtaskStatus && !completed
                                                            ? (next) => {
                                                                // «Approval»: erledigt heisst für die Leute «wartet auf
                                                                // Freigabe»; die Verwaltung schliesst im Fenster ab.
                                                                if (next === 'DONE' && subtask.requiresApproval) {
                                                                    if (subtaskActions?.isAdmin) setCompleting({ taskId: task.id, subtaskId: subtask.id });
                                                                    else if (subtask.status !== 'PENDING') onSubtaskStatus(task, subtask, 'PENDING');
                                                                    return;
                                                                }
                                                                onSubtaskStatus(task, subtask, next);
                                                            }
                                                            : undefined}
                                                    />
                                                </span>
                                            )}
                                            {/* Personen gehören der Aufgabe. */}
                                            <span role="cell" />
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
        </section>
    );
};
