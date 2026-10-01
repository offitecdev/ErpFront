import { useMemo, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Check } from 'lucide-react';

import { t } from '@/i18n/translate';
import { hrefFor, isModifiedClick } from '@/lib/navLink';
import type { PersonNames } from '@/pages/production/tasks/PeopleCell';
import { StageCard } from '@/pages/production/tasks/StageCard';
import { sectionLabel } from '@/pages/production/tasks/taskModel';
import { useAuthStore } from '@/store/authStore';
import type { ProductionTask, TaskPerson } from '@/types/productionTasks';
import '@/styles/modules/productionTasks.css';

import { Card } from './DashboardStats';
import { useMyTasks } from './useMyTasks';

/** Welches Projekt und welches Gerät zuletzt offen waren — je Person, nur eine Bequemlichkeit. */
type Choice = { project: string; devices: Record<string, string> };
const choiceKey = (userId: string) => `ofi:home-mytasks-choice:v1:${userId}`;
const readChoice = (userId: string | null): Choice => {
    const empty: Choice = { project: '', devices: {} };
    if (!userId) return empty;
    try {
        const parsed = JSON.parse(window.localStorage.getItem(choiceKey(userId)) ?? 'null') as Partial<Choice> | null;
        return { project: typeof parsed?.project === 'string' ? parsed.project : '', devices: parsed?.devices && typeof parsed.devices === 'object' ? parsed.devices : {} };
    } catch { return empty; }
};
const writeChoice = (userId: string | null, choice: Choice) => {
    if (!userId) return;
    try { window.localStorage.setItem(choiceKey(userId), JSON.stringify(choice)); } catch { /* ohne Speicher: nur für jetzt */ }
};

/** Die eigenen Unteraufgaben, die noch nicht erledigt sind — die Zahl am Projekt. */
const openOf = (tasks: readonly ProductionTask[], meId: string | null): number =>
    tasks.reduce((sum, task) => sum + task.subtasks.filter((subtask) =>
        Boolean(meId && subtask.assigneeIds.includes(meId)) && subtask.status !== 'DONE').length, 0);

/** Wie viele Unteraufgaben die Person hier überhaupt hat — ohne eigene kein Zeichen. */
const mineOf = (tasks: readonly ProductionTask[], meId: string | null): number =>
    tasks.reduce((sum, task) => sum + task.subtasks.filter((subtask) => Boolean(meId && subtask.assigneeIds.includes(meId))).length, 0);

/**
 * Das Zeichen am Knopf: offene eigene Unteraufgaben als blaue Zahl — sind alle erledigt, ein
 * grüner Kreis mit weissem Haken (30.09.2026: «show green circle and white checkmark if all
 * tasks that are assigned to that user are completed»).
 */
const MineBadge = ({ open, mine }: { open: number; mine: number }) => {
    // Offene als Text hinter einem grauen Strich (30.09.2026: «xxxxx | 1 open subtask») statt des blauen Kreises.
    if (open > 0) {
        return (
            <small className="ofi-home-mytasks__open" title={t('productionTasks.myTasks.openHint', { count: open })}>
                {t('productionTasks.myTasks.open', { count: open })}
            </small>
        );
    }
    if (mine > 0) {
        return (
            <em className="is-done" title={t('productionTasks.myTasks.allDone')}>
                <Check aria-hidden />
            </em>
        );
    }
    return null;
};

/**
 * ── «GÖREVLERİM» AUF DER STARTSEITE (30.09.2026, Vorgabe Samet) ────────────
 *
 * «Let's move to the employees side to show the tasks and allow them to use
 *  the functionalities of the task templates. On the homepage show a new
 *  section: tasks — the task tables that the employee is added will be shown.
 *  The employees can be added to multiple projects, so the employee should be
 *  able to switch between the project task tables. They can start or stop a
 *  subtask, and send subtasks to approving when the subtask meets the
 *  requirements.»
 *
 * Oben die Projekte (mit der Zahl offener eigener Unteraufgaben), darunter je
 * Gerät des gewählten Projekts die Tabellen der Stufen — dieselben wie auf der
 * Geräteseite, nur mit den Aufgaben der Person. Dort ▶ / ■, Dateien und
 * «Complete the task» (Freigabe bzw. erledigt, sobald die Pflichten erfüllt
 * sind — das prüft der Server). Ohne eigene Aufgaben erscheint der Abschnitt nicht.
 */
