import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
    Activity,
    ArrowRight,
    ArrowUpRight,
    ArrowRightLeft,
    BadgeCheck,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    CircleDot,
    FileUp,
    FileX,
    LayoutTemplate,
    ListPlus,
    LockOpen,
    Pencil,
    Play,
    Plus,
    RotateCcw,
    Send,
    Square,
    Trash2,
    UserPlus,
    X,
    type LucideIcon,
} from 'lucide-react';

import { t } from '@/i18n/translate';
import { productionTaskErrorText, productionTasksApi } from '@/lib/api/productionTasks';
import { MacDatePicker } from '@/components/ui-shared/MacDatePicker';
import type {
    ProductionTask,
    TaskActivity,
    TaskActivityKind,
    TaskActivityPage,
    TaskActivityQuery,
    TaskSubtask,
    TaskSubtaskFile,
} from '@/types/productionTasks';

import { FileCard } from '../tasks/FileCard';
import { formatDateTime, formatMoment, type SubtaskActions } from '../tasks/subtaskFileModel';
import { formatDay, formatPercent, initialsOf, localToday, personTone } from '../tasks/taskModel';
import {
    ACTIVITY_FILTERS,
    activityEntries,
    byDay,
    dayHeading,
    dayStartIso,
    entrySentence,
    formatSize,
    kindsOf,
    pageList,
    statusName,
    targetOf,
    type ActivityEntry,
    type ActivityFilter,
} from './stageActivityModel';

/** So viele Zeilen je Seite des Verlaufs. */
const ACTIVITY_PAGE_SIZE = 10;

/** Zeichen und Farbe je Art — die Farbe sagt, ob es voranging, zurück oder weg. */
const LOOK: Record<TaskActivityKind, { icon: LucideIcon; tone: string }> = {
    SUBTASK_STARTED: { icon: Play, tone: 'is-blue' },
    SUBTASK_STOPPED: { icon: Square, tone: 'is-gray' },
    SUBTASK_SUBMITTED: { icon: Send, tone: 'is-orange' },
    SUBTASK_DONE: { icon: CircleCheck, tone: 'is-green' },
    TASK_STATUS: { icon: CircleDot, tone: 'is-blue' },
    SUBTASK_APPROVED: { icon: BadgeCheck, tone: 'is-green' },
    REVISION_REQUESTED: { icon: RotateCcw, tone: 'is-red' },
    SUBTASK_UNLOCKED: { icon: LockOpen, tone: 'is-gray' },
    CHECKLIST_ITEM_ADDED: { icon: ListPlus, tone: 'is-orange' },
    UNLOCK_REQUESTED: { icon: LockOpen, tone: 'is-orange' },
    REQUEST_SOLVED: { icon: CircleCheck, tone: 'is-green' },
    FILE_UPLOADED: { icon: FileUp, tone: 'is-purple' },
    FILE_DELETED: { icon: FileX, tone: 'is-red' },
    SUBTASK_ASSIGNED: { icon: UserPlus, tone: 'is-blue' },
    TASK_CREATED: { icon: Plus, tone: 'is-green' },
    SUBTASK_CREATED: { icon: Plus, tone: 'is-green' },
    TASK_UPDATED: { icon: Pencil, tone: 'is-gray' },
    SUBTASK_UPDATED: { icon: Pencil, tone: 'is-gray' },
    TASK_DELETED: { icon: Trash2, tone: 'is-red' },
    SUBTASK_DELETED: { icon: Trash2, tone: 'is-red' },
    TASK_MOVED: { icon: ArrowRightLeft, tone: 'is-gray' },
    STAGE_ADDED: { icon: ListPlus, tone: 'is-green' },
    PLAN_LOADED: { icon: LayoutTemplate, tone: 'is-blue' },
    PLAN_REMOVED: { icon: Trash2, tone: 'is-red' },
};

/** Die Datei einer Zeile, wie der Verlauf sie festhielt. */
type LoggedFile = {
    fileId: string;
    name: string;
    size: number;
    version: number;
    revisionNote: string | null;
    uploadedByName: string | null;
    uploadedAt: string | null;
};

