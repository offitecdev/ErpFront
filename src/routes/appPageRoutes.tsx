import type { LazyExoticComponent } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { isProjectModuleEnabledForTenant } from '../lib/moduleCatalog';
import { lazyNamed, page } from './routeHelpers';
import type { RouteComponent } from './routeHelpers';
import { TechnicianBridge } from './montageRoutes';

/* ── Shared page-route table ──
   Rendered by AppRouter inside MainLayout, and again by the split view's
   secondary pane inside its own MemoryRouter — so navigation that starts in
   the right pane (list → detail, query views) stays in the right pane.

   `lazyNamed`/`page` routeHelpers'ta yaşar (buradan yeniden dışa aktarılır):
   montageRoutes da onları kullanır ve buradan alsaydı iki dosya arasında
   modül döngüsü oluşurdu. */

export { lazyNamed, page } from './routeHelpers';

const Roles = lazyNamed(() => import('../pages/iam/Roles'), 'Roles');
const Employees = lazyNamed(() => import('../pages/iam/Employees'), 'Employees');
const Dashboard = lazyNamed(() => import('../pages/Dashboard'), 'Dashboard');
const Home = lazyNamed(() => import('../pages/Home'), 'Home');
const AttendanceSettings = lazyNamed(() => import('../pages/attendance/AttendanceSettings'), 'AttendanceSettings');
const AttendanceRecords = lazyNamed(() => import('../pages/attendance/AttendanceRecords'), 'AttendanceRecords');
const CrmOverview = lazyNamed(() => import('../pages/crm/overview/CrmOverview'), 'CrmOverview');
const CustomerDashboard = lazyNamed(() => import('../pages/crm/CustomerDashboard'), 'CustomerDashboard');
const CustomerList = lazyNamed(() => import('../pages/crm/CustomerList'), 'CustomerList');
const MyOrders = lazyNamed(() => import('../pages/crm/MyOrders'), 'MyOrders');
const MyOrderDetail = lazyNamed(() => import('../pages/crm/MyOrderDetail'), 'MyOrderDetail');
const TenderList = lazyNamed(() => import('../pages/tender/TenderList'), 'TenderList');
const TenderDetail = lazyNamed(() => import('../pages/tender/TenderDetail'), 'TenderDetail');
const TenderReport = lazyNamed(() => import('../pages/tender/TenderReport'), 'TenderReport');
// Yeni tablo tabanlı envanter modülü — eski sayfalar pages/inventory_old altında arşivlendi.
const ProductsPage = lazyNamed(() => import('../pages/inventory/ProductsPage'), 'ProductsPage');
const ProductCreatePage = lazyNamed(() => import('../pages/inventory/ProductCreatePage'), 'ProductCreatePage');
const ProductDetailPage = lazyNamed(() => import('../pages/inventory/ProductDetailPage'), 'ProductDetailPage');
const MaterialsPage = lazyNamed(() => import('../pages/inventory/MaterialsPage'), 'MaterialsPage');
const MaterialCreatePage = lazyNamed(() => import('../pages/inventory/MaterialCreatePage'), 'MaterialCreatePage');
const MaterialDetailPage = lazyNamed(() => import('../pages/inventory/MaterialDetailPage'), 'MaterialDetailPage');
const StockPage = lazyNamed(() => import('../pages/inventory/StockPage'), 'StockPage');
const StockMovementsPage = lazyNamed(() => import('../pages/inventory/StockMovementsPage'), 'StockMovementsPage');
const SuppliersPage = lazyNamed(() => import('../pages/inventory/SuppliersPage'), 'SuppliersPage');
const OrdersPage = lazyNamed(() => import('../pages/inventory/OrdersPage'), 'OrdersPage');
const OrderCreatePage = lazyNamed(() => import('../pages/inventory/OrderCreatePage'), 'OrderCreatePage');
// Mal kabul artık pop-up değil, stok ekranı gibi kendi sayfası.
const OrderReceivePage = lazyNamed(() => import('../pages/inventory/OrderReceivePage'), 'OrderReceivePage');
const Shipments = lazyNamed(() => import('../pages/logistics/Shipments'), 'Shipments');
const ShipmentCreate = lazyNamed(() => import('../pages/logistics/ShipmentCreate'), 'ShipmentCreate');
const MaintenanceDashboard = lazyNamed(() => import('../pages/maintenance/MaintenanceDashboard'), 'MaintenanceDashboard');
const MaintenanceContracts = lazyNamed(() => import('../pages/maintenance/MaintenanceContracts'), 'MaintenanceContracts');
const MaintenanceContractCreate = lazyNamed(() => import('../pages/maintenance/MaintenanceContracts'), 'MaintenanceContractCreate');
const MaintenanceTasks = lazyNamed(() => import('../pages/maintenance/MaintenanceTasks'), 'MaintenanceTasks');
const RegieOperations = lazyNamed(() => import('../pages/maintenance/RegieOperations'), 'RegieOperations');
const PdfSettings = lazyNamed(() => import('../pages/settings/PdfSettings'), 'PdfSettings');
const CompanyCategories = lazyNamed(() => import('../pages/settings/CompanyCategories'), 'CompanyCategories');
const MailSettings = lazyNamed(() => import('../pages/settings/MailSettings'), 'MailSettings');
const ChecklistSettings = lazyNamed(() => import('../pages/settings/ChecklistSettings'), 'ChecklistSettings');
const Projects = lazyNamed(() => import('../pages/project/Projects'), 'Projects');
const ProjectDetail = lazyNamed(() => import('../pages/project/ProjectDetail'), 'ProjectDetail');
const ServiceReports = lazyNamed(() => import('../pages/services/ServiceReports'), 'ServiceReports');
const ServiceReportAdd = lazyNamed(() => import('../pages/services/ServiceReportAdd'), 'ServiceReportAdd');
const CalendarPage = lazyNamed(() => import('../pages/calendar/CalendarPage'), 'CalendarPage');

