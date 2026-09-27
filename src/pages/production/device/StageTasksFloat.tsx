import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight, ListChecks } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import type { ProductionTask, TaskArea, TaskStage } from '@/types/productionTasks';

import type { PersonNames } from '../tasks/PeopleCell';
import { StageCard } from '../tasks/StageCard';
import { formatPercent, initialsOf, roundPercent, stageLabelKey } from '../tasks/taskModel';

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
    onAssign,
}: {
    area: TaskArea;
    stage: TaskStage;
    number: number | null;
    tasks: ProductionTask[];
    share: number;
    names: PersonNames;
    editable: boolean;
    staff: StaffDirectoryRow[];
    staffLoading: boolean;
    meId: string | null;
    busyTaskId: string | null;
    onAssign?: (task: ProductionTask, assigneeIds: string[]) => void;
}) => {
    const [open, setOpen] = useState(readOpen);
    const boxRef = useRef<HTMLDivElement>(null);
    const fromRef = useRef<DOMRect | null>(null);

    const toggle = (next: boolean) => {
        fromRef.current = boxRef.current?.getBoundingClientRect() ?? null;
        writeOpen(next);
        setOpen(next);
    };

    /* FLIP: die alte Grösse gemerkt, die neue gemessen, dazwischen animiert —
       so wächst das Plättchen zur Karte (und zurück), statt zu springen. */
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
    }, [open]);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape' && open) {
            event.stopPropagation();
            toggle(false);
        }
    };

    const stageName = t(stageLabelKey(stage));
    const weight = roundPercent(tasks.reduce((sum, task) => sum + task.weight, 0));
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
                            onAssign={onAssign}
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
                                {t('productionTasks.stageFloat.summary', { count: tasks.length, weight: formatPercent(weight) })}
                                {mine > 0 && <em>{t('productionTasks.stageFloat.mine', { count: mine })}</em>}
                            </small>
                        </span>
                        {faces.length > 0 && (
                            <span className="ofi-ptk-float__faces" aria-hidden>
                                {faces.slice(0, 3).map((id) => (
                                    <span key={id} className={`ofi-ptk-float__face ${id === meId ? 'is-me' : ''}`} title={names.get(id)?.name}>
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
        </div>
    );
};
