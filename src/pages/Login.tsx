import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { LuArrowLeft, LuArrowRight, LuBookOpen, LuCheck, LuCloudDownload, LuGlobe, LuMoon, LuSun, LuX } from '@/components/icons/lucideLocal';
import { toast } from 'sonner';
import AntInput, { type InputRef } from 'antd/es/input';
import { Button } from '@/components/ui-shared/Button';
import { LanguageSwitcher } from '@/components/ui-shared/LanguageSwitcher';
import { Snowflake } from '@/components/ui-shared/Snowflake';
import offitecLogo from '../assets/images/offitec-1x.webp';
import offitecLogo2x from '../assets/images/offitec-2x.webp';
import offitecLogoDark from '../assets/images/darkmode-1x.webp';
import offitecLogoDark2x from '../assets/images/darkmode-2x.webp';
import { apiClient } from '../lib/axios';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';

import '../styles/login.css';

// Accepted top-level domains for the workspace.
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.(com|eu|ch|uk|tr)$/i;
const LOGIN_GUIDE_DISMISSED_KEY = 'offitec-login-guide-dismissed';
const MANUAL_PDF_URL = '/Benutzerhandbuch.pdf';
const PRODUCTION_PROTOTYPE_URL = 'https://prototip.offitec.ch/';

type Step = 'email' | 'password';

const ThemeToggle = () => {
    const { isDarkMode, toggleTheme } = useThemeStore();
    const { t } = useTranslation();
    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDarkMode ? t('common.lightMode') : t('common.darkMode')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-black/[0.02] text-[#0f172a] transition-colors hover:bg-black/[0.05] dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={isDarkMode ? 'moon' : 'sun'}
                    initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.2 }}
                    className="inline-flex"
                >
                    {isDarkMode ? <LuMoon size={17} /> : <LuSun size={17} />}
                </motion.span>
            </AnimatePresence>
        </button>
    );
};

