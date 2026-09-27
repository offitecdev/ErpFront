import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Info } from 'lucide-react';

import { t } from '@/i18n/translate';
import { warehouseApi } from '@/lib/api/warehouse';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useAuthStore } from '@/store/authStore';
import '@/styles/modules/warehouse.css';

import { ImportsTab } from './settings/ImportsTab';
import { LabelTab } from './settings/LabelTab';
import { MaterialGroupsTab } from './settings/MaterialGroupsTab';

type SettingsTab = 'groups' | 'labels' | 'imports';
const TABS: SettingsTab[] = ['groups', 'labels', 'imports'];

/**
 * ── DEPO · AYARLAR (26.09.2026, zweiter Durchgang, Vorgabe Samet) ──────────
 *
 * «Malzeme grupları da depoda Ayarlar bölümü olacak; bölümde ayrı ayrı
 *  tabler olacak, ilk tab malzeme grupları olacak.»
 *
 *   Malzeme grupları  Hauptkategorien mit Kürzel (Elektrik = ELK), darunter
 *                     ihre Materialgruppen (PLC) — daraus der ERP-Code.
 *   Etiket            Grösse und Druckart der Etiketten (GS1-Barcode + Code).
 *   Excel aktarımı    Vorlage, Einlesen, Freigabe durch die Verwaltung.
 *
 * Im Rahmen der Produkt­karten (schmale Leiste, keine Kopfleiste); der Reiter
 * steht in der Adresse — die Glocke eines Aktarım führt direkt dorthin.
 */
export const WarehouseSettingsPage = () => {
    useLanguageTick();
    const [params, setParams] = useSearchParams();
    const canManage = useAuthStore((state) => state.permissions.includes('production.manage'));
    const [pending, setPending] = useState(0);
    const raw = params.get('tab') as SettingsTab | null;
    const tab: SettingsTab = raw && TABS.includes(raw) ? raw : 'groups';

    // Wie viele Aktarımlar warten — die Zahl steht am Reiter.
    const [pendingTick, setPendingTick] = useState(0);
    useEffect(() => {
        let alive = true;
        warehouseApi.imports()
            .then((list) => { if (alive) setPending(list.pendingCount); })
            .catch(() => undefined);
        return () => { alive = false; };
    }, [pendingTick]);

    const setTab = (next: SettingsTab) => setParams((current) => {
        const nextParams = new URLSearchParams();
        if (next !== 'groups') nextParams.set('tab', next);
        // Die gewählte Kategorie bleibt, wenn man zurückkommt.
        const category = current.get('cat');
        if (category) nextParams.set('cat', category);
        return nextParams;
    }, { replace: true });

    return (
        <div className="ofi-wh is-settings">
            <header className="ofi-wh-head">
                <h1 className="ofi-wh-head__title">{t('warehouse.settings.title')}</h1>
            </header>

            <nav className="ofi-wh-tabs" role="tablist" aria-label={t('warehouse.settings.title')}>
                {TABS.map((key) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`ofi-wh-settings-${key}`}
                        aria-selected={tab === key}
                        className={`ofi-nosize ${tab === key ? 'is-on' : ''}`}
                        onClick={() => setTab(key)}
                    >
                        {t(`warehouse.settings.tabs.${key}`)}
                        {key === 'imports' && pending > 0 && <span className="ofi-wh-tabs__badge">{pending}</span>}
                    </button>
                ))}
            </nav>

            {!canManage && (
                <div className="ofi-wh-note">
                    <Info />
                    {t('warehouse.settings.readOnly')}
                </div>
            )}

            <div role="tabpanel" aria-labelledby={`ofi-wh-settings-${tab}`} className="ofi-wh-settings">
                {tab === 'groups' && <MaterialGroupsTab canManage={canManage} />}
                {tab === 'labels' && <LabelTab canManage={canManage} />}
                {tab === 'imports' && <ImportsTab canManage={canManage} onChanged={() => setPendingTick((value) => value + 1)} />}
            </div>
        </div>
    );
};

export default WarehouseSettingsPage;
