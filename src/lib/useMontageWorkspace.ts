import { useEffect } from 'react';

import { useAuthStore } from '../store/authStore';

import { canOpenMontage, isMontageTechnician, MONTAGE_PERMISSIONS } from './access';
import { isProjectModuleEnabledForTenant } from './moduleCatalog';

/**
 * ── EINE Antwort auf «ist der Montagebildschirm die Arbeitsfläche dieses
 * Kontos?» ─────────────────────────────────────────────────────────────────
 *
 * Drei Stellen fragen dasselbe und müssen dieselbe Antwort bekommen, sonst
 * schieben sich ihre Weiterleitungen endlos hin und her:
 *
 *   • `MontageGuard`      (/montage → '/')      — darf die Person herein?
 *   • `TechnikerBrücke`   ('/' → /montage)      — startet sie dort?
 *   • Der Seitenwächter in `MainLayout`         — hält sie DORT (alles
 *                                                 andere → /montage).
 *
 * Darum steht der Ausdruck hier in der Bibliothek und nicht mehr in
 * `routes/montageRoutes.tsx`: das Layout kann ihn lesen, ohne die Routendatei
 * zu holen (Modulzyklus). Die Bedingung selbst lebt in `lib/access.ts`
 * (`canOpenMontage`); hier kommt nur das Projektmodul DER FIRMA dazu — führt
 * die gewählte Firma es nicht, gibt es auch keinen Arbeitsplatz.
 */
export const useMontageIsWorkspace = (): boolean => {
    const user = useAuthStore((s) => s.user);
    const pageAccess = useAuthStore((s) => s.pageAccess);
    const permissions = useAuthStore((s) => s.permissions);
    const isSystemAdmin = useAuthStore((s) => s.isSystemAdmin);
    const tenants = useAuthStore((s) => s.tenants);
    const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
    const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId);

    const moduleOn = isProjectModuleEnabledForTenant(selectedTenant);
    const allowed = moduleOn && canOpenMontage(user, pageAccess, permissions, isSystemAdmin);

    /* Warum jemand NICHT auf dem roten Arbeitsplatz landet, ist von aussen nicht
       zu sehen — die Person steht einfach auf der Startseite. Wer nach Name oder
       Konto ein Monteur ist, aber abgewiesen wird, bekommt darum in der
       Entwicklung EINE Zeile, die die fehlende Bedingung beim Namen nennt. */
    useEffect(() => {
        if (!import.meta.env.DEV || allowed || !isMontageTechnician(user)) return;
        const reason = isSystemAdmin
            ? 'Konto traegt die Administratorrolle — der Arbeitsplatz gehoert den Technikern.'
            : !moduleOn
                ? 'Die gewaehlte Firma fuehrt das Projektmodul nicht (Firmenkategorie).'
                : `Rolle hat keines der Rechte ${MONTAGE_PERMISSIONS.join(' / ')} — Seite «Montage» in /settings/authorization auf Stufe 2 setzen.`;
        console.warn('[montage] Technikerarbeitsplatz nicht geoeffnet:', reason, {
            permissions,
            pageAccess,
            isSystemAdmin,
            projectModule: moduleOn,
        });
    }, [allowed, moduleOn, isSystemAdmin, permissions, pageAccess, user]);

    return allowed;
};
