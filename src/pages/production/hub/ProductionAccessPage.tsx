import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui-shared/Switch';
import { t } from '@/i18n/translate';
import { roleTemplateApi, type RoleTemplate } from '@/lib/api/authorization';
import type { PageLevel } from '@/lib/pageCatalog';
import '@/styles/modules/productionBom.css';
import '@/styles/modules/productionHub.css';

import { LoadingState, Note } from '../bom/bomUi';
import { TEMPLATE_TABS } from './ProductionHubTabs';

/**
 * ── ÜRETİM › AYARLAR › YETKİLENDİRME (28.09.2026, Vorgabe Samet) ──────────
 *
 * «Ayarlarda yetkilendirme ayarları da olsun — şimdiki yetkilendirme ayarı tek
 * bu ayar, ama alt alta o ayarları da yapacağız.» Die erste (und vorerst
 * einzige) Einstellung: welche Rollen die beiden Vorlagen-Reiter sehen. Ein
 * Schalter schreibt die Stufe 1 bzw. nimmt sie aus der Stufenkarte der Rolle —
 * dieselbe Karte wie Einstellungen › Berechtigungen, der Server leitet Rechte
 * und Paket beim Speichern ab. Weitere Einstellungen kommen als eigene
 * Abschnitte darunter.
 */
export const ProductionAccessPage = ({ tabs }: { tabs?: ReactNode }) => {
    const navigate = useNavigate();
    const [roles, setRoles] = useState<RoleTemplate[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        roleTemplateApi.list()
            .then((list) => { if (alive) setRoles(list); })
            .catch(() => { if (alive) setError(t('productionBom.err.loadFailed')); });
        return () => { alive = false; };
    }, []);

    const toggle = async (role: RoleTemplate, pageKey: string, on: boolean) => {
        const pageLevels: Record<string, PageLevel> = { ...role.pageLevels };
        if (on) pageLevels[pageKey] = 1;
        else delete pageLevels[pageKey];
        const cellKey = `${role.id}:${pageKey}`;
        // Der Haken steht sofort; scheitert das Speichern, springt er zurück.
        setRoles((list) => list?.map((entry) => (entry.id === role.id ? { ...entry, pageLevels } : entry)) ?? list);
        setBusy(cellKey);
        try {
            await roleTemplateApi.update(role.id, { pageLevels });
        } catch {
            setRoles((list) => list?.map((entry) => (entry.id === role.id ? role : entry)) ?? list);
            toast.error(t('productionBom.hub.access.saveFailed', { role: role.roleName }));
        } finally {
            setBusy((current) => (current === cellKey ? null : current));
        }
    };

    const body = () => {
        if (error && !roles) return <div className="ofi-bom-state is-error"><TriangleAlert aria-hidden /><b>{error}</b></div>;
        if (!roles) return <LoadingState />;
        return (
            <section className="ofi-bom-group">
                <h3 className="ofi-bom-group__title">{t('productionBom.hub.access.templatesTitle')}</h3>
                <p className="ofi-phub-access__intro">{t('productionBom.hub.access.templatesIntro')}</p>
                <div className="ofi-bom-tablewrap is-plain">
                    <table className="ofi-bom-table" data-unstyled-table>
                        <thead>
                            <tr>
                                <th>{t('productionBom.hub.access.role')}</th>
                                {TEMPLATE_TABS.map((tab) => <th key={tab.key} className="is-switch">{t(tab.labelKey)}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {roles.map((role) => {
                                // Eine Rolle ohne Stufenkarte heisst «alles offen» — ein einzelner
                                // Haken würde sie auf genau diese Seite zusammenschrumpfen lassen.
                                const legacy = !role.isSystemAdmin && Object.keys(role.pageLevels ?? {}).length === 0;
                                return (
                                    <tr key={role.id}>
                                        <td>
                                            <span className="ofi-phub-access__role">
                                                <b>{role.roleName}</b>
                                                {role.isSystemAdmin && <span className="ofi-phub-access__tag">{t('productionBom.hub.access.always')}</span>}
                                                <small>{t('productionBom.hub.access.people', { count: role.userCount })}</small>
                                            </span>
                                        </td>
                                        {TEMPLATE_TABS.map((tab) => (
                                            <td key={tab.key} className="is-switch">
                                                <Switch
                                                    checked={role.isSystemAdmin || legacy || (role.pageLevels?.[tab.pageKey] ?? 0) > 0}
                                                    disabled={role.isSystemAdmin || legacy || busy === `${role.id}:${tab.pageKey}`}
                                                    label={`${role.roleName} · ${t(tab.labelKey)}`}
                                                    onChange={(next) => void toggle(role, tab.pageKey, next)}
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <Note>{t('productionBom.hub.access.note')}</Note>
                <div>
                    <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" onClick={() => navigate('/settings/authorization')}>
                        {t('productionBom.hub.access.manageRoles')}
                        <ChevronRight />
                    </button>
                </div>
            </section>
        );
    };

    return (
        <div className="ofi-bom is-page">
            <header className="ofi-bom-head">
                {tabs ?? <h1 className="ofi-bom-head__title">{t('productionBom.hub.accessTab')}</h1>}
            </header>
            <div className="ofi-phub-access">{body()}</div>
        </div>
    );
};

export default ProductionAccessPage;
