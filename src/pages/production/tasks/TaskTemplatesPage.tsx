import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Info, ListChecks, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import {
    primeTaskTemplate,
    productionTaskErrorText,
    productionTasksApi,
    readTaskTemplate,
    readTaskTemplates,
    refreshTaskTemplates,
} from '@/lib/api/productionTasks';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useStaffDirectory } from '@/pages/crm/hooks/useStaffDirectory';
import { useUnsavedChangesGuard } from '@/pages/sales/detail/hooks/useUnsavedChangesGuard';
import { useAuthStore } from '@/store/authStore';
import type { ProductionTask, TaskArea, TaskPerson, TaskStage, TaskTemplate, TaskTemplateSummary } from '@/types/productionTasks';
import '@/styles/modules/productionTasks.css';

import { TaskEditDialog } from './TaskEditDialog';
import { TemplateEditor } from './TemplateEditor';
import { TemplateList } from './TemplateList';
import {
    draftDirty,
    draftFromTemplate,
    draftInput,
    duplicateDraft,
    emptyDraft,
    newTask,
    removeTask,
    upsertTask,
    type TemplateDraft,
} from './templateDraft';
import { staffName } from './taskModel';

const NEW = 'new';

/**
 * ── ÜRETİM · GÖREVLENDİRME ŞABLONLARI (26.09.2026, Vorgabe Samet) ──────────
 *
 * «Üretimde yeni sayfa oluyor: görevlendirme şablonları — bu şablonları
 *  ekleyebiliyoruz … apple mac ui, swift ui tasarımı, üretim depo modülü
 *  nasılsa o şekilde; temiz ve profesyonel.»
 *
 * Links die Vorlagen (Quellliste), rechts die gewählte: Name, Anteile der
 * Bereiche (Mekanik / Elektrik), und je Stufe die kleine Görevlendirme-Karte
 * mit den Aufgaben, ihrem Gewicht und den Personen. Das Beispiel «Chiller»
 * legt der Server beim ersten Öffnen an.
 *
 * Bearbeiten darf nur die Administratorrolle; alle anderen lesen. Die
 * gewählte Vorlage steht in der Adresse (`?t=`), eine neue als `?t=new`.
 * Der Rahmen ist der des Depos (schmale Leiste, keine Kopfleiste).
 */
