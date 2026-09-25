import { Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { isProjectModuleEnabledForTenant } from '../lib/moduleCatalog';
import { applePage, lagerPage, lazyNamed, page, productionPage } from './routeHelpers';
import type { RouteComponent } from './routeHelpers';
import { TechnicianBridge } from './montageRoutes';
import { LazyItGate } from './LazyItGate';
import { loadTaskDetailPage } from '../pages/tasks/taskRouteLoaders';
import { MacSpinnerScreen } from '../components/ui-shared/Loader';

/* ── Shared page-route table ──
   Rendered by AppRouter inside MainLayout, and again by the split view's
   secondary pane inside its own MemoryRouter — so navigation that starts in
   the right pane (list → detail, query views) stays in the right pane.

   `lazyNamed`/`page` routeHelpers'ta yaşar (buradan yeniden dışa aktarılır):
   montageRoutes da onları kullanır ve buradan alsaydı iki dosya arasında
   modül döngüsü oluşurdu. */

export { lazyNamed, page } from './routeHelpers';

const Roles = lazyNamed(() => import('../pages/iam/Roles'), 'Roles');
const Home = lazyNamed(() => import('../pages/Home'), 'Home');
// Personalmodul (Neubau 16.08.2026): ersetzt /employees, /attendance,
// /attendance-records und /attendance-settings vollständig. Die alten Adressen
// leiten weiter, damit Lesezeichen und gespeicherte Arbeitsbereich-Reiter
// weiter aufgehen.
const PersonnelListPage = lazyNamed(() => import('../pages/personnel/PersonnelListPage'), 'PersonnelListPage');
const TimeClockPage = lazyNamed(() => import('../pages/personnel/TimeClockPage'), 'TimeClockPage');
/* Die EINE Antragsseite und die Arbeitszeiterfassung (26.08.2026). Sie haben
   die drei Antragsseiten bzw. den Detail- und den Buchhaltungsrapport abgelöst;
   deren Adressen leiten unten hierher weiter. */
const RequestsPage = lazyNamed(() => import('../pages/personnel/requests/RequestsPage'), 'RequestsPage');
const TimeRecordsPage = lazyNamed(() => import('../pages/personnel/timerecords/TimeRecordsPage'), 'TimeRecordsPage');
const CrmOverview = lazyNamed(() => import('../pages/crm/overview/CrmOverview'), 'CrmOverview');
const CustomerDashboard = lazyNamed(() => import('../pages/crm/CustomerDashboard'), 'CustomerDashboard');
const CustomerList = lazyNamed(() => import('../pages/crm/CustomerList'), 'CustomerList');
const ContactsPage = lazyNamed(() => import('../pages/crm/ContactsPage'), 'ContactsPage');
const CommunicationPage = lazyNamed(() => import('../pages/crm/CommunicationPage'), 'CommunicationPage');
const EnquiriesPage = lazyNamed(() => import('../pages/crm/enquiries/EnquiriesPage'), 'EnquiriesPage');
const ActivitiesPage = lazyNamed(() => import('../pages/crm/activities/ActivitiesPage'), 'ActivitiesPage');
const MailPage = lazyNamed(() => import('../pages/crm/mail/MailPage'), 'MailPage');
const TasksPage = lazyNamed(() => import('../pages/crm/TasksPage'), 'TasksPage');
const TaskDetailPage = lazyNamed(() => import('../pages/crm/tasks/TaskDetailPage'), 'TaskDetailPage');
const RemindersPage = lazyNamed(() => import('../pages/crm/RemindersPage'), 'RemindersPage');
const QuickEntryPage = lazyNamed(() => import('../pages/crm/QuickEntryPage'), 'QuickEntryPage');
// Checklisten / Formulare / Vorlagen (CRM-Modul, 2026-08-15).
const FormsPage = lazyNamed(() => import('../pages/crm/forms/FormsPage'), 'FormsPage');
const FormTemplatesPage = lazyNamed(() => import('../pages/crm/forms/FormTemplatesPage'), 'FormTemplatesPage');
const FormTemplateBuilderPage = lazyNamed(() => import('../pages/crm/forms/FormTemplateBuilderPage'), 'FormTemplateBuilderPage');
const FormSubmissionPage = lazyNamed(() => import('../pages/crm/forms/FormSubmissionPage'), 'FormSubmissionPage');
// Angebote und Aufträge leben seit dem CRM-Umbau (2026-08-14) unter "Verkauf".
const MyOrders = lazyNamed(() => import('../pages/sales/MyOrders'), 'MyOrders');
const MyOrderDetail = lazyNamed(() => import('../pages/sales/MyOrderDetail'), 'MyOrderDetail');
// Zusatzaufträge / Nachträge (05.09.2026): ALLE NT-Belege in einer Liste,
// neben den Aufträgen (AB) — mit eigenem PDF je Nachtrag.
const AddonOrdersPage = lazyNamed(() => import('../pages/sales/AddonOrdersPage'), 'AddonOrdersPage');
// Der Nachtrag entsteht auf einer eigenen SEITE (kein Fenster) — Positions-
// erfassung wie in der Angebotsmaske, mit Zahlungsplan.
const AddonOrderCreatePage = lazyNamed(() => import('../pages/sales/AddonOrderCreatePage'), 'AddonOrderCreatePage');
const TenderList = lazyNamed(() => import('../pages/sales/TenderList'), 'TenderList');
const TenderDetail = lazyNamed(() => import('../pages/sales/TenderDetail'), 'TenderDetail');
const TenderReport = lazyNamed(() => import('../pages/sales/TenderReport'), 'TenderReport');
// OSP (04.09.2026): Offertanfragen der Offitec Selection Platform — eigene
// Seite mit eigener (Rauten-)Seitenleiste unter Verkauf.
const OspPage = lazyNamed(() => import('../pages/sales/osp/OspPage'), 'OspPage');
// Rechnungen — Liste aller Rechnungen und die zwei Erstellungswege (aus einem
// Auftrag bzw. die selbst ausgefüllte Direktrechnung), jeder als eigene Seite.
// Buchhaltung (16.09.2026, Schritt 5): Liste, Erstellen, Detail — EIN Ort.
const OutgoingInvoicesPage = lazyNamed(() => import('../pages/accounting/OutgoingInvoicesPage'), 'OutgoingInvoicesPage');
const NewInvoicePage = lazyNamed(() => import('../pages/accounting/NewInvoicePage'), 'NewInvoicePage');
const InvoiceDetailPage = lazyNamed(() => import('../pages/accounting/InvoiceDetailPage'), 'InvoiceDetailPage');
const ToBillPage = lazyNamed(() => import('../pages/accounting/ToBillPage'), 'ToBillPage');
const InvoiceDirectPage = lazyNamed(() => import('../pages/sales/invoices/InvoiceDirectPage'), 'InvoiceDirectPage');
// Yeni tablo tabanlı envanter modülü — eski sayfalar pages/inventory_old altında arşivlendi.
const ProductsPage = lazyNamed(() => import('../pages/inventory/ProductsPage'), 'ProductsPage');
const ProductCreatePage = lazyNamed(() => import('../pages/inventory/ProductCreatePage'), 'ProductCreatePage');
const ProductBulkCreatePage = lazyNamed(() => import('../pages/inventory/ProductBulkCreatePage'), 'ProductBulkCreatePage');
const ProductDetailPage = lazyNamed(() => import('../pages/inventory/ProductDetailPage'), 'ProductDetailPage');
const StockPage = lazyNamed(() => import('../pages/inventory/StockPage'), 'StockPage');
const StockMovementsPage = lazyNamed(() => import('../pages/inventory/StockMovementsPage'), 'StockMovementsPage');
const SuppliersPage = lazyNamed(() => import('../pages/inventory/SuppliersPage'), 'SuppliersPage');
const OrdersPage = lazyNamed(() => import('../pages/inventory/OrdersPage'), 'OrdersPage');
/* EINE Seite für Anfrage UND Bestellung (22.09.2026): Positionen, Einstellungen,
   Vorlage, Wareneingang, «Stoğa gidenler», PDF und Mail sind REITER. */
const OrderWorkspacePage = lazyNamed(() => import('../pages/inventory/OrderWorkspacePage'), 'OrderWorkspacePage');
// Mal kabul artık pop-up değil, stok ekranı gibi kendi sayfası.
// Produktion (19.09.2026, Vorgabe Samet): Produktionsaufträge, die Projektseite
// mit ihren zwei Reitern und die bestellten Produkte — im Kleid der Listen.
const ProductionOrdersPage = lazyNamed(() => import('../pages/production/ProductionOrdersPage'), 'ProductionOrdersPage');
const ProductionProjectPage = lazyNamed(() => import('../pages/production/project/ProductionProjectPage'), 'ProductionProjectPage');
// Die Geräteseite (24.09.2026): eigener Rahmen ohne Kopfleiste (MainLayout,
// `isDeviceFocusPath`); solange ihr Stück lädt, steht schon der Mac-Kreisel.
const ProductionDevicePage = lazyNamed(
    () => import('../pages/production/device/ProductionDevicePage'),
    'ProductionDevicePage',
    MacSpinnerScreen,
);
const ProductionLinesPage = lazyNamed(() => import('../pages/production/ProductionLinesPage'), 'ProductionLinesPage');
// Schaltschränke (20.09.2026): die Seriennummern und der Typenkatalog.
const PanelUnitsPage = lazyNamed(() => import('../pages/production/PanelUnitsPage'), 'PanelUnitsPage');
const PanelUnitEditorPage = lazyNamed(() => import('../pages/production/PanelUnitEditorPage'), 'PanelUnitEditorPage');
const PanelModelEditorPage = lazyNamed(() => import('../pages/production/PanelModelEditorPage'), 'PanelModelEditorPage');
const CompanyTransfersPage = lazyNamed(() => import('../pages/settings/transfers/CompanyTransfersPage'), 'CompanyTransfersPage');
// Görevler (13.09.2026, Vorgabe Samet): eigenständiges Aufgabenmodul nach dem Vorbild
// Görevly — NICHT die CRM-Aufgaben unter /crm/tasks. Im Kleid des Lagers (lagerPage).
const TasksModuleListPage = lazyNamed(() => import('../pages/tasks/TasksListPage'), 'TasksListPage');
const TasksModuleBoardPage = lazyNamed(() => import('../pages/tasks/TaskBoardPage'), 'TaskBoardPage');
const TasksModuleApprovalsPage = lazyNamed(() => import('../pages/tasks/TaskApprovalsPage'), 'TaskApprovalsPage');
const TasksModulePeoplePage = lazyNamed(() => import('../pages/tasks/TaskPeoplePage'), 'TaskPeoplePage');
const TasksModuleChatPage = lazyNamed(() => import('../pages/tasks/TaskChatPage'), 'TaskChatPage');
const TasksModuleReportsPage = lazyNamed(() => import('../pages/tasks/TaskReportsPage'), 'TaskReportsPage');
const TasksModuleDetailPage = lazyNamed(loadTaskDetailPage, 'TaskDetailPage');
const AdminTaskGuidePage = lazyNamed(() => import('../pages/tasks/AdminTaskGuidePage'), 'AdminTaskGuidePage');
const MemberTaskGuidePage = lazyNamed(() => import('../pages/tasks/MemberTaskGuidePage'), 'MemberTaskGuidePage');
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
const AuthorizationPage = lazyNamed(() => import('../pages/settings/authorization/AuthorizationPage'), 'AuthorizationPage');
const RoleEditorPage = lazyNamed(() => import('../pages/settings/authorization/RoleEditorPage'), 'RoleEditorPage');
const PersonPage = lazyNamed(() => import('../pages/personnel/person/PersonPage'), 'PersonPage');
// Das eigene Profil ist seit dem 26.08.2026 eine EIGENE, einfachere Seite —
// nicht mehr die Personenseite mit einer Flagge (Vorgabe: zwei Flächen).
const ProfilePage = lazyNamed(() => import('../pages/personnel/person/ProfilePage'), 'ProfilePage');
const ModuleSettingsPage = lazyNamed(() => import('../pages/settings/modules/ModuleSettingsPage'), 'ModuleSettingsPage');
// Upload der IT (17.08.2026): Stammdaten aus einer CSV/Excel-Datei, Bestand
// immer 0. Sammelstelle mit Modulliste links — heute nur Produkte. Lebt in den
// Einstellungen und hinter der IT-Schleuse.
const TwoFactorSettingsPage = lazyNamed(() => import('../pages/settings/twoFactor/TwoFactorSettingsPage'), 'TwoFactorSettingsPage');
const UploadSettingsPage = lazyNamed(() => import('../pages/settings/upload/UploadSettingsPage'), 'UploadSettingsPage');

/* Alte CRM-Adressen von Angebot und Auftrag auf die Verkaufs-Adresse
   umbiegen — MIT der id, damit ein geteilter Link auf genau denselben
   Datensatz führt und nicht bloss auf die Liste. */
const LegacyQuoteRedirect = ({ report = false }: { report?: boolean }) => {
    const { id } = useParams();
    return <Navigate to={`/sales/quotes/${id}${report ? '/report' : ''}`} replace />;
};

const LegacyOrderRedirect = () => {
    const { id } = useParams();
    return <Navigate to={`/sales/orders/${id}`} replace />;
};

/* Der Wareneingang ist am 22.09.2026 erst ein REITER der Einkaufsseite
   geworden und am selben Tag stillgelegt («mal kabul bölümünü şimdilik
   kaldır», siehe `_disabled/inventory-receive/`). Der alte Link führt darum
   auf die Auftragsseite — nicht ins Leere. */
const ReceiveRedirect = () => {
    const { id } = useParams();
    return <Navigate to={`/inventory/orders/${id}`} replace />;
};

/* Rechnungen: vom Verkauf in die Buchhaltung (16.09.2026) — der Abfrageteil
   reist mit (?type=…, ?edit=…). */
const LegacyInvoicesRedirect = ({ to = '/accounting/invoices' }: { to?: string }) => {
    const { search } = useLocation();
    return <Navigate to={`${to}${search}`} replace />;
};

/* Schichtplanung ist eine Firmenrichtlinie: sie ändert die Sollstunden JEDES
   Berichts, deshalb steht sie hinter dem Personal-Schreibrecht. Ohne das Recht
   zeigt die Seite selbst nur noch an, statt zurückzuwerfen — auch wer den Plan
   nicht setzen darf, muss ihn nachschlagen können. */
const PersonnelReportRoute = ({ component }: { component: RouteComponent }) => {
    const permissions = useAuthStore((s) => s.permissions);
    if (!permissions.includes('attendance.read')) {
        return <Navigate to="/personnel" replace />;
    }
    return page(component);
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

// Firmenübertragungen (19.09.2026): Admin-Fläche wie die Firmenkategorien —
// woher die Produktion ihre Projekte liest, entscheidet, wer Rollen vergibt.
const CompanyTransfersAdminRoute = () => {
    const permissions = useAuthStore((s) => s.permissions);
    if (!permissions.includes('roles.manage')) {
        return <Navigate to="/" replace />;
    }
    return applePage(CompanyTransfersPage);
};

// Berechtigungen sind Admin-Gebiet wie die Firmenkategorien: Zugriff nur mit
// roles.manage — wer keine Rollen vergeben darf, darf auch keine Stufen setzen.
const AuthorizationAdminRoute = ({ detail = false }: { detail?: boolean }) => {
    const permissions = useAuthStore((s) => s.permissions);
    if (!permissions.includes('roles.manage')) {
        return <Navigate to="/" replace />;
    }
    return page(detail ? RoleEditorPage : AuthorizationPage);
};

// Zwei-Faktor (Aegis) neu einrichten: Recht aus der Rollenzeile ODER die
// Administratorrolle (deren Rechte folgen erst beim nächsten Öffnen der
// Berechtigungen). Der Server prüft dasselbe noch einmal.
const TwoFactorSettingsRoute = () => {
    const permissions = useAuthStore((s) => s.permissions);
    const isSystemAdmin = useAuthStore((s) => s.isSystemAdmin);
    if (!isSystemAdmin && !permissions.includes('security.mfa.view')) {
        return <Navigate to="/" replace />;
    }
    return page(TwoFactorSettingsPage);
};

const ProjectModuleRoute = ({ component }: { component: RouteComponent }) => {
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
        {/* Technikerkonten haben genau eine Arbeitsflaeche: den roten
            Montage-Arbeitsplatz. Wer dort landet, sagt die ROLLE — die Seite
            «Montage» in der Berechtigungstabelle —, nicht der Rollenname und
            keine fest eingetragene Adresse (lib/access.ts → shouldLandOnMontage). */}
        <Route path="/" element={<TechnicianBridge to="/montage">{page(Home)}</TechnicianBridge>} />
        <Route path="/roles" element={page(Roles)} />
        {/* ── Personalmodul (Menü 26.08.2026) ──────────────────────────────
            Liste (reine Ansicht) · Stempeluhr (Tablet) ·
            Arbeitszeiterfassung · Anträge.

            Der Detail- und der Buchhaltungsrapport sind in der
            Arbeitszeiterfassung aufgegangen, die drei Antragsseiten in der
            einen Antragsseite. Ihre Adressen bleiben als Weiterleitungen
            stehen: sie stecken in Lesezeichen, in alten Mails und in den
            Meldungen, die das Programm selbst verschickt hat. */}
        <Route path="/personnel" element={page(PersonnelListPage)} />
        <Route path="/personnel/terminal" element={page(TimeClockPage)} />
        <Route path="/personnel/time-records" element={<PersonnelReportRoute component={TimeRecordsPage} />} />
        <Route path="/personnel/requests" element={page(RequestsPage)} />
        {/* Die Personenseite steht NACH den festen Pfaden: ':id' schluckte
            sonst /personnel/terminal & Co. Das eigene Profil (/profile) ist
            eine EIGENE Seite: die relevanten Angaben, das Urlaubskonto und
            «Urlaub beantragen» — ohne die Verwaltungsreiter der Personenseite. */}
        <Route path="/personnel/:id" element={page(PersonPage)} />
        <Route path="/profile" element={page(ProfilePage)} />
        {/* Abgelöste Adressen des Moduls — sie führen dorthin, wo dieselbe
            Arbeit jetzt getan wird. `?tab=` trifft dabei den Reiter, der der
            alten Seite entspricht. */}
        <Route path="/personnel/reports" element={<Navigate to="/personnel/time-records" replace />} />
        <Route path="/personnel/accounting" element={<Navigate to="/personnel/time-records" replace />} />
        <Route path="/personnel/accounting/:employeeId" element={<Navigate to="/personnel/time-records" replace />} />
        <Route path="/personnel/leaves" element={<Navigate to="/personnel/requests?tab=mine" replace />} />
        <Route path="/personnel/approvals" element={<Navigate to="/personnel/requests?tab=incoming" replace />} />
        <Route path="/personnel/incoming" element={<Navigate to="/personnel/requests?tab=incoming" replace />} />
        {/* Die Schichtplanung ist eine Einstellung geworden. */}
        <Route path="/personnel/shift-plan" element={<Navigate to="/settings/modules?module=personnel&category=shift" replace />} />
        {/* Adressen des abgelösten Vorgängermoduls. */}
        <Route path="/employees" element={<Navigate to="/personnel" replace />} />
        <Route path="/attendance" element={<Navigate to="/personnel/terminal" replace />} />
        <Route path="/attendance-records" element={<Navigate to="/personnel/time-records" replace />} />
        <Route path="/attendance-settings" element={<Navigate to="/settings/modules?module=personnel&category=shift" replace />} />
        <Route path="/crm/overview" element={page(CrmOverview)} />
        <Route path="/crm/customers" element={page(CustomerList)} />
        <Route path="/crm/customers/:id" element={applePage(CustomerDashboard)} />
        <Route path="/crm/contacts" element={applePage(ContactsPage)} />
        <Route path="/crm/communication" element={applePage(CommunicationPage)} />
        {/* Anfragen und Aktivitaeten (10.09.2026) — die beiden neuen Listen
            des CRM-Menues; das oeffentliche Formular haengt unter /anfrage. */}
        <Route path="/crm/enquiries" element={applePage(EnquiriesPage)} />
        <Route path="/crm/activities" element={applePage(ActivitiesPage)} />
        <Route path="/crm/mail" element={page(MailPage)} />
        <Route path="/crm/tasks" element={applePage(TasksPage)} />
        <Route path="/crm/tasks/:id" element={applePage(TaskDetailPage)} />
        <Route path="/crm/reminders" element={applePage(RemindersPage)} />
        <Route path="/crm/quick-entry" element={applePage(QuickEntryPage)} />
        {/* Checklisten / Formulare: Liste, Vorlagen (fester Pfad VOR ':id'),
            Vorlagen-Editor, Einzelformular. */}
        <Route path="/crm/forms" element={applePage(FormsPage)} />
        <Route path="/crm/forms/templates" element={applePage(FormTemplatesPage)} />
        <Route path="/crm/forms/templates/new" element={page(FormTemplateBuilderPage)} />
        <Route path="/crm/forms/templates/:id" element={page(FormTemplateBuilderPage)} />
        <Route path="/crm/forms/:id" element={page(FormSubmissionPage)} />
        {/* Verkauf: Angebote und Aufträge. Sie lagen bis zum CRM-Umbau
            (2026-08-14) unter /crm/tenders bzw. /crm/my-orders — die alten
            Adressen leiten weiter, damit Lesezeichen und gespeicherte
            Arbeitsbereich-Reiter weiter aufgehen. */}
        <Route path="/sales" element={<Navigate to="/sales/quotes" replace />} />
        <Route path="/sales/quotes" element={page(TenderList)} />
        <Route path="/sales/quotes/:id" element={page(TenderDetail)} />
        <Route path="/sales/quotes/:id/report" element={page(TenderReport)} />
        <Route path="/sales/osp" element={page(OspPage)} />
        <Route path="/sales/orders" element={page(MyOrders)} />
        <Route path="/sales/orders/:id" element={page(MyOrderDetail)} />
        <Route path="/sales/addon-orders" element={page(AddonOrdersPage)} />
        {/* Feste Wege vor jedem ':id' — hier gibt es ohnehin keinen. */}
        <Route path="/sales/addon-orders/new" element={page(AddonOrderCreatePage)} />
        <Route path="/sales/addon-orders/:id/edit" element={page(AddonOrderCreatePage)} />
        {/* BUCHHALTUNG (16.09.2026, Schritt 5): Rechnungen entstehen, ändern
            und schliessen sich NUR hier. Feste Wege vor ':id'. Die früheren
            Adressen unter /sales/invoices leiten weiter (Lesezeichen,
            gespeicherte Reiter). */}
        <Route path="/accounting" element={<Navigate to="/accounting/invoices" replace />} />
        <Route path="/accounting/invoices" element={page(OutgoingInvoicesPage)} />
        <Route path="/accounting/invoices/new" element={page(NewInvoicePage)} />
        {/* Die Direktrechnung steht im Kleid der Pano-Seiten (25.09.2026) und
            darum in derselben Apple-Hülle wie die Produktion. */}
        <Route path="/accounting/invoices/new/direct" element={applePage(InvoiceDirectPage)} />
        <Route path="/accounting/invoices/:id" element={page(InvoiceDetailPage)} />
        <Route path="/accounting/to-bill" element={page(ToBillPage)} />
        <Route path="/sales/invoices" element={<LegacyInvoicesRedirect />} />
        <Route path="/sales/invoices/new/order" element={<LegacyInvoicesRedirect to="/accounting/invoices/new" />} />
        <Route path="/sales/invoices/new/direct" element={<LegacyInvoicesRedirect to="/accounting/invoices/new/direct" />} />
        <Route path="/crm/tenders" element={<Navigate to="/sales/quotes" replace />} />
        <Route path="/crm/tenders/:id" element={<LegacyQuoteRedirect />} />
        <Route path="/crm/tenders/:id/report" element={<LegacyQuoteRedirect report />} />
        <Route path="/crm/my-orders" element={<Navigate to="/sales/orders" replace />} />
        <Route path="/crm/my-orders/:id" element={<LegacyOrderRedirect />} />
        <Route path="/inventory" element={<Navigate to="/inventory/articles" replace />} />
        <Route path="/inventory/articles" element={lagerPage(ProductsPage)} />
        {/* Ürün ekleme artık TEKLİ form (detay ekranı düzeninde); toplu tablo
            kendi sayfasında yaşar. Sabit yollar ':id'den ÖNCE tanımlıdır. */}
        <Route path="/inventory/articles/new" element={lagerPage(ProductCreatePage)} />
        <Route path="/inventory/articles/bulk-new" element={lagerPage(ProductBulkCreatePage)} />
        {/* Detay: listeden satıra tıklayınca açılır; '/new' ile çakışmaması için
            sabit yol ÖNCE tanımlıdır. */}
        <Route path="/inventory/articles/:id" element={lagerPage(ProductDetailPage)} />
        {/* Malzeme/ürün birleşmesi (2026-08-14): ayrı malzeme listesi kalktı,
            eski yollar ürün listesine yönlenir. */}
        <Route path="/inventory/materials" element={<Navigate to="/inventory/articles" replace />} />
        <Route path="/inventory/materials/:id" element={<Navigate to="/inventory/articles" replace />} />
        <Route path="/inventory/stock" element={lagerPage(StockPage)} />
        <Route path="/inventory/stock/movements" element={lagerPage(StockMovementsPage)} />
        {/* Eski yol: hareket girişi artık ortak stok ekranında. */}
        <Route path="/inventory/movements" element={<Navigate to="/inventory/stock" replace />} />
        <Route path="/inventory/suppliers" element={lagerPage(SuppliersPage)} />
        {/* Satın alma siparişleri: liste + oluşturma/düzenleme (?id= ile düzenleme). */}
        <Route path="/inventory/orders" element={lagerPage(OrdersPage)} />
        <Route path="/inventory/orders/new" element={lagerPage(OrderWorkspacePage)} />
        {/* Mal kabul: siparişin satırlarını stoğa aktarma ekranı ('/new' sabit
            yolundan sonra tanımlıdır, :id ile çakışmaz). */}
        {/* Der alte Wareneingangsweg öffnet heute den Reiter derselben Seite. */}
        <Route path="/inventory/orders/:id/receive" element={<ReceiveRedirect />} />
        {/* Die BESTELLSEITE (08.09.2026): sie hat das alte Detail-Popup abgelöst.
            Steht NACH '/new' und nach dem Wareneingang, damit ':id' die festen
            Wege nicht schluckt. */}
        <Route path="/inventory/orders/:id" element={lagerPage(OrderWorkspacePage)} />
        {/* Produktion: die Projektseite hängt unter den Aufträgen. */}
        <Route path="/production" element={<Navigate to="/production/orders" replace />} />
        <Route path="/production/orders" element={productionPage(ProductionOrdersPage)} />
        <Route path="/production/orders/:projectId" element={productionPage(ProductionProjectPage)} />
        <Route path="/production/orders/:projectId/devices/:deviceId" element={productionPage(ProductionDevicePage)} />
        <Route path="/production/lines" element={productionPage(ProductionLinesPage)} />
        {/* Schaltschränke: die Serienliste, dahinter der Typenkatalog. */}
        <Route path="/production/panels" element={productionPage(PanelUnitsPage)} />
        <Route path="/production/panels/new" element={productionPage(PanelUnitEditorPage)} />
        <Route path="/production/panels/models/new" element={productionPage(PanelModelEditorPage)} />
        <Route path="/production/panels/models/:modelId" element={productionPage(PanelModelEditorPage)} />
        <Route path="/production/panels/:unitId" element={productionPage(PanelUnitEditorPage)} />
        <Route path="/production/panel-models" element={<Navigate to="/production/panels?view=models" replace />} />
        {/* Görevler-Modul: feste Wege vor ':taskId'. */}
        <Route path="/tasks" element={lagerPage(TasksModuleListPage)} />
        <Route path="/tasks/board" element={lagerPage(TasksModuleBoardPage)} />
        <Route path="/tasks/approvals" element={lagerPage(TasksModuleApprovalsPage)} />
        <Route path="/tasks/people" element={lagerPage(TasksModulePeoplePage)} />
        <Route path="/tasks/chat" element={lagerPage(TasksModuleChatPage)} />
        <Route path="/tasks/chat/:roomId" element={lagerPage(TasksModuleChatPage)} />
        <Route path="/tasks/reports" element={lagerPage(TasksModuleReportsPage)} />
        <Route path="/tasks/guide/admin" element={lagerPage(AdminTaskGuidePage)} />
        <Route path="/tasks/guide/member" element={lagerPage(MemberTaskGuidePage)} />
        <Route path="/tasks/:taskId" element={lagerPage(TasksModuleDetailPage)} />
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
        {/* Upload: NUR die IT-Schleuse steht davor — kein Lagerrecht. Die IT
            pflegt Stammdaten, ohne dafür im Lagermodul zu sitzen; der Server
            prüft denselben Ausweis noch einmal (ItGateMiddleware). Das Modul
            steht in der Abfrage (?module=products), die alten Adressen unter
            '/upload' leiten hierher. */}
        <Route path="/settings/upload" element={<LazyItGate>{page(UploadSettingsPage)}</LazyItGate>} />
        <Route path="/upload" element={<Navigate to="/settings/upload?module=products" replace />} />
        <Route path="/upload/products" element={<Navigate to="/settings/upload?module=products" replace />} />
        {/* 16.09.2026 (Samet): das GANZE Einstellungsmenü steht hinter dem einen
            Kennwort der IT-Schleuse — die Seiten ebenso, sonst öffnet eine
            getippte Adresse, was das gesperrte Menü verbirgt. */}
        <Route path="/settings/pdf" element={<LazyItGate>{page(PdfSettings)}</LazyItGate>} />
        {/* Firmen- und E-Mail-Einstellungen stehen hinter der IT-Schleuse
            (Kennwortabfrage, "nur IT-Administration") — ZUSÄTZLICH zur
            jeweiligen Berechtigungsprüfung, nicht statt ihrer. */}
        <Route path="/settings/company-categories" element={<LazyItGate><CompanyCategoriesAdminRoute /></LazyItGate>} />
        <Route path="/settings/company-transfers" element={<LazyItGate><CompanyTransfersAdminRoute /></LazyItGate>} />
        <Route path="/settings/mail" element={<LazyItGate><ProjectModuleRoute component={MailSettings} /></LazyItGate>} />
        <Route path="/settings/checklists" element={<LazyItGate><ProjectModuleRoute component={ChecklistSettings} /></LazyItGate>} />
        {/* Berechtigungen: Zugangs­daten + Modulstufen je Person — Admin-Fläche. */}
        <Route path="/settings/authorization" element={<LazyItGate><AuthorizationAdminRoute /></LazyItGate>} />
        {/* Fester Pfad VOR ':id' — sonst wird "new" als Rollen-id gelesen. */}
        <Route path="/settings/authorization/new" element={<LazyItGate><AuthorizationAdminRoute detail /></LazyItGate>} />
        <Route path="/settings/authorization/:id" element={<LazyItGate><AuthorizationAdminRoute detail /></LazyItGate>} />
        {/* Moduleinstellungen: oben die Einstellungsart (Erinnerungen), links
            die Module. Das frühere Erinnerungs-Menü führt hierher. */}
        <Route path="/settings/modules" element={<LazyItGate>{page(ModuleSettingsPage)}</LazyItGate>} />
        <Route path="/settings/two-factor" element={<LazyItGate><TwoFactorSettingsRoute /></LazyItGate>} />
        <Route path="/settings/reminders" element={<Navigate to="/settings/modules?module=sales&category=reminders" replace />} />
    </>
);
