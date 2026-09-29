import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { ChevronRight, FileStack, ListChecks } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import type { ProductionTask, TaskArea, TaskSectionStage, TaskStatus, TaskSubtask } from '@/types/productionTasks';

import type { PersonNames } from '../tasks/PeopleCell';
import { StageCard } from '../tasks/StageCard';
import type { SubtaskActions } from '../tasks/subtaskFileModel';
import { StageFilesCard } from './StageFilesCard';
import { stageFilesOf } from './stageFileModel';
import { initialsOf, personTone, stageLabel } from '../tasks/taskModel';

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
 * Offen ist immer nur eine der beiden Karten.
 */
export const StageTasksFloat = ({
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
    canSetStatus,
    subtaskActions,
}: {
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
    canSetStatus?: (task: ProductionTask, subtask: TaskSubtask | null) => boolean;
    /** Dateien und Abschluss der Unteraufgaben; mit `isAdmin` auch das Plättchen «Dateien». */
    subtaskActions?: SubtaskActions;
}) => {
    const [open, setOpen] = useState(readOpen);
    const [filesOpen, setFilesOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);
    const fromRef = useRef<DOMRect | null>(null);
    const filesRef = useRef<HTMLDivElement>(null);
    const filesFromRef = useRef<DOMRect | null>(null);
    const showFiles = Boolean(subtaskActions?.isAdmin);

    const toggle = (next: boolean) => {
        fromRef.current = boxRef.current?.getBoundingClientRect() ?? null;
        writeOpen(next);
        setOpen(next);
        if (next) setFilesOpen(false);
    };
    const toggleFiles = (next: boolean) => {
        filesFromRef.current = filesRef.current?.getBoundingClientRect() ?? null;
        setFilesOpen(next);
        if (next && open) toggle(false);
    };

    useGrow(boxRef, fromRef, open);
    useGrow(filesRef, filesFromRef, filesOpen);

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
    const files = showFiles ? stageFilesOf(tasks) : [];

    const stageName = stageLabel(stage);
    const people = [...new Set(tasks.flatMap((task) => task.assigneeIds))];
    const faces = meId && people.includes(meId) ? [meId, ...people.filter((id) => id !== meId)] : people;
    const mine = meId ? tasks.filter((task) => task.assigneeIds.includes(meId)).length : 0;

    return (
        <div className="ofi-ptk ofi-ptk-floatwrap">
            <div
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
                            canSetStatus={canSetStatus}
                            subtaskActions={subtaskActions}
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
            </div>
            {/* Dateien der Stufe — nur die Verwaltung, solange die Aufgaben zu sind. */}
            {showFiles && subtaskActions && !open && (
                <div
                    ref={filesRef}
                    className={`ofi-ptk-float is-files ${filesOpen ? 'is-open' : ''}`}
                    role="region"
                    aria-label={t('productionTasks.stageFiles.region', { stage: stageName })}
                    onKeyDown={onFilesKeyDown}
                >
                    {filesOpen ? (
                        <div className="ofi-ptk-float__inner">
                            <StageFilesCard stageName={stageName} tasks={tasks} names={names} actions={subtaskActions} onClose={() => toggleFiles(false)} />
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
                                    {files.length
                                        ? t('productionTasks.stageFiles.count', { count: files.length })
                                        : t('productionTasks.stageFiles.none')}
                                </small>
                            </span>
                            <ChevronRight className="ofi-ptk-float__chevron" aria-hidden />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
