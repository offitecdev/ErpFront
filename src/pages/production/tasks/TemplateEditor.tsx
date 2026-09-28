import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, CircleCheck, Copy, Info, Layers, Trash2, TriangleAlert, Undo2 } from 'lucide-react';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import { fmtDateTime } from '@/pages/inventory/utils/format';
import type { ProductionTask, TaskArea, TaskStage, TaskTemplate, TaskTemplateSummary } from '@/types/productionTasks';

import { AreaIcon, AreaSwitch } from './AreaSwitch';
import { InlineCreate, NameInput } from './InlineName';
import type { PersonNames } from './PeopleCell';
import { StageCard } from './StageCard';
import { TemplateNameField } from './TemplateNameField';
import {
    addSection,
    addStage,
    moveSection,
    moveStage,
    removeSection,
    removeStage,
    renameSection,
    renameStage,
    setSectionShare,
    type TemplateDraft,
} from './templateDraft';
import {
    areaTone,
    checkProblems,
    checkTemplate,
    formatPercent,
    isBuiltInArea,
    isBuiltInStage,
    parsePercent,
    sectionLabel,
    sectionNameTaken,
    stageLabel,
    stageNameTaken,
    TASK_LIMITS,
    tasksByStage,
} from './taskModel';

const shareText = (value: number) => String(value).replace('.', ',');

/**
 * ── EINE VORLAGE BEARBEITEN (26.09.2026, Vorgabe Samet) ─────────────────────
 *
 * Oben der Name (als Titel, direkt zu tippen), daneben ob die Vorlage
 * «aufgeht». Darunter die Bereiche mit ihrem Anteil an der
 * Gesamtfertigstellung und ob ihre Gewichte 100 % ergeben. Dann der Schalter
 * der Bereiche und je Stufe die kleine Görevlendirme-Karte («her aşamada
 * büyük olmayacak şekilde») — eine Aufgabe öffnet sich mit einem Klick.
 *
 * Seit dem 28.09.2026 legt man Bereiche und Stufen selbst an: «+ Bölüm ekle»
 * unter den Bereichen, «+ Yeni aşama» hinter der letzten Karte. Ein eigener
 * Bereich / eine eigene Stufe heisst, wie man sie tippt, und lässt sich
 * verschieben und löschen. JEDE Stufe steht als Karte da, auch ohne Aufgaben
 * (die Knöpfe «Görevsiz aşamalar» gibt es nicht mehr).
 */
