import { useMemo, useState } from 'react';
import { ListChecks, Plus, RefreshCw, Save, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import { productionTaskErrorText, productionTasksApi, refreshTaskTemplates } from '@/lib/api/productionTasks';
import { fmtDateTime } from '@/pages/inventory/utils/format';
import type { ProductionTask, TaskPerson, TaskSection } from '@/types/productionTasks';

import type { PersonNames } from '../tasks/PeopleCell';
import { StageCard } from '../tasks/StageCard';
import { TaskEditDialog } from '../tasks/TaskEditDialog';
import { draftInput, newTask } from '../tasks/templateDraft';
import { InlineCreate } from '../tasks/InlineName';
import { checkProblems, checkTemplate, formatPercent, roundPercent, sectionLabel, stageNameTaken, TASK_LIMITS, tasksByStage } from '../tasks/taskModel';
import { stageNumber, type DeviceStage } from './deviceStages';
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
 * Klick auf die Personen einer Aufgabe öffnet die Auswahl. Die Bereiche und
 * Stufen sind die der geladenen Vorlage (28.09.2026).
 */
export const DeviceAssignmentBoard = ({
    section,
    stages,
    handle,
    names,
    staff,
    staffLoading,
    meId,
}: {
    /** Der gewählte Weg — null, solange keine Vorlage geladen ist (dann nur «Şablondan yükle»). */
    section: TaskSection | null;
    stages: DeviceStage[];
    handle: DeviceTasksHandle;
    names: PersonNames;
    staff: StaffDirectoryRow[];
    staffLoading: boolean;
    meId: string | null;
}) => {
    const { data, error, loading, busyTaskId, reload, assign, saveTasks, load, unload, addStage } = handle;
    // Eine Aufgabe dieses Geräts im Fenster — bestehend oder neu in einer Stufe.
    const [taskEdit, setTaskEdit] = useState<{ task: ProductionTask; isNew: boolean } | null>(null);
    const [loadOpen, setLoadOpen] = useState(false);
    const [confirmUnload, setConfirmUnload] = useState(false);
    const [unloading, setUnloading] = useState(false);

    const plan = data?.plan ?? null;
    const groups = useMemo(() => (section ? tasksByStage(data?.tasks ?? [], section) : new Map()), [data?.tasks, section]);
    const areaTasks = (data?.tasks ?? []).filter((task) => task.area === section?.key);
    const assigned = areaTasks.filter((task) => task.assigneeIds.length > 0).length;
    // Was die Aufgaben des Bereichs zusammen wiegen — unter 100 % lässt sich eine Stufe ergänzen.
    const areaWeight = roundPercent(areaTasks.reduce((sum, task) => sum + task.weight, 0));

    /* Anpassen (28.09.2026): «admin should be able to customize the tasks and
       subtasks — it shouldn't change the template, only the version that the
       project uses». Jedes «Tamam» speichert sofort alle Aufgaben des Geräts;
       eine neue kommt ohne Kürzel, der Server gibt ihr das nächste freie. */
    const tasksNow = data?.tasks ?? [];
    const saveTask = (task: ProductionTask) => {
        const exists = tasksNow.some((entry) => entry.id === task.id);
        const next = exists ? tasksNow.map((entry) => (entry.id === task.id ? task : entry)) : [...tasksNow, task];
        void saveTasks(next).then((ok) => { if (ok) setTaskEdit(null); });
    };
    const deleteTask = () => {
        if (!taskEdit) return;
        void saveTasks(tasksNow.filter((entry) => entry.id !== taskEdit.task.id)).then((ok) => { if (ok) setTaskEdit(null); });
    };

    // Geht die Kopie am Gerät auf? Sonst sind die Stufen gesperrt (ProductionDevicePage).
    const planCheck = checkTemplate(plan?.sections ?? [], tasksNow);
    const planProblems = plan ? checkProblems(plan.sections, tasksNow.length, planCheck) : [];

    /* «Save as template» (28.09.2026): diese Fassung als neue Vorlage — wie
       «Çoğalt» auf der Seite der Vorlagen. Stand, Dateien, Freigaben und Tage
       nimmt die Vorlage nicht mit (der Server lässt sie ohnehin weg). */
    const [saveAsOpen, setSaveAsOpen] = useState(false);
    const [saveAsName, setSaveAsName] = useState('');
    const [savingAs, setSavingAs] = useState(false);
    const saveAsTemplate = async () => {
        const name = saveAsName.replace(/\s+/g, ' ').trim();
        if (!plan || !name || savingAs) return;
        setSavingAs(true);
        try {
            const created = await productionTasksApi.createTemplate(draftInput({ id: null, name, sections: plan.sections, tasks: tasksNow }));
            void refreshTaskTemplates();
            toast.success(t('productionTasks.device.savedAsTemplate', { name: created.name }));
            setSaveAsOpen(false);
        } catch (failure) {
            toast.error(productionTaskErrorText(failure));
        } finally {
            setSavingAs(false);
        }
    };

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
            {!plan || !section ? (
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
                                area: sectionLabel(section),
                                share: formatPercent(section.share),
                            })}
                        </span>
                        <span className={`ofi-ptk-planbar__count ${areaTasks.length && assigned === areaTasks.length ? 'is-done' : ''}`}>
                            {t('productionTasks.device.assignedCount', { assigned, total: areaTasks.length })}
                        </span>
                        <span className="ofi-ptk-planbar__meta is-hint">{t('productionTasks.device.customizeHint')}</span>
                        <span className="ofi-ptk-planbar__actions">
                            <button type="button" className="ofi-ptk-btn is-small ofi-nosize" onClick={() => setLoadOpen(true)}>
                                <RefreshCw />
                                {t('productionTasks.device.change')}
                            </button>
                            {/* Diese Fassung als neue Vorlage (28.09.2026) — ohne Stand, Dateien und Tage. */}
                            <button
                                type="button"
                                className="ofi-ptk-btn is-small ofi-nosize"
                                onClick={() => {
                                    setSaveAsName(`${plan.templateName} · ${data?.device.name ?? ''}`.replace(/\s·\s$/, '').slice(0, TASK_LIMITS.templateName));
                                    setSaveAsOpen(true);
                                }}
                            >
                                <Save />
                                {t('productionTasks.device.saveAsTemplate')}
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

                    {/* Die 100-%-Regel am Gerät (28.09.2026): geht die Kopie nicht auf, sind die
                        Stufen gesperrt, bis Gewichte, Aufgaben oder Unteraufgaben wieder stimmen. */}
                    {!planCheck.valid && planProblems.length > 0 && (
                        <div className="ofi-ptk-note is-warn ofi-ptk-planlock" role="status">
                            <TriangleAlert aria-hidden />
                            <span>
                                <b>{t('productionTasks.device.planBrokenTitle')}</b>
                                {planProblems.map((problem) => <span key={problem} className="ofi-ptk-note__line">{problem}</span>)}
                            </span>
                        </div>
                    )}

                    <div className="ofi-ptk-grid">
                        {section.stages.map((stage) => (
                            <StageCard
                                key={stage.key}
                                area={section.key}
                                stage={stage}
                                number={stageNumber(stages, stage.key)}
                                tasks={groups.get(stage.key) ?? []}
                                share={section.share}
                                // In den Zuweisungen mit dem Gewicht der Stufe (28.09.2026).
                                showStageWeight
                                names={names}
                                mode="device"
                                editable
                                staff={staff}
                                staffLoading={staffLoading}
                                meId={meId}
                                busyTaskId={busyTaskId}
                                onAssign={(task, ids) => void assign(task, ids, known(ids))}
                                // Den Stand setzt man auf den Stufen selbst, nicht hier beim Anpassen.
                                onOpenTask={(task) => setTaskEdit({ task, isNew: false })}
                                onAddTask={(area, stageKey) => setTaskEdit({ task: newTask(area, stageKey), isNew: true })}
                            />
                        ))}
                        {/* Neue Stufe am Gerät (28.09.2026) — wie in der Vorlage, nur solange der
                            Bereich unter 100 % wiegt; die Vorlage bleibt unberührt. */}
                        {section.stages.length < TASK_LIMITS.stages && (
                            <InlineCreate
                                className="ofi-ptk-addstage"
                                label={t('productionTasks.template.addStage')}
                                placeholder={t('productionTasks.template.stageNamePlaceholder')}
                                maxLength={TASK_LIMITS.stageName}
                                isTaken={(name) => stageNameTaken(section, name)}
                                onCreate={(name) => void addStage(section.key, name)}
                                disabledReason={areaWeight >= 100 - 0.01 ? t('productionTasks.template.sectionFull') : undefined}
                            />
                        )}
                    </div>
                </>
            )}

            {loadOpen && <TemplateLoadDialog plan={plan} onLoad={load} onClose={() => setLoadOpen(false)} />}

            {taskEdit && plan && (
                <TaskEditDialog
                    task={taskEdit.task}
                    isNew={taskEdit.isNew}
                    sections={plan.sections}
                    otherWeight={roundPercent(tasksNow
                        .filter((entry) => entry.area === taskEdit.task.area && entry.id !== taskEdit.task.id)
                        .reduce((sum, entry) => sum + entry.weight, 0))}
                    withDates
                    names={names}
                    staff={staff}
                    staffLoading={staffLoading}
                    onSave={saveTask}
                    onDelete={taskEdit.isNew ? undefined : deleteTask}
                    onClose={() => setTaskEdit(null)}
                />
            )}

            <PopupDialog
                closeOnBackdrop={false}
                open={saveAsOpen}
                onClose={() => { if (!savingAs) setSaveAsOpen(false); }}
                title={t('productionTasks.device.saveAsTitle')}
                subtitle={t('productionTasks.device.saveAsText')}
                icon={<Save size={18} />}
                width={480}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setSaveAsOpen(false)} disabled={savingAs}>{t('productionTasks.actions.cancel')}</PopupButton>
                        <PopupButton variant="primary" loading={savingAs} disabled={!saveAsName.trim()} onClick={() => void saveAsTemplate()}>
                            {t('productionTasks.actions.save')}
                        </PopupButton>
                    </PopupActions>
                )}
            >
                <form
                    className="ofi-ptk-pop ofi-ptk-form"
                    onSubmit={(event) => { event.preventDefault(); void saveAsTemplate(); }}
                    noValidate
                >
                    <label className="ofi-ptk-field">
                        <span className="ofi-ptk-field__label">{t('productionTasks.template.name')}</span>
                        <input
                            className="ofi-ptk-input"
                            value={saveAsName}
                            maxLength={TASK_LIMITS.templateName}
                            autoFocus
                            onChange={(event) => setSaveAsName(event.target.value)}
                        />
                    </label>
                </form>
            </PopupDialog>

            <PopupDialog
                closeOnBackdrop={false}
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
