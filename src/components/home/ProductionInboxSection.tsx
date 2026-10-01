import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ChevronRight, Inbox, Search } from 'lucide-react';

import { t } from '@/i18n/translate';
import { StageActivityCard } from '@/pages/production/device/StageActivityCard';
import { StageRequestsCard } from '@/pages/production/device/StageRequestsCard';
import { useDeviceTasks } from '@/pages/production/device/useDeviceTasks';
import type { SubtaskActions } from '@/pages/production/tasks/subtaskFileModel';
import { areaParam, sectionLabel, stageLabel } from '@/pages/production/tasks/taskModel';
import { useAuthStore } from '@/store/authStore';
import '@/styles/modules/productionTasks.css';

import { fold, useTaskDevices } from './useTaskDevices';

type Tab = 'requests' | 'activities';

/**
 * ── ANFRAGEN UND VERLAUF AUF DER STARTSEITE (30.09.2026, Vorgabe Samet) ─────
 *
 * «In requests and activities show cards that show the projects and their
 * assignments. Admin should be able to know there are requests by looking on
 * the request button, and when they click on it they should be able to see
 * which projects have requests, then which units' assignments have requests.»
 *
 * Nur die Verwaltung. Zwei Knöpfe — «Anfragen» mit der Zahl offener, und
 * «Aktivitäten». Offen führt es Schritt für Schritt: Projekte als Karten (bei
 * den Anfragen zuerst nur die mit offenen, meiste zuerst) → ihre Einheiten →
 * die Anfragen bzw. der Verlauf DER GANZEN EINHEIT (jede Zeile mit ihrer Stufe
 * und «Go to subtask»). Oben der Weg zurück, auf den Kartenstufen ein Suchfeld.
 */
export const ProductionInboxSection = () => {
    const isAdmin = useAuthStore((state) => state.isSystemAdmin);
    const meId = useAuthStore((state) => state.user?.id ?? null);
    if (!isAdmin) return null;
    return <ProductionInbox meId={meId} />;
};

