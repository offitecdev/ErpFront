import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, ClipboardCheck, Info, ListChecks, Plus, Trash2, X } from 'lucide-react';

import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { MacDatePicker } from '@/components/ui-shared/MacDatePicker';
import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { useBackDismiss } from '@/lib/backDismiss';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import type { ProductionTask, TaskSection, TaskSubtask } from '@/types/productionTasks';

import { PeopleCell, type PersonNames } from './PeopleCell';
import type { SubtaskFlag } from './StageCard';
import {
    dateRangeLabel,
    formatPercent,
    localToday,
    newChecklistItemId,
    newSubtaskId,
    overallOf,
    parsePercent,
    requirementsAdded,
    sectionLabel,
    stageLabel,
    subtaskDatesProblem,
    subtaskSectionWeight,
    taskSectionWeight,
    subtaskWeightSum,
    TASK_LIMITS,
    taskAssigneesOf,
} from './taskModel';

const weightText = (value: number): string => (Number.isFinite(value) ? String(value).replace('.', ',') : '');

/**
 * Ein Gewicht höchstens bis zu dem, was noch frei ist (28.09.2026: «if the
 * left is 90 and admin writes 100 automatically make it 90») — das Feld
 * zeigt dann gleich den Rest.
 */
const capped = (text: string, max: number): string => {
    const value = parsePercent(text);
    return value !== null && value > max ? weightText(max) : text;
};

const FLAGS: ReadonlyArray<{ flag: SubtaskFlag; labelKey: string }> = [
    { flag: 'requiresDocument', labelKey: 'productionTasks.subtask.document' },
    { flag: 'requiresApproval', labelKey: 'productionTasks.subtask.approval' },
];

/** Eine neue Unteraufgabe: sie entsteht heute, ohne Gewicht, ohne Pflicht. */
const emptySubtask = (name: string): TaskSubtask => ({
    id: newSubtaskId(),
    status: 'TODO',
    files: [],
    completedById: null,
    completedByName: null,
    completedAt: null,
    completionNote: null,
    revisionById: null,
    revisionByName: null,
    revisionAt: null,
    revisionNote: null,
    revisionHistory: [],
    name,
    createdAt: localToday(),
    weight: null,
    startDate: null,
    dueDate: null,
    assigneeIds: [],
    requiresDocument: false,
    requiresApproval: false,
    approvalChecklist: [],
});

/**
 * ── EINE AUFGABE DER VORLAGE (26.09.2026) ──────────────────────────────────
 *
 * Name, Gewicht im Bereich und die voreingestellten Personen («kişi
 * ataması»). Der Beitrag zur Gesamtfertigstellung rechnet sich mit. «Tamam»
 * ändert nur den Entwurf der Vorlage; gespeichert wird oben mit «Kaydet».
 *
 * Seit dem 28.09.2026: das Kürzel vergibt die Vorlage selbst, und das
 * Fenster fragt nie nach Bereich und Stufe — Aufgaben entstehen IN ihrer
 * Stufe («we create the tasks inside the stages»). Name, Gewicht und Beitrag
 * stehen in einer Zeile. Dazu die Unteraufgaben mit Gewicht als Anteil an
 * der Aufgabe — wiegt die Aufgabe 0, gibt es keins — und mit «Document» und
 * «Approval» als Pflicht (in der Tabelle nur zu lesen, geändert wird hier). Tage trägt eine Vorlage keine (28.09.2026:
 * «we shouldn't add dates to tasks in the task templates page»).
 */
