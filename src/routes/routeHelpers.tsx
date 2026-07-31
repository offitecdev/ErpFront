import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { PageSkeleton } from '../components/ui-shared/PageSkeleton';

/* ── Route helpers ──
   appPageRoutes ve montageRoutes'un ORTAK bağımlılığı. Kendi dosyasında durur
   çünkü appPageRoutes montageRoutes'tan köprü bileşenlerini alıyor; helper'lar
   appPageRoutes'ta kalsaydı montageRoutes → appPageRoutes → montageRoutes
   döngüsü oluşur ve modül gövdesi `lazyNamed` başlatılmadan çalışıp
   "Cannot access 'lazyNamed' before initialization" ile tüm uygulamayı
   düşürürdü. */

export type RouteComponent = ComponentType<Record<string, never>>;

const CHUNK_RELOAD_KEY = 'offitec:chunk-reload-attempted';

const isChunkLoadError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    return /Failed to fetch dynamically imported module|dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
};

export const lazyNamed = (
    loader: () => Promise<unknown>,
    exportName: string
): LazyExoticComponent<RouteComponent> =>
    lazy<RouteComponent>(() =>
        loader()
            .then((mod) => {
                sessionStorage.removeItem(CHUNK_RELOAD_KEY);
                return { default: (mod as Record<string, RouteComponent>)[exportName] };
            })
            .catch((error) => {
                if (isChunkLoadError(error) && sessionStorage.getItem(CHUNK_RELOAD_KEY) !== '1') {
                    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
                    window.location.reload();
                    return new Promise<never>(() => undefined);
                }
                throw error;
            })
    );

const RouteFallback = () => <PageSkeleton />;

export const page = (Component: LazyExoticComponent<RouteComponent>) => (
    <Suspense fallback={<RouteFallback />}>
        <Component />
    </Suspense>
);
