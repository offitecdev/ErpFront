import { useState, type FormEvent } from 'react';
import { ListChecks, Trash2 } from 'lucide-react';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { useBackDismiss } from '@/lib/backDismiss';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import type { AreaShares, ProductionTask, TaskArea, TaskStage } from '@/types/productionTasks';

import { AreaSwitch } from './AreaSwitch';
import { PeopleCell, type PersonNames } from './PeopleCell';
import {
    AREA_STAGES,
    formatPercent,
    overallOf,
    parsePercent,
    sameCode,
    stageLabelKey,
    TASK_LIMITS,
    twinStage,
} from './taskModel';

/** Die Stufe, wenn der Bereich wechselt: dieselbe Stelle im anderen Weg. */
const stageFor = (area: TaskArea, stage: TaskStage): TaskStage => twinStage(stage, area);

const weightText = (value: number): string => (Number.isFinite(value) ? String(value).replace('.', ',') : '');

/**
 * ── EINE AUFGABE DER VORLAGE (26.09.2026) ──────────────────────────────────
 *
 * Kürzel, Name, Bereich («bölüm ataması»), Stufe, Gewicht im Bereich und die
 * voreingestellten Personen («kişi ataması») — mehr nicht («sadece kişi
 * atamaları ve bölüm atamaları olması lazım»). Der Beitrag zur
 * Gesamtfertigstellung rechnet sich mit. «Tamam» ändert nur den Entwurf der
 * Vorlage; gespeichert wird oben mit «Kaydet».
 */
