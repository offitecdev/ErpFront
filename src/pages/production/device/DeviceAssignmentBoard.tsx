import { useMemo, useState } from 'react';
import { ListChecks, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import { fmtDateTime } from '@/pages/inventory/utils/format';
import type { TaskArea, TaskPerson } from '@/types/productionTasks';

import type { PersonNames } from '../tasks/PeopleCell';
import { StageCard } from '../tasks/StageCard';
import { areaLabelKey, formatPercent, tasksByStage } from '../tasks/taskModel';
import { isWorkStage, stageNumber, type DeviceStage } from './deviceStages';
import { TemplateLoadDialog } from './TemplateLoadDialog';
import type { DeviceTasksHandle } from './useDeviceTasks';

/**
 * ── DIE STUFE «GÖREVLENDİRMELER» (26.09.2026, Vorgabe Samet) ────────────────
 *
 * «Üretimde ilk kısmı yapalım, bu görevlendirme kısmıdır … administrator
 *  isek görevleri yükleyebiliyoruz … her aşamada büyük olmayacak şekilde
 *  görevlendirme kartı.»
 *
 * Nur die Administratorrolle kommt hierher. Liegen am Gerät noch keine
 * Aufgaben, steht in der Mitte «Şablondan yükle». Danach eine schmale Leiste
 * (welche Vorlage, wer sie geladen hat, wie viele Aufgaben schon Personen
 * haben) und für JEDE Stufe des gewählten Bereichs ihre kleine Karte — ein
 * Klick auf die Personen einer Aufgabe öffnet die Auswahl.
 */
export const DeviceAssignmentBoard = ({
    area,
    stages,
    handle,
    names,
    staff,
    staffLoading,
    meId,
}: {
    area: TaskArea;
    stages: DeviceStage[];
    handle: DeviceTasksHandle;
    names: PersonNames;
    staff: StaffDirectoryRow[];
    staffLoading: boolean;
    meId: string | null;
}) => {
    const { data, error, loading, busyTaskId, reload, assign, load, unload } = handle;
    const [loadOpen, setLoadOpen] = useState(false);
    const [confirmUnload, setConfirmUnload] = useState(false);
    const [unloading, setUnloading] = useState(false);

    const plan = data?.plan ?? null;
    const workStages = stages.map((stage) => stage.id).filter(isWorkStage);
    const groups = useMemo(() => tasksByStage(data?.tasks ?? [], area), [data?.tasks, area]);
    const areaTasks = (data?.tasks ?? []).filter((task) => task.area === area);
    const assigned = areaTasks.filter((task) => task.assigneeIds.length > 0).length;

    /* Die Namen, die eine Auswahl eben gesetzt hat, reisen mit (sofort sichtbar). */
    const known = (ids: string[]): TaskPerson[] =>
        ids.map((id) => names.get(id)).filter((person): person is TaskPerson => Boolean(person));

    if (loading) {
        return (
            <div className="ofi-ptk ofi-ptk-board" aria-busy="true">
                <div className="ofi-ptk-grid">
                    {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="ofi-ptk-card is-skeleton">
                            <span className="ofi-ptk-skel" style={{ width: '42%' }} />
                            <span className="ofi-ptk-skel" style={{ width: '86%' }} />
                            <span className="ofi-ptk-skel" style={{ width: '64%' }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="ofi-ptk ofi-ptk-board">
                <div className="ofi-ptk-state is-error">
                    <TriangleAlert aria-hidden />
                    <b>{error}</b>
                    <button type="button" className="ofi-ptk-btn ofi-nosize" onClick={reload}>{t('productionTasks.actions.retry')}</button>
                </div>
            </div>
        );
    }

    return (
        <div className="ofi-ptk ofi-ptk-board">
            {!plan ? (
                <div className="ofi-ptk-state is-board">
                    <span className="ofi-ptk-state__icon"><ListChecks aria-hidden /></span>
                    <b>{t('productionTasks.device.emptyTitle')}</b>
                    <span>{t('productionTasks.device.emptyText')}</span>
                    <button type="button" className="ofi-ptk-btn is-primary ofi-nosize" onClick={() => setLoadOpen(true)}>
                        <Plus />
                        {t('productionTasks.device.loadButton')}
                    </button>
                </div>
            ) : (
                <>
                    <div className="ofi-ptk-planbar">
                        <span className="ofi-ptk-planbar__template" title={t('productionTasks.device.templateHint')}>
                            <ListChecks aria-hidden />
                            <b>{plan.templateName}</b>
                        </span>
                        <span className="ofi-ptk-planbar__meta">
                            {plan.loadedByName
                                ? t('productionTasks.device.loadedBy', { date: fmtDateTime(plan.loadedAt), name: plan.loadedByName })
                                : t('productionTasks.device.loadedAt', { date: fmtDateTime(plan.loadedAt) })}
                        </span>
                        <span className="ofi-ptk-planbar__meta">
                            {t('productionTasks.device.areaShare', {
                                area: t(areaLabelKey(area)),
                                share: formatPercent(plan.areaShares[area]),
                            })}
                        </span>
                        <span className={`ofi-ptk-planbar__count ${areaTasks.length && assigned === areaTasks.length ? 'is-done' : ''}`}>
                            {t('productionTasks.device.assignedCount', { assigned, total: areaTasks.length })}
                        </span>
                        <span className="ofi-ptk-planbar__actions">
                            <button type="button" className="ofi-ptk-btn is-small ofi-nosize" onClick={() => setLoadOpen(true)}>
                                <RefreshCw />
                                {t('productionTasks.device.change')}
                            </button>
                            <button
                                type="button"
                                className="ofi-ptk-btn is-small is-icon is-quiet is-danger-hover ofi-nosize"
                                title={t('productionTasks.device.unload')}
                                aria-label={t('productionTasks.device.unload')}
                                onClick={() => setConfirmUnload(true)}
                            >
                                <Trash2 />
                            </button>
                        </span>
                    </div>

                    <div className="ofi-ptk-grid">
                        {workStages.map((stage) => (
                            <StageCard
                                key={stage}
                                area={area}
                                stage={stage}
                                number={stage === 'final' ? null : stageNumber(stages, stage)}
                                tasks={groups.get(stage) ?? []}
                                share={plan.areaShares[area]}
                                names={names}
                                mode="device"
                                editable
                                staff={staff}
                                staffLoading={staffLoading}
                                meId={meId}
                                busyTaskId={busyTaskId}
                                onAssign={(task, ids) => void assign(task, ids, known(ids))}
                            />
                        ))}
                    </div>
                </>
            )}

            {loadOpen && <TemplateLoadDialog plan={plan} onLoad={load} onClose={() => setLoadOpen(false)} />}

            <PopupDialog
                open={confirmUnload}
                onClose={() => { if (!unloading) setConfirmUnload(false); }}
                title={t('productionTasks.device.unloadTitle')}
                subtitle={t('productionTasks.device.unloadText', { name: plan?.templateName ?? '' })}
                icon={<Trash2 size={18} />}
                tone="danger"
                width={460}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setConfirmUnload(false)} disabled={unloading}>{t('productionTasks.actions.cancel')}</PopupButton>
                        <PopupButton
                            variant="danger"
                            loading={unloading}
                            onClick={() => {
                                setUnloading(true);
                                void unload().then((ok) => {
                                    setUnloading(false);
                                    if (ok) setConfirmUnload(false);
                                });
                            }}
                        >
                            {t('productionTasks.device.unloadConfirm')}
                        </PopupButton>
                    </PopupActions>
                )}
            />
        </div>
    );
};
