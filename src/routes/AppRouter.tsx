import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicRoute } from './PublicRoute';
import { MainLayout } from '../components/layout/MainLayout';
import { lazyNamed, page, renderAppPageRoutes } from './appPageRoutes';

const Login = lazyNamed(() => import('../pages/Login'), 'Login');
const BookingPage = lazyNamed(() => import('../pages/project/BookingPage'), 'BookingPage');
const ReportSigningPage = lazyNamed(() => import('../pages/services/ReportSigningPage'), 'ReportSigningPage');
const MaintenanceBookingPage = lazyNamed(() => import('../pages/maintenance/MaintenanceBookingPage'), 'MaintenanceBookingPage');

export const AppRouter = () => {
    return (
        <Routes>
            <Route element={<PublicRoute />}>
                <Route path="/login" element={page(Login)} />
            </Route>

            <Route path="/booking/:token" element={page(BookingPage)} />
            <Route path="/maintenance-booking/:token" element={page(MaintenanceBookingPage)} />
            <Route path="/report-sign/:token" element={page(ReportSigningPage)} />

            <Route element={<ProtectedRoute />}>
                <Route element={<MainLayout />}>
                    {renderAppPageRoutes()}
                </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};
