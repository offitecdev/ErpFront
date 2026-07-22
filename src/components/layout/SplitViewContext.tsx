import React, { createContext, useContext, useState, useCallback } from 'react';

import { t } from '@/i18n/translate';

/* ── Dual-screen (split) view ──
   `splitMode` is armed by the toggle in the header brand cluster. While armed,
   the current page stays as the primary (left) pane and any page picked from
   the side menu opens in the secondary (right) pane instead of navigating.
   The right pane runs its own MemoryRouter over the shared route table, so
   navigation that starts there (list → detail) stays on that side. Closing
   the mode keeps the left page and drops the right one. */

export type SplitablePath = string;

/** window.name of the secondary-pane iframe — MainLayout renders a bare shell
    (no header/sidebar) when it finds itself loaded under this name. */
export const SPLIT_PANE_WINDOW_NAME = 'offitec-split-pane';

export interface SplitableRoute {
    path: SplitablePath;
    label: string;
}

/** Label table for the secondary-pane header (leaf menu pages). */
export const SPLITABLE_ROUTES: SplitableRoute[] = [
    { path: '/', label: 'nav.home' },
    { path: '/attendance', label: 'nav.attendance' },
    { path: '/calendar', label: 'nav.calendar' },
    { path: '/employees', label: 'nav.employeeList' },
    { path: '/attendance-records', label: 'nav.attendanceRecords' },
    { path: '/attendance-settings', label: 'nav.attendanceQR' },
    { path: '/roles', label: 'nav.roleManagement' },
    { path: '/crm/overview', label: 'nav.crmOverview' },
    { path: '/crm/customers', label: 'nav.customerList' },
    { path: '/crm/tenders', label: 'nav.tenderManagement' },
    { path: '/crm/my-orders', label: 'nav.myOrders' },
    { path: '/projects', label: 'nav.projectManagement' },
    { path: '/projects/flow', label: 'nav.projectFlow' },
    { path: '/projects/installation/tasks', label: 'nav.installationTasks' },
    { path: '/projects/installation/delivery', label: 'nav.deliveryReports' },
    { path: '/inventory/movements', label: 'nav.movements' },
    { path: '/inventory/articles', label: 'nav.articles' },
    { path: '/inventory/extra-materials', label: 'nav.materials' },
    { path: '/inventory/suppliers', label: 'nav.suppliers' },
    { path: '/inventory', label: 'nav.inventoryDashboard' },
    { path: '/logistics/shipments', label: 'nav.shipments' },
    { path: '/logistics/shipments/new', label: 'nav.newShipment' },
    { path: '/maintenance', label: 'nav.maintenanceDashboard' },
    { path: '/maintenance/contracts', label: 'nav.contracts' },
    { path: '/maintenance/tasks', label: 'nav.maintenanceTasks' },
    { path: '/maintenance/technician/tasks', label: 'nav.technicianTasks' },
    { path: '/maintenance/regie', label: 'nav.regie' },
    { path: '/services/reports', label: 'nav.serviceReports' },
    { path: '/settings/mail', label: 'nav.mailSettings' },
    { path: '/settings/pdf', label: 'nav.pdfSettings' },
    { path: '/settings/checklists', label: 'nav.checklistSettings' },
];

/** Strips a query string (`/maintenance/tasks?view=reports` → pathname). */
export const normalizeSplitPath = (path: string): SplitablePath => path.split('?')[0];

interface SplitViewContextValue {
    /** Dual-screen mode is on (even before a right-hand page is picked). */
    splitMode: boolean;
    /** Layout splits as soon as the mode is armed. */
    isSplit: boolean;
    /** The page the secondary pane was opened with (may include a query). */
    secondaryPath: SplitablePath | null;
    /** Where the secondary pane's own router currently is (it can drift to
        detail pages) — used by swap and "open full page". */
    secondaryCurrentPath: SplitablePath | null;
    /** Bumped on every openSecondary so re-picking the same menu entry resets
        a pane that drifted to a detail page. */
    secondaryNonce: number;
    enterSplit: () => void;
    /** Leaves the primary (left) page in place and drops the secondary one. */
    exitSplit: () => void;
    openSecondary: (path: string) => void;
    reportSecondaryLocation: (path: string) => void;
}

const SplitViewContext = createContext<SplitViewContextValue | null>(null);

export const SplitViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [splitMode, setSplitMode] = useState(false);
    const [secondaryPath, setSecondaryPath] = useState<SplitablePath | null>(null);
    const [secondaryCurrentPath, setSecondaryCurrentPath] = useState<SplitablePath | null>(null);
    const [secondaryNonce, setSecondaryNonce] = useState(0);

    const enterSplit = useCallback(() => setSplitMode(true), []);

    const exitSplit = useCallback(() => {
        setSplitMode(false);
        setSecondaryPath(null);
        setSecondaryCurrentPath(null);
    }, []);

    const openSecondary = useCallback((path: string) => {
        setSplitMode(true);
        setSecondaryPath(path);
        setSecondaryCurrentPath(path);
        setSecondaryNonce((n) => n + 1);
    }, []);

    const reportSecondaryLocation = useCallback((path: string) => {
        setSecondaryCurrentPath(path);
    }, []);

    return (
        <SplitViewContext.Provider value={{
            splitMode,
            isSplit: splitMode,
            secondaryPath,
            secondaryCurrentPath,
            secondaryNonce,
            enterSplit,
            exitSplit,
            openSecondary,
            reportSecondaryLocation,
        }}>
            {children}
        </SplitViewContext.Provider>
    );
};

export const useSplitView = () => {
    const ctx = useContext(SplitViewContext);
    if (!ctx) throw new Error(t('auto.usesplitview_must_be_used_within_splitviewprovid'));
    return ctx;
};
