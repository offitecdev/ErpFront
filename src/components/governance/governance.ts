import { useCallback } from 'react';

import { useAuthStore } from '@/store/authStore';

/**
 * ── BELEGAUFSICHT IM BROWSER (16.09.2026, Schritt 4) ─────────────────────────
 *
 * Spiegel von Erp_Backend/src/shared/documentGovernance/permissions.ts und
 * override.ts — Schlüssel und Namen müssen in beiden Kopien gleich bleiben.
 * Der Server entscheidet; die Oberfläche blendet nur aus, was ohnehin
 * abgewiesen würde, und sagt warum.
 */

export const DOCUMENT_ACTION_PERMISSIONS = {
    TENDER_CANCEL: 'tenders.cancel',
    ORDER_CANCEL: 'salesOrders.cancel',
    ORDER_REVERT: 'salesOrders.revert',
    PROJECT_CANCEL: 'projects.cancel',
    INVOICE_CANCEL: 'invoices.cancel',
} as const;

export type DocumentPermissionAction = keyof typeof DOCUMENT_ACTION_PERMISSIONS;

/** Welche Sperren die Systemverwaltung bei welcher Handlung überschreiten darf. */
export const OVERRIDE_POLICIES = {
    ORDER_REVERT: ['MONTAGE_STARTED'],
    TENDER_DELETE: ['PARKED_APPOINTMENT'],
} as const;

export type OverrideAction = keyof typeof OVERRIDE_POLICIES;

export const isOverridable = (action: OverrideAction, blockers: readonly string[]): boolean =>
    blockers.length > 0 && blockers.every((blocker) => (OVERRIDE_POLICIES[action] as readonly string[]).includes(blocker));

export type DocumentEntityType = 'TENDER' | 'SALES_ORDER' | 'ADDON_ORDER' | 'PROJECT' | 'INVOICE';

/** Was diese Person an Belegen zurücknehmen darf. */
export const useGovernance = () => {
    const permissions = useAuthStore((state) => state.permissions);
    const isSystemAdmin = useAuthStore((state) => Boolean(state.isSystemAdmin));
    const can = useCallback(
        (action: DocumentPermissionAction) => isSystemAdmin || permissions.includes(DOCUMENT_ACTION_PERMISSIONS[action]),
        [isSystemAdmin, permissions],
    );
    return { can, isSystemAdmin };
};
