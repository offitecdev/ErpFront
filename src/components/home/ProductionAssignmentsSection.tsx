import { useMemo, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ChevronRight, ListChecks, Search } from 'lucide-react';

import { t } from '@/i18n/translate';
import { hrefFor, isModifiedClick } from '@/lib/navLink';
import { useAuthStore } from '@/store/authStore';

import { fold, useTaskDevices } from './useTaskDevices';

/** Der Weg zu den Zuweisungen einer Einheit (die Tafel «Görevlendirmeler» am Gerät). */
const assignmentsPath = (projectId: string, deviceId: string): string =>
    `/production/orders/${encodeURIComponent(projectId)}/devices/${encodeURIComponent(deviceId)}?stage=assignments`;

/**
 * ── ZUWEISUNGEN DER PRODUKTION AUF DER STARTSEITE (30.09.2026, Vorgabe Samet) ─
 *
 * «For go to assignments create another section; in there show all projects
 * and their units that have assignments.» — «First show the project cards,
 * then after a click show its units, then inside of the unit cards show go to
 * assignments.» Nur die Verwaltung. Projekte als Karten → ein Klick zeigt ihre
 * Einheiten als Karten (Vorlage, Zahl der Aufgaben) mit «Zu den Zuweisungen» —
 * ohne die offenen Anfragen, die stehen unter «Anfragen & Aktivitäten». Oben der
 * Weg zurück und ein Suchfeld auf beiden Stufen.
 */
export const ProductionAssignmentsSection = () => {
    const isAdmin = useAuthStore((state) => state.isSystemAdmin);
    if (!isAdmin) return null;
    return <ProductionAssignments />;
};

const ProductionAssignments = () => {
    const navigate = useNavigate();
    const { directory, failed } = useTaskDevices(true);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    const projects = useMemo(() => directory?.projects ?? [], [directory]);
    const project = projects.find((entry) => entry.id === projectId) ?? null;
    const needle = fold(query.trim());

    const projectCards = useMemo(() => projects.filter((entry) =>
        !needle || fold(`${entry.projectNumber} ${entry.projectName} ${entry.devices.map((unit) => unit.name).join(' ')}`).includes(needle)),
    [projects, needle]);
    const unitCards = useMemo(() => (project?.devices ?? []).filter((entry) =>
        !needle || fold(`${entry.name} ${entry.positionNumber ?? ''} ${entry.templateName}`).includes(needle)),
    [project, needle]);

    if (failed || !directory || !projects.length) return null;

    const openProject = (id: string | null) => {
        setProjectId(id);
        setQuery('');
    };
    const openAssignments = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
        if (isModifiedClick(event)) return;
        event.preventDefault();
        navigate(path);
    };
    const searchLabel = t(project ? 'productionTasks.inbox.searchUnits' : 'productionTasks.inbox.searchProjects');

    return (
        <section className="ofi-home-section ofi-home-panel ofi-home-assign" aria-label={t('productionTasks.assignSection.title')}>
            <header className="ofi-home-panel__head">
                <h2 className="ofi-home-panel__title">{t('productionTasks.assignSection.title')}</h2>
            </header>

            <div className="ofi-home-inbox__body is-flush">
                {/* Der Weg zurück: alle Projekte › Projekt. */}
                <nav className="ofi-home-crumbs" aria-label={t('productionTasks.inbox.path')}>
                    <button type="button" className="ofi-home-crumbs__step ofi-nosize" disabled={!project} onClick={() => openProject(null)}>
                        {t('productionTasks.inbox.allProjects')}
                    </button>
                    {project && (
                        <>
                            <ChevronRight aria-hidden />
                            <span className="ofi-home-crumbs__step is-current">{`${project.projectNumber} · ${project.projectName}`}</span>
                        </>
                    )}
                </nav>

                <div className="ofi-home-inbox__tools">
                    <label className="ofi-home-search">
                        <Search aria-hidden />
                        <input
                            type="search"
                            value={query}
                            placeholder={searchLabel}
                            aria-label={searchLabel}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </label>
                </div>

                {!project ? (
                    projectCards.length ? (
                        <div className="ofi-home-pgrid">
                            {projectCards.map((entry) => (
                                <button key={entry.id} type="button" className="ofi-home-pcard ofi-nosize" onClick={() => openProject(entry.id)}>
                                    <span className="ofi-home-pcard__head">
                                        <b>{entry.projectNumber}</b>
                                        <span>{entry.projectName}</span>
                                    </span>
                                    <span className="ofi-home-pcard__meta">
                                        {t('productionTasks.inbox.units', { count: entry.devices.length })}
                                    </span>
                                    <ChevronRight className="ofi-home-pcard__chevron" aria-hidden />
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="ofi-home-inbox__hint">{t('productionTasks.inbox.noMatch')}</p>
                    )
                ) : unitCards.length ? (
                    <div className="ofi-home-pgrid">
                        {unitCards.map((entry) => {
                            const path = assignmentsPath(project.id, entry.id);
                            return (
                                <article key={entry.id} className="ofi-home-pcard is-static">
                                    <span className="ofi-home-pcard__head">
                                        {entry.positionNumber && <b>{entry.positionNumber}</b>}
                                        <span>{entry.name}</span>
                                    </span>
                                    <span className="ofi-home-pcard__meta">
                                        {[entry.templateName, t('productionTasks.assignSection.tasks', { count: entry.taskCount })].filter(Boolean).join(' · ')}
                                    </span>
                                    {/* In der Karte der Einheit: zu ihren Zuweisungen. */}
                                    <a className="ofi-home-btn ofi-home-pcard__action" href={hrefFor(path)} onClick={(event) => openAssignments(event, path)}>
                                        <ListChecks size={13} aria-hidden />
                                        {t('productionTasks.inbox.goToAssignments')}
                                        <ArrowUpRight size={12} aria-hidden />
                                    </a>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <p className="ofi-home-inbox__hint">{t('productionTasks.inbox.noMatch')}</p>
                )}
            </div>
        </section>
    );
};
