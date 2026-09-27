import { useMemo, useState } from 'react';
import { CircleCheck, Copy, Plus, Trash2, TriangleAlert, Undo2 } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import { fmtDateTime } from '@/pages/inventory/utils/format';
import type { ProductionTask, TaskArea, TaskStage, TaskTemplate, TaskTemplateSummary } from '@/types/productionTasks';

import { AreaIcon, AreaSwitch } from './AreaSwitch';
import type { PersonNames } from './PeopleCell';
import { StageCard } from './StageCard';
import type { TemplateDraft } from './templateDraft';
import {
    AREA_STAGES,
    areaLabelKey,
    checkTemplate,
    formatPercent,
    parsePercent,
    stageLabelKey,
    TASK_AREAS,
    TASK_LIMITS,
    tasksByStage,
} from './taskModel';

const shareText = (value: number) => String(value).replace('.', ',');

/**
 * ── EINE VORLAGE BEARBEITEN (26.09.2026, Vorgabe Samet) ─────────────────────
 *
 * Oben der Name (als Titel, direkt zu tippen), daneben ob die Vorlage
 * «aufgeht». Darunter die Bereiche mit ihrem Anteil an der
 * Gesamtfertigstellung (Mekanik 60 / Elektrik 40) und ob ihre Gewichte 100 %
 * ergeben. Dann der Schalter Mekanik | Elektrik und je Stufe die kleine
 * Görevlendirme-Karte («her aşamada büyük olmayacak şekilde») — eine Aufgabe
 * öffnet sich mit einem Klick. Stufen ohne Aufgaben stehen als kleine
 * Knöpfe darunter: ein Klick legt dort die erste Aufgabe an.
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
}) => {
    // Die Anteile als Text: «6» auf dem Weg zu «60» darf stehen bleiben.
    const [shares, setShares] = useState<Record<TaskArea, string>>(() => ({
        MECHANICAL: shareText(draft.areaShares.MECHANICAL),
        ELECTRICAL: shareText(draft.areaShares.ELECTRICAL),
    }));

    const check = useMemo(() => checkTemplate(draft.areaShares, draft.tasks), [draft.areaShares, draft.tasks]);
    const groups = useMemo(() => tasksByStage(draft.tasks, area), [draft.tasks, area]);
    const stagesWithTasks = AREA_STAGES[area].filter((stage) => (groups.get(stage)?.length ?? 0) > 0);
    const emptyStages = AREA_STAGES[area].filter((stage) => !(groups.get(stage)?.length));
    const warnings = Object.fromEntries(check.areas.map((entry) => [entry.area, !entry.ok])) as Record<TaskArea, boolean>;

    const setShare = (target: TaskArea, text: string) => {
        setShares((current) => ({ ...current, [target]: text }));
        const value = parsePercent(text);
        if (value !== null) onChange({ ...draft, areaShares: { ...draft.areaShares, [target]: value } });
    };

    const problems: string[] = [];
    if (!draft.tasks.length) problems.push(t('productionTasks.check.noTasks'));
    if (!check.sharesOk) problems.push(t('productionTasks.check.shares', { sum: formatPercent(check.sharesSum) }));
    for (const entry of check.areas) {
        if (entry.ok) continue;
        const label = t(areaLabelKey(entry.area));
        problems.push(entry.taskCount
            ? t('productionTasks.check.weights', { area: label, sum: formatPercent(entry.weightSum) })
            : t('productionTasks.check.noAreaTasks', { area: label, share: formatPercent(entry.share) }));
    }

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
                <input
                    className="ofi-ptk-titleinput"
                    value={draft.name}
                    // Rückfall ohne `field-sizing`: ungefähr so breit wie der Name.
                    size={Math.max(12, draft.name.length + 2)}
                    maxLength={TASK_LIMITS.templateName}
                    disabled={!canEdit}
                    autoFocus={!draft.id}
                    spellCheck={false}
                    placeholder={t('productionTasks.template.namePlaceholder')}
                    aria-label={t('productionTasks.template.name')}
                    onChange={(event) => onChange({ ...draft, name: event.target.value })}
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
                            disabled={!dirty || saving || !draft.name.trim()}
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
                <div className="ofi-ptk-group__box">
                    {TASK_AREAS.map((entry) => {
                        const areaCheck = check.areas.find((row) => row.area === entry);
                        const invalidShare = parsePercent(shares[entry]) === null;
                        return (
                            <div key={entry} className="ofi-ptk-arearow">
                                <span className="ofi-ptk-arearow__name">
                                    <span className={`ofi-ptk-areaicon is-${entry === 'ELECTRICAL' ? 'electrical' : 'mechanical'}`}>
                                        <AreaIcon area={entry} size={13} />
                                    </span>
                                    {t(areaLabelKey(entry))}
                                </span>
                                <label className="ofi-ptk-arearow__share">
                                    <span>{t('productionTasks.template.shareLabel')}</span>
                                    <span className={`ofi-ptk-percent is-compact ${invalidShare ? 'is-invalid' : ''}`}>
                                        <input
                                            className="ofi-ptk-input is-num"
                                            value={shares[entry]}
                                            inputMode="decimal"
                                            disabled={!canEdit}
                                            aria-label={t('productionTasks.template.shareAria', { area: t(areaLabelKey(entry)) })}
                                            onChange={(event) => setShare(entry, event.target.value)}
                                            onBlur={() => setShares((current) => ({ ...current, [entry]: shareText(draft.areaShares[entry]) }))}
                                        />
                                        <span aria-hidden>%</span>
                                    </span>
                                </label>
                                <span className="ofi-ptk-arearow__tasks">
                                    {t('productionTasks.templates.taskCount', { count: areaCheck?.taskCount ?? 0 })}
                                </span>
                                {areaCheck && !areaCheck.taskCount && !areaCheck.share ? (
                                    // Anteil 0, keine Aufgaben: der Bereich gehört nicht zu dieser Vorlage.
                                    <span className="ofi-ptk-arearow__sum is-unused">{t('productionTasks.template.areaUnused')}</span>
                                ) : (
                                    <span className={`ofi-ptk-arearow__sum ${areaCheck?.ok ? 'is-ok' : 'is-warn'}`}>
                                        {areaCheck?.ok ? <CircleCheck aria-hidden /> : <TriangleAlert aria-hidden />}
                                        {t('productionTasks.template.weightSum', { sum: formatPercent(areaCheck?.weightSum ?? 0) })}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                    <div className={`ofi-ptk-arearow is-total ${check.sharesOk ? '' : 'is-warn'}`}>
                        <span className="ofi-ptk-arearow__name">{t('productionTasks.template.total')}</span>
                        <span className="ofi-ptk-arearow__totalvalue">{formatPercent(check.sharesSum)}</span>
                        <span className="ofi-ptk-arearow__note">
                            {check.sharesOk ? t('productionTasks.template.totalOk') : t('productionTasks.template.totalMust')}
                        </span>
                    </div>
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

            {/* ── Mekanik | Elektrik und die Karten der Stufen ── */}
            <div className="ofi-ptk-editor__bar">
                <AreaSwitch value={area} onChange={onArea} shares={draft.areaShares} warnings={warnings} ariaControls="ofi-ptk-template-stages" />
                <span className="ofi-ptk-legend">
                    <span>{t('productionTasks.template.legendWeight')}</span>
                    <span className="ofi-ptk-legend__overall">{t('productionTasks.template.legendOverall')}</span>
                </span>
            </div>

            <div id="ofi-ptk-template-stages" className="ofi-ptk-grid is-template" role="tabpanel">
                {stagesWithTasks.map((stage) => (
                    <StageCard
                        key={stage}
                        area={area}
                        stage={stage}
                        number={stage === 'final' ? null : AREA_STAGES[area].indexOf(stage) + 1}
                        tasks={groups.get(stage) ?? []}
                        share={draft.areaShares[area]}
                        names={names}
                        mode="template"
                        editable={canEdit}
                        staff={staff}
                        staffLoading={staffLoading}
                        onOpenTask={onOpenTask}
                        onAddTask={onAddTask}
                        onAssign={canEdit ? (task, assigneeIds) => onChange({
                            ...draft,
                            tasks: draft.tasks.map((entry) => (entry.id === task.id ? { ...entry, assigneeIds } : entry)),
                        }) : undefined}
                    />
                ))}
                {!stagesWithTasks.length && (
                    <div className="ofi-ptk-state is-small is-wide">
                        <AreaIcon area={area} size={26} />
                        <b>{t('productionTasks.template.areaEmpty', { area: t(areaLabelKey(area)) })}</b>
                        {canEdit && <span>{t('productionTasks.template.areaEmptyHint')}</span>}
                    </div>
                )}
            </div>

            {canEdit && emptyStages.length > 0 && (
                <div className="ofi-ptk-emptystages">
                    <span className="ofi-ptk-emptystages__label">{t('productionTasks.template.emptyStages')}</span>
                    {emptyStages.map((stage) => (
                        <button
                            key={stage}
                            type="button"
                            className="ofi-ptk-stagechip ofi-nosize"
                            title={t('productionTasks.template.addToStage', { stage: t(stageLabelKey(stage)) })}
                            onClick={() => onAddTask(area, stage)}
                        >
                            <Plus aria-hidden />
                            {t(stageLabelKey(stage))}
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
};
