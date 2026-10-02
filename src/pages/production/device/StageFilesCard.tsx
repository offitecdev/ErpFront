import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, FileStack, History, X } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { MacDatePicker } from '@/components/ui-shared/MacDatePicker';
import { t } from '@/i18n/translate';
import type { ProductionTask } from '@/types/productionTasks';

import { FileDropZone } from '../tasks/FileDropZone';
import type { PersonNames } from '../tasks/PeopleCell';
import { FileCard } from '../tasks/FileCard';
import { fileProblem, formatMoment, type SubtaskActions } from '../tasks/subtaskFileModel';
import { formatDay, localToday, SUBTASK_FILE_ACCEPT, SUBTASK_PHOTO_ACCEPT, subtaskCode } from '../tasks/taskModel';
import {
    dayDiff,
    daysBetween,
    dutyChecker,
    firstTaskStart,
    lastTaskDue,
    HISTORY_MAX_DAYS,
    shiftDay,
    stageFilesOf,
    type StageFile,
} from './stageFileModel';

type Tab = 'files' | 'history';

/** Der Wochentag kurz, in der Sprache der Oberfläche. */
const weekday = (day: string): string => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(document.documentElement.lang || undefined, { weekday: 'short' });
};

/**
 * ── DIE DATEIEN EINER STUFE (28.09.2026, Vorgabe Samet) ─────────────────────
 *
 * «Under this show a files button like this. When the admin clicks on it show
 * all uploaded files of the stage, with filters: PDF and Image. Also admin
 * should be able to choose task and subtask to filter the files.»
 * «Admins should be able to upload files in that section directly … drag and
 * drop. After that they should select a task and subtask.»
 * «Show a file history tab … the uploaded files by the assigned people,
 * chronologically. They have to upload files every day» — je Person und Tag
 * grün mit Haken (hochgeladen) oder rot mit X (nicht). Ein Klick auf eine
 * Zelle zeigt genau diese Dateien. Beide Reiter teilen den Zeitraum.
 */
