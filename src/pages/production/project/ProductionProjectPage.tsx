import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { MacSpinner } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { productionErrorOf, readProductionDevices } from '@/lib/api/production';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import type { ProductionProjectDevices } from '@/types/production';
import '@/styles/modules/production.css';
import '@/styles/modules/productionProject.css';

import { DeviceCardGrid } from './DeviceCardGrid';
import { ProjectHeader } from './ProjectHeader';
import { ProjectInfoTable } from './ProjectInfoTable';

/**
 * ── EIN PRODUKTIONSPROJEKT (24.09.2026, vierte Fassung) ─────────────────────
 *
 * Vorgabe Samet: «Üretimde projelerde cihaz isimleri kartlar şeklinde olacak,
 * süreç falan olmayacak; proje bilgileri tablo halinde, daha fazla detay
 * yazabilir; sonra altında hemen cihaz kartları. Her cihaz kartına basınca
 * yeni sayfa yüklenecek.»
 *
 * Oben der Kopf, darunter die Projekttabelle, darunter die Gerätekarten. Die
 * Prozessleiste der dritten Fassung ist auf die GERÄTESEITE gewandert
 * (`../device/`): der Weg — Zeichnung, Stückliste, Einkauf, Montage, Prüfung —
 * ist der Weg EINES Geräts, nicht des ganzen Projekts.
 */
export const ProductionProjectPage = () => {
    useLanguageTick();
    const { projectId = '' } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const [data, setData] = useState<ProductionProjectDevices | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => readProductionDevices(
        projectId,
        (value) => { setData(value); setError(null); },
        (failure) => setError(productionErrorOf(failure).message || t('production.loadFailed')),
    ), [projectId]);

    const shown = data && data.project.id === projectId ? data : null;
    const loading = !shown && !error;

    return (
        <div className="ofi-prod-page ofi-pprj-page">
            <ProjectHeader project={shown?.project ?? null} />
            {error && <div className="ofi-prod-note is-warn">{error}</div>}
            {loading && (
                <div className="ofi-pprj-loading">
                    <MacSpinner size={26} />
                </div>
            )}
            {shown && (
                <>
                    <ProjectInfoTable data={shown} />
                    <section className="ofi-pprj-devices">
                        <h2 className="ofi-pprj-devices__title">
                            {t('production.project.devices', { count: shown.devices.length })}
                        </h2>
                        <DeviceCardGrid projectId={projectId} rows={shown.devices} onOpen={(path) => navigate(path)} />
                    </section>
                </>
            )}
        </div>
    );
};
