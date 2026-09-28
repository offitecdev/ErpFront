import { useNavigate } from 'react-router-dom';

import { t } from '@/i18n/translate';
import '@/styles/modules/productionHub.css';

export interface HubTab {
    key: string;
    path: string;
    labelKey: string;
}

/** Die Vorlagen-Reiter mit ihrer Katalogzeile (Sichtbarkeit je Rolle). */
export const TEMPLATE_TABS: Array<HubTab & { pageKey: string }> = [
    { key: 'tasks', path: '/production/templates/tasks', labelKey: 'nav.productionTaskTemplates', pageKey: 'production.taskTemplates' },
    { key: 'bom', path: '/production/templates/bom', labelKey: 'nav.productionBomTemplates', pageKey: 'production.bomTemplates' },
];

/**
 * ── ÜRETİM · DIE GRAUEN REITER (28.09.2026, Vorgabe Samet) ─────────────────
 *
 * «Görevlendirme şablonları, bom şablonları … tek bir sekme olsun … üstünde
 * sadece o bizim gri meşhur tablar olsun.» Die Reiter stehen an der Stelle des
 * Seitentitels (die Seiten darunter behalten ihre volle Höhe) und tragen die
 * Form der Depo-Einstellungen (`.ofi-wh-tabs`). Jeder Reiter ist eine eigene
 * Adresse — die Seiten darunter führen ihre Auswahl in `?t=` und würden einen
 * Reiter-Parameter beim Wechseln verwerfen.
 */
export const ProductionHubTabs = ({ tabs, active, label }: { tabs: HubTab[]; active: string; label: string }) => {
    const navigate = useNavigate();
    return (
        <nav className="ofi-phub-tabs" role="tablist" aria-label={t(label)}>
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={tab.key === active}
                    className={`ofi-nosize${tab.key === active ? ' is-on' : ''}`}
                    onClick={() => { if (tab.key !== active) navigate(tab.path); }}
                >
                    {t(tab.labelKey)}
                </button>
            ))}
        </nav>
    );
};