const ProductionInbox = ({ meId }: { meId: string | null }) => {
    const navigate = useNavigate();
    const { directory, failed, reload } = useTaskDevices(true);
    const [tab, setTab] = useState<Tab | null>(null);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    // Bei den Anfragen zuerst nur, wo welche offen sind — umschaltbar.
    const [onlyOpen, setOnlyOpen] = useState(true);

    const projects = useMemo(() => directory?.projects ?? [], [directory]);
    const project = projects.find((entry) => entry.id === projectId) ?? null;
    const device = project?.devices.find((entry) => entry.id === deviceId) ?? null;
    const handle = useDeviceTasks(device?.id ?? '');
    const totalOpen = projects.reduce((sum, entry) => sum + entry.openRequests, 0);
    const filterOpen = tab === 'requests' && onlyOpen;
    const needle = fold(query.trim());

    const projectCards = useMemo(() => projects
        .filter((entry) => !filterOpen || entry.openRequests > 0)
        .filter((entry) => !needle || fold(`${entry.projectNumber} ${entry.projectName} ${entry.devices.map((unit) => unit.name).join(' ')}`).includes(needle))
        .sort((left, right) => (tab === 'requests' ? right.openRequests - left.openRequests : 0)), [projects, filterOpen, needle, tab]);
    const unitCards = useMemo(() => (project?.devices ?? [])
        .filter((entry) => !filterOpen || entry.openRequests > 0)
        .filter((entry) => !needle || fold(`${entry.name} ${entry.positionNumber ?? ''} ${entry.templateName}`).includes(needle))
        .sort((left, right) => (tab === 'requests' ? right.openRequests - left.openRequests : 0)), [project, filterOpen, needle, tab]);

    // Ohne Produktionsmodul oder ohne Einheiten mit Aufgaben: kein Abschnitt.
    if (failed || (directory && !projects.length)) return null;

    const openTab = (next: Tab) => {
        setTab(tab === next ? null : next);
        setProjectId(null);
        setDeviceId(null);
        setQuery('');
    };
    const toProjects = () => { setProjectId(null); setDeviceId(null); setQuery(''); };
    const toUnits = () => { setDeviceId(null); setQuery(''); };

    const deviceLabel = device ? [device.positionNumber, device.name].filter(Boolean).join(' · ') : '';
    const sections = handle.data?.plan?.sections ?? [];
    const stageNameOf = (areaKey: string | null, stageKey: string | null): string => {
        const owner = sections.find((entry) => entry.key === areaKey) ?? null;
        const found = owner?.stages.find((entry) => entry.key === stageKey) ?? null;
        const name = found ? stageLabel(found) : stageKey || '—';
        return owner && sections.length > 1 ? `${sectionLabel(owner)} · ${name}` : name;
    };
    /** Zur Unteraufgabe am Gerät: richtige Stufe, Karte der Aufgaben offen, Unteraufgabe gewählt. */
    const goTo = (area: string, stage: string, subtaskId: string) => {
        if (!project || !device) return;
        const search = new URLSearchParams({ area: areaParam(area), stage, subtask: subtaskId });
        navigate(`/production/orders/${encodeURIComponent(project.id)}/devices/${encodeURIComponent(device.id)}?${search.toString()}`);
    };
    // Aus dem Verlauf öffnet die Verwaltung Dateien — mehr braucht die Karte hier nicht.
    const actions: SubtaskActions = {
        isAdmin: true,
        meId,
        deviceName: device?.name ?? '',
        upload: handle.uploadSubtaskFile,
        removeFile: handle.removeSubtaskFile,
        openFile: handle.openSubtaskFile,
        loadFile: handle.loadSubtaskFile,
        complete: handle.completeSubtask,
        requestRevision: handle.requestSubtaskRevision,
        unlock: handle.unlockSubtask,
        setStatus: handle.setSubtaskStatus,
        addChecklistItem: handle.addChecklistItem,
    };
    const searchLabel = t(project ? 'productionTasks.inbox.searchUnits' : 'productionTasks.inbox.searchProjects');

    return (
        <section className="ofi-home-section ofi-home-panel ofi-home-inbox" aria-label={t('productionTasks.inbox.title')}>
            <header className="ofi-home-panel__head">
                <h2 className="ofi-home-panel__title">{t('productionTasks.inbox.title')}</h2>
            </header>

            <div className="ofi-home-inbox__tabs" role="tablist" aria-label={t('productionTasks.inbox.title')}>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'requests'}
                    className={`ofi-home-inbox__tab is-requests ofi-nosize ${tab === 'requests' ? 'is-selected' : ''} ${totalOpen > 0 ? 'has-open' : ''}`}
                    onClick={() => openTab('requests')}
                >
                    <span className="ofi-home-inbox__icon is-requests" aria-hidden><Inbox /></span>
                    <span className="ofi-home-inbox__text">
                        <b>{t('productionTasks.requests.title')}</b>
                        <small>{totalOpen > 0 ? t('productionTasks.requests.openCount', { count: totalOpen }) : t('productionTasks.inbox.noOpen')}</small>
                    </span>
                    {totalOpen > 0 && <em>{totalOpen}</em>}
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'activities'}
                    className={`ofi-home-inbox__tab is-activity ofi-nosize ${tab === 'activities' ? 'is-selected' : ''}`}
                    onClick={() => openTab('activities')}
                >
                    <span className="ofi-home-inbox__icon is-activity" aria-hidden><Activity /></span>
                    <span className="ofi-home-inbox__text">
                        <b>{t('productionTasks.activity.title')}</b>
                        <small>{t('productionTasks.activity.summary')}</small>
                    </span>
                </button>
            </div>

            {tab && (
                <div className="ofi-home-inbox__body" role="tabpanel">
                    {/* Der Weg zurück: alle Projekte › Projekt › Einheit. */}
                    <nav className="ofi-home-crumbs" aria-label={t('productionTasks.inbox.path')}>
                        <button type="button" className="ofi-home-crumbs__step ofi-nosize" disabled={!project} onClick={toProjects}>
                            {t('productionTasks.inbox.allProjects')}
                        </button>
                        {project && (
                            <>
                                <ChevronRight aria-hidden />
                                <button type="button" className="ofi-home-crumbs__step ofi-nosize" disabled={!device} onClick={toUnits}>
                                    {`${project.projectNumber} · ${project.projectName}`}
                                </button>
                            </>
                        )}
                        {device && (
                            <>
                                <ChevronRight aria-hidden />
                                <span className="ofi-home-crumbs__step is-current">{deviceLabel}</span>
                            </>
                        )}
                    </nav>

                    {!device && (
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
                            {tab === 'requests' && (
                                <label className="ofi-home-inbox__only">
                                    <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} />
                                    {t('productionTasks.inbox.onlyOpen')}
                                </label>
                            )}
                        </div>
                    )}

                    {!directory ? (
                        <p className="ofi-home-inbox__hint">{t('productionTasks.activity.loading')}</p>
                    ) : !project ? (
                        projectCards.length ? (
                            <div className="ofi-home-pgrid">
                                {projectCards.map((entry) => (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        className={`ofi-home-pcard ofi-nosize ${tab === 'requests' && entry.openRequests > 0 ? 'has-open' : ''}`}
                                        onClick={() => { setProjectId(entry.id); setQuery(''); }}
                                    >
                                        <span className="ofi-home-pcard__head">
                                            <b>{entry.projectNumber}</b>
                                            <span>{entry.projectName}</span>
                                        </span>
                                        <span className="ofi-home-pcard__meta">
                                            {t('productionTasks.inbox.units', { count: entry.devices.length })}
                                            {tab === 'requests' && (
                                                entry.openRequests > 0
                                                    ? <em className="ofi-home-count">{t('productionTasks.requests.openCount', { count: entry.openRequests })}</em>
                                                    : <small>{t('productionTasks.inbox.noOpen')}</small>
                                            )}
                                        </span>
                                        <ChevronRight className="ofi-home-pcard__chevron" aria-hidden />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="ofi-home-inbox__hint">
                                {filterOpen && !needle ? t('productionTasks.inbox.noOpenAnywhere') : t('productionTasks.inbox.noMatch')}
                            </p>
                        )
                    ) : !device ? (
                        unitCards.length ? (
                            <div className="ofi-home-pgrid">
                                {unitCards.map((entry) => (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        className={`ofi-home-pcard ofi-nosize ${tab === 'requests' && entry.openRequests > 0 ? 'has-open' : ''}`}
                                        onClick={() => { setDeviceId(entry.id); setQuery(''); }}
                                    >
                                        <span className="ofi-home-pcard__head">
                                            {entry.positionNumber && <b>{entry.positionNumber}</b>}
                                            <span>{entry.name}</span>
                                        </span>
                                        <span className="ofi-home-pcard__meta">
                                            {[entry.templateName, t('productionTasks.assignSection.tasks', { count: entry.taskCount })].filter(Boolean).join(' · ')}
                                            {tab === 'requests' && entry.openRequests > 0 && (
                                                <em className="ofi-home-count">{t('productionTasks.requests.openCount', { count: entry.openRequests })}</em>
                                            )}
                                        </span>
                                        <ChevronRight className="ofi-home-pcard__chevron" aria-hidden />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="ofi-home-inbox__hint">
                                {filterOpen && !needle ? t('productionTasks.inbox.noOpenHere') : t('productionTasks.inbox.noMatch')}
                            </p>
                        )
                    ) : (
                        <div className="ofi-ptk ofi-home-inbox__card">
                            {tab === 'requests' ? (
                                <StageRequestsCard
                                    key={`r-${device.id}`}
                                    deviceId={device.id}
                                    revision={handle.revision}
                                    area={null}
                                    stageKey={null}
                                    stageName={deviceLabel}
                                    stageNameOf={stageNameOf}
                                    onGoTo={(request) => goTo(request.area, request.stage, request.subtaskId)}
                                    onChanged={reload}
                                    onClose={toUnits}
                                />
                            ) : (
                                <StageActivityCard
                                    key={`a-${device.id}`}
                                    deviceId={device.id}
                                    revision={handle.revision}
                                    area={null}
                                    stageKey={null}
                                    stageName={deviceLabel}
                                    tasks={handle.data?.tasks ?? []}
                                    actions={actions}
                                    stageNameOf={stageNameOf}
                                    onGoTo={(row) => { if (row.area && row.stage && row.subtaskId) goTo(row.area, row.stage, row.subtaskId); }}
                                    onClose={toUnits}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};
