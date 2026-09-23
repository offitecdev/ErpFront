import { Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { PageSkeleton } from '../components/ui-shared/PageSkeleton';
import { ProductionMacSelectMenu } from '../components/ui-shared/GlobalMacSelectMenu';
import { attemptChunkReload, clearChunkReloadGuard } from '../lib/chunkReload';

/* ── Route helpers ──
   appPageRoutes ve montageRoutes'un ORTAK bağımlılığı. Kendi dosyasında durur
   çünkü appPageRoutes montageRoutes'tan köprü bileşenlerini alıyor; helper'lar
   appPageRoutes'ta kalsaydı montageRoutes → appPageRoutes → montageRoutes
   döngüsü oluşur ve modül gövdesi `lazyNamed` başlatılmadan çalışıp
   "Cannot access 'lazyNamed' before initialization" ile tüm uygulamayı
   düşürürdü. */

export type RouteComponent = ComponentType<Record<string, never>>;

/** A route page whose chunk loads on first render — or earlier, via
    `preload()` (lib/routeIntent.ts calls it on hover, focus and press). */
export type PreloadableRoute = RouteComponent & { preload: () => Promise<unknown> };

/* ── WARUM KEIN React.lazy MEHR (14.09.2026) ────────────────────────────────
   React 19 hält einen einmal gezeigten Suspense-Platzhalter mindestens 300 ms
   stehen, bevor es den Inhalt einblendet (FALLBACK_THROTTLE_MS). Jede Route
   ist eine NEUE Suspense-Grenze — also zahlte jede Navigation diese 300 ms,
   auch wenn das Stück in 5 ms aus dem Cache kam. Und weil die Seite ihre Daten
   erst in ihrem Mount-Effekt anfordert, startete auch der Datenabruf 300 ms zu
   spät. Gemessen: Klick → Chunk nach 4–28 ms → Abruf erst nach 307 ms; beim
   Start von /projects dieselbe Lücke zwischen Profil und Liste.

   Stattdessen: ist das Modul schon da (vorgeladen oder schon einmal besucht),
   wird die Seite SOFORT gezeichnet — ohne Suspense, ohne Platzhalter. Sonst
   zeigt die Route das Skelett aus eigenem Zustand und tauscht es in dem
   Augenblick, in dem das Modul ankommt; kein Suspense heisst keine Drossel.
   Ladefehler landen wie bisher bei der Fehlergrenze (chunkReload zuerst). */
const createPreloadable = <P extends object>(
    loader: () => Promise<unknown>,
    pick: (mod: Record<string, unknown>) => ComponentType<P>,
    Placeholder: ComponentType<P>,
) => {
    let loaded: ComponentType<P> | null = null;
    let pending: Promise<ComponentType<P>> | null = null;

    const preload = (): Promise<ComponentType<P>> => {
        if (loaded) return Promise.resolve(loaded);
        if (!pending) {
            pending = loader()
                .then((mod) => {
                    clearChunkReloadGuard();
                    loaded = pick(mod as Record<string, unknown>);
                    return loaded;
                })
                .catch((error) => {
                    pending = null;
                    if (attemptChunkReload(error)) {
                        // The page is reloading — keep the placeholder up.
                        return new Promise<never>(() => undefined);
                    }
                    throw error;
                });
        }
        return pending;
    };

    const Preloadable = (props: P) => {
        const [state, setState] = useState<{ component: ComponentType<P> | null; error: unknown }>(
            () => ({ component: loaded, error: null }),
        );

        useEffect(() => {
            if (state.component) return;
            let active = true;
            preload().then(
                (component) => { if (active) setState({ component, error: null }); },
                (error) => { if (active) setState({ component: null, error }); },
            );
            return () => { active = false; };
        }, [state.component]);

        if (state.error) throw state.error;
        const Component = state.component;
        return Component ? <Component {...props} /> : <Placeholder {...props} />;
    };

    return Object.assign(Preloadable, { preload });
};

export const lazyNamed = (loader: () => Promise<unknown>, exportName: string): PreloadableRoute =>
    createPreloadable<Record<string, never>>(
        loader,
        (mod) => mod[exportName] as RouteComponent,
        () => <PageSkeleton />,
    );

const RouteFallback = () => <PageSkeleton />;

/* The Suspense boundary stays: pages lazy-load their own popups and panels. */
export const page = (Component: RouteComponent) => (
    <Suspense fallback={<RouteFallback />}>
        <Component />
    </Suspense>
);

/* Das Kleid der Offerte für eine Listenseite (09.09.2026): dieselbe Seite,
   nur in die `.ofi-list-apple`-Hülle gestellt — Haarlinien, 10px-Tafeln,
   kleine umrandete Bedienelemente, Inter (styles/listApple.css). Die Hülle
   lädt nach, damit Schrift und Stylesheet nicht am Start hängen. */
type SkinProps = { children: ReactNode };
const SkinPlaceholder = () => <PageSkeleton />;

const AppleListSkin = createPreloadable<SkinProps>(
    () => import('../components/ui-shared/AppleListSkin'),
    (mod) => mod.default as ComponentType<SkinProps>,
    SkinPlaceholder,
);

export const applePage = (Component: RouteComponent) => (
    <Suspense fallback={<RouteFallback />}>
        <AppleListSkin>
            <Component />
        </AppleListSkin>
    </Suspense>
);

/* Üretim kendi popup-button dilini kullanır. Kapsam işareti ve menü burada
   yalnızca /production rotalarına takılır; takvim ve diğer modüllerdeki
   select alanlarının mevcut davranışı ve görünümü değişmez. */
export const productionPage = (Component: RouteComponent) => (
    <Suspense fallback={<RouteFallback />}>
        <AppleListSkin>
            <div data-production-select-scope style={{ display: 'contents' }}>
                <Component />
            </div>
            <ProductionMacSelectMenu />
        </AppleListSkin>
    </Suspense>
);

/* Dasselbe Kleid für das Lager (10.09.2026): die Listen-Hülle plus die
   Lager-Klasse, an der styles/lagerApple.css hängt (Bestellfluss,
   Produktformular, Ein/Aus-Segment). */
const AppleLagerSkin = createPreloadable<SkinProps>(
    () => import('../components/ui-shared/AppleLagerSkin'),
    (mod) => mod.default as ComponentType<SkinProps>,
    SkinPlaceholder,
);

export const lagerPage = (Component: RouteComponent) => (
    <Suspense fallback={<RouteFallback />}>
        <AppleLagerSkin>
            <Component />
        </AppleLagerSkin>
    </Suspense>
);