export const TemplateEditor = ({
    draft,
    saved,
    summary,
    canEdit,
    dirty,
    saving,
    area,
    names,
    staff,
    staffLoading,
    onArea,
    onChange,
    onSave,
    onRevert,
    onDuplicate,
    onDelete,
    onOpenTask,
    onAddTask,
    isNameTaken,
}: {
    draft: TemplateDraft;
    saved: TaskTemplate | null;
    summary: TaskTemplateSummary | null;
    canEdit: boolean;
    dirty: boolean;
    saving: boolean;
    area: TaskArea;
    names: PersonNames;
    staff: StaffDirectoryRow[];
    staffLoading: boolean;
    onArea: (area: TaskArea) => void;
    onChange: (draft: TemplateDraft) => void;
    onSave: () => void;
    onRevert: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onOpenTask: (task: ProductionTask) => void;
    onAddTask: (area: TaskArea, stage: TaskStage) => void;
    /** Trägt schon eine ANDERE Vorlage der Firma diesen Namen? */
    isNameTaken: (name: string) => boolean;
}) => {
    // Die Anteile als Text: «6» auf dem Weg zu «60» darf stehen bleiben.
    const [shares, setShares] = useState<Record<TaskArea, string>>(() =>
        Object.fromEntries(draft.sections.map((section) => [section.key, shareText(section.share)])));
    // Ein Bereich oder eine Stufe MIT Aufgaben geht erst nach Rückfrage.
    const [removal, setRemoval] = useState<{ area: TaskArea; stage?: TaskStage; count: number } | null>(null);

    const check = useMemo(() => checkTemplate(draft.sections, draft.tasks), [draft.sections, draft.tasks]);
    /* Ist das Gewicht des gewählten Bereichs verteilt (Aufgaben zusammen 100 %),
       gibt es nichts mehr zu vergeben — «+ Yeni aşama» und «+ Görev ekle»
       sind dann gesperrt, bis eine Aufgabe weniger wiegt. */
    const sectionFull = (key: TaskArea) => (check.areas.find((entry) => entry.area === key)?.weightSum ?? 0) >= 100 - 0.01;
    const section = draft.sections.find((entry) => entry.key === area) ?? draft.sections[0] ?? null;
    const groups = useMemo(() => (section ? tasksByStage(draft.tasks, section) : null), [draft.tasks, section]);
    const warnings = Object.fromEntries(check.areas.map((entry) => [entry.area, !entry.ok])) as Record<TaskArea, boolean>;

    const shareOf = (key: TaskArea, fallback: number) => shares[key] ?? shareText(fallback);
    const setShare = (target: TaskArea, text: string) => {
        setShares((current) => ({ ...current, [target]: text }));
        const value = parsePercent(text);
        if (value !== null) onChange(setSectionShare(draft, target, value));
    };

    const createSection = (name: string) => {
        const { draft: next, key } = addSection(draft, name);
        onChange(next);
        onArea(key);
    };

    const taskCountIn = (target: TaskArea, stage?: TaskStage) =>
        draft.tasks.filter((task) => task.area === target && (stage === undefined || task.stage === stage)).length;

    const dropSection = (target: TaskArea) => {
        onChange(removeSection(draft, target));
        if (section?.key === target) onArea(draft.sections.find((entry) => entry.key !== target)?.key ?? '');
    };
    // Entfernen fragt immer nach — auch ohne Aufgaben (28.09.2026: «always show a warning»).
    const requestRemoveSection = (target: TaskArea) => setRemoval({ area: target, count: taskCountIn(target) });
    const requestRemoveStage = (target: TaskArea, stage: TaskStage) =>
        setRemoval({ area: target, stage, count: taskCountIn(target, stage) });
    const confirmRemoval = () => {
        if (!removal) return;
        if (removal.stage) onChange(removeStage(draft, removal.area, removal.stage));
        else dropSection(removal.area);
        setRemoval(null);
    };
    const removalSection = removal ? draft.sections.find((entry) => entry.key === removal.area) ?? null : null;
    const removalStage = removal?.stage ? removalSection?.stages.find((entry) => entry.key === removal.stage) ?? null : null;

    const problems = checkProblems(draft.sections, draft.tasks.length, check);

    const nameTaken = Boolean(draft.name.trim()) && isNameTaken(draft.name.replace(/\s+/g, ' ').trim());

    const meta: string[] = [t('productionTasks.templates.taskCount', { count: draft.tasks.length })];
    if (saved) {
        meta.push(saved.updatedByName
            ? t('productionTasks.template.changedBy', { date: fmtDateTime(saved.updatedAt), name: saved.updatedByName })
            : t('productionTasks.template.changed', { date: fmtDateTime(saved.updatedAt) }));
    }
    if (summary?.usedBy) meta.push(t('productionTasks.template.usedBy', { count: summary.usedBy }));

    return (
        <section className="ofi-ptk-editor" aria-label={draft.name || t('productionTasks.templates.untitled')}>
            <header className="ofi-ptk-editor__head">
                <TemplateNameField
                    value={draft.name}
                    savedName={saved?.name ?? null}
                    canEdit={canEdit}
                    autoFocus={!draft.id}
                    isTaken={isNameTaken}
                    onChange={(name) => onChange({ ...draft, name })}
                />
                <span
                    className={`ofi-ptk-status ${check.valid ? 'is-ok' : 'is-warn'}`}
                    title={check.valid ? t('productionTasks.check.readyHint') : problems.join('\n')}
                >
                    {check.valid ? <CircleCheck aria-hidden /> : <TriangleAlert aria-hidden />}
                    {check.valid ? t('productionTasks.check.ready') : t('productionTasks.check.incomplete')}
                </span>
                <div className="ofi-ptk-editor__actions">
                    {dirty && <span className="ofi-ptk-dirty">{t('productionTasks.template.unsaved')}</span>}
                    {canEdit && saved && (
                        <>
                            <button
                                type="button"
                                className="ofi-ptk-btn is-icon is-quiet ofi-nosize"
                                title={t('productionTasks.template.duplicate')}
                                aria-label={t('productionTasks.template.duplicate')}
                                onClick={onDuplicate}
                            >
                                <Copy />
                            </button>
                            <button
                                type="button"
                                className="ofi-ptk-btn is-icon is-quiet is-danger-hover ofi-nosize"
                                title={t('productionTasks.template.delete')}
                                aria-label={t('productionTasks.template.delete')}
                                onClick={onDelete}
                            >
                                <Trash2 />
                            </button>
                        </>
                    )}
                    {canEdit && dirty && saved && (
                        <button type="button" className="ofi-ptk-btn ofi-nosize" onClick={onRevert} disabled={saving}>
                            <Undo2 />
                            {t('productionTasks.actions.revert')}
                        </button>
                    )}
                    {canEdit && (
                        <button
                            type="button"
                            className="ofi-ptk-btn is-primary ofi-nosize"
                            disabled={!dirty || saving || !draft.name.trim() || nameTaken}
                            title={t('productionTasks.template.saveHint')}
                            onClick={onSave}
                        >
                            {saving ? t('productionTasks.actions.saving') : t('productionTasks.actions.save')}
                        </button>
                    )}
                </div>
            </header>
            <p className="ofi-ptk-editor__meta">
                {meta.map((part, index) => (
                    <span key={part}>
                        {index > 0 && <span className="ofi-ptk-dot" aria-hidden>·</span>}
                        {part}
                    </span>
                ))}
                {saved?.isExample && <span className="ofi-ptk-tag">{t('productionTasks.templates.example')}</span>}
            </p>

            {/* ── Bereiche: Anteil an der Gesamtfertigstellung ── */}
            <div className="ofi-ptk-group">
                <h2 className="ofi-ptk-group__title">{t('productionTasks.template.areasTitle')}</h2>
                <div className={`ofi-ptk-group__box ${canEdit ? 'is-editable' : ''}`}>
                    {!draft.sections.length && (
                        <div className="ofi-ptk-sectionsempty">
                            <span className="ofi-ptk-sectionsempty__icon"><Layers aria-hidden /></span>
                            <span className="ofi-ptk-sectionsempty__text">
                                <b>{t('productionTasks.template.sectionsEmpty')}</b>
                                {canEdit && <span>{t('productionTasks.template.sectionsEmptyHint')}</span>}
                            </span>
                        </div>
                    )}
                    {draft.sections.map((entry, index) => {
                        const areaCheck = check.areas.find((row) => row.area === entry.key);
                        const shareInput = shareOf(entry.key, entry.share);
                        const invalidShare = parsePercent(shareInput) === null;
                        const label = sectionLabel(entry);
                        return (
                            <div key={entry.key} className="ofi-ptk-arearow">
                                <span className="ofi-ptk-arearow__name">
                                    <span className={`ofi-ptk-areaicon ${areaTone(entry.key)}`}>
                                        <AreaIcon area={entry.key} size={13} />
                                    </span>
                                    {canEdit && !isBuiltInArea(entry.key) ? (
                                        <NameInput
                                            className="ofi-ptk-arearow__nameinput"
                                            value={entry.name}
                                            maxLength={TASK_LIMITS.sectionName}
                                            ariaLabel={t('productionTasks.template.sectionName')}
                                            placeholder={t('productionTasks.template.sectionName')}
                                            isTaken={(name) => sectionNameTaken(draft.sections, name, entry.key)}
                                            onCommit={(name) => onChange(renameSection(draft, entry.key, name))}
                                        />
                                    ) : (
                                        <span className="ofi-ptk-arearow__label" title={label}>{label}</span>
                                    )}
                                </span>
                                <label className="ofi-ptk-arearow__share">
                                    <span>{t('productionTasks.template.shareLabel')}</span>
                                    <span className={`ofi-ptk-percent is-compact ${invalidShare ? 'is-invalid' : ''}`}>
                                        <input
                                            className="ofi-ptk-input is-num"
                                            value={shareInput}
                                            inputMode="decimal"
                                            disabled={!canEdit}
                                            aria-label={t('productionTasks.template.shareAria', { area: label })}
                                            onChange={(event) => setShare(entry.key, event.target.value)}
                                            onKeyDown={(event) => {
                                                // Tab springt von Anteil zu Anteil (Umschalt+Tab zurück) — nicht über Name und Werkzeuge.
                                                if (event.key !== 'Tab') return;
                                                const inputs = [...document.querySelectorAll<HTMLInputElement>('.ofi-ptk-arearow__share input')];
                                                const next = inputs[inputs.indexOf(event.currentTarget) + (event.shiftKey ? -1 : 1)];
                                                if (!next) return;
                                                event.preventDefault();
                                                next.focus();
                                                next.select();
                                            }}
                                            onBlur={() => setShares((current) => ({ ...current, [entry.key]: shareText(entry.share) }))}
                                        />
                                        <span aria-hidden>%</span>
                                    </span>
                                </label>
                                <span className="ofi-ptk-arearow__tasks">
                                    {t('productionTasks.templates.taskCount', { count: areaCheck?.taskCount ?? 0 })}
                                </span>
                                {areaCheck && !areaCheck.taskCount && !areaCheck.share ? (
                                    // Anteil 0, keine Aufgaben: der Bereich trägt (noch) nichts bei.
                                    <span className="ofi-ptk-arearow__sum is-unused">{t('productionTasks.template.areaUnused')}</span>
                                ) : (
                                    <span className={`ofi-ptk-arearow__sum ${areaCheck?.ok ? 'is-ok' : 'is-warn'}`}>
                                        {areaCheck?.ok ? <CircleCheck aria-hidden /> : <TriangleAlert aria-hidden />}
                                        {t('productionTasks.template.weightSum', { sum: formatPercent(areaCheck?.weightSum ?? 0) })}
                                    </span>
                                )}
                                {canEdit && (
                                    <span className="ofi-ptk-arearow__tools">
                                        <button
                                            type="button"
                                            className="ofi-ptk-toolbtn ofi-nosize"
                                            disabled={index === 0}
                                            title={t('productionTasks.template.moveUp')}
                                            aria-label={t('productionTasks.template.moveUp')}
                                            onClick={() => onChange(moveSection(draft, entry.key, -1))}
                                        >
                                            <ChevronUp aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            className="ofi-ptk-toolbtn ofi-nosize"
                                            disabled={index === draft.sections.length - 1}
                                            title={t('productionTasks.template.moveDown')}
                                            aria-label={t('productionTasks.template.moveDown')}
                                            onClick={() => onChange(moveSection(draft, entry.key, 1))}
                                        >
                                            <ChevronDown aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            className="ofi-ptk-toolbtn is-danger ofi-nosize"
                                            title={t('productionTasks.template.removeSection')}
                                            aria-label={t('productionTasks.template.removeSection')}
                                            onClick={() => requestRemoveSection(entry.key)}
                                        >
                                            <Trash2 aria-hidden />
                                        </button>
                                    </span>
                                )}
                            </div>
                        );
                    })}
                    {canEdit && draft.sections.length < TASK_LIMITS.sections && (
                        <div className="ofi-ptk-arearow is-add">
                            <InlineCreate
                                className="ofi-ptk-addsection"
                                label={t('productionTasks.template.addSection')}
                                placeholder={t('productionTasks.template.sectionNamePlaceholder')}
                                maxLength={TASK_LIMITS.sectionName}
                                isTaken={(name) => sectionNameTaken(draft.sections, name)}
                                onCreate={createSection}
                            />
                        </div>
                    )}
                    {draft.sections.length > 0 && (
                        <div className={`ofi-ptk-arearow is-total ${check.sharesOk ? '' : 'is-warn'}`}>
                            <span className="ofi-ptk-arearow__name">{t('productionTasks.template.total')}</span>
                            <span className="ofi-ptk-arearow__totalvalue">{formatPercent(check.sharesSum)}</span>
                            <span className="ofi-ptk-arearow__note">
                                {check.sharesOk ? t('productionTasks.template.totalOk') : t('productionTasks.template.totalMust')}
                            </span>
                        </div>
                    )}
                </div>
                {!check.valid && problems.length > 0 && (
                    <div className="ofi-ptk-note is-warn" role="status">
                        <TriangleAlert aria-hidden />
                        <span>
                            <b>{t('productionTasks.check.incompleteTitle')}</b>
                            {problems.map((problem) => <span key={problem} className="ofi-ptk-note__line">{problem}</span>)}
                        </span>
                    </div>
                )}
            </div>

            {/* ── Der Schalter der Bereiche und die Karten der Stufen ── */}
            {section && groups && (
                <>
                    <div className="ofi-ptk-editor__bar">
                        <AreaSwitch
                            sections={draft.sections}
                            value={section.key}
                            onChange={onArea}
                            showShares
                            warnings={warnings}
                            ariaControls="ofi-ptk-template-stages"
                        />
                        <span className="ofi-ptk-legend">
                            <span>{t('productionTasks.template.legendWeight')}</span>
                            <span className="ofi-ptk-legend__overall">{t('productionTasks.template.legendOverall')}</span>
                        </span>
                    </div>

                    <div id="ofi-ptk-template-stages" className="ofi-ptk-grid is-template" role="tabpanel">
                        {section.stages.map((stage, index) => {
                            const last = index === section.stages.length - 1;
                            return (
                                <StageCard
                                    key={stage.key}
                                    area={section.key}
                                    stage={stage}
                                    // Die Fahne trägt nur der feste Abschluss am Ende des Weges.
                                    number={stage.key === 'final' && last && isBuiltInArea(section.key) ? null : index + 1}
                                    tasks={groups.get(stage.key) ?? []}
                                    share={section.share}
                                    names={names}
                                    mode="template"
                                    editable={canEdit}
                                    staff={staff}
                                    staffLoading={staffLoading}
                                    onOpenTask={onOpenTask}
                                    onAddTask={onAddTask}
                                    addDisabledReason={sectionFull(section.key) ? t('productionTasks.template.sectionFull') : undefined}
                                    onAssign={canEdit ? (task, assigneeIds) => onChange({
                                        ...draft,
                                        tasks: draft.tasks.map((entry) => (entry.id === task.id ? { ...entry, assigneeIds } : entry)),
                                    }) : undefined}
                                    tools={canEdit ? {
                                        // Eine feste Stufe trägt ihren Namen aus der Übersetzung.
                                        onRename: isBuiltInStage(stage.key) && !stage.name
                                            ? undefined
                                            : (name) => onChange(renameStage(draft, section.key, stage.key, name)),
                                        isNameTaken: (name) => stageNameTaken(section, name, stage.key),
                                        onMoveUp: index > 0 ? () => onChange(moveStage(draft, section.key, stage.key, -1)) : undefined,
                                        onMoveDown: !last ? () => onChange(moveStage(draft, section.key, stage.key, 1)) : undefined,
                                        onRemove: () => requestRemoveStage(section.key, stage.key),
                                    } : undefined}
                                />
                            );
                        })}
                        {!section.stages.length && (
                            <div className="ofi-ptk-state is-small is-wide">
                                <AreaIcon area={section.key} size={26} />
                                <b>{t('productionTasks.template.stagesEmpty', { area: sectionLabel(section) })}</b>
                                {canEdit && <span>{t('productionTasks.template.stagesEmptyHint')}</span>}
                            </div>
                        )}
                        {canEdit && section.stages.length < TASK_LIMITS.stages && (
                            <InlineCreate
                                className="ofi-ptk-addstage"
                                label={t('productionTasks.template.addStage')}
                                placeholder={t('productionTasks.template.stageNamePlaceholder')}
                                maxLength={TASK_LIMITS.stageName}
                                isTaken={(name) => stageNameTaken(section, name)}
                                onCreate={(name) => onChange(addStage(draft, section.key, name))}
                                disabledReason={sectionFull(section.key) ? t('productionTasks.template.sectionFull') : undefined}
                            />
                        )}
                        {/* Warum gesperrt — gleich darunter, nicht nur im Tipp. */}
                        {canEdit && sectionFull(section.key) && (
                            <div className="ofi-ptk-note is-info ofi-ptk-fullnote" role="status">
                                <Info aria-hidden />
                                <span>{t('productionTasks.template.sectionFull')}</span>
                            </div>
                        )}
                    </div>
                </>
            )}

            <PopupDialog
                closeOnBackdrop={false}
                open={removal !== null}
                onClose={() => setRemoval(null)}
                title={removal?.stage ? t('productionTasks.template.removeStageTitle') : t('productionTasks.template.removeSectionTitle')}
                subtitle={removal
                    ? removal.stage
                        ? t(removal.count ? 'productionTasks.template.removeStageText' : 'productionTasks.template.removeStageEmpty', { name: removalStage ? stageLabel(removalStage) : '', count: removal.count })
                        : t(removal.count ? 'productionTasks.template.removeSectionText' : 'productionTasks.template.removeSectionEmpty', { name: removalSection ? sectionLabel(removalSection) : '', count: removal.count })
                    : undefined}
                icon={<Trash2 size={18} />}
                tone="danger"
                width={460}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setRemoval(null)}>{t('productionTasks.actions.cancel')}</PopupButton>
                        <PopupButton variant="danger" onClick={confirmRemoval}>{t('productionTasks.actions.delete')}</PopupButton>
                    </PopupActions>
                )}
            />
        </section>
    );
};
