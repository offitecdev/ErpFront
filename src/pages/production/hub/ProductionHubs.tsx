import { Navigate } from 'react-router-dom';

import { pageLevelForKey } from '@/lib/pageAccess';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useAuthStore } from '@/store/authStore';

import { ProductionSettingsPage } from '../bom/ProductionSettingsPage';
import { BomTemplatesPage } from '../bom/templates/BomTemplatesPage';
import { TaskTemplatesPage } from '../tasks/TaskTemplatesPage';
import { ProductionAccessPage } from './ProductionAccessPage';
import { ProductionMailPage } from './mail/ProductionMailPage';
import { ProductionHubTabs, TEMPLATE_TABS, type HubTab } from './ProductionHubTabs';

/**
 * ── ÜRETİM · ŞABLONLAR UND AYARLAR (28.09.2026, Vorgabe Samet) ────────────
 *
 * «Projeler, satın alma, [şablonlar:] görevlendirme şablonları, bom şablonları
 * … ayarlarda üretim ayarları, yetkilendirme ayarları olacak.»
 *
 *   Şablonlar  Administratorrolle + Rollen mit der Seite (Makine / Elektrik
 *              Mühendisi) — jeder Reiter einzeln nach seiner Katalogzeile.
 *   Ayarlar    NUR die Administratorrolle.
 */
const SETTINGS_TABS: HubTab[] = [
    { key: 'general', path: '/production/settings', labelKey: 'productionBom.hub.settingsTab' },
    { key: 'access', path: '/production/settings/access', labelKey: 'productionBom.hub.accessTab' },
    // Die Postfächer der Automatik (rfq@…, Bestellungen) — 30.09.2026.
    { key: 'mail', path: '/production/settings/mail', labelKey: 'productionBom.hub.mailTab' },
];

/** Die Vorlagen-Reiter, die diese Anmeldung sehen darf. */
export const useTemplateTabs = () => {
    const isSystemAdmin = useAuthStore((state) => state.isSystemAdmin);
    const pageAccess = useAuthStore((state) => state.pageAccess);
    return TEMPLATE_TABS.filter((tab) => isSystemAdmin || pageLevelForKey(pageAccess, tab.pageKey) > 0);
};

export const ProductionTemplatesIndex = () => {
    const tabs = useTemplateTabs();
    return <Navigate to={tabs[0]?.path ?? '/production/orders'} replace />;
};

export const ProductionTemplatesHub = ({ tab }: { tab: 'tasks' | 'bom' }) => {
    useLanguageTick();
    const tabs = useTemplateTabs();
    if (!tabs.some((entry) => entry.key === tab)) {
        return <Navigate to={tabs[0]?.path ?? '/production/orders'} replace />;
    }
    const strip = <ProductionHubTabs tabs={tabs} active={tab} label="nav.productionTemplates" />;
    return tab === 'tasks' ? <TaskTemplatesPage tabs={strip} /> : <BomTemplatesPage tabs={strip} />;
};

export const ProductionSettingsHub = ({ tab }: { tab: 'general' | 'access' | 'mail' }) => {
    useLanguageTick();
    const isSystemAdmin = useAuthStore((state) => state.isSystemAdmin);
    if (!isSystemAdmin) return <Navigate to="/production/orders" replace />;
    const strip = <ProductionHubTabs tabs={SETTINGS_TABS} active={tab} label="nav.productionSettingsMenu" />;
    if (tab === 'mail') return <ProductionMailPage tabs={strip} />;
    return tab === 'general' ? <ProductionSettingsPage tabs={strip} /> : <ProductionAccessPage tabs={strip} />;
};

/* Feste Seiten je Reiter — die Routen brauchen stabile Komponenten (eine
   Pfeilfunktion im Routenbaum wäre bei jedem Rendern ein neuer Typ). */
export const ProductionTemplatesTasksPage = () => <ProductionTemplatesHub tab="tasks" />;
export const ProductionTemplatesBomPage = () => <ProductionTemplatesHub tab="bom" />;
export const ProductionSettingsGeneralPage = () => <ProductionSettingsHub tab="general" />;
export const ProductionSettingsAccessPage = () => <ProductionSettingsHub tab="access" />;
export const ProductionSettingsMailPage = () => <ProductionSettingsHub tab="mail" />;
