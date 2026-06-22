import { useEffect, useState } from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { Toaster } from 'sonner';
import { AlertCircle, CheckCircle, XClose as CloseOutlined } from './components/icons/antIconCompat';
import { AppRouter } from './routes/AppRouter';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import i18n from './i18n';

const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

const ToastIcon = ({ tone }: { tone: 'info' | 'success' | 'warning' | 'error' }) => {
    const toneClass = {
        info: 'toast-icon-info',
        success: 'toast-icon-success',
        warning: 'toast-icon-warning',
        error: 'toast-icon-error',
    }[tone];
    const Icon = tone === 'success' ? CheckCircle : AlertCircle;

    return (
        <span className={`toast-icon-ring ${toneClass}`}>
            <Icon size={18} />
        </span>
    );
};

const ToastProvider = () => {
    return (
        <Toaster 
            position="top-right"
            duration={2000}
            closeButton
            richColors={false}
            className="offitec-toaster"
            icons={{
                info: <ToastIcon tone="info" />,
                success: <ToastIcon tone="success" />,
                warning: <ToastIcon tone="warning" />,
                error: <ToastIcon tone="error" />,
                close: (
                    <span className="offitec-toast-close-icon">
                        <CloseOutlined size={16} />
                    </span>
                ),
            }}
            toastOptions={{
                duration: 2000,
                classNames: {
                    toast: 'offitec-toast',
                    title: 'offitec-toast-title',
                    description: 'offitec-toast-description',
                    closeButton: 'offitec-toast-close',
                    actionButton: 'offitec-toast-action',
                    cancelButton: 'offitec-toast-cancel',
                    icon: 'offitec-toast-icon',
                    content: 'offitec-toast-content',
                },
            }}
        />
    );
};

function App() {
    const fetchProfile = useAuthStore((state) => state.fetchProfile);
    const isDarkMode = useThemeStore((state) => state.isDarkMode);
    const [languageVersion, setLanguageVersion] = useState(0);

    useEffect(() => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (token) fetchProfile();
        else useAuthStore.setState({ isLoading: false });
    }, [fetchProfile]);

    useEffect(() => {
        const handleLanguageChange = () => setLanguageVersion((version) => version + 1);
        i18n.on('languageChanged', handleLanguageChange);
        return () => {
            i18n.off('languageChanged', handleLanguageChange);
        };
    }, []);

    return (
        <ConfigProvider
            theme={{
                algorithm: isDarkMode ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
                token: {
                    fontFamily: '"Google Sans", Arial, sans-serif',
                    borderRadius: 10,
                    borderRadiusXS: 10,
                    borderRadiusSM: 10,
                    borderRadiusLG: 10,
                    borderRadiusOuter: 10,
                    colorPrimary: isDarkMode ? '#e6cf9e' : '#272f67',
                    colorError: '#d30f15',
                    colorSuccess: '#079455',
                    colorWarning: '#dc6803',
                    ...(isDarkMode && {
                        colorInfo: '#e6cf9e',
                        colorLink: '#e6cf9e',
                        colorLinkHover: '#f0dcae',
                        colorPrimaryBg: 'rgba(230,207,158,0.14)',
                        colorPrimaryBgHover: 'rgba(230,207,158,0.20)',
                        colorPrimaryBorder: 'rgba(230,207,158,0.34)',
                        colorPrimaryHover: '#f0dcae',
                        colorPrimaryActive: '#d9bd83',
                        colorBgContainer: '#151616',
                        colorBgElevated: '#1b1c1c',
                        colorBgLayout: '#08090a',
                        colorBorder: 'rgba(255,255,255,0.10)',
                        colorBorderSecondary: 'rgba(255,255,255,0.07)',
                        colorText: '#e8e9ec',
                        colorTextSecondary: '#b0b3bb',
                        colorTextTertiary: '#888c96',
                        colorTextQuaternary: '#6b7280',
                    }),
                },
            }}
        >
            <Router>
                <ToastProvider />
                <AppRouter key={languageVersion} />
            </Router>
        </ConfigProvider>
    );
}

export default App;
