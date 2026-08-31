import { lazy, Suspense, type ReactNode } from 'react';

const ItGate = lazy(() =>
    import('../pages/settings/components/ItGate').then((module) => ({ default: module.ItGate })),
);

/** Keeps the settings-only Ant Design form stack outside the application shell. */
export const LazyItGate = ({ children }: { children: ReactNode }) => (
    <Suspense fallback={null}>
        <ItGate>{children}</ItGate>
    </Suspense>
);
