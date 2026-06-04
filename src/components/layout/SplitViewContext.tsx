import React, { createContext, useContext, useState, useCallback } from 'react';

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
    { path: '/', label: 'Mesai' },
    { path: '/employees', label: 'Personel Listesi' },
    { path: '/attendance-records', label: 'Mesai Kayıtları', permission: 'attendance.read' },
    { path: '/attendance-settings', label: 'Mesai & QR Ayarları', permission: 'tenants.update' },
    { path: '/roles', label: 'Rol Yönetimi' },
    { path: '/crm/customers', label: 'Müşteri Listesi', permission: 'crm.customers.view' },
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
    if (!ctx) throw new Error('useSplitView must be used within SplitViewProvider');
    return ctx;
};
