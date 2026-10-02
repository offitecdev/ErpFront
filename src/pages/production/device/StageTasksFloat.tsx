import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { Activity, Boxes, ChevronRight, FileStack, Inbox, ListChecks } from 'lucide-react';

import { productionTasksApi } from '@/lib/api/productionTasks';

import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import type { ProductionTask, TaskArea, TaskSectionStage, TaskStatus, TaskSubtask } from '@/types/productionTasks';

import type { PersonNames } from '../tasks/PeopleCell';
import { StageCard } from '../tasks/StageCard';
import type { SubtaskActions } from '../tasks/subtaskFileModel';
import { StageActivityCard } from './StageActivityCard';
import { StageFilesCard } from './StageFilesCard';
import { StageRequestsCard } from './StageRequestsCard';
import { missingUploadsToday, stageFilesOf } from './stageFileModel';
import { initialsOf, localToday, personTone, stageLabel } from '../tasks/taskModel';

/** Bleibt die Karte offen, wenn man die Stufe wechselt? — solange das Fenster lebt. */
const OPEN_KEY = 'ofi:ptk-stage-float-open';
const readOpen = (): boolean => {
    try { return window.sessionStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
};
const writeOpen = (open: boolean) => {
    try { window.sessionStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* ohne Speicher: nur für diese Seite */ }
};
const reducedMotion = (): boolean =>
    typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Wie sich die Karte öffnet: seitwärts, mit dem Schwung der Mac-Fenster. */
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * FLIP: die alte Grösse gemerkt (`from`), die neue gemessen, dazwischen
 * animiert — so wächst das Plättchen zur Karte (und zurück), statt zu springen.
 */
const useGrow = (boxRef: RefObject<HTMLDivElement | null>, fromRef: RefObject<DOMRect | null>, open: boolean) => {
    useLayoutEffect(() => {
        const box = boxRef.current;
        const from = fromRef.current;
        fromRef.current = null;
        if (!box || !from) return;
        box.querySelector<HTMLElement>(open ? '.ofi-ptk-card__close' : '.ofi-ptk-float__summary')?.focus({ preventScroll: true });
        if (reducedMotion() || typeof box.animate !== 'function') return;
        const to = box.getBoundingClientRect();
        box.animate(
            [
                { width: `${from.width}px`, height: `${from.height}px` },
                { width: `${to.width}px`, height: `${to.height}px` },
            ],
            { duration: open ? 460 : 340, easing: EASE },
        );
        (box.firstElementChild as HTMLElement | null)?.animate(
            [
                { opacity: 0, transform: open ? 'translateX(-12px)' : 'translateX(8px)' },
                { opacity: 1, transform: 'none' },
            ],
            { duration: open ? 300 : 220, delay: open ? 130 : 70, easing: 'ease-out', fill: 'backwards' },
        );
    }, [boxRef, fromRef, open]);
};

/**
 * ── DIE GLASKARTE DER AUFGABEN EINER STUFE (27.09.2026, Vorgabe Samet) ──────
 *
 * «Görevler diğer alanlarda küçük bir kart şeklinde olmalı — glass, güzel;
 *  küçük kart tıklanıp açılıp X ile kapanmalı, bir animasyonla sağa sola
 *  doğru açılmalı … içeriğin önüne geçmeli ama pop-up gibi değil — arka
 *  planın üzerinde kart kart glass, çarpı ile kapatılmalı.»
 *
 * Zu: ein kleines Glasplättchen oben links in der Fläche der Stufe — «Görevler»,
 * wie viele, ihr Gewicht, die Namenspunkte der Leute (die eigene Person
 * vorn und blau) und «sizde n», wenn welche der lesenden Person gehören.
 * Ein Klick zieht die Karte nach rechts auf (Breite und Höhe gemessen und
 * animiert, der Inhalt gleitet hinterher) — darin die Görevlendirme-Karte der
 * Stufe; ✕ (oder Escape) zieht sie wieder zusammen. Sie liegt ÜBER der Fläche
 * (kein Schleier, die Seite bleibt bedienbar), also kein Fenster.
 *
 * Darunter (28.09.2026, nur die Verwaltung) ein zweites Plättchen «Dateien»:
 * es zieht sich ebenso zur Liste aller Dateien der Stufe auf (StageFilesCard).
 * Und darunter (30.09.2026, ebenso nur die Verwaltung) ein drittes,
 * «Aktivitäten»: der Verlauf der Stufe — wer was wann tat (StageActivityCard).
 * Offen ist immer nur eine der Karten; die übrigen bleiben als Plättchen an ihrem Platz.
 */
export const StageTasksFloat = ({
    focusSubtaskId = null,
    deviceId,
    revision,
    area,
    stage,
    number,
    tasks,
    share,
    names,
    editable,
    staff,
    staffLoading,
    meId,
    busyTaskId,
    onStatus,
    onSubtaskStatus,
    onAssignSubtask,
    canSetStatus,
    subtaskActions,
    stageNameOf,
    onOpenBom,
}: {
    /** Diese Unteraufgabe gleich zeigen (30.09.2026, «Go to subtask»): die Karte der Aufgaben öffnet sich. */
    focusSubtaskId?: string | null;
    /** Das Gerät — der Verlauf der Stufe wird je Gerät gelesen. */
    deviceId: string;
    /** Zählt die vom Server bestätigten Änderungen — der Verlauf lädt danach nach. */
    revision: number;
    area: TaskArea;
    stage: TaskSectionStage;
    number: number | null;
    tasks: ProductionTask[];
    share: number;
    names: PersonNames;
    editable: boolean;
    staff: StaffDirectoryRow[];
    staffLoading: boolean;
    meId: string | null;
    busyTaskId: string | null;
    onStatus?: (task: ProductionTask, status: TaskStatus) => void;
    onSubtaskStatus?: (task: ProductionTask, subtask: TaskSubtask, status: TaskStatus) => void;
    /** Personen einer Unteraufgabe setzen — nur die Verwaltung (30.09.2026: auch auf den Stufen). */
    onAssignSubtask?: (task: ProductionTask, subtask: TaskSubtask, assigneeIds: string[]) => void;
    canSetStatus?: (task: ProductionTask, subtask: TaskSubtask | null) => boolean;
    /** Dateien und Abschluss der Unteraufgaben; mit `isAdmin` auch das Plättchen «Dateien». */
    subtaskActions?: SubtaskActions;
    /** Der Name einer Stufe des Geräts — der Verlauf nennt Stufen (verschoben, neu). */
    stageNameOf: (area: string | null, stage: string | null) => string;
    /** Nur auf der Stufe BOM (02.10.2026): das Plättchen «BOM» unter «Anfragen» öffnet die BOM. */
    onOpenBom?: () => void;
}) => {
    // «Go to subtask»: offen, wenn die gesuchte Unteraufgabe in dieser Stufe liegt.
    const [open, setOpen] = useState(() => (focusSubtaskId && tasks.some((task) => task.subtasks.some((subtask) => subtask.id === focusSubtaskId)) ? true : readOpen()));
    const [filesOpen, setFilesOpen] = useState(false);
    const [activityOpen, setActivityOpen] = useState(false);
    // Die Anfragen der Stufe (30.09.2026) — viertes Plättchen, unter «Aktivitäten».
    const [requestsOpen, setRequestsOpen] = useState(false);
    const [openRequests, setOpenRequests] = useState(0);
    const [requestsTick, setRequestsTick] = useState(0);
    const boxRef = useRef<HTMLDivElement>(null);
    const fromRef = useRef<DOMRect | null>(null);
    const filesRef = useRef<HTMLDivElement>(null);
    const filesFromRef = useRef<DOMRect | null>(null);
    const activityRef = useRef<HTMLDivElement>(null);
    const activityFromRef = useRef<DOMRect | null>(null);
    const requestsRef = useRef<HTMLDivElement>(null);
    const requestsFromRef = useRef<DOMRect | null>(null);
    const isAdmin = Boolean(subtaskActions?.isAdmin);
    const showFiles = isAdmin;
    /* Die Datei des Tages (02.10.2026): wer in der Stufe steht, sieht «Dateien» auch —
       mit dem Hinweis, dass heute noch keine Datei von ihm da ist; die Verwaltung,
       die hier nicht selbst arbeitet, sieht, wie vielen die Datei von heute fehlt. */
    const today = localToday();
    const missingToday = useMemo(() => missingUploadsToday(tasks, today), [tasks, today]);
    const responsible = Boolean(meId && tasks.some((task) => task.assigneeIds.includes(meId)));
    const showFilesTile = Boolean(subtaskActions) && (showFiles || responsible);
    const missingNote = responsible
        ? (meId && missingToday.includes(meId) ? t('productionTasks.stageFiles.missingMine') : null)
        : showFiles && missingToday.length > 0 ? t('productionTasks.stageFiles.missingCount', { count: missingToday.length }) : null;

    const toggle = (next: boolean) => {
        fromRef.current = boxRef.current?.getBoundingClientRect() ?? null;
        writeOpen(next);
        setOpen(next);
        if (next) {
            setFilesOpen(false);
            setActivityOpen(false);
            setRequestsOpen(false);
        }
    };
    const toggleFiles = (next: boolean) => {
        filesFromRef.current = filesRef.current?.getBoundingClientRect() ?? null;
        setFilesOpen(next);
        if (next) {
            setActivityOpen(false);
            setRequestsOpen(false);
        }
        if (next && open) toggle(false);
    };
    const toggleActivity = (next: boolean) => {
        activityFromRef.current = activityRef.current?.getBoundingClientRect() ?? null;
        setActivityOpen(next);
        if (next) {
            setFilesOpen(false);
            setRequestsOpen(false);
        }
        if (next && open) toggle(false);
    };
    const toggleRequests = (next: boolean) => {
        requestsFromRef.current = requestsRef.current?.getBoundingClientRect() ?? null;
        setRequestsOpen(next);
        if (next) {
            setFilesOpen(false);
            setActivityOpen(false);
        }
        if (next && open) toggle(false);
    };

    useGrow(boxRef, fromRef, open);
    useGrow(filesRef, filesFromRef, filesOpen);
    useGrow(activityRef, activityFromRef, activityOpen);
    useGrow(requestsRef, requestsFromRef, requestsOpen);

    /* Wie viele Anfragen der Stufe noch offen sind — die Zahl am Plättchen; jede bestätigte
       Änderung und jedes «Mark as solved» fragt neu. Nur die Verwaltung. */
    useEffect(() => {
        if (!subtaskActions?.isAdmin) return undefined;
        let cancelled = false;
        void productionTasksApi.requests(deviceId, area, stage.key, 'open').then(
            (list) => { if (!cancelled) setOpenRequests(list.openCount); },
            () => { /* ohne Zahl: das Plättchen bleibt ohne Zähler */ },
        );
        return () => { cancelled = true; };
    }, [deviceId, area, stage.key, revision, requestsTick, subtaskActions?.isAdmin]);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        // Escape aus einem Bestätigungsfenster (Portal) schliesst nur dieses.
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (event.key === 'Escape' && open) {
            event.stopPropagation();
            toggle(false);
        }
    };
    const onFilesKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        // Escape aus einem Bestätigungsfenster (Portal) schliesst nur dieses.
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (event.key === 'Escape' && filesOpen) {
            event.stopPropagation();
            toggleFiles(false);
        }
    };
    const onRequestsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (event.key === 'Escape' && requestsOpen) {
            event.stopPropagation();
            toggleRequests(false);
        }
    };
    const onActivityKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (event.key === 'Escape' && activityOpen) {
            event.stopPropagation();
            toggleActivity(false);
        }
    };
    const files = showFilesTile ? stageFilesOf(tasks) : [];

    const stageName = stageLabel(stage);
    const people = [...new Set(tasks.flatMap((task) => task.assigneeIds))];
    const faces = meId && people.includes(meId) ? [meId, ...people.filter((id) => id !== meId)] : people;
    const mine = meId ? tasks.filter((task) => task.assigneeIds.includes(meId)).length : 0;

    return (
        <div className="ofi-ptk ofi-ptk-floatwrap">
            {tasks.length > 0 && <div
                ref={boxRef}
                className={`ofi-ptk-float ${open ? 'is-open' : ''}`}
                role="region"
                aria-label={t('productionTasks.stageFloat.region', { stage: stageName })}
                onKeyDown={onKeyDown}
            >
                {open ? (
                    <div className="ofi-ptk-float__inner">
                        <StageCard
                            area={area}
                            stage={stage}
                            number={number}
                            tasks={tasks}
                            share={share}
                            names={names}
                            mode="device"
                            editable={editable}
                            staff={staff}
                            staffLoading={staffLoading}
                            meId={meId}
                            busyTaskId={busyTaskId}
                            onStatus={onStatus}
                            onSubtaskStatus={onSubtaskStatus}
                            onAssignSubtask={onAssignSubtask}
                            canSetStatus={canSetStatus}
                            subtaskActions={subtaskActions}
                            focusSubtaskId={focusSubtaskId}
                            onClose={() => toggle(false)}
                        />
                    </div>
                ) : (
                    <button
                        type="button"
                        className="ofi-ptk-float__summary ofi-nosize"
                        aria-expanded="false"
                        aria-label={t('productionTasks.stageFloat.open', { stage: stageName })}
                        onClick={() => toggle(true)}
                    >
                        <span className="ofi-ptk-float__icon" aria-hidden><ListChecks /></span>
                        <span className="ofi-ptk-float__text">
                            <b>{t('productionTasks.stageFloat.title')}</b>
                            <small>
                                {/* Ohne das Gewicht der Stufe (28.09.2026: am Gerät immer 100 %). */}
                                {t('productionTasks.stageFloat.summary', { count: tasks.length })}
                                {mine > 0 && <em>{t('productionTasks.stageFloat.mine', { count: mine })}</em>}
                            </small>
                        </span>
                        {faces.length > 0 && (
                            <span className="ofi-ptk-float__faces" aria-hidden>
                                {faces.slice(0, 3).map((id) => (
                                    <span
                                        key={id}
                                        className={`ofi-ptk-float__face ${id === meId ? 'is-me' : ''}`}
                                        title={names.get(id)?.name}
                                        style={{ '--ptk-person-tone': personTone(id) } as CSSProperties}
                                    >
                                        {initialsOf(names.get(id)?.name ?? '?')}
                                    </span>
                                ))}
                                {faces.length > 3 && <span className="ofi-ptk-float__face is-more">+{faces.length - 3}</span>}
                            </span>
                        )}
                        <ChevronRight className="ofi-ptk-float__chevron" aria-hidden />
                    </button>
                )}
            </div>}
            {/* Dateien der Stufe — nur die Verwaltung. Die Plättchen bleiben immer in ihrer
                Reihenfolge stehen (30.09.2026: «don't hide the other buttons»); offen ist nur eines. */}
            {showFilesTile && subtaskActions && (
                <div
                    ref={filesRef}
                    className={`ofi-ptk-float is-files ${filesOpen ? 'is-open' : ''}`}
                    role="region"
                    aria-label={t('productionTasks.stageFiles.region', { stage: stageName })}
                    onKeyDown={onFilesKeyDown}
                >
                    {filesOpen ? (
                        <div className="ofi-ptk-float__inner">
                            <StageFilesCard stageName={stageName} tasks={tasks} names={names} actions={subtaskActions} missingNote={missingNote} onClose={() => toggleFiles(false)} />
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="ofi-ptk-float__summary ofi-nosize"
                            aria-expanded="false"
                            aria-label={t('productionTasks.stageFiles.open', { stage: stageName })}
                            onClick={() => toggleFiles(true)}
                        >
                            <span className="ofi-ptk-float__icon is-files" aria-hidden><FileStack /></span>
                            <span className="ofi-ptk-float__text">
                                <b>{t('productionTasks.stageFiles.title')}</b>
                                <small>
                                    {missingNote
                                        ? <em className="is-warn">{missingNote}</em>
                                        : files.length
                                            ? t('productionTasks.stageFiles.count', { count: files.length })
                                            : t('productionTasks.stageFiles.none')}
                                </small>
                            </span>
                            <ChevronRight className="ofi-ptk-float__chevron" aria-hidden />
                        </button>
                    )}
                </div>
            )}
            {/* Der Verlauf der Stufe (30.09.2026) — unter «Dateien», ebenso nur die Verwaltung. */}
            {isAdmin && subtaskActions && (
                <div
                    ref={activityRef}
                    className={`ofi-ptk-float is-activity ${activityOpen ? 'is-open' : ''}`}
                    role="region"
                    aria-label={t('productionTasks.activity.region', { stage: stageName })}
                    onKeyDown={onActivityKeyDown}
                >
                    {activityOpen ? (
                        <div className="ofi-ptk-float__inner">
                            <StageActivityCard
                                deviceId={deviceId}
                                revision={revision}
                                area={area}
                                stageKey={stage.key}
                                stageName={stageName}
                                tasks={tasks}
                                actions={subtaskActions}
                                stageNameOf={stageNameOf}
                                onClose={() => toggleActivity(false)}
                            />
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="ofi-ptk-float__summary ofi-nosize"
                            aria-expanded="false"
                            aria-label={t('productionTasks.activity.open', { stage: stageName })}
                            onClick={() => toggleActivity(true)}
                        >
                            <span className="ofi-ptk-float__icon is-activity" aria-hidden><Activity /></span>
                            <span className="ofi-ptk-float__text">
                                <b>{t('productionTasks.activity.title')}</b>
                                <small>{t('productionTasks.activity.summary')}</small>
                            </span>
                            <ChevronRight className="ofi-ptk-float__chevron" aria-hidden />
                        </button>
                    )}
                </div>
            )}
            {/* Anfragen an die Verwaltung (30.09.2026) — unter «Aktivitäten», nur die Verwaltung. */}
            {isAdmin && subtaskActions && (
                <div
                    ref={requestsRef}
                    className={`ofi-ptk-float is-requests ${requestsOpen ? 'is-open' : ''}`}
                    role="region"
                    aria-label={t('productionTasks.requests.region', { stage: stageName })}
                    onKeyDown={onRequestsKeyDown}
                >
                    {requestsOpen ? (
                        <div className="ofi-ptk-float__inner">
                            <StageRequestsCard
                                deviceId={deviceId}
                                revision={revision}
                                area={area}
                                stageKey={stage.key}
                                stageName={stageName}
                                onChanged={() => setRequestsTick((value) => value + 1)}
                                onClose={() => toggleRequests(false)}
                            />
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="ofi-ptk-float__summary ofi-nosize"
                            aria-expanded="false"
                            aria-label={t('productionTasks.requests.open', { stage: stageName })}
                            onClick={() => toggleRequests(true)}
                        >
                            <span className="ofi-ptk-float__icon is-requests" aria-hidden><Inbox /></span>
                            <span className="ofi-ptk-float__text">
                                <b>{t('productionTasks.requests.title')}</b>
                                <small>
                                    {openRequests > 0
                                        ? <em>{t('productionTasks.requests.openCount', { count: openRequests })}</em>
                                        : t('productionTasks.requests.noneOpen')}
                                </small>
                            </span>
                            <ChevronRight className="ofi-ptk-float__chevron" aria-hidden />
                        </button>
                    )}
                </div>
            )}
            {/* Die BOM der Stufe (02.10.2026) — für alle, die die Stufe sehen; bearbeiten darf, wer an «BOM» steht. */}
            {onOpenBom && (
                <div className="ofi-ptk-float is-bom" role="region" aria-label={t('productionTasks.bomTile.region', { stage: stageName })}>
                    <button
                        type="button"
                        className="ofi-ptk-float__summary ofi-nosize"
                        aria-haspopup="dialog"
                        aria-label={t('productionTasks.bomTile.open', { stage: stageName })}
                        onClick={onOpenBom}
                    >
                        <span className="ofi-ptk-float__icon is-bom" aria-hidden><Boxes /></span>
                        <span className="ofi-ptk-float__text">
                            <b>{t('productionTasks.bomTile.title')}</b>
                            <small>{t('productionTasks.bomTile.summary')}</small>
                        </span>
                        <ChevronRight className="ofi-ptk-float__chevron" aria-hidden />
                    </button>
                </div>
            )}
        </div>
    );
};