export const TaskEditDialog = ({
    task,
    isNew,
    otherCodes,
    areaShares,
    names,
    staff,
    staffLoading,
    onSave,
    onDelete,
    onClose,
}: {
    task: ProductionTask;
    isNew: boolean;
    /** Die Kürzel der ÜBRIGEN Aufgaben (Eindeutigkeit). */
    otherCodes: string[];
    areaShares: AreaShares;
    names: PersonNames;
    staff: StaffDirectoryRow[];
    staffLoading: boolean;
    onSave: (task: ProductionTask) => void;
    onDelete?: () => void;
    onClose: () => void;
}) => {
    useBackDismiss(true, onClose);
    const [code, setCode] = useState(task.code);
    const [name, setName] = useState(task.name);
    const [area, setArea] = useState<TaskArea>(task.area);
    const [stage, setStage] = useState<TaskStage>(task.stage);
    const [weight, setWeight] = useState(isNew && !task.weight ? '' : weightText(task.weight));
    const [assigneeIds, setAssigneeIds] = useState<string[]>(task.assigneeIds);
    const [tried, setTried] = useState(false);

    const parsedWeight = parsePercent(weight);
    const codeMissing = !code.trim();
    const codeTaken = !codeMissing && otherCodes.some((other) => sameCode(other, code.trim()));
    const nameMissing = !name.trim();
    const weightInvalid = parsedWeight === null;
    const valid = !codeMissing && !codeTaken && !nameMissing && !weightInvalid;

    const changeArea = (next: TaskArea) => {
        setArea(next);
        setStage((current) => stageFor(next, current));
    };

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        setTried(true);
        if (!valid || parsedWeight === null) return;
        onSave({
            ...task,
            code: code.trim(),
            name: name.replace(/\s+/g, ' ').trim(),
            area,
            stage,
            weight: parsedWeight,
            assigneeIds,
        });
    };

    const error = (show: boolean, key: string) =>
        (tried || show) && <span className="ofi-ptk-field__error" role="alert">{t(key)}</span>;

    return (
        <PopupDialog
            open
            onClose={onClose}
            title={isNew ? t('productionTasks.task.newTitle') : t('productionTasks.task.editTitle', { code: task.code })}
            subtitle={t('productionTasks.task.subtitle')}
            icon={<ListChecks size={18} />}
            width={560}
            footer={(
                <PopupActions
                    start={onDelete ? (
                        <PopupButton variant="danger" onClick={onDelete}>
                            <Trash2 size={14} />
                            {t('productionTasks.task.delete')}
                        </PopupButton>
                    ) : undefined}
                >
                    <PopupButton onClick={onClose}>{t('productionTasks.actions.cancel')}</PopupButton>
                    <PopupButton variant="primary" onClick={() => submit()}>
                        {isNew ? t('productionTasks.task.addButton') : t('productionTasks.actions.apply')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <form className="ofi-ptk-pop ofi-ptk-form" onSubmit={submit} noValidate>
                <div className="ofi-ptk-form__row is-code">
                    <label className="ofi-ptk-field">
                        <span className="ofi-ptk-field__label">{t('productionTasks.task.code')}</span>
                        <input
                            className={`ofi-ptk-input is-code ${(tried || codeTaken) && (codeMissing || codeTaken) ? 'is-invalid' : ''}`}
                            value={code}
                            maxLength={TASK_LIMITS.code}
                            spellCheck={false}
                            autoFocus={!isNew}
                            onChange={(event) => setCode(event.target.value.toLocaleUpperCase('tr-TR'))}
                        />
                        {codeTaken ? error(true, 'productionTasks.task.codeTaken') : codeMissing && error(false, 'productionTasks.task.codeMissing')}
                    </label>
                    <label className="ofi-ptk-field is-grow">
                        <span className="ofi-ptk-field__label">{t('productionTasks.task.name')}</span>
                        <input
                            className={`ofi-ptk-input ${tried && nameMissing ? 'is-invalid' : ''}`}
                            value={name}
                            maxLength={TASK_LIMITS.taskName}
                            autoFocus={isNew}
                            placeholder={t('productionTasks.task.namePlaceholder')}
                            onChange={(event) => setName(event.target.value)}
                        />
                        {nameMissing && error(false, 'productionTasks.task.nameMissing')}
                    </label>
                </div>

                <div className="ofi-ptk-field">
                    <span className="ofi-ptk-field__label">{t('productionTasks.task.area')}</span>
                    <AreaSwitch value={area} onChange={changeArea} shares={areaShares} />
                </div>

                <div className="ofi-ptk-form__row">
                    <label className="ofi-ptk-field is-grow">
                        <span className="ofi-ptk-field__label">{t('productionTasks.task.stage')}</span>
                        <select
                            className="ofi-ptk-input"
                            value={stage}
                            onChange={(event) => setStage(event.target.value as TaskStage)}
                        >
                            {AREA_STAGES[area].map((entry) => (
                                <option key={entry} value={entry}>{t(stageLabelKey(entry))}</option>
                            ))}
                        </select>
                    </label>
                    <label className="ofi-ptk-field is-weight">
                        <span className="ofi-ptk-field__label">{t('productionTasks.task.weight')}</span>
                        <span className={`ofi-ptk-percent ${tried && weightInvalid ? 'is-invalid' : ''}`}>
                            <input
                                className="ofi-ptk-input is-num"
                                value={weight}
                                inputMode="decimal"
                                placeholder="0"
                                onChange={(event) => setWeight(event.target.value)}
                            />
                            <span aria-hidden>%</span>
                        </span>
                        {weightInvalid && error(false, 'productionTasks.task.weightInvalid')}
                    </label>
                    <div className="ofi-ptk-field is-overall">
                        <span className="ofi-ptk-field__label">{t('productionTasks.task.overall')}</span>
                        <span className="ofi-ptk-readout" title={t('productionTasks.task.overallHint')}>
                            {parsedWeight === null ? '—' : formatPercent(overallOf(parsedWeight, areaShares[area]), true)}
                        </span>
                    </div>
                </div>

                <div className="ofi-ptk-field">
                    <span className="ofi-ptk-field__label">{t('productionTasks.task.people')}</span>
                    <PeopleCell
                        ids={assigneeIds}
                        names={names}
                        editable
                        staff={staff}
                        staffLoading={staffLoading}
                        onCommit={setAssigneeIds}
                    />
                    <span className="ofi-ptk-field__hint">{t('productionTasks.task.peopleHint')}</span>
                </div>
                {/* Enter im Feld übernimmt — wie «Tamam». */}
                <button type="submit" hidden aria-hidden tabIndex={-1} />
            </form>
        </PopupDialog>
    );
};
