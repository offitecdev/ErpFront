import { isValidElement, useEffect, type ReactNode } from 'react';
import { Routes, Route, Navigate, createRoutesFromChildren, matchRoutes, useLocation, type RouteObject } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicRoute } from './PublicRoute';
import { MainLayout } from '../components/layout/MainLayout';
import { lazyNamed, page, renderAppPageRoutes } from './appPageRoutes';
import { renderMontageRoutes } from './montageRoutes';
import { installRouteIntent, preloadRoute, registerRouteChunkResolver, registerRouteDataWarmer } from '../lib/routeIntent';
import { hasSessionHint } from '../store/authStore';

const Login = lazyNamed(() => import('../pages/Login'), 'Login');
const BookingPage = lazyNamed(() => import('../pages/project/BookingPage'), 'BookingPage');
const ReportSigningPage = lazyNamed(() => import('../pages/services/ReportSigningPage'), 'ReportSigningPage');
const MaintenanceBookingPage = lazyNamed(() => import('../pages/maintenance/MaintenanceBookingPage'), 'MaintenanceBookingPage');
const PublicEnquiryPage = lazyNamed(() => import('../pages/PublicEnquiryPage'), 'PublicEnquiryPage');

const appRoutes = () => (
    <>
        <Route element={<PublicRoute />}>
            <Route path="/login" element={page(Login)} />
        </Route>

        <Route path="/booking/:token" element={page(BookingPage)} />
        <Route path="/maintenance-booking/:token" element={page(MaintenanceBookingPage)} />
        <Route path="/report-sign/:token" element={page(ReportSigningPage)} />
        {/* Das oeffentliche Anfrageformular (10.09.2026): der Link, der auf
            der Anfragenseite steht und verschickt wird. Ohne Anmeldung,
            ohne App-Rahmen — wer ihn oeffnet, ist noch kein Kunde. */}
        <Route path="/anfrage/:token" element={page(PublicEnquiryPage)} />

        <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
                {/* Technician montage screens: inside the panel (app header
                    stays); MainLayout hides the sidebar on /montage paths. */}
                {renderMontageRoutes()}
                {renderAppPageRoutes()}
            </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
    </>
);

/* ── Which chunks does a path need? ──
   The route table itself answers: match the path, then walk the matched
   elements for components that carry `preload()` (lazyNamed pages, the list
   skins) — directly, as a `component` prop (ProjectModuleRoute & Co.) or
   nested as children. No second list of routes to keep in step. */
let routeObjects: RouteObject[] | null = null;

const collectPreloads = (node: ReactNode, out: Set<() => Promise<unknown>>) => {
    if (Array.isArray(node)) {
        node.forEach((child) => collectPreloads(child, out));
        return;
    }
    if (!isValidElement(node)) return;
    const type = node.type as { preload?: () => Promise<unknown> };
    if (typeof type?.preload === 'function') out.add(type.preload);
    const props = node.props as { component?: { preload?: () => Promise<unknown> }; children?: ReactNode };
    if (typeof props.component?.preload === 'function') out.add(props.component.preload);
    collectPreloads(props.children, out);
};

registerRouteChunkResolver((pathname) => {
    routeObjects ??= createRoutesFromChildren(appRoutes().props.children);
    const preloads = new Set<() => Promise<unknown>>();
    for (const match of matchRoutes(routeObjects, pathname) ?? []) collectPreloads(match.route.element, preloads);
    preloads.forEach((preload) => { void preload().catch(() => undefined); });
});

// Heavy lists whose data is worth starting on intent (see lib/api/*Bundle).
registerRouteDataWarmer(/^\/projects\/?$/, () => {
    void import('../lib/api/projectListBundle').then((mod) => mod.primeProjectListBundle()).catch(() => undefined);
});

installRouteIntent();

// The page this document opened on: start its chunks now, alongside the
// profile requests, instead of after them. Its data only with a session —
// without one the request would just bounce off the login guard.
preloadRoute(
    window.location.protocol === 'file:' ? (window.location.hash.slice(1) || '/') : window.location.pathname,
    { data: hasSessionHint() },
);

export const AppRouter = () => {
    const { pathname } = useLocation();

    // Navigations nobody hovered first (row clicks, redirects, history):
    // the page and its skin load in parallel rather than one after the other.
    useEffect(() => { preloadRoute(pathname, { data: false }); }, [pathname]);

    return <Routes>{appRoutes().props.children}</Routes>;
};
