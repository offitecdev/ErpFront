import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { MacSpinnerScreen } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { productionErrorOf, readProductionDeviceHeader } from '@/lib/api/production';
import { useBackTarget } from '@/lib/backNav';
import { hrefFor, isModifiedClick } from '@/lib/navLink';
import { useStaffDirectory } from '@/pages/crm/hooks/useStaffDirectory';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useAuthStore } from '@/store/authStore';
import { useNavGuardStore } from '@/store/navGuardStore';
import type { ProductionDeviceHeader } from '@/types/production';
import type { TaskArea, TaskPerson } from '@/types/productionTasks';
import '@/styles/modules/production.css';
import '@/styles/modules/productionDevice.css';
import '@/styles/modules/productionTasks.css';

import { areaFromParam, areaParam, staffName } from '../tasks/taskModel';
import { AreaSelect } from './AreaSelect';
import { DeviceHeader } from './DeviceHeader';
import { DeviceProcessBar } from './DeviceProcessBar';
import { DeviceStagePanel } from './DeviceStagePanel';
import { deviceStageFrom, visibleDeviceStages, type DeviceStageId } from './deviceStages';
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
 * an `isDeviceFocusPath`). Der Kopf lädt nur das gewählte Gerät. Der Kreisel
 * verschwindet, sobald diese Daten da sind.
 *
 * Die Stufe steht in der Adresse (`?stage=`); der Anfang braucht keinen
 * Parameter. Stufenwechsel ersetzen den Verlaufseintrag — «zurück» (der
 * hellblaue Knopf oben in der Leiste, RailBackButton) verlässt das Gerät,
 * statt durch die Stufen zu laufen.
 */

export const ProductionDevicePage = () => {
    useLanguageTick();
    const { projectId = '', deviceId = '' } = useParams<{ projectId: string; deviceId: string }>();
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const back = useBackTarget();
    const isAdmin = useAuthStore((state) => state.isSystemAdmin);
    const meId = useAuthStore((state) => state.user?.id ?? null);
    const [data, setData] = useState<ProductionDeviceHeader | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => readProductionDeviceHeader(
        projectId, deviceId,
        (value) => { setData(value); setError(null); },
        (failure) => setError(productionErrorOf(failure).message || t('production.loadFailed')),
    ), [projectId, deviceId]);

    /* Görevlendirme (26.09.2026): die Aufgaben des Geräts und — für die
       Administratorrolle — das Personalverzeichnis der Auswahl. */
    const tasks = useDeviceTasks(deviceId);
    const { staff, loading: staffLoading } = useStaffDirectory(isAdmin);

    /* Bereich und Stufe stehen in der Adresse (`?area=electrical&stage=…`);
       ohne Angabe gilt die Mekanik und ihre erste Stufe. */
    const area = areaFromParam(params.get('area'));
    const stages = useMemo(() => visibleDeviceStages(isAdmin, area), [isAdmin, area]);
    const stage = deviceStageFrom(params.get('stage'), stages, area);
    const writeParams = (nextArea: TaskArea, nextStage: DeviceStageId, nextStages = stages) =>
        setParams(() => {
            const query = new URLSearchParams();
            if (nextArea === 'ELECTRICAL') query.set('area', areaParam(nextArea));
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
    const select = (id: DeviceStageId) => guarded(() => writeParams(area, id));
    // Beim Wechsel des Bereichs bleibt die Stelle des Weges («Cihaz seçimi» ↔ «Devre tasarımı»).
    const selectArea = (next: TaskArea) => guarded(() => {
        const nextStages = visibleDeviceStages(isAdmin, next);
        writeParams(next, deviceStageFrom(stage.id, nextStages, next).id, nextStages);
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
        if (!meId) return stagesWithMine;
        for (const task of tasks.data?.tasks ?? []) {
            if (task.area === area && task.assigneeIds.includes(meId)) stagesWithMine.add(task.stage);
        }
        return stagesWithMine;
    }, [tasks.data?.tasks, meId, area]);

    // Zurück zum Projekt: kam man eben von dort, ist es ein echter
    // Verlaufsschritt (die Karten stehen dann wieder an ihrer Stelle).
    const projectPath = `/production/orders/${projectId}`;
    const openProject = () => guarded(() => {
        if (back?.to === projectPath && back.historyStep) navigate(-1);
        else navigate(projectPath);
    });

    const shown = data && data.project.id === projectId && data.device.id === deviceId ? data : null;
    const device = shown?.device ?? null;

    // Derselbe Kreisel an derselben Stelle wie der Platzhalter der Route.
    if (!shown && !error) return <MacSpinnerScreen />;

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

    return (
        <div className="ofi-prod-page ofi-pdev-page">
            <DeviceHeader
                device={device}
                project={shown.project}
                projectPath={projectPath}
                onOpenProject={openProject}
                control={<AreaSelect value={area} onChange={selectArea} shares={tasks.data?.plan?.areaShares ?? null} />}
            />
            <DeviceProcessBar stages={stages} current={stage.id} onSelect={select} mine={mine} />
            <DeviceStagePanel
                key={`${area}:${stage.id}`}
                deviceId={deviceId}
                stage={stage}
                stages={stages}
                area={area}
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
