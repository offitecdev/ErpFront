import { Plus, X } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import type { ProductionTask, TaskArea, TaskStage } from '@/types/productionTasks';

import { FlagGlyph } from '../device/deviceGlyphs';
import { PeopleCell, type PersonNames } from './PeopleCell';
import { formatPercent, overallOf, roundPercent, stageLabelKey } from './taskModel';

type Mode = 'template' | 'device';

/**
 * ── DIE GÖREVLENDİRME-KARTE EINER STUFE (26.09.2026, Vorgabe Samet) ────────
 *
 * «Her aşamada büyük olmayacak şekilde görevlendirme kartı olması lazım.»
 *
 * Eine kleine Karte je Stufe: oben Nummer (bzw. die Fahne beim Abschluss),
 * Name und Gewicht der Stufe (Summe ihrer Aufgaben im Bereich, dahinter der
 * Beitrag zur Gesamtfertigstellung), darunter je Aufgabe EINE Zeile —
 * Kürzel, Name, Gewicht («her bir görevin yüzdesi yanında»), die Personen.
 *
 *   template  in der Vorlage: ein Klick auf die Aufgabe öffnet sie,
 *             die Spalte «genel» zeigt den Beitrag, unten «+ Görev ekle»
 *   device    am Gerät: nur die Personen sind zu setzen (Administratorrolle);
 *             eigene Aufgaben der lesenden Person tragen ein blaues Zeichen
 */
export const StageCard = ({
    area,
    stage,
    number,
    tasks,
    share,
    names,
    mode,
    editable,
    staff,
    staffLoading,
    meId,
    busyTaskId,
    onAssign,
    onOpenTask,
    onAddTask,
    onClose,
}: {
    area: TaskArea;
    stage: TaskStage;
    /** Die Nummer der Stufe in der Prozessleiste (leer bei der Fahne). */
    number: number | null;
    tasks: ProductionTask[];
    /** Anteil des Bereichs an der Gesamtfertigstellung. */
    share: number;
    names: PersonNames;
    mode: Mode;
    editable: boolean;
    staff: StaffDirectoryRow[];
    staffLoading: boolean;
    meId?: string | null;
    busyTaskId?: string | null;
    onAssign?: (task: ProductionTask, assigneeIds: string[]) => void;
    onOpenTask?: (task: ProductionTask) => void;
    onAddTask?: (area: TaskArea, stage: TaskStage) => void;
    /** Mit ✕ im Kopf — die aufgeklappte Glaskarte der Stufen (27.09.2026). */
    onClose?: () => void;
}) => {
    const weight = roundPercent(tasks.reduce((sum, task) => sum + task.weight, 0));
    const stageName = t(stageLabelKey(stage));
    const isFinish = stage === 'final';

    return (
        <section className={`ofi-ptk-card ${tasks.length ? '' : 'is-empty'}`} aria-label={stageName} data-stage={stage}>
            <header className="ofi-ptk-card__head">
                <span className={`ofi-ptk-stagenum ${isFinish ? 'is-flag' : ''}`} aria-hidden>
                    {isFinish ? <FlagGlyph size={11} strokeWidth={2} /> : number}
                </span>
                <h3 className="ofi-ptk-card__title">{stageName}</h3>
                {tasks.length > 0 && (
                    <span
                        className="ofi-ptk-card__sum"
                        title={t('productionTasks.stage.sumHint', {
                            weight: formatPercent(weight),
                            overall: formatPercent(overallOf(weight, share), true),
                        })}
                    >
                        <b>{formatPercent(weight)}</b>
                        <small>{t('productionTasks.overallShort', { value: formatPercent(overallOf(weight, share), true) })}</small>
                    </span>
                )}
                {onClose && (
                    <button
                        type="button"
                        className="ofi-ptk-card__close ofi-nosize"
                        aria-label={t('productionTasks.stageFloat.close')}
                        title={t('productionTasks.stageFloat.close')}
                        onClick={onClose}
                    >
                        <X aria-hidden />
                    </button>
                )}
            </header>

            {tasks.length ? (
                <ul className={`ofi-ptk-card__list is-${mode}`}>
                    {tasks.map((task) => {
                        const mine = Boolean(meId && task.assigneeIds.includes(meId));
                        const overall = formatPercent(overallOf(task.weight, share), true);
                        const main = (
                            <>
                                <span className="ofi-ptk-code">{task.code}</span>
                                <span className="ofi-ptk-task__name" title={task.name}>{task.name}</span>
                                {mine && <span className="ofi-ptk-mine" title={t('productionTasks.people.mine')}>{t('productionTasks.people.meShort')}</span>}
                            </>
                        );
                        return (
                            <li key={task.id} className={`ofi-ptk-task ${mine ? 'is-mine' : ''}`}>
                                {mode === 'template' && editable && onOpenTask ? (
                                    <button
                                        type="button"
                                        className="ofi-ptk-task__main is-button ofi-nosize"
                                        title={t('productionTasks.task.edit')}
                                        onClick={() => onOpenTask(task)}
                                    >
                                        {main}
                                    </button>
                                ) : (
                                    <span className="ofi-ptk-task__main">{main}</span>
                                )}
                                <span
                                    className="ofi-ptk-weight"
                                    title={t('productionTasks.task.weightHint', { weight: formatPercent(task.weight), overall })}
                                >
                                    {formatPercent(task.weight)}
                                </span>
                                {mode === 'template' && <span className="ofi-ptk-overall">{overall}</span>}
                                <PeopleCell
                                    ids={task.assigneeIds}
                                    names={names}
                                    editable={editable && Boolean(onAssign)}
                                    staff={staff}
                                    staffLoading={staffLoading}
                                    meId={meId}
                                    busy={busyTaskId === task.id}
                                    onCommit={onAssign ? (next) => onAssign(task, next) : undefined}
                                />
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="ofi-ptk-card__empty">{t('productionTasks.stage.noTasks')}</p>
            )}

            {mode === 'template' && editable && onAddTask && (
                <button type="button" className="ofi-ptk-addtask ofi-nosize" onClick={() => onAddTask(area, stage)}>
                    <Plus aria-hidden />
                    {t('productionTasks.task.add')}
                </button>
            )}
        </section>
    );
};
