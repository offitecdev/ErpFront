import { Navigate, Outlet, Route } from 'react-router-dom';

import { isMontageTechnician } from '../lib/access';
import { isProjectModuleEnabledForTenant } from '../lib/moduleCatalog';
import { useAuthStore } from '../store/authStore';
// routeHelpers'tan (appPageRoutes'tan DEĞİL): appPageRoutes bu dosyadan köprü
// bileşenleri aldığı için oradan almak modül döngüsü yaratır ve `lazyNamed`
// başlatılmadan çalışıp uygulamayı açılışta düşürür.
import { lazyNamed, page } from './routeHelpers';

/* ── Technician montage screens ──
   Fullscreen tablet UI rendered OUTSIDE MainLayout (no sidebar). Only users
   with a technician role — and a tenant with the project module — get in. */

const MontageLayout = lazyNamed(() => import('../pages/montage/MontageLayout'), 'MontageLayout');
const MontageHome = lazyNamed(() => import('../pages/montage/MontageHome'), 'MontageHome');
const MontageActiveOrders = lazyNamed(() => import('../pages/montage/MontageOrders'), 'MontageActiveOrders');
const MontageCompletedOrders = lazyNamed(() => import('../pages/montage/MontageOrders'), 'MontageCompletedOrders');
const MontageOrderDetail = lazyNamed(() => import('../pages/montage/MontageOrderDetail'), 'MontageOrderDetail');
const MontageReports = lazyNamed(() => import('../pages/montage/MontageReports'), 'MontageReports');
const MontageReportDetail = lazyNamed(() => import('../pages/montage/MontageReportDetail'), 'MontageReportDetail');
const MontageGeneralReport = lazyNamed(() => import('../pages/montage/MontageGeneralReport'), 'MontageGeneralReport');
const MontageHandover = lazyNamed(() => import('../pages/montage/MontageHandover'), 'MontageHandover');

const MontageGuard = () => {
    const user = useAuthStore((s) => s.user);
    const tenants = useAuthStore((s) => s.tenants);
    const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
    const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId);

    if (!isMontageTechnician(user)) return <Navigate to="/" replace />;
    if (!isProjectModuleEnabledForTenant(selectedTenant)) return <Navigate to="/" replace />;
    return <Outlet />;
};

export const renderMontageRoutes = () => (
    <Route element={<MontageGuard />}>
        <Route element={page(MontageLayout)}>
            <Route path="/montage" element={page(MontageHome)} />
            <Route path="/montage/orders/active" element={page(MontageActiveOrders)} />
            <Route path="/montage/orders/completed" element={page(MontageCompletedOrders)} />
            <Route path="/montage/orders/:appointmentId" element={page(MontageOrderDetail)} />
            <Route path="/montage/reports" element={page(MontageReports)} />
            <Route path="/montage/reports/view/:kind/:reportId" element={page(MontageReportDetail)} />
            <Route path="/montage/reports/general/:appointmentId" element={page(MontageGeneralReport)} />
            <Route path="/montage/reports/delivery/:projectId" element={page(MontageHandover)} />
            <Route path="/montage/calendar" element={<Navigate to="/calendar" replace />} />
        </Route>
    </Route>
);

/* ── Old-route bridging ──
   Technicians landing on the legacy installation screens (menu entries,
   notification links) are carried into the new montage UI; everyone else
   keeps the old pages. */

export const TechnicianBridge = ({ to, children }: { to: string; children: React.ReactNode }) => {
    const user = useAuthStore((s) => s.user);
    if (isMontageTechnician(user)) return <Navigate to={to} replace />;
    return <>{children}</>;
};