export const TaskEditDialog = ({
    task,
    isNew,
    sections,
    otherWeight,
    withDates = false,
    names,
    staff,
    staffLoading,
    onSave,
    onDelete,
    onClose,
}: {
    task: ProductionTask;
    isNew: boolean;
    sections: readonly TaskSection[];
    /**
     * Was die ÜBRIGEN Aufgaben derselben STUFE schon wiegen (30.09.2026: «the weights of the
     * task only should fill the weight of its stage») — diese hier bekommt höchstens den Rest.
     */
    otherWeight: number;
    /**
     * Am Gerät (28.09.2026): Beginn und Termin für Aufgabe und Unteraufgaben —
     * die Unteraufgaben innerhalb der Tage der Aufgabe. Eine Vorlage trägt keine.
     */
    withDates?: boolean;
    names: PersonNames;
    staff: StaffDirectoryRow[];
    staffLoading: boolean;
    onSave: (task: ProductionTask) => void;
    onDelete?: () => void;
    onClose: () => void;
}) => {
    useBackDismiss(true, onClose);
    const [name, setName] = useState(task.name);
    const [weight, setWeight] = useState(isNew && !task.weight ? '' : weightText(task.weight));
    const [startDate, setStartDate] = useState<string | null>(task.startDate);
    const [dueDate, setDueDate] = useState<string | null>(task.dueDate);
    const [subtasks, setSubtasks] = useState<TaskSubtask[]>(task.subtasks);
    // Die Gewichte der Unteraufgaben als Text: «2» auf dem Weg zu «25» darf stehen bleiben.
    const [subtaskWeights, setSubtaskWeights] = useState<Record<string, string>>(() =>
        Object.fromEntries(task.subtasks.map((subtask) => [subtask.id, subtask.weight === null ? '' : weightText(subtask.weight)])));
    const [newSubtask, setNewSubtask] = useState('');
    // Die Freigabe-Checkliste (28.09.2026): offen je Unteraufgabe, dazu der Text des neuen Punkts.
    const [openChecklists, setOpenChecklists] = useState<ReadonlySet<string>>(() => new Set());
    const [newChecklistItems, setNewChecklistItems] = useState<Record<string, string>>({});
    const [tried, setTried] = useState(false);

    const section = sections.find((entry) => entry.key === task.area) ?? null;
    const stageEntry = section?.stages.find((entry) => entry.key === task.stage) ?? null;
    const location = section && stageEntry ? `${sectionLabel(section)} › ${stageLabel(stageEntry)}` : '';

    const parsedWeight = parsePercent(weight);
    // Was in der Stufe noch frei ist: 100 % minus die übrigen Aufgaben der Stufe (30.09.2026).
    const weightLeft = Math.max(0, Math.round((100 - otherWeight) * 100) / 100);
    // Das Gewicht der Stufe im Bereich — für den Beitrag zur Gesamtfertigstellung.
    const stageWeight = stageEntry?.weight ?? 0;
    const nameMissing = !name.trim();
    const weightInvalid = parsedWeight === null;
    /* Das Gewicht einer Unteraufgabe ist ein Anteil an ihrer Aufgabe («10 means
       10% of its parent»): zusammen höchstens 100 %, eine einzelne höchstens
       den Rest. Wiegt die Aufgabe 0, gibt es keins («if the weight of the task
       is 0 we shouldn't be able to add weight to the subtasks»). */
    const taskWeight = parsedWeight ?? 0;
    const noSubtaskWeights = taskWeight === 0;
    const subtaskSum = noSubtaskWeights ? 0 : subtaskWeightSum(subtasks);
    const subtaskWeightsExceeded = subtaskSum > 100 + 0.01;
    // Tragen die Unteraufgaben schon 100 % der Aufgabe, kommt keine weitere dazu.
    const subtasksFull = subtaskSum >= 100 - 0.01;
    const subtaskWeightInvalid = !noSubtaskWeights && subtasks.some((subtask) => {
        const text = subtaskWeights[subtask.id] ?? '';
        return Boolean(text.trim()) && parsePercent(text) === null;
    });
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [removingSubtask, setRemovingSubtask] = useState<TaskSubtask | null>(null);
    const remainingFor = (id: string) =>
        Math.max(0, Math.round((100 - subtaskWeightSum(subtasks.filter((entry) => entry.id !== id))) * 100) / 100);
    const datesReversed = withDates && Boolean(startDate && dueDate && startDate > dueDate);
    const dateProblems = new Map(subtasks.map((subtask) => [
        subtask.id,
        withDates ? subtaskDatesProblem({ startDate, dueDate }, subtask) : null,
    ]));
    const datesInvalid = datesReversed || [...dateProblems.values()].some(Boolean);
    const valid = !nameMissing && !weightInvalid && !subtaskWeightsExceeded && !subtaskWeightInvalid && !datesInvalid;

    // Am Gerät: wie die Unteraufgaben beim Öffnen des Fensters waren — kommt an einer
    // begonnenen eine Pflicht dazu, beginnt sie nach dem Speichern offen von vorn.
    const original = new Map(task.subtasks.map((entry) => [entry.id, entry]));
    const reopens = (subtask: TaskSubtask): boolean => {
        const before = original.get(subtask.id);
        return withDates && Boolean(before) && before!.status !== 'TODO' && requirementsAdded(before!, subtask);
    };
    const patchSubtask = (id: string, patch: Partial<TaskSubtask>) =>
        setSubtasks((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
    const moveSubtask = (index: number, offset: -1 | 1) =>
        setSubtasks((current) => {
            const target = index + offset;
            if (target < 0 || target >= current.length) return current;
            const next = [...current];
            const [item] = next.splice(index, 1);
            next.splice(target, 0, item);
            return next;
        });
    const addSubtask = () => {
        const clean = newSubtask.replace(/\s+/g, ' ').trim();
        if (!clean || subtasksFull || subtasks.length >= TASK_LIMITS.subtasks) return;
        setSubtasks((current) => [...current, emptySubtask(clean)]);
        setNewSubtask('');
    };
    const toggleChecklist = (id: string) =>
        setOpenChecklists((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const addChecklistItem = (subtask: TaskSubtask) => {
        const clean = (newChecklistItems[subtask.id] ?? '').replace(/\s+/g, ' ').trim();
        if (!clean || subtask.approvalChecklist.length >= TASK_LIMITS.checklistItems) return;
        patchSubtask(subtask.id, { approvalChecklist: [...subtask.approvalChecklist, { id: newChecklistItemId(), text: clean }] });
        setNewChecklistItems((current) => ({ ...current, [subtask.id]: '' }));
    };
    const patchChecklistItem = (subtask: TaskSubtask, itemId: string, text: string) =>
        patchSubtask(subtask.id, {
            approvalChecklist: subtask.approvalChecklist.map((item) => (item.id === itemId ? { ...item, text } : item)),
        });
    const removeChecklistItem = (subtask: TaskSubtask, itemId: string) =>
        patchSubtask(subtask.id, { approvalChecklist: subtask.approvalChecklist.filter((item) => item.id !== itemId) });
    const onNewSubtaskKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        // Enter im Feld der neuen Unteraufgabe fügt an — es übernimmt nicht die ganze Aufgabe.
        event.preventDefault();
        event.stopPropagation();
        addSubtask();
    };

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        setTried(true);
        if (!valid || parsedWeight === null) return;
        // Was noch im Feld der neuen Unteraufgabe steht, kommt mit.
        const pending = newSubtask.replace(/\s+/g, ' ').trim();
        const list = [...subtasks, ...(pending && !subtasksFull && subtasks.length < TASK_LIMITS.subtasks ? [emptySubtask(pending)] : [])]
            .map((entry) => ({
                ...entry,
                name: entry.name.replace(/\s+/g, ' ').trim(),
                // Was noch im Feld des neuen Punkts steht, kommt mit; ohne «Approval» keine Checkliste.
                approvalChecklist: entry.requiresApproval
                    ? [
                        ...entry.approvalChecklist,
                        ...(newChecklistItems[entry.id]?.trim() && entry.approvalChecklist.length < TASK_LIMITS.checklistItems
                            ? [{ id: newChecklistItemId(), text: newChecklistItems[entry.id] }]
                            : []),
                    ]
                        .map((item) => ({ ...item, text: item.text.replace(/\s+/g, ' ').trim() }))
                        .filter((item) => item.text)
                    : [],
            }))
            .filter((entry) => entry.name)
            // Eine Vorlage trägt keine Tage (28.09.2026) — auch keine alten; ohne
            // Gewicht der Aufgabe auch keine Gewichte der Unteraufgaben.
            .map((entry) => ({
                ...entry,
                startDate: withDates ? entry.startDate : null,
                dueDate: withDates ? entry.dueDate : null,
                weight: noSubtaskWeights ? null : entry.weight,
            }));
        onSave({
            ...task,
            name: name.replace(/\s+/g, ' ').trim(),
            weight: parsedWeight,
            startDate: withDates ? startDate : null,
            dueDate: withDates ? dueDate : null,
            // Personen stehen nur an den Unteraufgaben (29.09.2026) — die Aufgabe trägt ihre Summe.
            assigneeIds: taskAssigneesOf(list),
            subtasks: list,
        });
    };

    const error = (show: boolean, key: string) =>
        (tried || show) && <span className="ofi-ptk-field__error" role="alert">{t(key)}</span>;

    return (
        <PopupDialog
            closeOnBackdrop={false}
            open
            onClose={onClose}
            title={isNew ? t('productionTasks.task.newTitle') : t('productionTasks.task.editTitle', { code: task.code })}
            subtitle={location}
            icon={<ListChecks size={18} />}
            width={780}
            // Solange eine Bestätigung offen ist, gehört Escape ihr.
            closeOnEscape={!confirmDelete && removingSubtask === null}
            footer={(
                <PopupActions
                    start={onDelete ? (
                        <PopupButton variant="danger" onClick={() => setConfirmDelete(true)}>
                            <Trash2 size={14} />
                            {t('productionTasks.task.delete')}
                        </PopupButton>
                    ) : undefined}
                >
                    <PopupButton onClick={onClose}>{t('productionTasks.actions.cancel')}</PopupButton>
                    <PopupButton variant="primary" onClick={() => submit()}>
                        {isNew ? t('productionTasks.task.addButton') : t('productionTasks.actions.apply')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <form className="ofi-ptk-pop ofi-ptk-form" onSubmit={submit} noValidate>
                {/* Name, Gewicht und Beitrag in EINER Zeile. */}
                <div className="ofi-ptk-form__row">
                    <label className="ofi-ptk-field is-grow">
                        <span className="ofi-ptk-field__label">{t('productionTasks.task.name')}</span>
                        <input
                            className={`ofi-ptk-input ${tried && nameMissing ? 'is-invalid' : ''}`}
                            value={name}
                            maxLength={TASK_LIMITS.taskName}
                            autoFocus
                            placeholder={t('productionTasks.task.namePlaceholder')}
                            onChange={(event) => setName(event.target.value)}
                        />
                        {nameMissing && error(false, 'productionTasks.task.nameMissing')}
                    </label>
                    <label className="ofi-ptk-field is-weight">
                        <span className="ofi-ptk-field__label">{t('productionTasks.task.weight')}</span>
                        <span className={`ofi-ptk-percent ${tried && weightInvalid ? 'is-invalid' : ''}`}>
                            <input
                                className="ofi-ptk-input is-num"
                                value={weight}
                                inputMode="decimal"
                                placeholder={t('productionTasks.subtask.weightMax', { max: formatPercent(weightLeft) })}
                                title={t('productionTasks.task.weightLeft', { left: formatPercent(weightLeft) })}
                                onChange={(event) => setWeight(capped(event.target.value, weightLeft))}
                            />
                            <span aria-hidden>%</span>
                        </span>
                        {weightInvalid && error(false, 'productionTasks.task.weightInvalid')}
                    </label>
                    <div className="ofi-ptk-field is-overall">
                        <span className="ofi-ptk-field__label">{t('productionTasks.task.overall')}</span>
                        <span className="ofi-ptk-readout" title={t('productionTasks.task.overallHint')}>
                            {parsedWeight === null ? '—' : formatPercent(overallOf(taskSectionWeight(stageWeight, parsedWeight), section?.share ?? 0), true)}
                        </span>
                    </div>
                </div>

                {withDates && (
                    <div className="ofi-ptk-form__row">
                        <div className="ofi-ptk-field is-date">
                            <span className="ofi-ptk-field__label">{t('productionTasks.task.startDate')}</span>
                            <MacDatePicker
                                className="is-field-sm"
                                value={startDate ?? ''}
                                max={dueDate ?? undefined}
                                clearable
                                ariaLabel={t('productionTasks.task.startDate')}
                                onChange={(day) => setStartDate(day || null)}
                            />
                        </div>
                        <div className="ofi-ptk-field is-date">
                            <span className="ofi-ptk-field__label">{t('productionTasks.task.dueDate')}</span>
                            <MacDatePicker
                                className="is-field-sm"
                                value={dueDate ?? ''}
                                min={startDate ?? undefined}
                                clearable
                                ariaLabel={t('productionTasks.task.dueDate')}
                                onChange={(day) => setDueDate(day || null)}
                            />
                            {datesReversed && <span className="ofi-ptk-field__error" role="alert">{t('productionTasks.task.dueBeforeStart')}</span>}
                        </div>
                    </div>
                )}

                <div className="ofi-ptk-field">
                    <span className="ofi-ptk-field__label">{t('productionTasks.task.people')}</span>
                    {/* Nur zu lesen (29.09.2026: «only assign people to subtasks») — alle Personen der
                        Unteraufgaben; zugewiesen wird in der Tabelle, an jeder Unteraufgabe. */}
                    <PeopleCell
                        ids={taskAssigneesOf(subtasks)}
                        names={names}
                        editable={false}
                        staff={staff}
                        staffLoading={staffLoading}
                    />
                    <span className="ofi-ptk-field__hint">{t('productionTasks.task.peopleFromSubtasks')}</span>
                </div>

                <div className="ofi-ptk-field">
                    <span className="ofi-ptk-field__label">{t('productionTasks.subtask.title')}</span>
                    <div className="ofi-ptk-subedit">
                        {subtasks.map((subtask, index) => {
                            return (
                                <div key={subtask.id} className={`ofi-ptk-subedit__item ${dateProblems.get(subtask.id) ? 'is-invalid' : ''}`}>
                                    <div className="ofi-ptk-subedit__row">
                                        <span className="ofi-ptk-subedit__num" aria-hidden>{index + 1}</span>
                                        <input
                                            className="ofi-ptk-input"
                                            value={subtask.name}
                                            maxLength={TASK_LIMITS.subtaskName}
                                            aria-label={t('productionTasks.subtask.name')}
                                            placeholder={t('productionTasks.subtask.name')}
                                            onChange={(event) => patchSubtask(subtask.id, { name: event.target.value })}
                                        />
                                        <span className="ofi-ptk-subedit__part">
                                            <span>{t('productionTasks.subtask.weight')}</span>
                                            <span className={`ofi-ptk-percent is-subtask ${subtaskWeightsExceeded || parsePercent(subtaskWeights[subtask.id] ?? '') === null && (subtaskWeights[subtask.id] ?? '').trim() ? 'is-invalid' : ''}`}>
                                                <input
                                                    className="ofi-ptk-input is-num"
                                                    value={noSubtaskWeights ? '' : subtaskWeights[subtask.id] ?? ''}
                                                    inputMode="decimal"
                                                    disabled={noSubtaskWeights}
                                                    placeholder={noSubtaskWeights ? '—' : t('productionTasks.subtask.weightMax', { max: formatPercent(remainingFor(subtask.id)) })}
                                                    aria-label={t('productionTasks.subtask.weight')}
                                                    title={noSubtaskWeights
                                                        ? t('productionTasks.subtask.weightNeedsTask')
                                                        : t('productionTasks.subtask.weightMax', { max: formatPercent(remainingFor(subtask.id)) })}
                                                    onChange={(event) => {
                                                        const text = capped(event.target.value, remainingFor(subtask.id));
                                                        setSubtaskWeights((current) => ({ ...current, [subtask.id]: text }));
                                                        if (!text.trim()) patchSubtask(subtask.id, { weight: null });
                                                        else {
                                                            const value = parsePercent(text);
                                                            if (value !== null) patchSubtask(subtask.id, { weight: value });
                                                        }
                                                    }}
                                                />
                                                <span aria-hidden>%</span>
                                            </span>
                                            {/* Der Beitrag zur Gesamtfertigstellung gleich daneben — wie bei der Aufgabe. */}
                                            <span
                                                className="ofi-ptk-subedit__overall"
                                                title={subtask.weight === null || noSubtaskWeights ? undefined : t('productionTasks.subtask.weightOfTask', {
                                                    weight: formatPercent(subtask.weight),
                                                    section: formatPercent(subtaskSectionWeight(taskSectionWeight(stageWeight, taskWeight), subtask.weight)),
                                                })}
                                            >
                                                {subtask.weight === null || noSubtaskWeights
                                                    ? '—'
                                                    : formatPercent(overallOf(subtaskSectionWeight(taskSectionWeight(stageWeight, taskWeight), subtask.weight), section?.share ?? 0), true)}
                                            </span>
                                        </span>
                                        <span className="ofi-ptk-subedit__tools">
                                            <button
                                                type="button"
                                                className="ofi-ptk-toolbtn ofi-nosize"
                                                disabled={index === 0}
                                                title={t('productionTasks.subtask.moveUp')}
                                                aria-label={t('productionTasks.subtask.moveUp')}
                                                onClick={() => moveSubtask(index, -1)}
                                            >
                                                <ArrowUp aria-hidden />
                                            </button>
                                            <button
                                                type="button"
                                                className="ofi-ptk-toolbtn ofi-nosize"
                                                disabled={index === subtasks.length - 1}
                                                title={t('productionTasks.subtask.moveDown')}
                                                aria-label={t('productionTasks.subtask.moveDown')}
                                                onClick={() => moveSubtask(index, 1)}
                                            >
                                                <ArrowDown aria-hidden />
                                            </button>
                                            <button
                                                type="button"
                                                className="ofi-ptk-toolbtn is-danger ofi-nosize"
                                                title={t('productionTasks.subtask.remove')}
                                                aria-label={t('productionTasks.subtask.remove')}
                                                onClick={() => setRemovingSubtask(subtask)}
                                            >
                                                <X aria-hidden />
                                            </button>
                                        </span>
                                    </div>
                                    <div className="ofi-ptk-subedit__meta">
                                        <span className="ofi-ptk-subedit__lead">
                                            {/* Personen gleich beim Anlegen (29.09.2026: «when admins create a subtask they
                                                should be able to assign people in the same modal») — nur an Unteraufgaben. */}
                                            <span className="ofi-ptk-subedit__part">
                                                <span>{t('productionTasks.task.people')}</span>
                                                <PeopleCell
                                                    ids={subtask.assigneeIds}
                                                    names={names}
                                                    editable
                                                    staff={staff}
                                                    staffLoading={staffLoading}
                                                    onCommit={(next) => patchSubtask(subtask.id, { assigneeIds: next })}
                                                />
                                            </span>
                                            {withDates && (
                                                <span className="ofi-ptk-subedit__dates">
                                                    <span className="ofi-ptk-subedit__part">
                                                        <span>{t('productionTasks.subtask.startDate')}</span>
                                                        <MacDatePicker
                                                            className="is-compact"
                                                            value={subtask.startDate ?? ''}
                                                            min={startDate ?? undefined}
                                                            max={(subtask.dueDate && dueDate ? (subtask.dueDate < dueDate ? subtask.dueDate : dueDate) : subtask.dueDate ?? dueDate) ?? undefined}
                                                            clearable
                                                            ariaLabel={t('productionTasks.subtask.startDate')}
                                                            onChange={(day) => patchSubtask(subtask.id, { startDate: day || null })}
                                                        />
                                                    </span>
                                                    <span className="ofi-ptk-subedit__part">
                                                        <span>{t('productionTasks.subtask.dueDate')}</span>
                                                        <MacDatePicker
                                                            className="is-compact"
                                                            value={subtask.dueDate ?? ''}
                                                            min={(subtask.startDate && startDate ? (subtask.startDate > startDate ? subtask.startDate : startDate) : subtask.startDate ?? startDate) ?? undefined}
                                                            max={dueDate ?? undefined}
                                                            clearable
                                                            ariaLabel={t('productionTasks.subtask.dueDate')}
                                                            onChange={(day) => patchSubtask(subtask.id, { dueDate: day || null })}
                                                        />
                                                    </span>
                                                </span>
                                            )}
                                        </span>
                                        <span className="ofi-ptk-subedit__flags">
                                            {FLAGS.map(({ flag, labelKey }) => (
                                                <label key={flag} className="ofi-ptk-flag">
                                                    <input
                                                        type="checkbox"
                                                        className="ofi-ptk-check"
                                                        checked={subtask[flag]}
                                                        onChange={(event) => patchSubtask(subtask.id, flag === 'requiresDocument'
                                                            ? { requiresDocument: event.target.checked }
                                                            : { requiresApproval: event.target.checked })}
                                                    />
                                                    {t(labelKey)}
                                                </label>
                                            ))}
                                            {/* «Approval» gewählt: daneben die Checkliste (28.09.2026). */}
                                            {subtask.requiresApproval && (
                                                <button
                                                    type="button"
                                                    className={`ofi-ptk-btn is-small ofi-nosize ofi-ptk-checklistbtn ${openChecklists.has(subtask.id) ? 'is-open' : ''}`}
                                                    aria-expanded={openChecklists.has(subtask.id)}
                                                    // Kurz im Knopf, ausgeschrieben beim Zeigen und für Vorleser.
                                                    title={subtask.approvalChecklist.length
                                                        ? t('productionTasks.subtask.checklistEdit', { count: subtask.approvalChecklist.length })
                                                        : t('productionTasks.subtask.checklistAdd')}
                                                    aria-label={subtask.approvalChecklist.length
                                                        ? t('productionTasks.subtask.checklistEdit', { count: subtask.approvalChecklist.length })
                                                        : t('productionTasks.subtask.checklistAdd')}
                                                    onClick={() => toggleChecklist(subtask.id)}
                                                >
                                                    {subtask.approvalChecklist.length ? <ClipboardCheck aria-hidden /> : <Plus aria-hidden />}
                                                    {t('productionTasks.subtask.checklistShort')}
                                                    {subtask.approvalChecklist.length > 0 && (
                                                        <span className="ofi-ptk-checklistbtn__count" aria-hidden>{subtask.approvalChecklist.length}</span>
                                                    )}
                                                </button>
                                            )}
                                        </span>
                                    </div>
                                    {subtask.requiresApproval && openChecklists.has(subtask.id) && (
                                        <div className="ofi-ptk-apchecklist" role="group" aria-label={t('productionTasks.subtask.checklistTitle')}>
                                            <span className="ofi-ptk-apchecklist__title">
                                                <ClipboardCheck aria-hidden />
                                                {t('productionTasks.subtask.checklistTitle')}
                                            </span>
                                            {subtask.approvalChecklist.map((item, itemIndex) => (
                                                <div key={item.id} className="ofi-ptk-subedit__row">
                                                    <span className="ofi-ptk-subedit__num" aria-hidden>{itemIndex + 1}</span>
                                                    <input
                                                        className="ofi-ptk-input"
                                                        value={item.text}
                                                        maxLength={TASK_LIMITS.checklistItemText}
                                                        aria-label={t('productionTasks.subtask.checklistItem')}
                                                        onChange={(event) => patchChecklistItem(subtask, item.id, event.target.value)}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="ofi-ptk-toolbtn is-danger ofi-nosize"
                                                        title={t('productionTasks.subtask.checklistRemove')}
                                                        aria-label={t('productionTasks.subtask.checklistRemove')}
                                                        onClick={() => removeChecklistItem(subtask, item.id)}
                                                    >
                                                        <X aria-hidden />
                                                    </button>
                                                </div>
                                            ))}
                                            {subtask.approvalChecklist.length < TASK_LIMITS.checklistItems && (
                                                <div className="ofi-ptk-subedit__row is-new">
                                                    <span className="ofi-ptk-subedit__num" aria-hidden><Plus /></span>
                                                    <input
                                                        className="ofi-ptk-input"
                                                        value={newChecklistItems[subtask.id] ?? ''}
                                                        maxLength={TASK_LIMITS.checklistItemText}
                                                        autoFocus={!subtask.approvalChecklist.length}
                                                        aria-label={t('productionTasks.subtask.checklistAddItem')}
                                                        placeholder={t('productionTasks.subtask.checklistPlaceholder')}
                                                        onChange={(event) => setNewChecklistItems((current) => ({ ...current, [subtask.id]: event.target.value }))}
                                                        onKeyDown={(event) => {
                                                            if (event.key !== 'Enter') return;
                                                            // Enter fügt den Punkt an — es übernimmt nicht die ganze Aufgabe.
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            addChecklistItem(subtask);
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="ofi-ptk-btn is-small ofi-nosize"
                                                        disabled={!(newChecklistItems[subtask.id] ?? '').trim()}
                                                        onClick={() => addChecklistItem(subtask)}
                                                    >
                                                        {t('productionTasks.subtask.checklistAddItem')}
                                                    </button>
                                                </div>
                                            )}
                                            <span className="ofi-ptk-field__hint">{t('productionTasks.subtask.checklistHint')}</span>
                                        </div>
                                    )}
                                    {/* Neue Pflicht an einer begonnenen Unteraufgabe (28.09.2026): Speichern öffnet sie wieder. */}
                                    {reopens(subtask) && (
                                        <div className="ofi-ptk-note is-info ofi-ptk-reopennote" role="status">
                                            <Info aria-hidden />
                                            <span>{t('productionTasks.subtask.reopenNote')}</span>
                                        </div>
                                    )}
                                    {dateProblems.get(subtask.id) && (
                                        <span className="ofi-ptk-field__error" role="alert">
                                            {dateProblems.get(subtask.id) === 'order'
                                                ? t('productionTasks.task.dueBeforeStart')
                                                : t('productionTasks.subtask.outsideTask', { range: dateRangeLabel(startDate, dueDate) })}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                        {subtasks.length < TASK_LIMITS.subtasks && (
                            <div className="ofi-ptk-subedit__row is-new">
                                <span className="ofi-ptk-subedit__num" aria-hidden><Plus /></span>
                                <input
                                    className="ofi-ptk-input"
                                    value={newSubtask}
                                    maxLength={TASK_LIMITS.subtaskName}
                                    aria-label={t('productionTasks.subtask.add')}
                                    placeholder={t('productionTasks.subtask.addPlaceholder')}
                                    disabled={subtasksFull}
                                    title={subtasksFull ? t('productionTasks.subtask.full') : undefined}
                                    onChange={(event) => setNewSubtask(event.target.value)}
                                    onKeyDown={onNewSubtaskKey}
                                />
                                <button
                                    type="button"
                                    className="ofi-ptk-btn is-small ofi-nosize"
                                    disabled={subtasksFull || !newSubtask.trim()}
                                    title={subtasksFull ? t('productionTasks.subtask.full') : undefined}
                                    onClick={addSubtask}
                                >
                                    {t('productionTasks.subtask.add')}
                                </button>
                            </div>
                        )}
                    </div>
                    {/* Warum keine weitere Unteraufgabe — gleich darunter. */}
                    {subtasksFull && !subtaskWeightsExceeded && (
                        <div className="ofi-ptk-note is-info ofi-ptk-fullnote" role="status">
                            <Info aria-hidden />
                            <span>{t('productionTasks.subtask.full')}</span>
                        </div>
                    )}
                    {subtaskWeightsExceeded && (
                        <span className="ofi-ptk-field__error" role="alert">
                            {t('productionTasks.subtask.weightsExceeded', { sum: formatPercent(subtaskSum) })}
                        </span>
                    )}
                    <span className="ofi-ptk-field__hint">
                        {noSubtaskWeights ? t('productionTasks.subtask.weightNeedsTask') : t('productionTasks.subtask.hint')}
                    </span>
                </div>
                {/* Enter in einem Feld übernimmt — wie «Tamam». */}
                <button type="submit" hidden aria-hidden tabIndex={-1} />
            </form>
            {/* Löschen fragt immer nach (28.09.2026: «always show a warning»). */}
            <ConfirmDialog
                closeOnBackdrop={false}
                open={confirmDelete}
                tone="danger"
                title={t('productionTasks.task.deleteTitle')}
                message={t('productionTasks.task.deleteText', { code: task.code, name: task.name })}
                confirmLabel={t('productionTasks.actions.delete')}
                cancelLabel={t('productionTasks.actions.cancel')}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => { setConfirmDelete(false); onDelete?.(); }}
            />
            <ConfirmDialog
                closeOnBackdrop={false}
                open={removingSubtask !== null}
                tone="danger"
                title={t('productionTasks.subtask.removeTitle')}
                message={removingSubtask ? t('productionTasks.subtask.removeText', { name: removingSubtask.name || '—' }) : undefined}
                confirmLabel={t('productionTasks.actions.delete')}
                cancelLabel={t('productionTasks.actions.cancel')}
                onCancel={() => setRemovingSubtask(null)}
                onConfirm={() => {
                    const target = removingSubtask;
                    setRemovingSubtask(null);
                    if (target) setSubtasks((current) => current.filter((entry) => entry.id !== target.id));
                }}
            />
        </PopupDialog>
    );
};
