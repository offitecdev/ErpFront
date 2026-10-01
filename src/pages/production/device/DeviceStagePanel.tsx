import type { StaffDirectoryRow } from '@/lib/api/directory';
import type { TaskArea } from '@/types/productionTasks';

import type { PersonNames } from '../tasks/PeopleCell';
import { DeviceBomArea, type BomTasksBundle } from '../bom/device/DeviceBomArea';
import { StageCard } from '../tasks/StageCard';
import { DeviceAssignmentBoard } from './DeviceAssignmentBoard';
import { isWorkStage, stageNumber, type DeviceStage } from './deviceStages';
import { StageTasksFloat } from './StageTasksFloat';
import type { DeviceTasksHandle } from './useDeviceTasks';

type Props = {
    /** Das Gerät (uretim_proje_kalemleri.id) — die Stufe BOM liest seine BOMs. */
    deviceId: string;
    stage: DeviceStage;
    stages: DeviceStage[];
    area: TaskArea;
    handle: DeviceTasksHandle;
    names: PersonNames;
    isAdmin: boolean;
    meId: string | null;
    staff: StaffDirectoryRow[];
    staffLoading: boolean;
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
 */
export const DeviceStagePanel = ({ deviceId, stage, stages, area, handle, names, isAdmin, meId, staff, staffLoading }: Props) => {
    const plan = handle.data?.plan ?? null;
    const workStage = isWorkStage(stage.id) ? stage.id : null;
    const tasks = workStage && handle.data
        ? handle.data.tasks.filter((task) => task.area === area && task.stage === workStage)
        : [];
    const onAssign = isAdmin
        ? (task: (typeof tasks)[number], ids: string[]) => void handle.assign(task, ids, ids.flatMap((id) => {
            const person = names.get(id);
            return person ? [person] : [];
        }))
        : undefined;
    /* Stufe BOM (27.09.2026, Samet: «görevler artık bir buton halinde bulunsun,
       BOM liste diyor ya orada … aynı yerde ileri geri»): keine Glaskarte —
       die Karte der Stufe steht hinter einem Knopf der BOM-Liste. */
    const bomTasks: BomTasksBundle | null = stage.id === 'bom' && workStage && plan && tasks.length > 0
        ? {
            count: tasks.length,
            mine: meId ? tasks.filter((task) => task.assigneeIds.includes(meId)).length : 0,
            card: (
                <StageCard
                    area={area}
                    stage={workStage}
                    number={stageNumber(stages, workStage)}
                    tasks={tasks}
                    share={plan.areaShares[area]}
                    names={names}
                    mode="device"
                    editable={isAdmin}
                    staff={staff}
                    staffLoading={staffLoading}
                    meId={meId}
                    busyTaskId={handle.busyTaskId}
                    onAssign={onAssign}
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
                    area={area}
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
            {stage.id === 'bom' && <DeviceBomArea key={`${deviceId}:${area}`} deviceId={deviceId} area={area} tasks={bomTasks} />}
            {workStage && plan && tasks.length > 0 && stage.id !== 'bom' && (
                <StageTasksFloat
                    area={area}
                    stage={workStage}
                    number={workStage === 'final' ? null : stageNumber(stages, workStage)}
                    tasks={tasks}
                    share={plan.areaShares[area]}
                    names={names}
                    editable={isAdmin}
                    staff={staff}
                    staffLoading={staffLoading}
                    meId={meId}
                    busyTaskId={handle.busyTaskId}
                    onAssign={onAssign}
                />
            )}
        </section>
    );
};
