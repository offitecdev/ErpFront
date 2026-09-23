import { useMemo } from 'react';

import { useAuthStore } from '../store/authStore';
import { isProductionModuleEnabledForTenant } from './moduleCatalog';

/**
 * Produktion (19.09.2026): läuft das Modul in der gewählten Firma? Dann
 * verlangen Preisanfrage, Bestellung und Wareneingang ein Projekt und
 * mindestens ein Gerät — die Lagerseiten zeigen dafür die Zuordnung.
 * Der Server prüft dasselbe (isModuleEnabledForTenant) und bleibt die Autorität.
 */
export const useProductionEnabled = (): boolean => {
    const tenants = useAuthStore((state) => state.tenants);
    const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
    return useMemo(
        () => isProductionModuleEnabledForTenant(tenants.find((tenant) => tenant.id === selectedTenantId) || null),
        [tenants, selectedTenantId],
    );
};
