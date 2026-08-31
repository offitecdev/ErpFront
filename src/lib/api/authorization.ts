import { apiClient } from '../axios';
import type { PageLevel } from '../pageCatalog';

/* ── BERECHTIGUNGEN: SERVERZUGRIFF (17.08.2026) ──────────────────────────────
 *
 * Drei Flächen, ein Ort:
 *
 *   roleTemplateApi  — Einstellungen → Berechtigungen: hier werden die ROLLEN
 *                      gebaut (Tabelle Modul × Seite × Stufe).
 *   personAccessApi  — Personal → Person → Zugang: hier bekommt eine Person
 *                      EINE dieser Rollen, dazu E-Mail, Kennwort und Firmen.
 *   passwordRequestApi — der Kennwortwunsch aus dem eigenen Profil und seine
 *                      Freigabe.
 *
 * Die Stufen-→-Rechte-Übersetzung passiert auf dem SERVER
 * (shared/pageCatalog.ts dort ist die Autorität); der Browser schickt und
 * empfängt nur die Stufenkarte.
 */

export type { PageLevel };
/** Altname aus der abgelösten Stufenseite — gleiche Werte, gleiche Bedeutung. */
export type AuthorizationLevel = PageLevel;

export interface RoleTemplate {
    id: string;
    roleName: string;
    /** Die feste Administratorrolle: alle Seiten, nicht änderbar, nicht löschbar. */
    isSystemAdmin: boolean;
    /** Die feste Purser-Rolle (27.08.2026): sie führt die zweite Stufe des
        Antragswegs. Stufen bleiben änderbar, Name und Bestand nicht. */
    isPurser?: boolean;
    /** FIRMENWECHSEL (31.08.2026): darf diese Rolle im Kopf jede Firma des
        eigenen Konzernbaums wählen — auch ohne Zuteilung unter Person →
        Zugang? Für Verwaltung und Projektleitung, die über alle Häuser hinweg
        arbeiten. Die Administratorrolle trägt es immer; der Server schickt
        deshalb dort das abgeleitete `true`. Es ist KEINE Seitenstufe: es
        entscheidet die Reichweite des Umschalters, nicht was jemand öffnet. */
    canSwitchTenant?: boolean;
    userCount: number;
    pageLevels: Record<string, PageLevel>;
}

export interface CatalogPageDto {
    key: string;
    path: string;
    labelKey: string;
    maxLevel: PageLevel;
}

export interface CatalogModuleDto {
    key: string;
    labelKey: string;
    pages: CatalogPageDto[];
}

/** Die Rolle, wie die Zugangs-Auswahl sie anbietet (ohne Personenzahl). */
export interface RoleOption {
    id: string;
    roleName: string;
    isSystemAdmin: boolean;
    /** Oeffnet diese Rolle von sich aus die ganze eigene Firmengruppe? Der
        Server liefert hier das ABGELEITETE Ja (Administratorrolle inbegriffen),
        damit die Zugangsflaeche sagen kann, was zusaetzlich zu den Haken gilt. */
    canSwitchTenant?: boolean;
    pageLevels: Record<string, PageLevel>;
}

/** Eine Firma des Baums, wie sie in der Zuteilung angeboten wird. */
export interface AccessCompany {
    id: string;
    tenantName: string;
    parentTenantId: string | null;
}

export interface PersonAccess {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
    /** Die Firma, unter der die Person angelegt wurde. */
    homeTenantId: string;
    /** null = keine Zuteilung gespeichert → NUR `homeTenantId` (31.08.2026).
        Früher hiess null «alle Firmen des Baums»; genau das liess Personal
        einer Untergesellschaft die Schwesterfirmen sehen. */
    allowedTenantIds: string[] | null;
    /** Der GANZE Firmenbaum — die Auswahl hier vergibt erst den Zugang, darf
        also nicht am Firmenumschalter hängen (der zeigt nur Zugeteiltes). */
    companies: AccessCompany[];
    roleId: string | null;
    roles: RoleOption[];
}

export interface PasswordRequest {
    id: string;
    employeeId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    note: string | null;
    createdAt: string;
    decidedAt: string | null;
    decisionNote: string | null;
    employee: { id: string; firstName: string; lastName: string; email: string; staffNumber: number | null } | null;
    decidedBy: { id: string; firstName: string; lastName: string } | null;
}

export const roleTemplateApi = {
    list: async (): Promise<RoleTemplate[]> => {
        const res = await apiClient.get<{ data: RoleTemplate[] }>('/role-templates');
        return res.data.data;
    },

    /** Der Katalog vom Server — die Tabelle zeigt ihn, nicht die Browserkopie. */
    catalog: async (): Promise<CatalogModuleDto[]> => {
        const res = await apiClient.get<{ modules: CatalogModuleDto[] }>('/role-templates/catalog');
        return res.data.modules;
    },

    create: async (body: {
        roleName: string;
        pageLevels: Record<string, PageLevel>;
        canSwitchTenant?: boolean;
    }): Promise<RoleTemplate> => {
        const res = await apiClient.post<RoleTemplate>('/role-templates', body);
        return res.data;
    },

    update: async (
        id: string,
        body: { roleName?: string; pageLevels?: Record<string, PageLevel>; canSwitchTenant?: boolean },
    ): Promise<void> => {
        await apiClient.put(`/role-templates/${id}`, body);
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/role-templates/${id}`);
    },
};

export const personAccessApi = {
    get: async (employeeId: string): Promise<PersonAccess> => {
        const res = await apiClient.get<PersonAccess>(`/employees/${employeeId}/authorization`);
        return res.data;
    },

    save: async (employeeId: string, body: {
        email?: string;
        password?: string;
        allowedTenantIds?: string[];
        /** null zieht jede Rolle ab; undefined lässt die Zuweisung unberührt. */
        roleId?: string | null;
    }): Promise<{ id: string; roleId?: string | null; roleName: string | null }> => {
        const res = await apiClient.put(`/employees/${employeeId}/authorization`, body);
        return res.data;
    },
};

export const passwordRequestApi = {
    /** `applied: true` = die anfragende Person verwaltet selbst, das Kennwort steht schon. */
    submit: async (body: { currentPassword: string; newPassword: string; note?: string }): Promise<{
        applied: boolean;
        request: PasswordRequest | null;
    }> => {
        const res = await apiClient.post('/password-requests', body);
        return res.data;
    },

    mine: async (): Promise<PasswordRequest[]> => {
        const res = await apiClient.get<{ data: PasswordRequest[] }>('/password-requests/mine');
        return res.data.data;
    },

    pending: async (status: 'PENDING' | 'ALL' = 'PENDING'): Promise<PasswordRequest[]> => {
        const res = await apiClient.get<{ data: PasswordRequest[] }>('/password-requests', { params: { status } });
        return res.data.data;
    },

    decide: async (id: string, approve: boolean, note?: string): Promise<PasswordRequest> => {
        const res = await apiClient.post<{ request: PasswordRequest }>(`/password-requests/${id}/decide`, { approve, note });
        return res.data.request;
    },
};