export const Login = () => {
    const { t } = useTranslation();
    const isDarkMode = useThemeStore((state) => state.isDarkMode);
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showGuidePopup, setShowGuidePopup] = useState(() => {
        try {
            return window.localStorage.getItem(LOGIN_GUIDE_DISMISSED_KEY) !== 'true';
        } catch {
            return true;
        }
    });
    const passwordRef = useRef<InputRef>(null);

    const { login, fetchProfile } = useAuthStore();

    const emailValid = VALID_EMAIL.test(email.trim());

    useEffect(() => {
        if (step === 'password') {
            const id = window.setTimeout(() => passwordRef.current?.focus(), 220);
            return () => window.clearTimeout(id);
        }
    }, [step]);

    const goToPassword = () => {
        if (!emailValid) {
            toast.error(t('auth.errorInvalid'));
            return;
        }
        setStep('password');
    };

    const goBack = () => {
        setStep('email');
        setPassword('');
    };

    const handleLogin = async () => {
        if (!email || !password) {
            toast.error(t('auth.errorEmpty'));
            return;
        }

        try {
            setLoading(true);
            const response = await apiClient.post('/auth/login', { email, password });
            // Tokens arrive as HttpOnly cookies; the body only carries the employee.
            const { employee } = response.data;

            if (!employee) {
                throw new Error(response.data?.error || response.data?.message || t('auth.errorMissingData'));
            }

            login(employee);
            await fetchProfile();
            toast.success(t('auth.successLogin'));
        } catch (error: any) {
            toast.error(error.response?.data?.error || error.response?.data?.message || error.message || t('auth.errorInvalid'));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (step === 'email') goToPassword();
        else handleLogin();
    };

    const dismissGuidePopup = () => {
        setShowGuidePopup(false);
        try {
            window.localStorage.setItem(LOGIN_GUIDE_DISMISSED_KEY, 'true');
        } catch {
            // Ignore storage errors; the close action should still feel immediate.
        }
    };

    return (
        <main className="ofi-login2 grid min-h-screen place-items-center px-6">
            {/* Navy logo, top-left */}
            <img
                src={isDarkMode ? offitecLogoDark : offitecLogo}
                srcSet={`${isDarkMode ? offitecLogoDark : offitecLogo} 96w, ${isDarkMode ? offitecLogoDark2x : offitecLogo2x} 180w`}
                sizes="96px"
                alt="Offitec ERP"
                width={96}
                height={38}
                className="absolute left-6 top-6 z-10 h-8 w-auto object-contain sm:left-8 sm:top-8"
            />

            {/* Big detailed snowflake, right */}
            <Snowflake className="ofi-login2__flake" />

            {/* Top-right controls */}
            <div className="absolute right-5 top-5 z-10 flex items-center gap-2 sm:right-8 sm:top-8">
                <LanguageSwitcher />
                <ThemeToggle />
            </div>

            <nav className="ofi-login2__resource-dock" aria-label="Login-Schnellzugriffe">
                <a className="ofi-login2__resource-card ofi-login2__resource-card--manual" href={MANUAL_PDF_URL} download="Benutzerhandbuch.pdf">
                    <span className="ofi-login2__resource-icon">
                        <LuBookOpen size={18} />
                    </span>
                    <span className="ofi-login2__resource-copy">
                        <span className="ofi-login2__resource-kicker">Handbuch</span>
                        <span className="ofi-login2__resource-title">Benutzerhandbuch</span>
                    </span>
                    <LuCloudDownload className="ofi-login2__resource-action" size={16} />
                </a>
                <a className="ofi-login2__resource-card ofi-login2__resource-card--prototype" href={PRODUCTION_PROTOTYPE_URL} target="_blank" rel="noreferrer">
                    <span className="ofi-login2__resource-icon">
                        <LuGlobe size={18} />
                    </span>
                    <span className="ofi-login2__resource-copy">
                        <span className="ofi-login2__resource-kicker">Weblink</span>
                        <span className="ofi-login2__resource-title">Produktionsprototyp Türkei</span>
                    </span>
                    <LuArrowRight className="ofi-login2__resource-action" size={16} />
                </a>
            </nav>

            <AnimatePresence>
                {showGuidePopup && (
                    <motion.div
                        className="ofi-login2__guide-layer"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.14 }}
                    >
                        <motion.section
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="ofi-login-guide-title"
                            className="ofi-login2__guide-panel"
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <button type="button" className="ofi-login2__guide-close" onClick={dismissGuidePopup} aria-label="Popup schließen">
                                <LuX size={18} />
                            </button>

                            <div className="ofi-login2__guide-badge">
                                Beim ersten Einstieg
                            </div>

                            <h2 id="ofi-login-guide-title">Willkommen im Offitec Arbeitsbereich</h2>
                            <p className="ofi-login2__guide-lead">
                                Nutzen Sie die Schnellzugriffe für das Benutzerhandbuch und den Produktionsprototyp Türkei.
                            </p>

                            <div className="ofi-login2__guide-grid">
                                <a className="ofi-login2__guide-card ofi-login2__guide-card--manual" href={MANUAL_PDF_URL} download="Benutzerhandbuch.pdf">
                                    <span className="ofi-login2__guide-card-icon">
                                        <LuBookOpen size={24} />
                                    </span>
                                    <span className="ofi-login2__guide-card-kicker">PDF-Handbuch</span>
                                    <strong>Benutzerhandbuch</strong>
                                    <span>Zum Benutzerhandbuch klicken und herunterladen.</span>
                                    <em>
                                        Handbuch herunterladen
                                        <LuArrowRight size={15} />
                                    </em>
                                </a>

                                <a className="ofi-login2__guide-card ofi-login2__guide-card--prototype" href={PRODUCTION_PROTOTYPE_URL} target="_blank" rel="noreferrer">
                                    <span className="ofi-login2__guide-card-icon">
                                        <LuGlobe size={24} />
                                    </span>
                                    <span className="ofi-login2__guide-card-kicker">Web-Prototyp</span>
                                    <strong>Produktionsprototyp Türkei</strong>
                                    <span>Vorläufiger Link zum Produktionsprototyp.</span>
                                    <em>
                                        Prototyp öffnen
                                        <LuArrowRight size={15} />
                                    </em>
                                </a>
                            </div>
                        </motion.section>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Centered minimal column */}
            <div className="ofi-login2__enter relative z-[1] w-full max-w-[420px]">
                <AnimatePresence mode="wait" initial={false}>
                    {step === 'email' ? (
                        <motion.div
                            key="email-step"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <h1 className="text-center text-[30px] font-bold tracking-tight text-[var(--l2-text)] sm:text-[36px]">
                                {t('auth.emailQuestion')}
                            </h1>

                            <form onSubmit={handleSubmit} className="mt-8 space-y-3">
                                <AntInput
                                    type="email"
                                    className="ofi-login2__input"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder={t('auth.emailPlaceholder')}
                                    size="large"
                                    autoFocus
                                    autoComplete="email"
                                    suffix={
                                        <AnimatePresence>
                                            {emailValid && (
                                                <motion.span
                                                    initial={{ scale: 0, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    exit={{ scale: 0, opacity: 0 }}
                                                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#079455] text-white"
                                                >
                                                    <LuCheck size={11} strokeWidth={3} />
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                    }
                                />

                                <Button
                                    type="submit"
                                    size="lg"
                                    color="primary"
                                    className="ofi-login2__btn h-[52px] w-full text-[15px] shadow-[0_8px_18px_rgba(26,35,97,0.18)]"
                                    iconTrailing={<LuArrowRight size={16} />}
                                    isDisabled={!emailValid}
                                >
                                    {t('auth.continue')}
                                </Button>
                            </form>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="password-step"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <h1 className="text-center text-[30px] font-bold tracking-tight text-[var(--l2-text)] sm:text-[36px]">
                                {t('auth.enterPasswordTitle')}
                            </h1>
                            <p className="mt-2 text-center text-sm text-[var(--l2-sub)]">
                                {t('auth.enterPasswordSubtitle')} <span className="font-medium text-[var(--l2-text)]">{email.trim()}</span>
                            </p>

                            <form onSubmit={handleSubmit} className="mt-8 space-y-3">
                                <AntInput.Password
                                    ref={passwordRef}
                                    className="ofi-login2__input"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder={t('auth.passwordPlaceholder')}
                                    size="large"
                                    autoComplete="current-password"
                                />

                                <Button
                                    type="submit"
                                    size="lg"
                                    color="primary"
                                    className="ofi-login2__btn h-[52px] w-full text-[15px] shadow-[0_8px_18px_rgba(26,35,97,0.18)]"
                                    iconTrailing={<LuArrowRight size={16} />}
                                    isLoading={loading}
                                    showTextWhileLoading
                                >
                                    {t('auth.signIn')}
                                </Button>

                                <button
                                    type="button"
                                    onClick={goBack}
                                    className="group mx-auto flex items-center justify-center gap-1.5 pt-1 text-sm font-medium text-[var(--l2-sub)] transition-colors hover:text-[var(--l2-text)]"
                                >
                                    <LuArrowLeft size={15} className="transition-transform group-hover:-translate-x-0.5" />
                                    {t('auth.back')}
                                </button>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>

                <p className="mt-10 text-center text-xs leading-5 text-[var(--l2-sub)]">{t('auth.demoNotice')}</p>
            </div>

            {/* Bottom-right label */}
            <span className="absolute bottom-5 right-6 z-[1] text-xs font-medium text-[var(--l2-sub)] max-sm:hidden">
                offitec management panel
            </span>
        </main>
    );
};
