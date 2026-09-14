import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Check, InfoCircle, XClose as CloseOutlined } from './components/icons/antIconCompat';
import { AppRouter } from './routes/AppRouter';
import { useAuthStore, hasSessionHint } from './store/authStore';
import i18n from './i18n';

const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;
const LazyToaster = lazy(() => import('sonner').then((mod) => ({ default: mod.Toaster })));

const ToastIcon = ({ tone }: { tone: 'info' | 'success' | 'warning' | 'error' }) => {
    const toneClass = {
        info: 'toast-icon-info',
        success: 'toast-icon-success',
        warning: 'toast-icon-warning',
        error: 'toast-icon-error',
    }[tone];
    // Das farbige Symbolquadrat eines Mac-Banners (styles/notifications.css):
    // Haken / i / Dreieck / Ausrufezeichen in Weiss auf der Systemfarbe.
    const Icon = { success: Check, info: InfoCircle, warning: AlertTriangle, error: AlertCircle }[tone];

    return (
        <span className={`toast-icon-ring ${toneClass}`}>
            <Icon size={18} />
        </span>
    );
};

const ToastProvider = () => {
    const [shouldMount, setShouldMount] = useState(false);

    useEffect(() => {
        // Sonner is not needed to paint or operate the initial route. A plain
        // idle callback fires during the first loading gap and pulled the whole
        // toast runtime into Lighthouse's critical window, so wait until the
        // page has settled. Calls made earlier are queued by Sonner itself.
        const id = globalThis.setTimeout(() => setShouldMount(true), 4000);
        return () => globalThis.clearTimeout(id);
    }, []);

    if (!shouldMount) return null;

    return (
        <Suspense fallback={null}>
            <LazyToaster
                position="top-right"
                // Ganz in der rechten oberen Ecke, über der Kopfzeile wie ein
                // macOS-Banner (Samet, 11.09.) — der Wecker sitzt auf derselben
                // Linie; nur die Mitteilungszentrale bleibt unter der Glocke.
                offset={{ top: 10, right: 10 }}
                mobileOffset={{ top: 10, right: 16, left: 16 }}
                gap={10}
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
                            <CloseOutlined size={11} />
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
        </Suspense>
    );
};

function App() {
    const fetchProfile = useAuthStore((state) => state.fetchProfile);
    const [, setLanguageVersion] = useState(0);

    useEffect(() => {
        // Auth cookies are HttpOnly (invisible to JS); a non-sensitive marker
        // tells us whether a session likely exists and a profile fetch is worth it.
        if (hasSessionHint()) {
            fetchProfile();

            // Start direct tender visits in parallel with profile validation.
            // This removes the old profile -> route JS -> tender API waterfall.
            const match = window.location.pathname.match(
                /^\/(?:sales\/quotes|crm\/tenders)\/([^/?#]+)\/?$/,
            );
            const tenderId = match?.[1];
            if (tenderId && tenderId !== 'new') {
                void import('./pages/sales/TenderDetail').catch(() => undefined);
                void import('./store/tenderStore')
                    .then(({ useTenderStore }) => {
                        const state = useTenderStore.getState();
                        if (state.detail?.tender.id !== tenderId) {
                            return state.fetchDetail(tenderId);
                        }
                    })
                    .catch(() => undefined);
            }

            // Project-detail visits used to wait for all profile requests before
            // loading both their route chunk and overview data. Start both now;
            // the protected route still controls when anything is rendered.
            const projectMatch = window.location.pathname.match(/^\/projects\/([^/?#]+)$/);
            const projectId = projectMatch?.[1];
            if (projectId) {
                void import('./pages/project/ProjectDetail').catch(() => undefined);
                void import('./lib/api/project')
                    .then(({ projectApi }) => projectApi.prefetchById(projectId, 'overview'))
                    .catch(() => undefined);
            }
        } else useAuthStore.setState({ isLoading: false });
    }, [fetchProfile]);

    useEffect(() => {
        const handleLanguageChange = () => setLanguageVersion((version) => version + 1);
        i18n.on('languageChanged', handleLanguageChange);
        return () => {
            i18n.off('languageChanged', handleLanguageChange);
        };
    }, []);

    return (
        <Router>
            <ToastProvider />
            {/* A language event only needs a normal render so direct t()
                calls receive the new strings. Giving the router a changing
                key unmounted and rebuilt the entire shell/detail table when
                the initial locale chunk arrived, producing a second DOM
                insertion, forced layout work and visible footer movement. */}
            <AppRouter />
        </Router>
    );
}

export default App;
