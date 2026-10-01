import type { StaffDirectoryRow } from '@/lib/api/directory';
import type { TaskSection } from '@/types/productionTasks';

import type { PersonNames } from '../tasks/PeopleCell';
import { DeviceBomArea, type BomTasksBundle } from '../bom/device/DeviceBomArea';
import type { ComponentProps } from 'react';

import { StageCard } from '../tasks/StageCard';
import type { SubtaskActions } from '../tasks/subtaskFileModel';
import { isBuiltInArea, sectionLabel, stageLabel } from '../tasks/taskModel';
import { DeviceAssignmentBoard } from './DeviceAssignmentBoard';
import { isWorkStage, stageNumber, type DeviceStage } from './deviceStages';
import { StageTasksFloat } from './StageTasksFloat';
import type { DeviceTasksHandle } from './useDeviceTasks';

type StageCardProps = ComponentProps<typeof StageCard>;

type Props = {
    /** Das Gerät (uretim_proje_kalemleri.id) — die Stufe BOM liest seine BOMs. */
    deviceId: string;
    stage: DeviceStage;
    stages: DeviceStage[];
    /** Der gewählte Weg: ein Bereich der geladenen Vorlage (oder Mekanik/Elektrik). */
    section: TaskSection;
    handle: DeviceTasksHandle;
    names: PersonNames;
    isAdmin: boolean;
    meId: string | null;
    staff: StaffDirectoryRow[];
    staffLoading: boolean;
    /** Diese Unteraufgabe gleich zeigen (30.09.2026, «Go to subtask» von der Startseite). */
    focusSubtaskId?: string | null;
};

/**
 * ── DIE FLÄCHE EINER STUFE (24.09.2026, 26.09.2026) ─────────────────────────
 *
 * Vorgabe Samet: «büyük bir alan olması lazım tüm içerikler için» — ohne
 * Kopf, ohne Hinweis, ohne Rahmen («direkt orası boş olsun»).
 *
 * Seit der Görevlendirme (26.09.2026) steht darin:
 *   · auf «Görevlendirmeler» (nur Administratorrolle) die Tafel mit allen
 *     Karten des Bereichs und «Şablondan yükle»,
 *   · auf jeder anderen Stufe oben links ein kleines GLASPLÄTTCHEN mit ihren
 *     Aufgaben (27.09.2026: «küçük kart, tıklanıp açılıp X ile kapanmalı,
 *     sağa sola doğru açılmalı, içeriğin önüne geçmeli ama pop-up değil») —
 *     nur, wenn an dieser Stufe Aufgaben hängen. Es liegt ÜBER der Fläche;
 *     der Inhalt der Stufe folgt Schritt für Schritt darunter.
 * Die BOM-Liste gibt es nur auf der Stufe BOM der festen Bereiche Mekanik /
 * Elektrik — ein eigener Bereich einer Vorlage (28.09.2026) hat keine.
 */