export const MyTasksSection = () => {
    const meId = useAuthStore((state) => state.user?.id ?? null);
    /* Die Geräteseite gibt es nur mit Produktionsrecht (30.09.2026: «normal employees shouldn't
       be able to go to that page») — sie arbeiten hier auf der Startseite. */
    const canOpenDevice = useAuthStore((state) => state.isSystemAdmin || state.permissions.includes('production.view'));
    const navigate = useNavigate();
    const my = useMyTasks(meId);
    // Projekt UND Gerät umschalten (30.09.2026: «switch between both projects and devices in the project»).
    const [choice, setChoice] = useState<Choice>(() => readChoice(meId));

    const names = useMemo<PersonNames>(
        () => new Map((my.data?.people ?? []).map((person): [string, TaskPerson] => [person.id, person])),
        [my.data?.people],
    );

    const projects = my.data?.projects ?? [];
    if (my.error && !my.data) {
        return (
            <section className="ofi-home-section ofi-home-panel ofi-home-mytasks">
                <header className="ofi-home-panel__head">
                    <h2 className="ofi-home-panel__title">{t('productionTasks.myTasks.title')}</h2>
                </header>
                <Card>
                    <div className="ofi-home-mytasks__error">
                        <span>{my.error}</span>
                        <button type="button" className="ofi-home-btn" onClick={my.reload}>{t('productionTasks.activity.retry')}</button>
                    </div>
                </Card>
            </section>
        );
    }
    // Noch am Laden oder keine eigenen Aufgaben: kein Abschnitt (die Startseite springt nicht).
    if (!projects.length) return null;

    const project = projects.find((entry) => entry.id === choice.project) ?? projects[0];
    const current = project.devices.find((entry) => entry.device.id === choice.devices[project.id]) ?? project.devices[0];
    const choose = (next: Choice) => {
        setChoice(next);
        writeChoice(meId, next);
    };
    const openDevice = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
        if (isModifiedClick(event)) return;
        event.preventDefault();
        navigate(path);
    };
    const totalOpen = projects.reduce((sum, entry) => sum + entry.devices.reduce((inner, device) => inner + openOf(device.tasks, meId), 0), 0);

    return (
        /* Ein eigener Rahmen um den ganzen Abschnitt und ein grösserer Titel (30.09.2026: «put that
           all tasks section into a border so the user can distinguish it»). */
        <section className="ofi-home-section ofi-home-panel ofi-home-mytasks" aria-label={t('productionTasks.myTasks.title')}>
            <header className="ofi-home-panel__head">
                <h2 className="ofi-home-panel__title">{t('productionTasks.myTasks.title')}</h2>
                <span className="ofi-home-mytasks__total">{t('productionTasks.myTasks.open', { count: totalOpen })}</span>
            </header>

            {/* Die Projekte der Person — mehrere: umschalten. */}
            {projects.length > 1 && (
                <div className="ofi-home-mytasks__projects" role="tablist" aria-label={t('productionTasks.myTasks.projects')}>
                    {projects.map((entry) => {
                        const open = entry.devices.reduce((sum, device) => sum + openOf(device.tasks, meId), 0);
                        const mine = entry.devices.reduce((sum, device) => sum + mineOf(device.tasks, meId), 0);
                        const selected = entry.id === project.id;
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                className={`ofi-home-mytasks__project ofi-nosize ${selected ? 'is-selected' : ''}`}
                                title={`${entry.projectNumber} · ${entry.projectName}`}
                                onClick={() => choose({ ...choice, project: entry.id })}
                            >
                                <b>{entry.projectNumber}</b>
                                <span>{entry.projectName}</span>
                                <MineBadge open={open} mine={mine} />
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Die Geräte des Projekts, an denen die Person steht — mehrere: umschalten. */}
            {project.devices.length > 1 && (
                <div className="ofi-home-mytasks__projects is-devices" role="tablist" aria-label={t('productionTasks.myTasks.devices')}>
                    {project.devices.map((entry) => {
                        const open = openOf(entry.tasks, meId);
                        const mine = mineOf(entry.tasks, meId);
                        const selected = entry.device.id === current?.device.id;
                        return (
                            <button
                                key={entry.device.id}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                className={`ofi-home-mytasks__project ofi-nosize ${selected ? 'is-selected' : ''}`}
                                title={[entry.device.positionNumber, entry.device.name].filter(Boolean).join(' · ')}
                                onClick={() => choose({ ...choice, project: project.id, devices: { ...choice.devices, [project.id]: entry.device.id } })}
                            >
                                {entry.device.positionNumber && <b>{entry.device.positionNumber}</b>}
                                <span>{entry.device.name}</span>
                                <MineBadge open={open} mine={mine} />
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="ofi-home-mytasks__devices" role={projects.length > 1 || project.devices.length > 1 ? 'tabpanel' : undefined}>
                {(current ? [current] : []).map(({ device, plan, tasks }) => {
                    const path = `/production/orders/${device.projectId}/devices/${device.id}`;
                    const actions = my.actionsFor(device.id, device.name);
                    return (
                        <Card
                            key={device.id}
                            className="ofi-home-mytasks__device"
                            title={[device.positionNumber, device.name].filter(Boolean).join(' · ')}
                            subtitle={`${project.projectNumber} · ${project.projectName}`}
                            actions={canOpenDevice ? (
                                <a className="ofi-home-btn" href={hrefFor(path)} onClick={(event) => openDevice(event, path)}>
                                    {t('productionTasks.myTasks.openDevice')}
                                    <ArrowUpRight size={13} aria-hidden />
                                </a>
                            ) : undefined}
                        >
                            <div className="ofi-ptk ofi-home-mytasks__stages">
                                {plan.sections.map((section) => {
                                    const stages = section.stages.filter((stage) =>
                                        tasks.some((task) => task.area === section.key && task.stage === stage.key));
                                    if (!stages.length) return null;
                                    return (
                                        <div key={section.key} className="ofi-home-mytasks__section">
                                            {/* Mehrere Bereiche (Mekanik / Elektrik …): ihr Name über den Stufen. */}
                                            {plan.sections.length > 1 && <h4 className="ofi-home-mytasks__area">{sectionLabel(section)}</h4>}
                                            {stages.map((stage) => (
                                                <StageCard
                                                    key={stage.key}
                                                    area={section.key}
                                                    stage={stage}
                                                    number={section.stages.findIndex((entry) => entry.key === stage.key) + 1}
                                                    tasks={tasks.filter((task) => task.area === section.key && task.stage === stage.key)}
                                                    share={section.share}
                                                    names={names}
                                                    mode="device"
                                                    editable={false}
                                                    staff={[]}
                                                    staffLoading={false}
                                                    meId={meId}
                                                    busyTaskId={my.busyTaskId}
                                                    // Den Stand setzt nur, wer an der Unteraufgabe steht — hier also die eigenen.
                                                    canSetStatus={(task, subtask) => Boolean(meId && (subtask ?? task).assigneeIds.includes(meId))}
                                                    onSubtaskStatus={(task, subtask, status) => void my.setSubtaskStatus(device.id, task, subtask, status)}
                                                    subtaskActions={actions}
                                                    // «Wartet auf Freigabe» gehört zu den Anfragen, nicht hierher (30.09.2026).
                                                    hidePending
                                                    // Kein grüner Haken vor dem Namen der Stufe — die Nummer bleibt (30.09.2026).
                                                    hideStageDone
                                                />
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    );
                })}
            </div>
        </section>
    );
};