export const StageFilesCard = ({
    stageName,
    tasks,
    names,
    actions,
    missingNote = null,
    onClose,
}: {
    stageName: string;
    tasks: ProductionTask[];
    names: PersonNames;
    actions: SubtaskActions;
    /** «Heute noch keine Datei» / «N fehlen heute» (02.10.2026) — am Reiter «Dateiverlauf». */
    missingNote?: string | null;
    onClose: () => void;
}) => {
    const [tab, setTab] = useState<Tab>('files');
    // Entfernen fragt immer nach (28.09.2026: «always show a warning»).
    const [removing, setRemoving] = useState<StageFile | null>(null);
    const [unstaging, setUnstaging] = useState<File | null>(null);
    const [taskId, setTaskId] = useState('');
    const [subtaskId, setSubtaskId] = useState('');
    const [personId, setPersonId] = useState('');
    /* Die Grenzen des Zeitraums (28.09.2026): vom Beginn der ersten Aufgabe der
       Stufe bis zum spätesten Termin — nie davor («shouldn't go older than the
       first task's starting date»). Ohne Termin endet er heute. */
    const today = localToday();
    const minDay = firstTaskStart(tasks);
    const maxDay = lastTaskDue(tasks) ?? (minDay && minDay > today ? minDay : today);
    const clampDay = (day: string) => (minDay && day < minDay ? minDay : day > maxDay ? maxDay : day);
    const [from, setFrom] = useState(() => minDay ?? shiftDay(maxDay, -6));
    const [to, setTo] = useState(() => maxDay);
    // Ein Klick in der Historie: genau ein Tag einer Person.
    const [cellDay, setCellDay] = useState<string | null>(null);
    const [pending, setPending] = useState<File[]>([]);
    const [targetTaskId, setTargetTaskId] = useState('');
    const [targetSubtaskId, setTargetSubtaskId] = useState('');
    const [uploading, setUploading] = useState(false);

    const all = useMemo(() => stageFilesOf(tasks), [tasks]);
    const filterTask = tasks.find((task) => task.id === taskId);
    const inRange = (entry: StageFile) => (cellDay
        ? entry.day === cellDay
        : (!from || entry.day >= from) && (!to || entry.day <= to));
    const shown = all.filter((entry) =>
        (!taskId || entry.task.id === taskId)
        && (!subtaskId || entry.subtask.id === subtaskId)
        && (!personId || entry.file.uploadedById === personId)
        && inRange(entry));

    // Die Leute der Stufe: wer in einer ihrer Aufgaben steht.
    const people = useMemo(() => [...new Set(tasks.flatMap((task) => task.assigneeIds))]
        .map((id) => ({ id, name: names.get(id)?.name ?? '—' }))
        .sort((a, b) => a.name.localeCompare(b.name)), [tasks, names]);
    // Der Filter «Person» (28.09.2026): die Leute der Stufe UND jede Person, die hier
    // etwas hochgeladen hat — auch die Verwaltung, die nicht in einer Aufgabe steht.
    const filterPeople = useMemo(() => {
        const known = new Map(people.map((person) => [person.id, person.name]));
        for (const entry of all) {
            const id = entry.file.uploadedById;
            if (id && !known.has(id)) known.set(id, names.get(id)?.name ?? entry.file.uploadedByName ?? '—');
        }
        return [...known].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [people, all, names]);
    const personName = (id: string) => filterPeople.find((person) => person.id === id)?.name ?? names.get(id)?.name ?? '—';

    const days = useMemo(() => daysBetween(from, to), [from, to]);
    const isDutyDay = useMemo(() => dutyChecker(tasks), [tasks]);
    const uploadsByPersonDay = useMemo(() => {
        const counts = new Map<string, number>();
        for (const entry of all) {
            if (!entry.file.uploadedById) continue;
            const key = `${entry.file.uploadedById}|${entry.day}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return counts;
    }, [all]);

    /* Die Zeilen der Historie (28.09.2026): wer in einer Aufgabe steht, muss
       jeden Tag hochladen (grün bzw. rot); wer sonst hier hochgeladen hat —
       etwa die Verwaltung — steht darunter, nur mit seinen Tagen, ohne rotes X. */
    const historyRows = useMemo(() => {
        const assigned = new Set(people.map((person) => person.id));
        const extra = filterPeople.filter((person) => !assigned.has(person.id)
            && days.some((day) => uploadsByPersonDay.has(`${person.id}|${day}`)));
        return [
            ...people.map((person) => ({ ...person, duty: true })),
            ...extra.map((person) => ({ ...person, duty: false })),
        ];
    }, [people, filterPeople, days, uploadsByPersonDay]);

    // Nur Aufgaben mit Unteraufgaben nehmen Dateien an — Dateien hängen an Unteraufgaben.
    const targets = tasks.filter((task) => task.subtasks.length > 0);
    const targetTask = targets.find((task) => task.id === targetTaskId);
    const targetSubtask = targetTask?.subtasks.find((subtask) => subtask.id === targetSubtaskId);
    // Fotos (02.10.2026): nur, wenn eine Unteraufgabe der Stufe «Fotoğraf yeterli» trägt — das Ziel prüft beim Hochladen.
    const photoTargets = targets.some((task) => task.subtasks.some((subtask) => subtask.photoAllowed));

    const stage = (files: File[]) => {
        const accepted = files.filter((file) => {
            const problem = fileProblem(file, photoTargets);
            if (problem) toast.error(`${file.name}: ${problem}`);
            return !problem;
        });
        if (!accepted.length) return;
        setPending((current) => [...current, ...accepted]);
        // Die Filter geben das Ziel vor, wenn sie schon eine Aufgabe zeigen.
        if (!targetTaskId && taskId) {
            setTargetTaskId(taskId);
            if (subtaskId) setTargetSubtaskId(subtaskId);
        }
    };

    const upload = async () => {
        if (!targetTask || !targetSubtask || !pending.length) return;
        setUploading(true);
        let left = [...pending];
        for (const file of pending) {
            // Ein Foto an eine Unteraufgabe ohne «Fotoğraf yeterli»: bleibt liegen, ein anderes Ziel wählen.
            const problem = fileProblem(file, targetSubtask.photoAllowed);
            if (problem) { toast.error(`${file.name}: ${problem}`); continue; }
            if (!(await actions.upload(targetTask, targetSubtask, file))) break;
            left = left.filter((entry) => entry !== file);
        }
        setPending(left);
        setUploading(false);
        if (!left.length) toast.success(t('productionTasks.stageFiles.uploaded', { count: pending.length, name: targetSubtask.name }));
    };

    /* Blättern in der Historie (28.09.2026): der Zeitraum rückt um seine eigene
       Länge vor oder zurück — innerhalb der Grenzen der Stufe. */
    const span = from && to ? Math.min(HISTORY_MAX_DAYS, Math.max(1, dayDiff(from, to) + 1)) : 7;
    const pageEnd = to && to < maxDay ? to : maxDay;
    const page = (direction: -1 | 1) => {
        let end = shiftDay(pageEnd, direction * span);
        if (end > maxDay) end = maxDay;
        let start = shiftDay(end, -(span - 1));
        if (minDay && start < minDay) {
            start = minDay;
            const stretched = shiftDay(minDay, span - 1);
            end = stretched < maxDay ? stretched : maxDay;
        }
        setFrom(start);
        setTo(end);
        setCellDay(null);
    };

    const openCell = (person: string, day: string) => {
        setPersonId(person);
        setCellDay(day);
        setTaskId('');
        setSubtaskId('');
        setTab('files');
    };


    return (
        <section className="ofi-ptk-card ofi-ptk-stagefiles" aria-label={t('productionTasks.stageFiles.region', { stage: stageName })}>
            <header className="ofi-ptk-card__head">
                <span className="ofi-ptk-stagefiles__icon" aria-hidden><FileStack /></span>
                <h3 className="ofi-ptk-card__title">
                    {t('productionTasks.stageFiles.title')}
                    <small>{stageName}</small>
                </h3>
                <span className="ofi-ptk-card__sum">
                    <b>{t('productionTasks.stageFiles.count', { count: all.length })}</b>
                </span>
                <button
                    type="button"
                    className="ofi-ptk-card__close ofi-nosize"
                    aria-label={t('productionTasks.stageFloat.close')}
                    title={t('productionTasks.stageFloat.close')}
                    onClick={onClose}
                >
                    <X aria-hidden />
                </button>
            </header>

            <div className="ofi-ptk-stagefiles__body">
                <div className="ofi-ptk-stagefiles__bar">
                    <div className="ofi-ptk-seg" role="tablist" aria-label={t('productionTasks.stageFiles.title')}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={tab === 'files'}
                            className="ofi-ptk-seg__btn ofi-nosize"
                            onClick={() => setTab('files')}
                        >
                            <FileStack size={14} aria-hidden />
                            {t('productionTasks.stageFiles.tabFiles')}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={tab === 'history'}
                            className="ofi-ptk-seg__btn ofi-nosize"
                            onClick={() => setTab('history')}
                        >
                            <History size={14} aria-hidden />
                            {t('productionTasks.stageFiles.tabHistory')}
                            {/* Nur ein rotes «!» (02.10.2026) — der Text steht im Tipp. */}
                            {missingNote && <em className="ofi-ptk-seg__warn" title={missingNote} aria-label={missingNote}>!</em>}
                        </button>
                    </div>
                    {/* Der Zeitraum gilt für beide Reiter. */}
                    <div className="ofi-ptk-stagefiles__filters">
                        <div className="ofi-ptk-field is-date">
                            <span className="ofi-ptk-field__label">{t('productionTasks.stageFiles.from')}</span>
                            <MacDatePicker
                                className="is-field-sm"
                                value={from}
                                min={minDay ?? undefined}
                                max={to || maxDay}
                                ariaLabel={t('productionTasks.stageFiles.from')}
                                onChange={(day) => { setFrom(clampDay(day || minDay || from)); setCellDay(null); }}
                            />
                        </div>
                        <div className="ofi-ptk-field is-date">
                            <span className="ofi-ptk-field__label">{t('productionTasks.stageFiles.to')}</span>
                            <MacDatePicker
                                className="is-field-sm"
                                value={to}
                                min={from || minDay || undefined}
                                max={maxDay}
                                ariaLabel={t('productionTasks.stageFiles.to')}
                                onChange={(day) => { setTo(clampDay(day || maxDay)); setCellDay(null); }}
                            />
                        </div>
                    </div>
                </div>

                {tab === 'files' ? (
                    <>
                        {actions.isAdmin && (
                            <div className="ofi-ptk-stagefiles__upload">
                                <FileDropZone
                                    compact
                                    multiple
                                    title={t(photoTargets ? 'productionTasks.stageFiles.dropTitlePhoto' : 'productionTasks.stageFiles.dropTitle')}
                                    accept={photoTargets ? SUBTASK_PHOTO_ACCEPT : SUBTASK_FILE_ACCEPT}
                                    busy={uploading}
                                    disabled={!targets.length}
                                    onFiles={stage}
                                />
                                {!targets.length && <p className="ofi-ptk-stagefiles__note">{t('productionTasks.stageFiles.noSubtasks')}</p>}
                                {pending.length > 0 && (
                                    <div className="ofi-ptk-tray">
                                        <ul className="ofi-ptk-tray__files">
                                            {pending.map((file, index) => (
                                                <li key={`${file.name}-${index}`}>
                                                    <span>{file.name}</span>
                                                    <button
                                                        type="button"
                                                        className="ofi-ptk-tray__drop ofi-nosize"
                                                        aria-label={t('productionTasks.files.remove', { name: file.name })}
                                                        disabled={uploading}
                                                        onClick={() => setUnstaging(file)}
                                                    >
                                                        <X aria-hidden />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="ofi-ptk-tray__target">
                                            <label className="ofi-ptk-fselect">
                                                <span>{t('productionTasks.stageFiles.task')}</span>
                                                <select
                                                    value={targetTaskId}
                                                    disabled={uploading}
                                                    onChange={(event) => { setTargetTaskId(event.target.value); setTargetSubtaskId(''); }}
                                                >
                                                    <option value="">{t('productionTasks.stageFiles.chooseTask')}</option>
                                                    {targets.map((task) => <option key={task.id} value={task.id}>{`${task.code} · ${task.name}`}</option>)}
                                                </select>
                                            </label>
                                            <label className="ofi-ptk-fselect">
                                                <span>{t('productionTasks.stageFiles.subtask')}</span>
                                                <select
                                                    value={targetSubtaskId}
                                                    disabled={uploading || !targetTask}
                                                    onChange={(event) => setTargetSubtaskId(event.target.value)}
                                                >
                                                    <option value="">{t('productionTasks.stageFiles.chooseSubtask')}</option>
                                                    {targetTask?.subtasks.map((subtask, index) => (
                                                        <option key={subtask.id} value={subtask.id}>{`${subtaskCode(targetTask.code, index)} · ${subtask.name}`}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <button
                                                type="button"
                                                className="ofi-ptk-tray__cancel ofi-nosize"
                                                disabled={uploading}
                                                onClick={() => setPending([])}
                                            >
                                                {t('productionTasks.actions.cancel')}
                                            </button>
                                            <button
                                                type="button"
                                                className="ofi-ptk-completebtn ofi-nosize"
                                                disabled={uploading || !targetSubtask}
                                                onClick={() => void upload()}
                                            >
                                                {t('productionTasks.stageFiles.upload', { count: pending.length })}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="ofi-ptk-stagefiles__filters">
                            <label className="ofi-ptk-fselect">
                                <span className="sr-only">{t('productionTasks.stageFiles.task')}</span>
                                <select value={taskId} onChange={(event) => { setTaskId(event.target.value); setSubtaskId(''); }}>
                                    <option value="">{t('productionTasks.stageFiles.allTasks')}</option>
                                    {targets.map((task) => <option key={task.id} value={task.id}>{`${task.code} · ${task.name}`}</option>)}
                                </select>
                            </label>
                            <label className="ofi-ptk-fselect">
                                <span className="sr-only">{t('productionTasks.stageFiles.subtask')}</span>
                                <select value={subtaskId} disabled={!filterTask} onChange={(event) => setSubtaskId(event.target.value)}>
                                    <option value="">{t('productionTasks.stageFiles.allSubtasks')}</option>
                                    {filterTask?.subtasks.map((subtask, index) => (
                                        <option key={subtask.id} value={subtask.id}>{`${subtaskCode(filterTask.code, index)} · ${subtask.name}`}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="ofi-ptk-fselect">
                                <span className="sr-only">{t('productionTasks.stageFiles.person')}</span>
                                <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
                                    <option value="">{t('productionTasks.stageFiles.allPeople')}</option>
                                    {filterPeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                                </select>
                            </label>
                            {cellDay && (
                                <button
                                    type="button"
                                    className="ofi-ptk-activefilter ofi-nosize"
                                    title={t('productionTasks.stageFiles.clearDay')}
                                    onClick={() => { setCellDay(null); setPersonId(''); }}
                                >
                                    {personId ? `${personName(personId)} · ${formatDay(cellDay)}` : formatDay(cellDay)}
                                    <X aria-hidden />
                                </button>
                            )}
                        </div>

                        {shown.length ? (
                            <div className="ofi-ptk-filegrid">
                                {shown.map((entry) => (
                                    <FileCard
                                        key={entry.file.id}
                                        file={entry.file}
                                        meta={[entry.code, entry.file.uploadedByName, formatMoment(entry.file.uploadedAt)].filter(Boolean).join(' · ')}
                                        load={() => actions.loadFile(entry.task, entry.subtask, entry.file)}
                                        onOpen={() => actions.openFile(entry.task, entry.subtask, entry.file)}
                                        onRemove={actions.isAdmin ? () => setRemoving(entry) : undefined}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="ofi-ptk-card__empty">
                                {all.length ? t('productionTasks.stageFiles.empty') : t('productionTasks.stageFiles.none')}
                            </p>
                        )}
                    </>
                ) : historyRows.length ? (
                    <>
                        <div className="ofi-ptk-history" role="region" aria-label={t('productionTasks.stageFiles.tabHistory')}>
                            <table>
                                <thead>
                                    <tr>
                                        <th scope="col">{t('productionTasks.stageFiles.person')}</th>
                                        {days.map((day) => (
                                            <th key={day} scope="col" className={day === today ? 'is-today' : ''}>
                                                {`${day.slice(8, 10)}.${day.slice(5, 7)}`}
                                                <small>{weekday(day)}</small>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyRows.map((person) => {
                                        // Nur die Tage ihrer Aufgaben zählen — an den übrigen gibt es kein rotes X.
                                        // Gezählt wird bis heute — ein kommender Tag ist noch nicht versäumt.
                                        const dutyDays = person.duty ? days.filter((day) => day <= today && isDutyDay(person.id, day)) : [];
                                        const total = dutyDays.filter((day) => uploadsByPersonDay.has(`${person.id}|${day}`)).length;
                                        return (
                                            <tr key={person.id} className={person.duty ? '' : 'is-extra'}>
                                                <th scope="row">
                                                    {person.name}
                                                    <small>{person.duty ? `${total}/${dutyDays.length}` : t('productionTasks.stageFiles.notAssigned')}</small>
                                                </th>
                                                {days.map((day) => {
                                                    const count = uploadsByPersonDay.get(`${person.id}|${day}`) ?? 0;
                                                    // Ohne Pflicht zum Hochladen: ein Tag ohne Datei bleibt leer.
                                                    if (!count && !(person.duty && isDutyDay(person.id, day))) {
                                                        return <td key={day} className="is-free" title={t('productionTasks.stageFiles.cellFree')} />;
                                                    }
                                                    // Ein Aufgabentag, der noch kommt: ein leerer Ring statt X.
                                                    if (!count && day > today) {
                                                        return (
                                                            <td key={day} title={t('productionTasks.stageFiles.cellUpcoming', { name: person.name, day: formatDay(day) })}>
                                                                <span className="ofi-ptk-daydot is-upcoming" aria-hidden />
                                                            </td>
                                                        );
                                                    }
                                                    const label = count
                                                        ? t('productionTasks.stageFiles.cellYes', { name: person.name, day: formatDay(day), count })
                                                        : t('productionTasks.stageFiles.cellNo', { name: person.name, day: formatDay(day) });
                                                    return (
                                                        <td key={day}>
                                                            <button
                                                                type="button"
                                                                className="ofi-ptk-daycell ofi-nosize"
                                                                aria-label={label}
                                                                title={label}
                                                                onClick={() => openCell(person.id, day)}
                                                            >
                                                                <span className={`ofi-ptk-daydot ${count ? 'is-yes' : 'is-no'}`} aria-hidden>
                                                                    {count ? <Check /> : <X />}
                                                                    {count > 1 && <b>{count}</b>}
                                                                </span>
                                                            </button>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="ofi-ptk-history__foot">
                            <p className="ofi-ptk-history__legend">
                                <span><span className="ofi-ptk-daydot is-yes" aria-hidden><Check /></span>{t('productionTasks.stageFiles.legendYes')}</span>
                                <span><span className="ofi-ptk-daydot is-no" aria-hidden><X /></span>{t('productionTasks.stageFiles.legendNo')}</span>
                                <span><span className="ofi-ptk-daydot is-upcoming" aria-hidden />{t('productionTasks.stageFiles.legendUpcoming')}</span>
                                <span><span className="ofi-ptk-daydot is-free" aria-hidden />{t('productionTasks.stageFiles.legendFree')}</span>
                                {days.length >= HISTORY_MAX_DAYS && <span>{t('productionTasks.stageFiles.historyCapped', { max: HISTORY_MAX_DAYS })}</span>}
                            </p>
                            {/* Unten rechts: zwischen den Tagen blättern. */}
                            <nav className="ofi-ptk-pager" aria-label={t('productionTasks.stageFiles.pager')}>
                                <button
                                    type="button"
                                    className="ofi-ptk-pager__btn ofi-nosize"
                                    aria-label={t('productionTasks.stageFiles.prevDays', { count: span })}
                                    title={t('productionTasks.stageFiles.prevDays', { count: span })}
                                    disabled={Boolean(minDay && from <= minDay)}
                                    onClick={() => page(-1)}
                                >
                                    <ChevronLeft aria-hidden />
                                </button>
                                <span className="ofi-ptk-pager__range">
                                    {days.length ? `${formatDay(days[0]).slice(0, 5)} – ${formatDay(days[days.length - 1]).slice(0, 5)}` : '—'}
                                </span>
                                <button
                                    type="button"
                                    className="ofi-ptk-pager__btn ofi-nosize"
                                    disabled={pageEnd >= maxDay}
                                    aria-label={t('productionTasks.stageFiles.nextDays', { count: span })}
                                    title={t('productionTasks.stageFiles.nextDays', { count: span })}
                                    onClick={() => page(1)}
                                >
                                    <ChevronRight aria-hidden />
                                </button>
                            </nav>
                        </div>
                    </>
                ) : (
                    <p className="ofi-ptk-card__empty">{t('productionTasks.stageFiles.noPeople')}</p>
                )}
            </div>

            <ConfirmDialog
                open={removing !== null}
                tone="danger"
                title={t('productionTasks.files.removeTitle')}
                message={removing ? t('productionTasks.files.removeText', { name: removing.file.name, subtask: `${removing.code} · ${removing.subtask.name}` }) : undefined}
                confirmLabel={t('productionTasks.actions.delete')}
                cancelLabel={t('productionTasks.actions.cancel')}
                onCancel={() => setRemoving(null)}
                onConfirm={() => {
                    if (removing) void actions.removeFile(removing.task, removing.subtask, removing.file);
                    setRemoving(null);
                }}
            />
            <ConfirmDialog
                open={unstaging !== null}
                tone="danger"
                title={t('productionTasks.stageFiles.unstageTitle')}
                message={unstaging ? t('productionTasks.stageFiles.unstageText', { name: unstaging.name }) : undefined}
                confirmLabel={t('productionTasks.actions.remove')}
                cancelLabel={t('productionTasks.actions.cancel')}
                onCancel={() => setUnstaging(null)}
                onConfirm={() => {
                    setPending((current) => current.filter((entry) => entry !== unstaging));
                    setUnstaging(null);
                }}
            />
        </section>
    );
};
