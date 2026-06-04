import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { LoadingScreen } from '../components/layout/LoadingScreen';

export const ProtectedRoute = () => {
    const { isAuthenticated, isLoading } = useAuthStore();

    if (isLoading && !isAuthenticated) {
        return <LoadingScreen />;
    }

    return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};
