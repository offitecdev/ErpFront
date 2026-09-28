import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ListChecks } from 'lucide-react';

import { MacSpinnerScreen } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { productionErrorOf, readProductionDevices } from '@/lib/api/production';
import { useBackTarget } from '@/lib/backNav';
import { hrefFor, isModifiedClick } from '@/lib/navLink';
import { useStaffDirectory } from '@/pages/crm/hooks/useStaffDirectory';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useAuthStore } from '@/store/authStore';
import { useNavGuardStore } from '@/store/navGuardStore';
import type { ProductionProjectDevices } from '@/types/production';
import type { TaskArea, TaskPerson } from '@/types/productionTasks';
import '@/styles/modules/production.css';
import '@/styles/modules/productionDevice.css';
import '@/styles/modules/productionTasks.css';

import { areaFromParam, areaParam, checkTemplate, pendingApprovals, staffName } from '../tasks/taskModel';
import { AreaSelect } from './AreaSelect';
import { DeviceAssignmentBoard } from './DeviceAssignmentBoard';
import { DeviceHeader } from './DeviceHeader';
import { DeviceProcessBar } from './DeviceProcessBar';
import { DeviceStagePanel } from './DeviceStagePanel';
import { deviceStageFrom, routeSections, visibleDeviceStages, type DeviceStageId } from './deviceStages';
import { useDeviceTasks } from './useDeviceTasks';

/**
 * ── DIE GERÄTESEITE DER PRODUKTION (24.09.2026) ─────────────────────────────
 *
 * Vorgabe Samet: «her cihaz kartına basınca yeni sayfa yüklenecek — aynı
 * pencerede, yükleniyor olacak, Apple macOS loading'i, ama hızlı açılsın …
 * ürünün ismi üstte, hemen altında ince bir süreç, macOS tab gibi … büyük bir
 * alan olması lazım tüm içerikler için.»
 *
 * Die Seite hat ihren EIGENEN RAHMEN: keine Kopfleiste, eine schmale
 * Modulleiste mit Glocke, Sprache und Profil (MainLayout erkennt die Adresse
 * an `isDeviceFocusPath`). Beim Öffnen steht kurz der Mac-Kreisel — die Daten
 * kommen meist schon aus dem Speicher der Projektseite, er bleibt trotzdem
 * einen Augenblick stehen, damit das Laden als Laden zu sehen ist.
 *
 * Die Stufe steht in der Adresse (`?stage=`); der Anfang braucht keinen
 * Parameter. Stufenwechsel ersetzen den Verlaufseintrag — «zurück» (der
 * hellblaue Knopf oben in der Leiste, RailBackButton) verlässt das Gerät,
 * statt durch die Stufen zu laufen.
 */

/** So lange steht der Kreisel mindestens: kurz, aber als Laden erkennbar. */
const LOADING_MIN_MS = 420;

const useMinimumWait = (key: string, ms: number): boolean => {
    const [doneFor, setDoneFor] = useState<string | null>(null);
    useEffect(() => {
        const timer = window.setTimeout(() => setDoneFor(key), ms);
        return () => window.clearTimeout(timer);
    }, [key, ms]);
    return doneFor === key;
};