const loggedFile = (details: Record<string, unknown> | null): LoggedFile | null => {
    if (!details || typeof details.fileId !== 'string') return null;
    return {
        fileId: details.fileId,
        name: typeof details.name === 'string' ? details.name : '—',
        size: typeof details.size === 'number' ? details.size : 0,
        version: typeof details.version === 'number' ? details.version : 1,
        revisionNote: typeof details.revisionNote === 'string' && details.revisionNote ? details.revisionNote : null,
        uploadedByName: typeof details.uploadedByName === 'string' ? details.uploadedByName : null,
        uploadedAt: typeof details.uploadedAt === 'string' ? details.uploadedAt : null,
    };
};

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Ein Wert einer Änderung, lesbar. */
const fieldValue = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (field === 'startDate' || field === 'dueDate') return typeof value === 'string' ? formatDay(value) : '—';
    if (field === 'weight') return typeof value === 'number' ? formatPercent(value) : '—';
    if (field === 'status') return statusName(value);
    if (typeof value === 'boolean') return value ? t('productionTasks.activity.detail.yes') : t('productionTasks.activity.detail.no');
    return String(value);
};

type Live = { task: ProductionTask; subtask: TaskSubtask; file: TaskSubtaskFile };

/**
 * ── DER VERLAUF EINER STUFE (30.09.2026, Vorgabe Samet) ─────────────────────
 *
 * «Add activities on the stage pages under the devices after the files
 *  button. Activities will show the history of the stage — who did what …
 *  but I should click and see the details, for example xxx uploaded a file I
 *  need to see which files, or revision messages etc.»
 *
 * Drittes Glasplättchen unter «Aufgaben» und «Dateien»; auf ist es eine Liste
 * nach Tagen, neueste zuerst. Jeder Eintrag klappt auf: die Dateien (als
 * Karten — ein Klick öffnet sie, solange sie noch an der Unteraufgabe
 * hängen), Notizen der Freigabe und Rückgabe, vorher → nachher, Personen.
 * Oben filtern Art, Person und Zeitraum, unten wird geblättert (30.09.2026) —
 * beides fragt der Server ab. Ändert sich an den Aufgaben der Stufe etwas,
 * lädt die Seite still nach.
 */