export const DeviceStagePanel = ({ deviceId, stage, stages, section, handle, names, isAdmin, meId, staff, staffLoading, focusSubtaskId = null }: Props) => {
    const plan = handle.data?.plan ?? null;
    const workStage = isWorkStage(stage.id) ? section.stages.find((entry) => entry.key === stage.id) ?? null : null;
    const tasks = workStage && handle.data
        ? handle.data.tasks.filter((task) => task.area === section.key && task.stage === workStage.key)
        : [];
    // Personen setzt die Verwaltung an den Unteraufgaben (29.09.2026) — auf der Tafel und seit dem 30.09.2026 auch hier.
    // Den Stand setzt nur, wer an der Unteraufgabe steht — die Verwaltung nicht von Hand (29.09.2026).
    const canSetStatus: StageCardProps['canSetStatus'] = (task, subtask) =>
        Boolean(meId && (subtask ?? task).assigneeIds.includes(meId));
    const onStatus = (task: (typeof tasks)[number], status: (typeof tasks)[number]['status']) => void handle.setStatus(task, status);
    const onSubtaskStatus: StageCardProps['onSubtaskStatus'] = (task, subtask, status) => void handle.setSubtaskStatus(task, subtask, status);
    /* Personen der Unteraufgaben auch auf den Stufen (30.09.2026: «the admin should be able to
       assign people to subtasks or change the assigned people on the stage pages») — nur die
       Verwaltung, wie auf der Tafel der Zuweisungen; der Server sichert es ebenso. */
    const onAssignSubtask: StageCardProps['onAssignSubtask'] = isAdmin
        ? (task, subtask, ids) => void handle.assignSubtask(
            task,
            subtask,
            ids,
            ids.map((id) => names.get(id)).filter((person): person is NonNullable<typeof person> => Boolean(person)),
        )
        : undefined;
    // Dateien und «Complete the task» der Unteraufgaben (28.09.2026).
    const subtaskActions: SubtaskActions = {
        isAdmin,
        meId,
        deviceName: handle.data?.device.name ?? '',
        upload: handle.uploadSubtaskFile,
        removeFile: handle.removeSubtaskFile,
        openFile: handle.openSubtaskFile,
        loadFile: handle.loadSubtaskFile,
        complete: handle.completeSubtask,
        requestRevision: handle.requestSubtaskRevision,
        unlock: handle.unlockSubtask,
        // Wer nicht die Verwaltung ist, bittet um das Entsperren (30.09.2026).
        requestUnlock: isAdmin ? undefined : handle.requestUnlock,
        setStatus: handle.setSubtaskStatus,
        addChecklistItem: handle.addChecklistItem,
    };
    /* Der Name einer Stufe für den Verlauf (30.09.2026): in einem anderen Bereich mit dessen Namen davor. */
    const stageNameOf = (areaKey: string | null, stageKey: string | null): string => {
        const owner = plan?.sections.find((entry) => entry.key === areaKey) ?? null;
        const found = owner?.stages.find((entry) => entry.key === stageKey) ?? null;
        const name = found ? stageLabel(found) : stageKey || '—';
        return owner && owner.key !== section.key ? `${sectionLabel(owner)} · ${name}` : name;
    };
    const bomArea = stage.id === 'bom' && isBuiltInArea(section.key) ? section.key : null;
    /* Stufe BOM (27.09.2026, Samet: «görevler artık bir buton halinde bulunsun,
       BOM liste diyor ya orada … aynı yerde ileri geri»): keine Glaskarte —
       die Karte der Stufe steht hinter einem Knopf der BOM-Liste. */
    const bomTasks: BomTasksBundle | null = bomArea && workStage && plan && tasks.length > 0
        ? {
            count: tasks.length,
            mine: meId ? tasks.filter((task) => task.assigneeIds.includes(meId)).length : 0,
            card: (
                <StageCard
                    area={section.key}
                    stage={workStage}
                    number={stageNumber(stages, workStage.key)}
                    tasks={tasks}
                    share={section.share}
                    names={names}
                    mode="device"
                    editable={isAdmin}
                    staff={staff}
                    staffLoading={staffLoading}
                    meId={meId}
                    busyTaskId={handle.busyTaskId}
                    onStatus={onStatus}
                    onSubtaskStatus={onSubtaskStatus}
                    onAssignSubtask={onAssignSubtask}
                    canSetStatus={canSetStatus}
                    subtaskActions={subtaskActions}
                />
            ),
        }
        : null;

    return (
        <section
            id="ofi-pdev-panel"
            className="ofi-pdev-panel"
            role="tabpanel"
            aria-labelledby={`ofi-pdev-tab-${stage.id}`}
            data-stage={stage.id}
        >
            {stage.id === 'assignments' && isAdmin && (
                <DeviceAssignmentBoard
                    section={section}
                    stages={stages}
                    handle={handle}
                    names={names}
                    staff={staff}
                    staffLoading={staffLoading}
                    meId={meId}
                />
            )}
            {/* BOM (27.09.2026): die BOM-Liste des Geräts im Bereich — ein
                Navigationsstapel unter der Glaskarte der Aufgaben. */}
            {bomArea && <DeviceBomArea deviceId={deviceId} area={bomArea} tasks={bomTasks} />}
            {workStage && plan && tasks.length > 0 && !bomArea && (
                <StageTasksFloat
                    focusSubtaskId={focusSubtaskId}
                    deviceId={deviceId}
                    revision={handle.revision}
                    stageNameOf={stageNameOf}
                    area={section.key}
                    stage={workStage}
                    number={stage.finish ? null : stageNumber(stages, workStage.key)}
                    tasks={tasks}
                    share={section.share}
                    names={names}
                    editable={isAdmin}
                    staff={staff}
                    staffLoading={staffLoading}
                    meId={meId}
                    busyTaskId={handle.busyTaskId}
                    onStatus={onStatus}
                    onSubtaskStatus={onSubtaskStatus}
                    onAssignSubtask={onAssignSubtask}
                    canSetStatus={canSetStatus}
                    subtaskActions={subtaskActions}
                />
            )}
        </section>
    );
};