export const ProductionDevicePage = () => {
    useLanguageTick();
    const { projectId = '', deviceId = '' } = useParams<{ projectId: string; deviceId: string }>();
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const back = useBackTarget();
    const isAdmin = useAuthStore((state) => state.isSystemAdmin);
    const meId = useAuthStore((state) => state.user?.id ?? null);
    const [data, setData] = useState<ProductionProjectDevices | null>(null);
    const [error, setError] = useState<string | null>(null);
    const waited = useMinimumWait(deviceId, LOADING_MIN_MS);

    useEffect(() => readProductionDevices(
        projectId,
        (value) => { setData(value); setError(null); },
        (failure) => setError(productionErrorOf(failure).message || t('production.loadFailed')),
    ), [projectId]);

    /* Görevlendirme (26.09.2026): die Aufgaben des Geräts und — für die
       Administratorrolle — das Personalverzeichnis der Auswahl. */
    const tasks = useDeviceTasks(deviceId);
    const { staff, loading: staffLoading } = useStaffDirectory(isAdmin);

    /* Die Wege: die Bereiche der geladenen Vorlage (28.09.2026) — ohne Vorlage
       keine Leiste, nur «Şablondan yükle». Bereich und Stufe stehen in der
       Adresse (`?area=electrical&stage=…`, ein eigener Bereich mit seiner
       Kennung); ohne Angabe gilt der erste Weg und seine erste Stufe. */
    const plan = tasks.data?.plan ?? null;
    const sections = useMemo(() => routeSections(plan), [plan]);
    const area = areaFromParam(params.get('area'), sections);
    const section = sections.find((entry) => entry.key === area) ?? sections[0] ?? null;
    const stages = useMemo(() => (section ? visibleDeviceStages(isAdmin, section) : []), [isAdmin, section]);
    const requested = section && stages.length ? deviceStageFrom(params.get('stage'), stages, section) : null;
    /* Die 100-%-Regel am Gerät (28.09.2026): passt die Verwaltung Gewichte an und
       geht die Kopie nicht mehr auf, bleibt sie in den Zuweisungen, bis sie wieder
       aufgeht — «they shouldn't be allowed to move to the stage tabs». */
    const planCheck = useMemo(
        () => (plan ? checkTemplate(plan.sections, tasks.data?.tasks ?? []) : null),
        [plan, tasks.data?.tasks],
    );
    const planBroken = isAdmin && Boolean(planCheck && !planCheck.valid);
    const assignmentsStage = stages.find((entry) => entry.id === 'assignments') ?? null;
    const stage = planBroken && assignmentsStage ? assignmentsStage : requested;
    const lockedStages = useMemo(
        () => new Set<DeviceStageId>(planBroken ? stages.filter((entry) => entry.id !== 'assignments').map((entry) => entry.id) : []),
        [planBroken, stages],
    );
    const writeParams = (nextArea: TaskArea, nextStage: DeviceStageId, nextStages = stages) =>
        setParams(() => {
            const query = new URLSearchParams();
            if (nextArea !== sections[0]?.key) query.set('area', areaParam(nextArea));
            if (nextStage !== nextStages[0].id) query.set('stage', nextStage);
            return query;
        }, { replace: true });
    /* Stufe und Bereich wechseln durch die Wache ungespeicherter Änderungen
       (27.09.2026, BOM: «başka aşamaya geçerken kaydedilmemiş değişiklikler var
       demesi lazım») — ohne offene Änderungen geht es sofort. */
    const guarded = (go: () => void) => {
        const { attempt } = useNavGuardStore.getState();
        if (attempt) attempt(go);
        else go();
    };
    const select = (id: DeviceStageId) => {
        if (lockedStages.has(id)) return;
        guarded(() => { if (section) writeParams(section.key, id); });
    };
    // Beim Wechsel des Bereichs bleibt die Stelle des Weges («Cihaz seçimi» ↔ «Devre tasarımı»).
    const selectArea = (next: TaskArea) => guarded(() => {
        const nextSection = sections.find((entry) => entry.key === next) ?? sections[0];
        if (!nextSection) return;
        const nextStages = visibleDeviceStages(isAdmin, nextSection);
        writeParams(nextSection.key, deviceStageFrom(stage?.id ?? null, nextStages, nextSection).id, nextStages);
    });

    /* Namen der Personen: die des Servers zuerst (mit «ausgetreten»), dann das Verzeichnis. */
    const names = useMemo(() => {
        const map = new Map<string, TaskPerson>();
        for (const person of tasks.data?.people ?? []) map.set(person.id, person);
        for (const row of staff) {
            if (!map.has(row.id)) map.set(row.id, { id: row.id, name: staffName(row) || row.email || row.id, active: true });
        }
        return map;
    }, [tasks.data?.people, staff]);

    /* Wo die lesende Person selbst Aufgaben hat — ein blauer Punkt in der Leiste. */
    const mine = useMemo(() => {
        const stagesWithMine = new Set<DeviceStageId>();
        if (!meId || !section) return stagesWithMine;
        for (const task of tasks.data?.tasks ?? []) {
            if (task.area === section.key && task.assigneeIds.includes(meId)) stagesWithMine.add(task.stage);
        }
        return stagesWithMine;
    }, [tasks.data?.tasks, meId, section]);

    /* Wartet auf Freigabe: je Stufe die Unteraufgaben im Stand PENDING — neben dem Namen in der Leiste. */
    const pendingStages = useMemo(() => {
        const result = new Map<DeviceStageId, number>();
        if (!section) return result;
        for (const task of tasks.data?.tasks ?? []) {
            if (task.area !== section.key) continue;
            const count = pendingApprovals([task]);
            if (count) result.set(task.stage, (result.get(task.stage) ?? 0) + count);
        }
        return result;
    }, [tasks.data?.tasks, section]);

    /* Erledigte Stufen des Weges: alle ihre Aufgaben erledigt — grüner Kreis mit Haken in der Leiste. */
    const doneStages = useMemo(() => {
        const result = new Set<DeviceStageId>();
        if (!section) return result;
        for (const entry of section.stages) {
            const own = (tasks.data?.tasks ?? []).filter((task) => task.area === section.key && task.stage === entry.key);
            if (own.length && own.every((task) => task.status === 'DONE')) result.add(entry.key);
        }
        return result;
    }, [tasks.data?.tasks, section]);

    // Zurück zum Projekt: kam man eben von dort, ist es ein echter
    // Verlaufsschritt (die Karten stehen dann wieder an ihrer Stelle).
    const projectPath = `/production/orders/${projectId}`;
    const openProject = () => guarded(() => {
        if (back?.to === projectPath && back.historyStep) navigate(-1);
        else navigate(projectPath);
    });

    const shown = data && data.project.id === projectId ? data : null;
    const device = shown?.devices.find((row) => row.id === deviceId) ?? null;

    // Derselbe Kreisel an derselben Stelle wie der Platzhalter der Route —
    // auch bis die Aufgaben da sind: ihre Vorlage bestimmt den Weg.
    if (!waited || (!shown && !error) || tasks.loading) return <MacSpinnerScreen />;

    if (!shown || !device) {
        const toProject = (event: MouseEvent<HTMLAnchorElement>) => {
            if (isModifiedClick(event)) return;
            event.preventDefault();
            openProject();
        };
        return (
            <div className="ofi-prod-page ofi-pdev-page">
                <div className="ofi-prod-note is-warn">{error || t('production.devicePage.notFound')}</div>
                <a className="ofi-pdev-missing" href={hrefFor(projectPath)} onClick={toProject}>
                    {t('production.devicePage.openProject')}
                </a>
            </div>
        );
    }

    // Ohne Vorlage kein Weg: kein Aufklappmenü, keine Leiste — die Verwaltung
    // lädt eine Vorlage, alle anderen sehen, dass noch keine da ist.
    if (!section || !stage) {
        return (
            <div className="ofi-prod-page ofi-pdev-page">
                <DeviceHeader device={device} project={shown.project} projectPath={projectPath} onOpenProject={openProject} />
                <section id="ofi-pdev-panel" className="ofi-pdev-panel">
                    {isAdmin ? (
                        <DeviceAssignmentBoard
                            section={null}
                            stages={[]}
                            handle={tasks}
                            names={names}
                            staff={staff}
                            staffLoading={staffLoading}
                            meId={meId}
                        />
                    ) : (
                        <div className="ofi-ptk ofi-ptk-board">
                            <div className="ofi-ptk-state is-board">
                                <span className="ofi-ptk-state__icon"><ListChecks aria-hidden /></span>
                                <b>{t('productionTasks.device.emptyTitle')}</b>
                                <span>{t('productionTasks.device.emptyViewerText')}</span>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        );
    }

    return (
        <div className="ofi-prod-page ofi-pdev-page">
            <DeviceHeader
                device={device}
                project={shown.project}
                projectPath={projectPath}
                onOpenProject={openProject}
                control={<AreaSelect sections={sections} value={section.key} onChange={selectArea} showShares />}
            />
            <DeviceProcessBar
                stages={stages}
                current={stage.id}
                onSelect={select}
                mine={mine}
                done={doneStages}
                pending={pendingStages}
                locked={lockedStages}
                lockedHint={t('productionTasks.device.stagesLocked')}
            />
            <DeviceStagePanel
                key={`${section.key}:${stage.id}`}
                deviceId={deviceId}
                stage={stage}
                stages={stages}
                section={section}
                handle={tasks}
                names={names}
                isAdmin={isAdmin}
                meId={meId}
                staff={staff}
                staffLoading={staffLoading}
            />
        </div>
    );
};
