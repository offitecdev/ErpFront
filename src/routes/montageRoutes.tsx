import { Navigate, Outlet, Route } from 'react-router-dom';

// Die Bedingung selbst steht in lib/useMontageWorkspace — auch MainLayouts
// Seitenwächter liest sie, und der darf die Routendatei nicht holen.
import { useMontageIsWorkspace } from '../lib/useMontageWorkspace';
// routeHelpers'tan (appPageRoutes'tan DEĞİL): appPageRoutes bu dosyadan köprü
// bileşenleri aldığı için oradan almak modül döngüsü yaratır ve `lazyNamed`
// başlatılmadan çalışıp uygulamayı açılışta düşürür.
import { lazyNamed, page } from './routeHelpers';

/* ── Technician montage screens ──
   Tablet-Vollbild ohne Seitenleiste. Wer hereinkommt, entscheidet allein
   canOpenMontage (lib/access.ts): nie die Administratorrolle, nur mit dem
   Recht im Rücken (eine Rolle ohne jedes Recht ausgenommen), und dann auf
   eines von zwei Zeichen hin — die Stufenkarte sagt Technikerrolle, ODER
   Name/Konto tun es.

   MainLayouts allgemeiner Seitenwächter lässt /montage in Ruhe; umgekehrt
   hält er den Monteur jetzt HIER fest: für ihn ist dieser Bildschirm die
   ganze Anwendung, jede andere Adresse führt zurück auf /montage (Kalender
   und eigenes Profil ausgenommen). Beide lesen dieselbe Bedingung aus
   lib/useMontageWorkspace, sonst schieben sich die Weiterleitungen. */

const MontageLayout = lazyNamed(() => import('../pages/montage/MontageLayout'), 'MontageLayout');
const MontageHome = lazyNamed(() => import('../pages/montage/MontageHome'), 'MontageHome');
const MontageActiveOrders = lazyNamed(() => import('../pages/montage/MontageOrders'), 'MontageActiveOrders');
const MontageCompletedOrders = lazyNamed(() => import('../pages/montage/MontageOrders'), 'MontageCompletedOrders');
const MontageOrderDetail = lazyNamed(() => import('../pages/montage/MontageOrderDetail'), 'MontageOrderDetail');
const MontageReports = lazyNamed(() => import('../pages/montage/MontageReports'), 'MontageReports');
const MontageReportDetail = lazyNamed(() => import('../pages/montage/MontageReportDetail'), 'MontageReportDetail');
const MontageGeneralReport = lazyNamed(() => import('../pages/montage/MontageGeneralReport'), 'MontageGeneralReport');
const MontageHandover = lazyNamed(() => import('../pages/montage/MontageHandover'), 'MontageHandover');
const MontageFormPage = lazyNamed(() => import('../pages/montage/MontageFormPage'), 'MontageFormPage');

const MontageGuard = () => {
    // Der rote Arbeitsplatz gehört den Technikern: jede andere Rolle — die
    // Administratorrolle eingeschlossen — geht auf ihre eigene Startseite.
    const isWorkspace = useMontageIsWorkspace();
    if (!isWorkspace) return <Navigate to="/" replace />;
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
            {/* Checkliste / Formular am Termin — derselbe Editor wie im Büro. */}
            <Route path="/montage/forms/:submissionId" element={page(MontageFormPage)} />
            <Route path="/montage/calendar" element={<Navigate to="/calendar" replace />} />
        </Route>
    </Route>
);

/* ── Old-route bridging ──
   Technicians landing on the legacy installation screens (menu entries,
   notification links) are carried into the new montage UI; everyone else
   keeps the old pages. */

export const TechnicianBridge = ({ to, children }: { to: string; children: React.ReactNode }) => {
    // Wer den roten Arbeitsplatz öffnen darf, STARTET dort auch: er ist die
    // einzige Arbeitsfläche eines Monteurs. Dieselbe Prüfung wie im Wächter,
    // sonst schieben sich die beiden Weiterleitungen hin und her. Jede andere
    // Rolle sieht hier ihre eigene Startseite.
    const isWorkspace = useMontageIsWorkspace();
    if (isWorkspace) return <Navigate to={to} replace />;
    return <>{children}</>;
};