export const StageActivityCard = ({
    deviceId,
    revision,
    area,
    stageKey,
    stageName,
    tasks,
    actions,
    stageNameOf,
    onGoTo,
    onClose,
}: {
    deviceId: string;
    /** Zählt die vom Server bestätigten Änderungen — jede lädt die Seite nach. */
    revision: number;
    /** Bereich und Stufe — null (30.09.2026): der Verlauf des ganzen Geräts, jede Zeile nennt ihre Stufe. */
    area: string | null;
    stageKey: string | null;
    stageName: string;
    tasks: ProductionTask[];
    actions: SubtaskActions;
    /** Der Name einer Stufe (verschobene Aufgaben, neue Stufen). */
    stageNameOf: (area: string | null, stage: string | null) => string;
    /**
     * «Go to subtask» neben Datum und Uhrzeit (30.09.2026, Startseite) — nur an Zeilen einer
     * Unteraufgabe, die es noch gibt.
     */
    onGoTo?: (row: TaskActivity) => void;
    onClose: () => void;
}) => {
    const [page, setPage] = useState(1);
    const [filter, setFilter] = useState<ActivityFilter>('all');
    const [personId, setPersonId] = useState('');
    // Der Zeitraum (30.09.2026): Kalendertage, leer = offen.
    const [fromDay, setFromDay] = useState('');
    const [toDay, setToDay] = useState('');
    const [tick, setTick] = useState(0);
    const [result, setResult] = useState<{ key: string; page: TaskActivityPage | null; error: string | null } | null>(null);
    const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(() => new Set());
    const cardRef = useRef<HTMLElement>(null);

    /* Was gezeigt wird, fragt der Server ab (30.09.2026: Seiten und Zeitraum) —
       so gelten Filter und Seiten über den GANZEN Verlauf, nicht nur das Geladene.
       Der Zeitraum geht als Beginn des ersten und des Tages NACH dem letzten Tag. */
    const query = useMemo<TaskActivityQuery>(() => ({
        page,
        pageSize: ACTIVITY_PAGE_SIZE,
        kinds: kindsOf(filter),
        ...(personId ? { actorId: personId } : {}),
        ...(fromDay ? { from: dayStartIso(fromDay) } : {}),
        ...(toDay ? { to: dayStartIso(toDay, 1) } : {}),
    }), [page, filter, personId, fromDay, toDay]);
    // Jede bestätigte Änderung (`revision`) fragt neu — ihre Zeile steht dann schon im Verlauf.
    const key = `${deviceId}|${area}|${stageKey}|${JSON.stringify(query)}|${tick}|${revision}`;

    useEffect(() => {
        let cancelled = false;
        void productionTasksApi.activities(deviceId, area, stageKey, query).then(
            (value) => {
                if (cancelled) return;
                // Die Seite gibt es nicht mehr (weniger Zeilen als zuvor): zur letzten.
                if (!value.items.length && value.total > 0 && query.page > 1) {
                    setPage(Math.max(1, Math.ceil(value.total / value.pageSize)));
                    return;
                }
                setResult({ key, page: value, error: null });
            },
            (failure: unknown) => {
                if (cancelled) return;
                setResult((current) => ({
                    key,
                    page: current?.page ?? null,
                    error: productionTaskErrorText(failure, 'productionTasks.activity.loadFailed'),
                }));
            },
        );
        return () => { cancelled = true; };
    }, [deviceId, area, stageKey, query, key]);

    // Bis die Antwort da ist, bleibt die vorige Seite stehen (leicht gedimmt).
    const shown = result?.page ?? null;
    const loading = result === null;
    const busy = result !== null && result.key !== key;
    const error = result?.key === key ? result.error : null;
    const rows = useMemo(() => shown?.items ?? [], [shown]);
    const people = shown?.actors ?? [];
    const total = shown?.total ?? 0;
    const pageSize = shown?.pageSize ?? ACTIVITY_PAGE_SIZE;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const firstRow = total ? (page - 1) * pageSize + 1 : 0;
    const lastRow = Math.min(total, page * pageSize);
    const filtered = filter !== 'all' || Boolean(personId || fromDay || toDay);

    const entries = useMemo(() => activityEntries(rows), [rows]);
    const days = useMemo(() => byDay(entries), [entries]);
    const today = localToday();

    /** Ein Filter ändert sich: zurück auf die erste Seite. */
    const refilter = (apply: () => void) => {
        apply();
        setPage(1);
    };
    const goPage = (next: number) => {
        setPage(Math.min(pages, Math.max(1, next)));
        cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    /** Hängt die Datei noch an der Unteraufgabe? — dann lässt sie sich öffnen. */
    const liveFile = (row: Pick<TaskActivity, 'taskId' | 'subtaskId'>, fileId: string): Live | null => {
        const task = tasks.find((entry) => entry.id === row.taskId);
        const subtask = task?.subtasks.find((entry) => entry.id === row.subtaskId);
        const file = subtask?.files.find((entry) => entry.id === fileId);
        return task && subtask && file ? { task, subtask, file } : null;
    };

    const toggle = (key: string) => setOpenKeys((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    /* ── Die Einzelheiten eines Eintrags ────────────────────────────────── */

    const fileTile = (row: TaskActivity, file: LoggedFile, deleted = false): ReactNode => {
        const live = deleted ? null : liveFile(row, file.fileId);
        const meta = [
            file.uploadedByName,
            file.uploadedAt ? formatMoment(file.uploadedAt) : '',
            formatSize(file.size),
        ].filter(Boolean).join(' · ');
        return (
            <div key={`${row.id}-${file.fileId}`} className="ofi-ptk-actfile">
                {live ? (
                    <FileCard
                        file={live.file}
                        meta={meta}
                        load={() => actions.loadFile(live.task, live.subtask, live.file)}
                        onOpen={() => actions.openFile(live.task, live.subtask, live.file)}
                    />
                ) : (
                    <div className={`ofi-ptk-actfile__gone ${deleted ? 'is-deleted' : ''}`}>
                        <span className="ofi-ptk-actfile__type" aria-hidden>PDF</span>
                        <span className="ofi-ptk-actfile__text">
                            <b>
                                {file.name}
                                {file.version > 1 && <span className="ofi-ptk-versiontag">{t('productionTasks.files.versionShort', { version: file.version })}</span>}
                            </b>
                            <small>{meta}</small>
                            <em>{deleted ? t('productionTasks.activity.detail.deleted') : t('productionTasks.activity.detail.fileGone')}</em>
                        </span>
                    </div>
                )}
                {file.revisionNote && (
                    <p className="ofi-ptk-actnote is-small">
                        <span>{t('productionTasks.activity.detail.whatChanged')}</span>
                        {file.revisionNote}
                    </p>
                )}
            </div>
        );
    };

    /** Die Dateien, die eine Freigabe oder Rückgabe betraf (Kennungen) — die noch da sind. */
    const filesByIds = (row: TaskActivity, ids: string[]): ReactNode => {
        const live = ids.map((id) => liveFile(row, id)).filter((entry): entry is Live => entry !== null);
        if (!live.length) return null;
        return (
            <div className="ofi-ptk-actblock">
                <span className="ofi-ptk-actblock__label">{t('productionTasks.activity.detail.files')}</span>
                <div className="ofi-ptk-actfiles">
                    {live.map((entry) => (
                        <div key={entry.file.id} className="ofi-ptk-actfile">
                            <FileCard
                                file={entry.file}
                                meta={[entry.file.uploadedByName, formatMoment(entry.file.uploadedAt)].filter(Boolean).join(' · ')}
                                load={() => actions.loadFile(entry.task, entry.subtask, entry.file)}
                                onOpen={() => actions.openFile(entry.task, entry.subtask, entry.file)}
                            />
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const note = (value: unknown, label: string): ReactNode => (
        <p className={`ofi-ptk-actnote ${text(value) ? '' : 'is-empty'}`}>
            <span>{label}</span>
            {text(value) || t('productionTasks.activity.detail.noNote')}
        </p>
    );

    const statusStep = (from: unknown, to: unknown): ReactNode => (
        <p className="ofi-ptk-actstep">
            <span className={`ofi-ptk-actstatus is-${text(from).toLowerCase()}`}>{statusName(from)}</span>
            <ArrowRight aria-hidden />
            <span className={`ofi-ptk-actstatus is-${text(to).toLowerCase()}`}>{statusName(to)}</span>
        </p>
    );

    const personChips = (label: string, persons: Array<{ id?: string; name?: string }>, tone: 'is-add' | 'is-remove' | '') =>
        persons.length > 0 && (
            <div className="ofi-ptk-actblock">
                <span className="ofi-ptk-actblock__label">{label}</span>
                <span className="ofi-ptk-actpeople">
                    {persons.map((person, index) => (
                        <span key={person.id ?? index} className={`ofi-ptk-actperson ${tone}`}>
                            <span className="ofi-ptk-actperson__dot" style={{ '--ptk-person-tone': personTone(person.id ?? String(index)) } as CSSProperties}>
                                {initialsOf(person.name ?? '?')}
                            </span>
                            {person.name || '—'}
                        </span>
                    ))}
                </span>
            </div>
        );

    const facts = (pairs: Array<[string, ReactNode]>) => (
        <dl className="ofi-ptk-actfacts">
            {pairs.map(([label, value]) => (
                <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                </div>
            ))}
        </dl>
    );

    const changeTable = (changes: Array<{ field: string; from: unknown; to: unknown }>) => (
        <table className="ofi-ptk-actchanges">
            <thead>
                <tr>
                    <th scope="col">{t('productionTasks.activity.detail.field')}</th>
                    <th scope="col">{t('productionTasks.activity.detail.before')}</th>
                    <th scope="col">{t('productionTasks.activity.detail.after')}</th>
                </tr>
            </thead>
            <tbody>
                {changes.map((change) => {
                    if (change.field === 'checklist') {
                        const value = (change.to ?? {}) as { added?: string[]; removed?: string[]; edited?: Array<{ from: string; to: string }> };
                        return (
                            <tr key="checklist">
                                <th scope="row">{t('productionTasks.activity.field.checklist')}</th>
                                <td>
                                    {list<string>(value.removed).map((item) => <s key={`r-${item}`}>{item}</s>)}
                                    {list<{ from: string; to: string }>(value.edited).map((item) => <s key={`e-${item.from}`}>{item.from}</s>)}
                                    {!list(value.removed).length && !list(value.edited).length && '—'}
                                </td>
                                <td>
                                    {list<string>(value.added).map((item) => <ins key={`a-${item}`}>{item}</ins>)}
                                    {list<{ from: string; to: string }>(value.edited).map((item) => <ins key={`e-${item.to}`}>{item.to}</ins>)}
                                    {!list(value.added).length && !list(value.edited).length && '—'}
                                </td>
                            </tr>
                        );
                    }
                    return (
                        <tr key={change.field}>
                            <th scope="row">{t(`productionTasks.activity.field.${change.field}`)}</th>
                            <td>{fieldValue(change.field, change.from)}</td>
                            <td>{fieldValue(change.field, change.to)}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );

    const detailsOf = (entry: ActivityEntry): ReactNode => {
        const row = entry.rows[0];
        const details = row.details ?? {};
        switch (entry.kind) {
            case 'FILE_UPLOADED':
                return (
                    <div className="ofi-ptk-actfiles">
                        {[...entry.rows].reverse().map((item) => {
                            const file = loggedFile(item.details);
                            return file ? fileTile(item, file) : null;
                        })}
                    </div>
                );
            case 'FILE_DELETED': {
                const file = loggedFile(details);
                return file ? <div className="ofi-ptk-actfiles">{fileTile(row, file, true)}</div> : null;
            }
            case 'REVISION_REQUESTED':
                return (
                    <>
                        {note(details.note, t('productionTasks.activity.detail.revisionNote'))}
                        {filesByIds(row, list<string>(details.fileIds))}
                    </>
                );
            case 'SUBTASK_APPROVED':
                return (
                    <>
                        {note(details.note, t('productionTasks.activity.detail.approvalNote'))}
                        {list<string>(details.checklist).length > 0 && (
                            <div className="ofi-ptk-actblock">
                                <span className="ofi-ptk-actblock__label">{t('productionTasks.activity.detail.checklist')}</span>
                                <ul className="ofi-ptk-actchecks">
                                    {list<string>(details.checklist).map((item) => <li key={item}><CircleCheck aria-hidden />{item}</li>)}
                                </ul>
                            </div>
                        )}
                        {filesByIds(row, list<string>(details.fileIds))}
                    </>
                );
            case 'CHECKLIST_ITEM_ADDED':
                return note(details.text, t('productionTasks.activity.detail.checklistItem'));
            case 'UNLOCK_REQUESTED':
                return note(details.note, t('productionTasks.requests.unlockReason'));
            case 'REQUEST_SOLVED':
                return (
                    <>
                        {facts([
                            [t('productionTasks.requests.kindLabel'), t(`productionTasks.requests.kind.${text(details.kind) || 'UNLOCK'}`)],
                            [t('productionTasks.requests.requestedBy'), text(details.requestedByName) || '—'],
                            [t('productionTasks.requests.requestedAt'), text(details.requestedAt) ? formatDateTime(text(details.requestedAt)) : '—'],
                        ])}
                        {text(details.note) && note(details.note, t('productionTasks.requests.unlockReason'))}
                    </>
                );
            case 'SUBTASK_STARTED':
            case 'SUBTASK_STOPPED':
            case 'SUBTASK_SUBMITTED':
            case 'SUBTASK_DONE':
            case 'SUBTASK_UNLOCKED':
            case 'TASK_STATUS':
                return statusStep(details.from, details.to);
            case 'SUBTASK_ASSIGNED':
                return (
                    <>
                        {personChips(t('productionTasks.activity.detail.added'), list(details.added), 'is-add')}
                        {personChips(t('productionTasks.activity.detail.removed'), list(details.removed), 'is-remove')}
                    </>
                );
            case 'TASK_UPDATED':
            case 'SUBTASK_UPDATED': {
                const changes = list<{ field: string; from: unknown; to: unknown }>(details.changes);
                return changes.length ? changeTable(changes) : null;
            }
            case 'TASK_CREATED':
                return (
                    <>
                        {facts([
                            [t('productionTasks.activity.field.weight'), fieldValue('weight', details.weight)],
                            [t('productionTasks.activity.field.startDate'), fieldValue('startDate', details.startDate)],
                            [t('productionTasks.activity.field.dueDate'), fieldValue('dueDate', details.dueDate)],
                        ])}
                        {list<{ code: string; name: string }>(details.subtasks).length > 0 && (
                            <div className="ofi-ptk-actblock">
                                <span className="ofi-ptk-actblock__label">{t('productionTasks.activity.detail.subtasks')}</span>
                                <ul className="ofi-ptk-actlist">
                                    {list<{ code: string; name: string }>(details.subtasks).map((item) => <li key={item.code}><b>{item.code}</b> {item.name}</li>)}
                                </ul>
                            </div>
                        )}
                    </>
                );
            case 'SUBTASK_CREATED':
                return (
                    <>
                        {facts([
                            [t('productionTasks.activity.field.weight'), fieldValue('weight', details.weight)],
                            [t('productionTasks.activity.field.startDate'), fieldValue('startDate', details.startDate)],
                            [t('productionTasks.activity.field.dueDate'), fieldValue('dueDate', details.dueDate)],
                            [t('productionTasks.activity.field.requiresDocument'), fieldValue('requiresDocument', details.requiresDocument)],
                            [t('productionTasks.activity.field.requiresApproval'), fieldValue('requiresApproval', details.requiresApproval)],
                        ])}
                        {list<string>(details.checklist).length > 0 && (
                            <div className="ofi-ptk-actblock">
                                <span className="ofi-ptk-actblock__label">{t('productionTasks.activity.field.checklist')}</span>
                                <ul className="ofi-ptk-actlist">{list<string>(details.checklist).map((item) => <li key={item}>{item}</li>)}</ul>
                            </div>
                        )}
                        {personChips(t('productionTasks.activity.detail.people'), list(details.assignees), '')}
                    </>
                );
            case 'TASK_DELETED':
                return list<{ code: string; name: string; status: string; fileCount: number }>(details.subtasks).length ? (
                    <div className="ofi-ptk-actblock">
                        <span className="ofi-ptk-actblock__label">{t('productionTasks.activity.detail.subtasks')}</span>
                        <ul className="ofi-ptk-actlist">
                            {list<{ code: string; name: string; status: string; fileCount: number }>(details.subtasks).map((item) => (
                                <li key={item.code}>
                                    <b>{item.code}</b> {item.name}
                                    <small>
                                        {statusName(item.status)}
                                        {item.fileCount > 0 && ` · ${t('productionTasks.stageFiles.count', { count: item.fileCount })}`}
                                    </small>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : <p className="ofi-ptk-actmuted">{t('productionTasks.activity.detail.noSubtasks')}</p>;
            case 'SUBTASK_DELETED': {
                const files = list<Record<string, unknown>>(details.files).map(loggedFile).filter((file): file is LoggedFile => file !== null);
                return (
                    <>
                        {facts([[t('productionTasks.activity.field.status'), statusName(details.status)]])}
                        {files.length > 0 && (
                            <div className="ofi-ptk-actblock">
                                <span className="ofi-ptk-actblock__label">{t('productionTasks.activity.detail.filesGone')}</span>
                                <div className="ofi-ptk-actfiles">{files.map((file) => fileTile(row, file, true))}</div>
                            </div>
                        )}
                    </>
                );
            }
            case 'TASK_MOVED':
                return (
                    <p className="ofi-ptk-actstep">
                        <span className="ofi-ptk-actstatus">{stageNameOf(text(details.fromArea), text(details.fromStage))}</span>
                        <ArrowRight aria-hidden />
                        <span className="ofi-ptk-actstatus">{stageNameOf(text(details.toArea), text(details.toStage))}</span>
                    </p>
                );
            case 'PLAN_LOADED':
                return facts([
                    [t('productionTasks.activity.detail.template'), text(details.templateName) || '—'],
                    ...(text(details.previousTemplateName)
                        ? [[t('productionTasks.activity.detail.previousTemplate'), text(details.previousTemplateName)] as [string, ReactNode]]
                        : []),
                    [t('productionTasks.activity.detail.taskCount'), String(details.taskCount ?? '—')],
                ]);
            case 'PLAN_REMOVED':
                return facts([
                    [t('productionTasks.activity.detail.template'), text(details.templateName) || '—'],
                    [t('productionTasks.activity.detail.taskCount'), String(details.taskCount ?? '—')],
                ]);
            default:
                return null;
        }
    };

    return (
        <section ref={cardRef} className="ofi-ptk-card ofi-ptk-stagefiles ofi-ptk-activity" aria-label={t('productionTasks.activity.region', { stage: stageName })}>
            <header className="ofi-ptk-card__head">
                <span className="ofi-ptk-stagefiles__icon is-activity" aria-hidden><Activity /></span>
                <h3 className="ofi-ptk-card__title">
                    {t('productionTasks.activity.title')}
                    <small>{stageName}</small>
                </h3>
                {total > 0 && (
                    <span className="ofi-ptk-card__sum">
                        <b>{t('productionTasks.activity.count', { count: total })}</b>
                    </span>
                )}
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
                    <div className="ofi-ptk-seg" role="group" aria-label={t('productionTasks.activity.filterLabel')}>
                        {ACTIVITY_FILTERS.map((value) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={filter === value}
                                className="ofi-ptk-seg__btn ofi-nosize"
                                onClick={() => refilter(() => setFilter(value))}
                            >
                                {t(`productionTasks.activity.filter.${value}`)}
                            </button>
                        ))}
                    </div>
                    <div className="ofi-ptk-stagefiles__filters">
                        <label className="ofi-ptk-fselect">
                            <span className="sr-only">{t('productionTasks.activity.person')}</span>
                            <select value={personId} onChange={(event) => refilter(() => setPersonId(event.target.value))}>
                                <option value="">{t('productionTasks.activity.allPeople')}</option>
                                {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                            </select>
                        </label>
                        {/* Der Zeitraum (30.09.2026) — leer: offen; ✕ im Kalender leert ihn. */}
                        <div className="ofi-ptk-field is-date">
                            <span className="ofi-ptk-field__label">{t('productionTasks.activity.from')}</span>
                            <MacDatePicker
                                className="is-field-sm"
                                value={fromDay}
                                max={toDay || today}
                                clearable
                                placeholder={t('productionTasks.activity.anyDay')}
                                ariaLabel={t('productionTasks.activity.from')}
                                onChange={(day) => refilter(() => setFromDay(day))}
                            />
                        </div>
                        <div className="ofi-ptk-field is-date">
                            <span className="ofi-ptk-field__label">{t('productionTasks.activity.to')}</span>
                            <MacDatePicker
                                className="is-field-sm"
                                value={toDay}
                                min={fromDay || undefined}
                                max={today}
                                clearable
                                placeholder={t('productionTasks.activity.anyDay')}
                                ariaLabel={t('productionTasks.activity.to')}
                                onChange={(day) => refilter(() => setToDay(day))}
                            />
                        </div>
                        {filtered && (
                            <button
                                type="button"
                                className="ofi-ptk-activefilter ofi-nosize"
                                title={t('productionTasks.activity.clearFilters')}
                                onClick={() => refilter(() => { setFilter('all'); setPersonId(''); setFromDay(''); setToDay(''); })}
                            >
                                {t('productionTasks.activity.clearFilters')}
                                <X aria-hidden />
                            </button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <p className="ofi-ptk-card__empty is-activity">{t('productionTasks.activity.loading')}</p>
                ) : error && !rows.length ? (
                    <div className="ofi-ptk-activity__error">
                        <p>{error}</p>
                        <button type="button" className="ofi-ptk-btn ofi-nosize" onClick={() => setTick((value) => value + 1)}>
                            {t('productionTasks.activity.retry')}
                        </button>
                    </div>
                ) : !entries.length ? (
                    <p className="ofi-ptk-card__empty is-activity">
                        {filtered ? t('productionTasks.activity.emptyFiltered') : t('productionTasks.activity.empty')}
                    </p>
                ) : (
                    <div className={`ofi-ptk-activity__days ${busy ? 'is-busy' : ''}`} aria-busy={busy}>
                        {days.map(({ day, entries: dayEntries }) => (
                            <section key={day} className="ofi-ptk-activity__day" aria-label={dayHeading(day)}>
                                <h4 className="ofi-ptk-activity__dayhead">{dayHeading(day)}</h4>
                                <ol className="ofi-ptk-activity__list">
                                    {dayEntries.map((entry) => {
                                        const look = LOOK[entry.kind] ?? { icon: CircleDot, tone: 'is-gray' };
                                        const Icon = look.icon;
                                        const open = openKeys.has(entry.key);
                                        const row = entry.rows[0];
                                        const target = targetOf(row);
                                        const detailsId = `ofi-ptk-act-${entry.key}`;
                                        // Zur Unteraufgabe springen — nur, wenn es sie noch gibt.
                                        const canGo = Boolean(onGoTo && row.subtaskId && row.area && row.stage
                                            && row.kind !== 'SUBTASK_DELETED' && row.kind !== 'TASK_DELETED'
                                            && tasks.some((task) => task.id === row.taskId && task.subtasks.some((subtask) => subtask.id === row.subtaskId)));
                                        return (
                                            <li key={entry.key} className={`ofi-ptk-act ${open ? 'is-open' : ''}`}>
                                                <div className="ofi-ptk-act__head">
                                                <button
                                                    type="button"
                                                    className="ofi-ptk-act__row ofi-nosize"
                                                    aria-expanded={open}
                                                    aria-controls={detailsId}
                                                    onClick={() => toggle(entry.key)}
                                                >
                                                    <span className={`ofi-ptk-act__icon ${look.tone}`} aria-hidden><Icon /></span>
                                                    <span className="ofi-ptk-act__text">
                                                        <span className="ofi-ptk-act__line">
                                                            {/* Das ganze Gerät: in welcher Stufe es geschah. */}
                                                            {!stageKey && row.area && (
                                                                <span className="ofi-ptk-act__stage">{stageNameOf(row.area, row.stage)}</span>
                                                            )}
                                                            {entrySentence(entry, stageNameOf).map((part, index) => (
                                                                part.strong ? <b key={index}>{part.text}</b> : <span key={index}>{part.text}</span>
                                                            ))}
                                                        </span>
                                                    </span>
                                                    {/* Datum und Uhrzeit (30.09.2026: «show the dates where you show the times»). */}
                                                    <time className="ofi-ptk-act__time" dateTime={entry.at}>
                                                        {formatDateTime(entry.at)}
                                                    </time>
                                                    <ChevronDown className="ofi-ptk-act__chevron" aria-hidden />
                                                </button>
                                                {canGo && (
                                                    <button
                                                        type="button"
                                                        className="ofi-ptk-btn is-small ofi-ptk-act__goto ofi-nosize"
                                                        title={t('productionTasks.requests.goToSubtask')}
                                                        onClick={() => onGoTo?.(row)}
                                                    >
                                                        <ArrowUpRight aria-hidden />
                                                        {t('productionTasks.requests.goToSubtask')}
                                                    </button>
                                                )}
                                                </div>
                                                {open && (
                                                    <div id={detailsId} className="ofi-ptk-act__details">
                                                        {detailsOf(entry)}
                                                        <p className="ofi-ptk-act__foot">
                                                            <span
                                                                className="ofi-ptk-actperson__dot"
                                                                style={{ '--ptk-person-tone': personTone(entry.actorId ?? '?') } as CSSProperties}
                                                                aria-hidden
                                                            >
                                                                {initialsOf(entry.actorName ?? '?')}
                                                            </span>
                                                            {[entry.actorName || t('productionTasks.activity.someone'), formatDateTime(entry.at), target]
                                                                .filter(Boolean)
                                                                .join(' · ')}
                                                        </p>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ol>
                            </section>
                        ))}
                    </div>
                )}

                {/* Blättern (30.09.2026): «1–25 von 132», zurück, die Seiten, weiter. */}
                {!loading && total > pageSize && (
                    <nav className="ofi-ptk-activity__pager" aria-label={t('productionTasks.activity.pager')}>
                        <span className="ofi-ptk-pager__range">
                            {t('productionTasks.activity.pageRange', { from: firstRow, to: lastRow, total })}
                        </span>
                        <span className="ofi-ptk-activity__pages">
                            <button
                                type="button"
                                className="ofi-ptk-pager__btn ofi-nosize"
                                aria-label={t('productionTasks.activity.prevPage')}
                                title={t('productionTasks.activity.prevPage')}
                                disabled={page <= 1}
                                onClick={() => goPage(page - 1)}
                            >
                                <ChevronLeft aria-hidden />
                            </button>
                            {pageList(page, pages).map((value, index) => (value === null ? (
                                <span key={`gap-${index}`} className="ofi-ptk-activity__gap" aria-hidden>…</span>
                            ) : (
                                <button
                                    key={value}
                                    type="button"
                                    className={`ofi-ptk-activity__page ofi-nosize ${value === page ? 'is-current' : ''}`}
                                    aria-current={value === page ? 'page' : undefined}
                                    aria-label={t('productionTasks.activity.page', { page: value })}
                                    onClick={() => goPage(value)}
                                >
                                    {value}
                                </button>
                            )))}
                            <button
                                type="button"
                                className="ofi-ptk-pager__btn ofi-nosize"
                                aria-label={t('productionTasks.activity.nextPage')}
                                title={t('productionTasks.activity.nextPage')}
                                disabled={page >= pages}
                                onClick={() => goPage(page + 1)}
                            >
                                <ChevronRight aria-hidden />
                            </button>
                        </span>
                    </nav>
                )}
            </div>
        </section>
    );
};
