import { apiClient } from '../axios';

/* ── EINSTELLUNGEN → ZWEI-FAKTOR (AEGIS), 15.09.2026 ─────────────────────────
 * Server: Erp_Backend/src/presentation/routes/twoFactorAdmin.routes.ts.
 * Lesen = `security.mfa.view`, neu starten = `security.mfa.reset` (oder die
 * Administratorrolle).
 */

export type TwoFactorPerson = {
    id: string;
    name: string;
    email: string | null;
    isActive: boolean;
    /** Wann Aegis eingerichtet wurde; null = noch nicht / neu gestartet. */
    enrolledAt: string | null;
};

export const twoFactorAdminApi = {
    list: () => apiClient.get<TwoFactorPerson[]>('/security/two-factor').then((r) => r.data),
    reset: (id: string) =>
        apiClient.post<{ reset: boolean }>(`/security/two-factor/${encodeURIComponent(id)}/reset`).then((r) => r.data),
};
