/**
 * Single source of truth for "which modules may this person see right now".
 *
 * The math used to live inline in MainLayout, so every other surface that
 * needed it (the dashboard tiles, Roles.tsx) either recomputed it or — worse —
 * skipped it and fell back to raw permissions. That is how a module switched
 * off in BOTH the company category and the role package still showed up as a
 * dashboard tile. Anything that hides/shows a page must read it from here.
 */
import { useMemo } from 'react';

import { useAuthStore } from '../store/authStore';
import {
    ADMIN_PERMISSION_NAMES,
    PERMISSION_TO_MODULE,
    isModuleKeyEnabled,
    isProjectModuleEnabledForTenant,
    type EnabledModules,
} from './moduleCatalog';

export interface ModuleAccess {
    /** Effective set = company category ∩ the role's package. null = unrestricted. */
    enabledModules: EnabledModules;
    /** The role's module package in the selected entity. null = unrestricted. */
    packageModules: ReadonlySet<string> | null;
    /** Company-level switch for the Project module. */
    projectModuleEnabled: boolean;
    /** Module key gate (menu leaves / tiles tagged with an explicit module). */
    isModuleEnabled: (moduleKey: string | undefined) => boolean;
    /**
     * Page-level gate for an item guarded by a single permission.
     * A module in the role's package GRANTS its pages: the leaf shows even
     * without the permission (permissions then only govern actions inside the
     * page). Admin permissions never bypass.
     */
    canSeePermissionItem: (permission: string | undefined) => boolean;
}

export const useModuleAccess = (): ModuleAccess => {
    const user = useAuthStore((state) => state.user);
    const permissions = useAuthStore((state) => state.permissions);
    const tenants = useAuthStore((state) => state.tenants);
    const selectedTenantId = useAuthStore((state) => state.selectedTenantId);

    const selectedTenant = useMemo(
        () => tenants.find((tenant) => tenant.id === selectedTenantId) || null,
        [tenants, selectedTenantId],
    );
    const projectModuleEnabled = isProjectModuleEnabledForTenant(selectedTenant);

    // Module package of the user's role(s) IN THE SELECTED ENTITY — the same
    // role can enable different modules per company of the tree. Accessible
    // pages are a property of the role, never of the individual employee.
    const packageModules = useMemo<ReadonlySet<string> | null>(() => {
        const keys = selectedTenantId ? user?.roleModuleKeysByTenant?.[selectedTenantId] : undefined;
        return Array.isArray(keys) && keys.length > 0 ? new Set(keys) : null;
    }, [user?.roleModuleKeysByTenant, selectedTenantId]);

    // null on either side means "no restriction" there; null result = everything.
    const enabledModules = useMemo<EnabledModules>(() => {
        const companyKeys = selectedTenant?.moduleProfile?.moduleKeys;
        const company = Array.isArray(companyKeys) ? new Set<string>(companyKeys) : null;
        if (!company) return packageModules ? new Set(packageModules) : null;
        if (!packageModules) return company;
        return new Set([...packageModules].filter((key) => company.has(key)));
    }, [selectedTenant?.moduleProfile, packageModules]);

    return useMemo<ModuleAccess>(() => {
        const isModuleEnabled = (moduleKey: string | undefined) =>
            !moduleKey || isModuleKeyEnabled(moduleKey, enabledModules);

        const canSeePermissionItem = (permission: string | undefined) => {
            if (!permission) return true;
            const moduleKey = PERMISSION_TO_MODULE.get(permission);
            if (!isModuleEnabled(moduleKey)) return false;
            if (permissions.includes(permission)) return true;
            return Boolean(
                packageModules && moduleKey && packageModules.has(moduleKey)
                && !ADMIN_PERMISSION_NAMES.has(permission),
            );
        };

        return { enabledModules, packageModules, projectModuleEnabled, isModuleEnabled, canSeePermissionItem };
    }, [enabledModules, packageModules, projectModuleEnabled, permissions]);
};
