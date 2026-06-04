import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicRoute } from './PublicRoute';
import { MainLayout } from '../components/layout/MainLayout';
import { useAuthStore } from '../store/authStore';

type RouteComponent = ComponentType<Record<string, never>>;

const lazyNamed = (
    loader: () => Promise<unknown>,
    exportName: string
): LazyExoticComponent<RouteComponent> =>
    lazy<RouteComponent>(() => loader().then((mod) => ({ default: (mod as Record<string, RouteComponent>)[exportName] })));

const Login = lazyNamed(() => import('../pages/Login'), 'Login');
const Roles = lazyNamed(() => import('../pages/iam/Roles'), 'Roles');
const Employees = lazyNamed(() => import('../pages/iam/Employees'), 'Employees');
const Dashboard = lazyNamed(() => import('../pages/Dashboard'), 'Dashboard');
const AttendanceSettings = lazyNamed(() => import('../pages/attendance/AttendanceSettings'), 'AttendanceSettings');
const AttendanceRecords = lazyNamed(() => import('../pages/attendance/AttendanceRecords'), 'AttendanceRecords');
const CustomerDashboard = lazyNamed(() => import('../pages/crm/CustomerDashboard'), 'CustomerDashboard');
const CustomerList = lazyNamed(() => import('../pages/crm/CustomerList'), 'CustomerList');
const TenderList = lazyNamed(() => import('../pages/tender/TenderList'), 'TenderList');
const TenderDetail = lazyNamed(() => import('../pages/tender/TenderDetail'), 'TenderDetail');
const TenderReport = lazyNamed(() => import('../pages/tender/TenderReport'), 'TenderReport');
const TenderCreate = lazyNamed(() => import('../pages/tender/TenderCreate'), 'TenderCreate');
const InventoryDashboard = lazyNamed(() => import('../pages/inventory/InventoryDashboard'), 'InventoryDashboard');
const Articles = lazyNamed(() => import('../pages/inventory/Articles'), 'Articles');
const ExtraMaterials = lazyNamed(() => import('../pages/inventory/ExtraMaterials'), 'ExtraMaterials');
const Locations = lazyNamed(() => import('../pages/inventory/Locations'), 'Locations');
const Movements = lazyNamed(() => import('../pages/inventory/Movements'), 'Movements');
const Proposals = lazyNamed(() => import('../pages/inventory/Proposals'), 'Proposals');
const Shipments = lazyNamed(() => import('../pages/logistics/Shipments'), 'Shipments');
const ShipmentCreate = lazyNamed(() => import('../pages/logistics/ShipmentCreate'), 'ShipmentCreate');
const MaintenanceDashboard = lazyNamed(() => import('../pages/maintenance/MaintenanceDashboard'), 'MaintenanceDashboard');
const MaintenanceContracts = lazyNamed(() => import('../pages/maintenance/MaintenanceContracts'), 'MaintenanceContracts');
const MaintenanceTasks = lazyNamed(() => import('../pages/maintenance/MaintenanceTasks'), 'MaintenanceTasks');
const MaintenanceReports = lazyNamed(() => import('../pages/maintenance/MaintenanceReports'), 'MaintenanceReports');
const RegieOperations = lazyNamed(() => import('../pages/maintenance/RegieOperations'), 'RegieOperations');
const PdfSettings = lazyNamed(() => import('../pages/settings/PdfSettings'), 'PdfSettings');
const MailSettings = lazyNamed(() => import('../pages/settings/MailSettings'), 'MailSettings');
const Projects = lazyNamed(() => import('../pages/project/Projects'), 'Projects');
const ProjectDetail = lazyNamed(() => import('../pages/project/ProjectDetail'), 'ProjectDetail');
const BookingPage = lazyNamed(() => import('../pages/project/BookingPage'), 'BookingPage');

const RouteFallback = () => (
    <div className="animate-pulse space-y-5">
        <div className="border-b border-slate-200/60 pb-4">
            <div className="mb-2 h-3 w-36 rounded bg-slate-100" />
            <div className="h-6 w-60 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-80 max-w-full rounded bg-slate-100" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 rounded-md border border-slate-100 bg-slate-50" />
            ))}
        </div>
        <div className="h-72 rounded-md border border-slate-100 bg-slate-50" />
    </div>
);

const page = (Component: LazyExoticComponent<RouteComponent>) => (
    <Suspense fallback={<RouteFallback />}>
        <Component />
    </Suspense>
);

const AttendanceAdminRoute = () => {
    const permissions = useAuthStore((s) => s.permissions);
    if (!permissions.includes('tenants.update')) {
        return <Navigate to="/" replace />;
    }
    return page(AttendanceSettings);
};

const ProjectModuleRoute = ({ component }: { component: LazyExoticComponent<RouteComponent> }) => {
    const tenants = useAuthStore((s) => s.tenants);
    const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
    const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId);

    if (selectedTenant && !selectedTenant.isProjectModuleEnabled) {
        return <Navigate to="/" replace />;
    }

    return page(component);
};

export const AppRouter = () => {
    return (
        <Routes>
            <Route element={<PublicRoute />}>
                <Route path="/login" element={page(Login)} />
            </Route>

            <Route path="/booking/:token" element={page(BookingPage)} />

            <Route element={<ProtectedRoute />}>
                <Route element={<MainLayout />}>
                    <Route path="/" element={page(Dashboard)} />
                    <Route path="/roles" element={page(Roles)} />
                    <Route path="/employees" element={page(Employees)} />
                    <Route path="/attendance-settings" element={<AttendanceAdminRoute />} />
                    <Route path="/attendance-records" element={page(AttendanceRecords)} />
                    <Route path="/crm/customers" element={page(CustomerList)} />
                    <Route path="/crm/customers/:id" element={page(CustomerDashboard)} />
                    <Route path="/crm/tenders" element={page(TenderList)} />
                    <Route path="/crm/tenders/new" element={page(TenderCreate)} />
                    <Route path="/crm/tenders/:id" element={page(TenderDetail)} />
                    <Route path="/crm/tenders/:id/report" element={page(TenderReport)} />
                    <Route path="/inventory" element={page(InventoryDashboard)} />
                    <Route path="/inventory/articles" element={page(Articles)} />
                    <Route path="/inventory/extra-materials" element={page(ExtraMaterials)} />
                    <Route path="/inventory/locations" element={page(Locations)} />
                    <Route path="/inventory/movements" element={page(Movements)} />
                    <Route path="/inventory/proposals" element={page(Proposals)} />
                    <Route path="/logistics/shipments" element={page(Shipments)} />
                    <Route path="/logistics/shipments/new" element={page(ShipmentCreate)} />
                    <Route path="/maintenance" element={page(MaintenanceDashboard)} />
                    <Route path="/maintenance/contracts" element={page(MaintenanceContracts)} />
                    <Route path="/maintenance/tasks" element={page(MaintenanceTasks)} />
                    <Route path="/maintenance/reports" element={page(MaintenanceReports)} />
                    <Route path="/maintenance/regie" element={page(RegieOperations)} />
                    <Route path="/projects" element={<ProjectModuleRoute component={Projects} />} />
                    <Route path="/projects/:id" element={<ProjectModuleRoute component={ProjectDetail} />} />
                    <Route path="/settings/pdf" element={page(PdfSettings)} />
                    <Route path="/settings/mail" element={<ProjectModuleRoute component={MailSettings} />} />
                </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};
