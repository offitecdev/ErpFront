import React, { lazy, Suspense } from 'react';
import { SwitchHorizontal01 as ArrowLeftRight, X } from '@untitledui/icons';
import { useNavigate } from 'react-router-dom';
import { useSplitView, SPLITABLE_ROUTES, type SplitablePath } from './SplitViewContext';
import { useAuthStore } from '../../store/authStore';
import { Select as SharedSelect } from '../ui-shared/Field';

type PaneComponent = React.ComponentType<Record<string, never>>;

const lazyNamed = (
    loader: () => Promise<unknown>,
    exportName: string
) => lazy<PaneComponent>(() => loader().then((mod) => ({ default: (mod as Record<string, PaneComponent>)[exportName] })));

const SECONDARY_PAGES: Record<SplitablePath, React.LazyExoticComponent<PaneComponent>> = {
    '/': lazyNamed(() => import('../../pages/Dashboard'), 'Dashboard'),
    '/employees': lazyNamed(() => import('../../pages/iam/Employees'), 'Employees'),
    '/attendance-records': lazyNamed(() => import('../../pages/attendance/AttendanceRecords'), 'AttendanceRecords'),
    '/attendance-settings': lazyNamed(() => import('../../pages/attendance/AttendanceSettings'), 'AttendanceSettings'),
    '/roles': lazyNamed(() => import('../../pages/iam/Roles'), 'Roles'),
    '/crm/customers': lazyNamed(() => import('../../pages/crm/CustomerList'), 'CustomerList'),
};

const PaneFallback = () => (
    <div className="animate-pulse space-y-4">
        <div className="h-5 w-48 rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-3">
            <div className="h-20 rounded-md bg-slate-50 border border-slate-100" />
            <div className="h-20 rounded-md bg-slate-50 border border-slate-100" />
        </div>
        <div className="h-60 rounded-md bg-slate-50 border border-slate-100" />
    </div>
);

export const SecondaryPane: React.FC = () => {
    const { secondaryPath, openSplit, closeSplit } = useSplitView();
    const navigate = useNavigate();
    const permissions = useAuthStore(s => s.permissions);

    if (!secondaryPath) return null;

    const PageComponent = SECONDARY_PAGES[secondaryPath];
    const currentRoute = SPLITABLE_ROUTES.find(r => r.path === secondaryPath);

    const handleSwap = () => {
        const currentMain = window.location.pathname as SplitablePath;
        if (SPLITABLE_ROUTES.some(r => r.path === currentMain)) {
            openSplit(currentMain);
            navigate(secondaryPath);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white border-l border-slate-200/70">
            {/* Header */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-slate-200/70 bg-slate-50/60 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                    <SharedSelect
                        value={secondaryPath}
                        onChange={(e) => openSplit(e.target.value as SplitablePath)}
                        className="w-[180px] [&_button]:border-0 [&_button]:bg-transparent [&_button]:shadow-none [&_button]:ring-0"
                    >
                        {SPLITABLE_ROUTES
                            .filter(r => !r.permission || permissions.includes(r.permission))
                            .map(r => (
                                <option key={r.path} value={r.path}>{r.label}</option>
                            ))}
                    </SharedSelect>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={handleSwap}
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-200/60 text-slate-500 hover:text-slate-700 transition-colors"
                        title="Pencereleri değiştir"
                    >
                        <ArrowLeftRight size={14} />
                    </button>
                    <button
                        onClick={closeSplit}
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-200/60 text-slate-500 hover:text-slate-700 transition-colors"
                        title="Bölünmüş görünümü kapat"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
                {PageComponent && (
                    <Suspense fallback={<PaneFallback />}>
                        <PageComponent />
                    </Suspense>
                )}
                {currentRoute && (
                    <div className="mt-4 text-[11px] text-slate-400">
                        <button
                            onClick={() => navigate(secondaryPath)}
                            className="hover:text-sky-600 transition-colors"
                        >
                            Tam sayfada aç →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
