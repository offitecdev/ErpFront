import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './routes/AppRouter';
import { useAuthStore } from './store/authStore';

function App() {
    const fetchProfile = useAuthStore((state) => state.fetchProfile);

    useEffect(() => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (token) fetchProfile();
        else useAuthStore.setState({ isLoading: false });
    }, [fetchProfile]);

    return (
        <BrowserRouter>
            <AppRouter />
        </BrowserRouter>
    );
}

export default App;