/** `tabs`: die grauen Reiter der Seite «Şablonlar» (28.09.2026) — sie stehen statt des Titels. */
export const TaskTemplatesPage = ({ tabs }: { tabs?: ReactNode } = {}) => {
    useLanguageTick();
    const [params, setParams] = useSearchParams();
    const canEdit = useAuthStore((state) => state.isSystemAdmin);
    // Das Verzeichnis braucht nur, wer Personen auswählt (die Namen der
    // gespeicherten Vorlage liefert der Server mit).
    const { staff, loading: staffLoading } = useStaffDirectory(canEdit);

    const [list, setList] = useState<TaskTemplateSummary[] | null>(null);
    const [listError, setListError] = useState<string | null>(null);
    const [listTick, setListTick] = useState(0);

    const [saved, setSaved] = useState<TaskTemplate | null>(null);
    const [draft, setDraft] = useState<TemplateDraft | null>(null);
    const [revision, setRevision] = useState(0);
    const [templateError, setTemplateError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [switchTo, setSwitchTo] = useState<string | null>(null);
    const [taskEdit, setTaskEdit] = useState<{ task: ProductionTask; isNew: boolean } | null>(null);
    const [area, setArea] = useState<TaskArea>('MECHANICAL');

    const savedRef = useRef<TaskTemplate | null>(null);
    const draftRef = useRef<TemplateDraft | null>(null);

    // Eine neue Vorlage gibt es nur für die Administratorrolle.
    const rawWanted = params.get('t');
    const wanted = rawWanted === NEW && !canEdit ? null : rawWanted;
    // Die eben angelegte Vorlage steht schon in der Adresse, bevor die Liste
    // sie kennt — sie bleibt trotzdem gewählt.
    const selectedId = wanted === NEW
        ? null
        : wanted && (list?.some((item) => item.id === wanted) || saved?.id === wanted) ? wanted : list?.[0]?.id ?? null;

    /** Den Entwurf neu setzen — der Editor fängt dann von vorn an (Felder, Anteile). */
    const resetDraft = useCallback((next: TemplateDraft | null) => {
        draftRef.current = next;
        setDraft(next);
        setRevision((value) => value + 1);
    }, []);

    const updateDraft = useCallback((next: TemplateDraft) => {
        draftRef.current = next;
        setDraft(next);
    }, []);

    /* ── die Liste ─────────────────────────────────────────────────── */
    useEffect(() => readTaskTemplates(
        (items) => { setList(items); setListError(null); },
        (error) => setListError(productionTaskErrorText(error, 'productionTasks.err.loadFailed')),
    ), [listTick]);

    /* Nach dem Speichern/Löschen: die Liste direkt vom Server — nicht erst den
       alten Stand aus dem Speicher und dann den neuen (kein Flackern). */
    const reloadList = useCallback(() => {
        void refreshTaskTemplates()
            .then((items) => { setList(items); setListError(null); })
            .catch(() => undefined);
    }, []);

    /* ── die gewählte Vorlage ──────────────────────────────────────── */
    useEffect(() => {
        if (!selectedId) return undefined;
        return readTaskTemplate(
            selectedId,
            (value) => {
                const previous = savedRef.current;
                savedRef.current = value;
                setSaved(value);
                setTemplateError(null);
                // Kommt die frische Antwort nach der gespeicherten, bleibt ein
                // angefangener Entwurf stehen.
                const current = draftRef.current;
                const keep = Boolean(current && current.id === value.id && previous && previous.id === value.id && draftDirty(current, previous));
                if (!keep) resetDraft(draftFromTemplate(value));
            },
            (error) => setTemplateError(productionTaskErrorText(error, 'productionTasks.err.loadFailed')),
        );
    }, [selectedId, resetDraft]);

    /* Eine neue Vorlage aus der Adresse (auch nach dem Neuladen). */
    useEffect(() => {
        if (wanted !== NEW || !canEdit) return;
        if (draftRef.current && draftRef.current.id === null) return;
        savedRef.current = null;
        setSaved(null);
        resetDraft(emptyDraft());
    }, [wanted, canEdit, resetDraft]);

    const shownDraft = draft && (wanted === NEW ? draft.id === null : draft.id === selectedId) ? draft : null;
    const shownSaved = shownDraft?.id && saved?.id === shownDraft.id ? saved : null;
    const dirty = canEdit && draftDirty(shownDraft, shownSaved);
    const summary = list?.find((item) => item.id === shownDraft?.id) ?? null;

    const guard = useUnsavedChangesGuard(dirty && !saving && !deleting);

    /* Namen: zuerst die des Servers (mit «ausgetreten»), dann das Verzeichnis. */
    const names = useMemo(() => {
        const map = new Map<string, TaskPerson>();
        for (const person of shownSaved?.people ?? []) map.set(person.id, person);
        for (const row of staff) {
            if (!map.has(row.id)) map.set(row.id, { id: row.id, name: staffName(row) || row.email || row.id, active: true });
        }
        return map;
    }, [shownSaved, staff]);

    /* ── Wechseln (mit Rückfrage, wenn ungespeichert) ─────────────── */
    const applySwitch = useCallback((target: string) => {
        if (target === NEW) {
            savedRef.current = null;
            setSaved(null);
            resetDraft(emptyDraft());
            setArea('MECHANICAL');
        } else if (draftRef.current?.id === null) {
            // Eine verworfene neue Vorlage verschwindet ganz.
            resetDraft(null);
        }
        setParams(target ? { t: target } : {}, { replace: true });
    }, [resetDraft, setParams]);

    const requestSwitch = (target: string) => {
        if (target === wanted || (target === selectedId && wanted !== NEW)) return;
        if (dirty) setSwitchTo(target);
        else applySwitch(target);
    };

    /* ── Speichern ─────────────────────────────────────────────────── */
    const save = useCallback(async (): Promise<boolean> => {
        const current = draftRef.current;
        if (!current || saving) return false;
        if (!current.name.trim()) {
            toast.error(t('productionTasks.err.NAME_REQUIRED'));
            return false;
        }
        setSaving(true);
        try {
            const input = draftInput(current);
            const result = current.id
                ? await productionTasksApi.saveTemplate(current.id, input)
                : await productionTasksApi.createTemplate(input);
            void primeTaskTemplate(result);
            savedRef.current = result;
            setSaved(result);
            resetDraft(draftFromTemplate(result));
            if (!current.id) setParams({ t: result.id }, { replace: true });
            reloadList();
            toast.success(t('productionTasks.template.saved', { name: result.name }));
            return true;
        } catch (error) {
            toast.error(productionTaskErrorText(error));
            return false;
        } finally {
            setSaving(false);
        }
    }, [saving, resetDraft, setParams, reloadList]);

    /* ⌘S / Strg+S speichert — wie in jeder Mac-App. */
    useEffect(() => {
        if (!canEdit) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
            event.preventDefault();
            if (dirty && !saving) void save();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [canEdit, dirty, saving, save]);

    const revert = () => {
        if (shownSaved) resetDraft(draftFromTemplate(shownSaved));
    };

    const duplicate = () => {
        if (!shownDraft) return;
        const copy = duplicateDraft(shownDraft, t('productionTasks.template.copyName', { name: shownDraft.name.trim() || t('productionTasks.templates.untitled') }));
        savedRef.current = null;
        setSaved(null);
        resetDraft(copy);
        setParams({ t: NEW }, { replace: true });
    };

    const remove = async () => {
        const current = shownDraft;
        if (!current?.id) return;
        setDeleting(true);
        try {
            await productionTasksApi.removeTemplate(current.id);
            toast.success(t('productionTasks.template.deleted', { name: current.name }));
            setConfirmDelete(false);
            // Sofort aus der Liste — sonst würde die gelöschte gleich wieder gewählt.
            setList((items) => items?.filter((item) => item.id !== current.id) ?? null);
            savedRef.current = null;
            setSaved(null);
            resetDraft(null);
            setParams({}, { replace: true });
            reloadList();
        } catch (error) {
            toast.error(productionTaskErrorText(error));
        } finally {
            setDeleting(false);
        }
    };

    /* ── Aufgaben ──────────────────────────────────────────────────── */
    const openTask = (task: ProductionTask) => setTaskEdit({ task, isNew: false });
    const addTask = (targetArea: TaskArea, stage: TaskStage) => {
        if (!shownDraft) return;
        setTaskEdit({ task: newTask(shownDraft, targetArea, stage), isNew: true });
    };
    const saveTask = (task: ProductionTask) => {
        const current = draftRef.current;
        if (!current) return;
        updateDraft(upsertTask(current, task));
        if (task.area !== area) setArea(task.area);
        setTaskEdit(null);
    };
    const deleteTask = () => {
        const current = draftRef.current;
        if (!current || !taskEdit) return;
        updateDraft(removeTask(current, taskEdit.task.id));
        setTaskEdit(null);
    };

    const listLoading = !list && !listError;
    const loadingTemplate = Boolean(selectedId && !shownDraft && !templateError);

    return (
        <div className="ofi-ptk is-templates">
            <header className="ofi-ptk-head">
                {tabs ?? <h1 className="ofi-ptk-head__title">{t('productionTasks.templates.title')}</h1>}
                {list && <span className="ofi-ptk-head__count">{t('productionTasks.templates.count', { count: list.length })}</span>}
                <div className="ofi-ptk-head__actions">
                    {canEdit && (
                        <button type="button" className="ofi-ptk-btn is-primary ofi-nosize" onClick={() => requestSwitch(NEW)}>
                            <Plus />
                            {t('productionTasks.templates.new')}
                        </button>
                    )}
                </div>
            </header>

            {!canEdit && (
                <div className="ofi-ptk-note">
                    <Info aria-hidden />
                    <span>{t('productionTasks.templates.readOnly')}</span>
                </div>
            )}

            {listError && !list ? (
                <div className="ofi-ptk-state is-error">
                    <TriangleAlert aria-hidden />
                    <b>{listError}</b>
                    <button type="button" className="ofi-ptk-btn ofi-nosize" onClick={() => setListTick((value) => value + 1)}>
                        {t('productionTasks.actions.retry')}
                    </button>
                </div>
            ) : (
                <div className="ofi-ptk-split">
                    <TemplateList
                        items={list}
                        loading={listLoading}
                        selectedId={selectedId}
                        draftNew={wanted === NEW && shownDraft ? { name: shownDraft.name } : null}
                        onSelect={requestSwitch}
                    />

                    <div className="ofi-ptk-main">
                        {shownDraft ? (
                            <TemplateEditor
                                key={`${shownDraft.id ?? NEW}:${revision}`}
                                draft={shownDraft}
                                saved={shownSaved}
                                summary={summary}
                                canEdit={canEdit}
                                dirty={dirty}
                                saving={saving}
                                area={area}
                                names={names}
                                staff={staff}
                                staffLoading={staffLoading}
                                onArea={setArea}
                                onChange={updateDraft}
                                onSave={() => void save()}
                                onRevert={revert}
                                onDuplicate={duplicate}
                                onDelete={() => setConfirmDelete(true)}
                                onOpenTask={openTask}
                                onAddTask={addTask}
                            />
                        ) : templateError ? (
                            <div className="ofi-ptk-state is-error">
                                <TriangleAlert aria-hidden />
                                <b>{templateError}</b>
                                <button type="button" className="ofi-ptk-btn ofi-nosize" onClick={() => setListTick((value) => value + 1)}>
                                    {t('productionTasks.actions.retry')}
                                </button>
                            </div>
                        ) : loadingTemplate || listLoading ? (
                            <div className="ofi-ptk-state" aria-busy="true">
                                <span className="ofi-ptk-spinner" />
                            </div>
                        ) : (
                            <div className="ofi-ptk-state">
                                <ListChecks aria-hidden />
                                <b>{t('productionTasks.templates.empty')}</b>
                                {canEdit && (
                                    <>
                                        <span>{t('productionTasks.templates.emptyHint')}</span>
                                        <button type="button" className="ofi-ptk-btn is-primary ofi-nosize" onClick={() => requestSwitch(NEW)}>
                                            <Plus />
                                            {t('productionTasks.templates.new')}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {taskEdit && shownDraft && (
                <TaskEditDialog
                    task={taskEdit.task}
                    isNew={taskEdit.isNew}
                    otherCodes={shownDraft.tasks.filter((task) => task.id !== taskEdit.task.id).map((task) => task.code)}
                    areaShares={shownDraft.areaShares}
                    names={names}
                    staff={staff}
                    staffLoading={staffLoading}
                    onSave={saveTask}
                    onDelete={taskEdit.isNew ? undefined : deleteTask}
                    onClose={() => setTaskEdit(null)}
                />
            )}

            <PopupDialog
                open={confirmDelete}
                onClose={() => { if (!deleting) setConfirmDelete(false); }}
                title={t('productionTasks.template.deleteTitle')}
                subtitle={summary?.usedBy
                    ? t('productionTasks.template.deleteTextUsed', { name: shownDraft?.name ?? '', count: summary.usedBy })
                    : t('productionTasks.template.deleteText', { name: shownDraft?.name ?? '' })}
                icon={<Trash2 size={18} />}
                tone="danger"
                width={460}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setConfirmDelete(false)} disabled={deleting}>{t('productionTasks.actions.cancel')}</PopupButton>
                        <PopupButton variant="danger" loading={deleting} onClick={() => void remove()}>{t('productionTasks.actions.delete')}</PopupButton>
                    </PopupActions>
                )}
            />

            {/* Wechsel zu einer anderen Vorlage mit ungespeicherten Änderungen. */}
            <PopupDialog
                open={switchTo !== null}
                onClose={() => setSwitchTo(null)}
                title={t('productionTasks.template.unsavedTitle')}
                subtitle={t('productionTasks.template.unsavedText')}
                icon={<TriangleAlert size={18} />}
                tone="warning"
                width={460}
                footer={(
                    <PopupActions start={<PopupButton onClick={() => setSwitchTo(null)}>{t('productionTasks.actions.cancel')}</PopupButton>}>
                        <PopupButton variant="danger" onClick={() => { const target = switchTo; setSwitchTo(null); if (target) applySwitch(target); }}>
                            {t('productionTasks.actions.discard')}
                        </PopupButton>
                        <PopupButton
                            variant="primary"
                            loading={saving}
                            onClick={() => {
                                const target = switchTo;
                                void save().then((ok) => { if (ok && target) { setSwitchTo(null); applySwitch(target); } });
                            }}
                        >
                            {t('productionTasks.actions.save')}
                        </PopupButton>
                    </PopupActions>
                )}
            />

            {/* Verlassen der Seite mit ungespeicherten Änderungen. */}
            <PopupDialog
                open={guard.isOpen}
                onClose={guard.cancel}
                title={t('productionTasks.template.unsavedTitle')}
                subtitle={t('productionTasks.template.unsavedLeave')}
                icon={<TriangleAlert size={18} />}
                tone="warning"
                width={460}
                footer={(
                    <PopupActions start={<PopupButton onClick={guard.cancel}>{t('productionTasks.actions.cancel')}</PopupButton>}>
                        <PopupButton variant="danger" onClick={guard.proceed}>{t('productionTasks.actions.discard')}</PopupButton>
                        <PopupButton
                            variant="primary"
                            loading={saving}
                            onClick={() => { void save().then((ok) => { if (ok) guard.proceed(); }); }}
                        >
                            {t('productionTasks.actions.save')}
                        </PopupButton>
                    </PopupActions>
                )}
            />
        </div>
    );
};

export default TaskTemplatesPage;