const AttendanceAdminRoute = () => {
    const permissions = useAuthStore((s) => s.permissions);
    if (!permissions.includes('tenants.update')) {
        return <Navigate to="/" replace />;
    }
    return page(AttendanceSettings);
};

// Company categories are admin territory: mapping companies to module
// bundles is only for holders of roles.manage.
const CompanyCategoriesAdminRoute = () => {
    const permissions = useAuthStore((s) => s.permissions);
    if (!permissions.includes('roles.manage')) {
        return <Navigate to="/" replace />;
    }
    return page(CompanyCategories);
};

const ProjectModuleRoute = ({ component }: { component: LazyExoticComponent<RouteComponent> }) => {
    const tenants = useAuthStore((s) => s.tenants);
    const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
    const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId);

    if (!isProjectModuleEnabledForTenant(selectedTenant)) {
        return <Navigate to="/" replace />;
    }

    return page(component);
};

/** The in-app page routes (MainLayout's children). Returned as a fragment so a
    <Routes> element can splice them in — React Router flattens fragments. */
export const renderAppPageRoutes = () => (
    <>
        {/* Technician accounts have one workspace only: the new montage panel.
            This also makes hans@offitec.com land there immediately after login. */}
        <Route path="/" element={<TechnicianBridge to="/montage">{page(Home)}</TechnicianBridge>} />
        <Route path="/attendance" element={page(Dashboard)} />
        <Route path="/roles" element={page(Roles)} />
        <Route path="/employees" element={page(Employees)} />
        <Route path="/attendance-settings" element={<AttendanceAdminRoute />} />
        <Route path="/attendance-records" element={page(AttendanceRecords)} />
        <Route path="/crm/overview" element={page(CrmOverview)} />
        <Route path="/crm/customers" element={page(CustomerList)} />
        <Route path="/crm/customers/:id" element={page(CustomerDashboard)} />
        <Route path="/crm/my-orders" element={page(MyOrders)} />
        <Route path="/crm/my-orders/:id" element={page(MyOrderDetail)} />
        <Route path="/crm/tenders" element={page(TenderList)} />
        <Route path="/crm/tenders/:id" element={page(TenderDetail)} />
        <Route path="/crm/tenders/:id/report" element={page(TenderReport)} />
        <Route path="/inventory" element={<Navigate to="/inventory/articles" replace />} />
        <Route path="/inventory/articles" element={page(ProductsPage)} />
        {/* Ürün ekleme artık pop-up değil, kendi sayfası (stok ekranıyla aynı desen). */}
        <Route path="/inventory/articles/new" element={page(ProductCreatePage)} />
        {/* Detay: listeden satıra tıklayınca açılır; '/new' ile çakışmaması için
            sabit yol ÖNCE tanımlıdır. */}
        <Route path="/inventory/articles/:id" element={page(ProductDetailPage)} />
        {/* Malzemeler: ürünlerle aynı tablo, aynı akış — yalnızca itemType farklı. */}
        <Route path="/inventory/materials" element={page(MaterialsPage)} />
        <Route path="/inventory/materials/new" element={page(MaterialCreatePage)} />
        <Route path="/inventory/materials/:id" element={page(MaterialDetailPage)} />
        <Route path="/inventory/stock" element={page(StockPage)} />
        <Route path="/inventory/stock/movements" element={page(StockMovementsPage)} />
        {/* Eski yol: hareket girişi artık ortak stok ekranında. */}
        <Route path="/inventory/movements" element={<Navigate to="/inventory/stock" replace />} />
        <Route path="/inventory/suppliers" element={page(SuppliersPage)} />
        {/* Satın alma siparişleri: liste + oluşturma/düzenleme (?id= ile düzenleme). */}
        <Route path="/inventory/orders" element={page(OrdersPage)} />
        <Route path="/inventory/orders/new" element={page(OrderCreatePage)} />
        {/* Mal kabul: siparişin satırlarını stoğa aktarma ekranı ('/new' sabit
            yolundan sonra tanımlıdır, :id ile çakışmaz). */}
        <Route path="/inventory/orders/:id/receive" element={page(OrderReceivePage)} />
        <Route path="/logistics/shipments" element={page(Shipments)} />
        <Route path="/logistics/shipments/new" element={page(ShipmentCreate)} />
        <Route path="/maintenance" element={page(MaintenanceDashboard)} />
        <Route path="/maintenance/contracts" element={page(MaintenanceContracts)} />
        <Route path="/maintenance/contracts/new" element={page(MaintenanceContractCreate)} />
        <Route path="/maintenance/tasks" element={page(MaintenanceTasks)} />
        <Route path="/maintenance/tasks/:taskId" element={page(MaintenanceTasks)} />
        <Route path="/maintenance/technician" element={<Navigate to="/montage" replace />} />
        <Route path="maintenance/technician/calendar" element={<Navigate to="/calendar" replace />} />
        <Route path="maintenance/technician/tasks" element={<Navigate to="/montage" replace />} />
        <Route path="maintenance/technician/tasks/:taskId" element={<Navigate to="/montage" replace />} />
        <Route path="/maintenance/reports" element={<Navigate to="/maintenance/tasks?view=reports" replace />} />
        <Route path="/maintenance/regie" element={page(RegieOperations)} />
        <Route path="/calendar" element={page(CalendarPage)} />
        <Route path="/projects" element={<ProjectModuleRoute component={Projects} />} />
        <Route path="/projects/flow" element={<Navigate to="/projects" replace />} />
        <Route path="/projects/installation" element={<Navigate to="/montage" replace />} />
        <Route path="/projects/installation/calendar" element={<Navigate to="/calendar" replace />} />
        <Route path="/projects/installation/tasks" element={<Navigate to="/montage" replace />} />
        <Route path="/projects/installation/tasks/:appointmentId" element={<Navigate to="/montage" replace />} />
        <Route path="/projects/installation/delivery" element={<Navigate to="/montage/reports" replace />} />
        <Route path="/projects/:id" element={<ProjectModuleRoute component={ProjectDetail} />} />
        <Route path="/services/reports" element={<ProjectModuleRoute component={ServiceReports} />} />
        <Route path="/services/reports/new" element={<ProjectModuleRoute component={ServiceReportAdd} />} />
        <Route path="/settings/pdf" element={page(PdfSettings)} />
        <Route path="/settings/company-categories" element={<CompanyCategoriesAdminRoute />} />
        <Route path="/settings/mail" element={<ProjectModuleRoute component={MailSettings} />} />
        <Route path="/settings/checklists" element={<ProjectModuleRoute component={ChecklistSettings} />} />
    </>
);
