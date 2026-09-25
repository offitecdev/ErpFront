import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { MacSpinnerScreen } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { productionErrorOf, readProductionDevices } from '@/lib/api/production';
import { useBackTarget } from '@/lib/backNav';
import { hrefFor, isModifiedClick } from '@/lib/navLink';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useAuthStore } from '@/store/authStore';
import type { ProductionProjectDevices } from '@/types/production';
import '@/styles/modules/production.css';
import '@/styles/modules/productionDevice.css';

import { DeviceHeader } from './DeviceHeader';
import { DeviceProcessBar } from './DeviceProcessBar';
import { DeviceStagePanel } from './DeviceStagePanel';
import { deviceStageFrom, visibleDeviceStages, type DeviceStageId } from './deviceStages';

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
    const [data, setData] = useState<ProductionProjectDevices | null>(null);
    const [error, setError] = useState<string | null>(null);
    const waited = useMinimumWait(deviceId, LOADING_MIN_MS);

    useEffect(() => readProductionDevices(
        projectId,
        (value) => { setData(value); setError(null); },
        (failure) => setError(productionErrorOf(failure).message || t('production.loadFailed')),
    ), [projectId]);

    const stages = useMemo(() => visibleDeviceStages(isAdmin), [isAdmin]);
    const stage = deviceStageFrom(params.get('stage'), stages);
    const select = (id: DeviceStageId) =>
        setParams(id === stages[0].id ? {} : { stage: id }, { replace: true });

    // Zurück zum Projekt: kam man eben von dort, ist es ein echter
    // Verlaufsschritt (die Karten stehen dann wieder an ihrer Stelle).
    const projectPath = `/production/orders/${projectId}`;
    const openProject = () => {
        if (back?.to === projectPath && back.historyStep) navigate(-1);
        else navigate(projectPath);
    };

    const shown = data && data.project.id === projectId ? data : null;
    const device = shown?.devices.find((row) => row.id === deviceId) ?? null;

    // Derselbe Kreisel an derselben Stelle wie der Platzhalter der Route.
    if (!waited || (!shown && !error)) return <MacSpinnerScreen />;

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
            <DeviceHeader device={device} project={shown.project} projectPath={projectPath} onOpenProject={openProject} />
            <DeviceProcessBar stages={stages} current={stage.id} onSelect={select} />
            <DeviceStagePanel key={stage.id} stage={stage} />
        </div>
    );
};
