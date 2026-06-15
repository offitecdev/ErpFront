import React, { createContext, useContext, useState, useCallback } from 'react';

import { t } from '@/i18n/translate';

export type SplitablePath =
    | '/'
    | '/employees'
    | '/attendance-records'
    | '/attendance-settings'
    | '/roles'
    | '/crm/customers';

export interface SplitableRoute {
    path: SplitablePath;
    label: string;
    permission?: string;
}

export const SPLITABLE_ROUTES: SplitableRoute[] = [
    { path: '/', label: 'nav.attendance' },
    { path: '/employees', label: 'nav.employeeList' },
    { path: '/attendance-records', label: 'nav.attendanceRecords', permission: 'attendance.read' },
    { path: '/attendance-settings', label: 'nav.attendanceQR', permission: 'tenants.update' },
    { path: '/roles', label: 'nav.roleManagement' },
    { path: '/crm/customers', label: 'nav.customerList', permission: 'crm.customers.view' },
];

interface SplitViewContextValue {
    isSplit: boolean;
    secondaryPath: SplitablePath | null;
    openSplit: (path: SplitablePath) => void;
    closeSplit: () => void;
    swap: () => void;
}

const SplitViewContext = createContext<SplitViewContextValue | null>(null);

export const SplitViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [secondaryPath, setSecondaryPath] = useState<SplitablePath | null>(null);

    const openSplit = useCallback((path: SplitablePath) => {
        setSecondaryPath(path);
    }, []);

    const closeSplit = useCallback(() => {
        setSecondaryPath(null);
    }, []);

    const swap = useCallback(() => {
        // swap handled at consumer side via navigation
    }, []);

    return (
        <SplitViewContext.Provider value={{
            isSplit: secondaryPath !== null,
            secondaryPath,
            openSplit,
            closeSplit,
            swap,
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
