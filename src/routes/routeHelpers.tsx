import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { PageSkeleton } from '../components/ui-shared/PageSkeleton';
import { attemptChunkReload, clearChunkReloadGuard } from '../lib/chunkReload';

/* ── Route helpers ──
   appPageRoutes ve montageRoutes'un ORTAK bağımlılığı. Kendi dosyasında durur
   çünkü appPageRoutes montageRoutes'tan köprü bileşenlerini alıyor; helper'lar
   appPageRoutes'ta kalsaydı montageRoutes → appPageRoutes → montageRoutes
   döngüsü oluşur ve modül gövdesi `lazyNamed` başlatılmadan çalışıp
   "Cannot access 'lazyNamed' before initialization" ile tüm uygulamayı
   düşürürdü. */

export type RouteComponent = ComponentType<Record<string, never>>;

export const lazyNamed = (
    loader: () => Promise<unknown>,
    exportName: string
): LazyExoticComponent<RouteComponent> =>
    lazy<RouteComponent>(() =>
        loader()
            .then((mod) => {
                clearChunkReloadGuard();
                return { default: (mod as Record<string, RouteComponent>)[exportName] };
            })
            .catch((error) => {
                if (attemptChunkReload(error)) {
                    // The page is reloading — keep the suspense fallback up.
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

/* Das Kleid der Offerte für eine Listenseite (09.09.2026): dieselbe Seite,
   nur in die `.ofi-list-apple`-Hülle gestellt — Haarlinien, 10px-Tafeln,
   kleine umrandete Bedienelemente, Inter (styles/listApple.css). Die Hülle
   lädt nach, damit Schrift und Stylesheet nicht am Start hängen. */
const AppleListSkin = lazy(() => import('../components/ui-shared/AppleListSkin'));

export const applePage = (Component: LazyExoticComponent<RouteComponent>) => (
    <Suspense fallback={<RouteFallback />}>
        <AppleListSkin>
            <Component />
        </AppleListSkin>
    </Suspense>
);
