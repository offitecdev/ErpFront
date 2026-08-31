import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LuEye, LuEyeOff, LuMoon, LuQrCode, LuSun, LuTriangleAlert } from '@/components/icons/lucideLocal';
import { InstallAppButton } from '@/components/ui-shared/InstallAppButton';
import { LoginWave } from '@/components/login/LoginWave';
import { LoginNotifications } from '@/components/login/LoginNotifications';
import { LoginQrDialog } from '@/components/login/LoginQrDialog';
import type { LoginQrPayload } from '@/components/login/loginQrPayload';
import { SUPPORTED_LANGUAGES } from '@/i18n/loadResources';
import offitecLogo from '../assets/images/offitec-1x.webp';
import offitecLogo2x from '../assets/images/offitec-2x.webp';
import offitecLogoDark from '../assets/images/darkmode-1x.webp';
import offitecLogoDark2x from '../assets/images/darkmode-2x.webp';
import { apiClient } from '../lib/axios';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';

import '../styles/login.css';

/**
 * ── ANMELDESEITE (v3, 15.08.2026) ───────────────────────────────────────────
 *
 * Aufbau von oben nach unten:
 *   • Kopfzeile — nicht ganz am Rand — mit Logo links und rechts Sprache
 *     TR·EN·DE, Hell/Dunkel und (falls installierbar) dem App-Installieren-
 *     Knopf. Darunter läuft die grosse Welle von oben herein; sie beginnt
 *     erst unterhalb der Kopfzeile und löst sich nach unten im Verlauf auf.
 *   • Formular: E-Mail und Passwort gleichzeitig sichtbar (kein Zwei-Schritt-
 *     Ablauf mehr), „E-Mail merken", grosser Anmelden-Knopf, daneben der
 *     kleine QR-Knopf, der die Kamera in einem Popup öffnet.
 *     Fehler: das Formular schüttelt sich (am Handy zusätzlich Vibration),
 *     rote Meldung direkt unter dem betroffenen Feld bzw. unter dem Knopf.
 *   • Rechts (nur Desktop) eine kurze Erklärung — in der Programmschrift
 *     Open Sans, wie das Formular. Die Titelschrift `.ofi-serif` ist seit
 *     16.08.2026 programmweit Open Sans; die Anmeldeseite lenkt sie für
 *     sich auf Times New Roman zurück (login.css, `--ofi-serif` im
 *     Token-Block). Times tragen seit 17.08.2026 nur noch die Rechtezeile
 *     unten und der Titel des QR-Popups; Erklärtext, Mitteilungen,
 *     Überschrift und Formular laufen in Open Sans.
 *   • Ganz unten nur noch die Rechtezeile — die Welle sitzt oben.
 *   • Unten links die Glocke mit der herausgleitenden Mitteilungsleiste.
 *
 * Kein Ant Design, keine Animationsbibliothek — nur React, CSS und die
 * lokalen Lucide-Icons.
 */

// Accepted top-level domains for the workspace.
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.(com|eu|ch|uk|tr)$/i;
/**
 * Kontaktadressen im Erklärtext rechts. Adressen sind keine Übersetzung,
 * darum stehen sie hier und nicht in den Sprachdateien.
 */
const CONTACT_EMAILS = ['help@offitec.ch', 'sck@offitec.eu'];
/** Feste Servermeldung für falsche Zugangsdaten (LoginUseCase) → wird übersetzt. */
const INVALID_CREDENTIALS_SERVER_MESSAGE = 'E-posta veya parola hatalı.';
/** „E-Mail merken": die zuletzt verwendete Adresse, nur lokal im Browser. */
const REMEMBER_KEY = 'offitec:login-email';

const readRemembered = () => {
    try {
        return window.localStorage.getItem(REMEMBER_KEY) ?? '';
    } catch {
        return '';
    }
};

const writeRemembered = (email: string | null) => {
    try {
        if (email) window.localStorage.setItem(REMEMBER_KEY, email);
        else window.localStorage.removeItem(REMEMBER_KEY);
    } catch {
        /* Speicher nicht verfügbar */
    }
};

interface FieldErrors {
    email?: string;
    password?: string;
    form?: string;
}

const LanguageToggle = () => {
    const { i18n, t } = useTranslation();
    const current = (i18n.resolvedLanguage || i18n.language || '').slice(0, 2);
    return (
        <div className="ofi-login__lang" role="group" aria-label={t('language.title')}>
            {SUPPORTED_LANGUAGES.map((code) => (
                <button
                    key={code}
                    type="button"
                    className={`ofi-login__lang-btn${current === code ? ' is-active' : ''}`}
                    aria-pressed={current === code}
                    title={t(`language.${code}`)}
                    onClick={() => void i18n.changeLanguage(code)}
                >
                    {code.toUpperCase()}
                </button>
            ))}
        </div>
    );
};

const ThemeToggle = () => {
    const { isDarkMode, toggleTheme } = useThemeStore();
    const { t } = useTranslation();
    return (
        <button
            type="button"
            onClick={toggleTheme}
            className="ofi-login__theme"
            aria-label={isDarkMode ? t('common.lightMode') : t('common.darkMode')}
            title={isDarkMode ? t('common.lightMode') : t('common.darkMode')}
        >
            {/* key: der Wechsel tauscht das Element aus → Einblend-Animation läuft neu */}
            <span key={isDarkMode ? 'dark' : 'light'} className="ofi-login__theme-icon">
                {isDarkMode ? <LuMoon size={16} /> : <LuSun size={16} />}
            </span>
        </button>
    );
};

export const Login = () => {
    const { t } = useTranslation();
    const isDarkMode = useThemeStore((state) => state.isDarkMode);
    const { login, fetchProfile } = useAuthStore();

    const [email, setEmail] = useState(readRemembered);
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(() => readRemembered() !== '');
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [loading, setLoading] = useState(false);
    const [shaking, setShaking] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);

    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    // Gemerkte Adresse → direkt ins Passwortfeld, sonst in die E-Mail.
    useEffect(() => {
        const target = readRemembered() ? passwordRef.current : emailRef.current;
        const id = window.setTimeout(() => target?.focus(), 80);
        return () => window.clearTimeout(id);
    }, []);

    /** Schütteln neu starten, auch wenn gerade noch geschüttelt wird. */
    const shake = useCallback(() => {
        setShaking(false);
        requestAnimationFrame(() => requestAnimationFrame(() => setShaking(true)));
        try {
            navigator.vibrate?.([50, 40, 50]);
        } catch {
            /* nicht unterstützt */
        }
    }, []);

    const fail = useCallback(
        (next: FieldErrors, focus?: HTMLInputElement | null) => {
            setErrors(next);
            shake();
            focus?.focus();
        },
        [shake],
    );

    const submit = useCallback(
        async (rawEmail: string, rawPassword: string) => {
            const trimmedEmail = rawEmail.trim();
            if (!trimmedEmail) return fail({ email: t('auth.errorEmailRequired') }, emailRef.current);
            if (!VALID_EMAIL.test(trimmedEmail)) return fail({ email: t('auth.errorEmailFormat') }, emailRef.current);
            if (!rawPassword) return fail({ password: t('auth.errorPasswordRequired') }, passwordRef.current);

            setErrors({});
            setLoading(true);
            try {
                const response = await apiClient.post('/auth/login', { email: trimmedEmail, password: rawPassword });
                // Tokens arrive as HttpOnly cookies; the body only carries the employee.
                const { employee } = response.data;
                if (!employee) {
                    throw new Error(response.data?.error || response.data?.message || t('auth.'));
                }
                writeRemembered(remember ? trimmedEmail : null);
                login(employee);
                await fetchProfile();
                toast.success(t('auth.successLogin'));
            } catch (error: unknown) {
                const err = error as {
                    response?: { status?: number; data?: { error?: string; message?: string } };
                    message?: string;
                    request?: unknown;
                };
                const serverMessage = err.response?.data?.error || err.response?.data?.message;
                // Der Server antwortet auf falsche Zugangsdaten mit einer festen
                // (türkischen) Meldung — die wird in die Sprache des Nutzers
                // übersetzt; alle anderen Servermeldungen (gesperrt, zu viele
                // Versuche …) kommen unverändert durch.
                const message =
                    serverMessage && serverMessage !== INVALID_CREDENTIALS_SERVER_MESSAGE
                        ? serverMessage
                        : serverMessage
                          ? t('auth.errorInvalid')
                          : err.request && !err.response
                            ? t('auth.errorNetwork')
                            : err.message || t('auth.errorInvalid');
                fail({ form: message }, passwordRef.current);
                setPassword('');
            } finally {
                setLoading(false);
            }
        },
        [fail, fetchProfile, login, remember, t],
    );

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (loading) return;
        void submit(email, password);
    };

    /**
     * Anmeldung per Personal-Ausweis: der Code trägt NUR einen Schlüssel, den
     * der Server gegen eine Sitzung tauscht — es gibt hier weder E-Mail noch
     * Kennwort, die man ins Formular schreiben könnte. Deshalb ein eigener Weg
     * neben `submit()` und nicht ein Umweg über die Felder.
     */
    const submitQrToken = useCallback(
        async (token: string) => {
            setErrors({});
            setLoading(true);
            try {
                const response = await apiClient.post('/auth/qr-login', { token });
                const { employee } = response.data;
                if (!employee) throw new Error(response.data?.error || t('auth.errorInvalid'));
                login(employee);
                await fetchProfile();
                toast.success(t('auth.successLogin'));
            } catch (error: unknown) {
                const err = error as {
                    response?: { data?: { error?: string; message?: string } };
                    message?: string;
                    request?: unknown;
                };
                const message =
                    err.response?.data?.error
                    || err.response?.data?.message
                    || (err.request && !err.response ? t('auth.errorNetwork') : t('auth.qrInvalid'));
                fail({ form: message }, emailRef.current);
            } finally {
                setLoading(false);
            }
        },
        [fail, fetchProfile, login, t],
    );

    const handleQrCredentials = (payload: LoginQrPayload) => {
        setQrOpen(false);
        if (payload.kind === 'token') {
            void submitQrToken(payload.token);
            return;
        }
        setEmail(payload.email);
        setPassword(payload.password);
        void submit(payload.email, payload.password);
    };

    const logo = isDarkMode ? offitecLogoDark : offitecLogo;
    const logo2x = isDarkMode ? offitecLogoDark2x : offitecLogo2x;

    return (
        <main className="ofi-login">
            {/* Die Welle läuft oben herein und beginnt erst unterhalb von Logo
                und Bedienelementen (siehe CSS). */}
            <LoginWave className="ofi-login__wave ofi-login__wave--top" />

            {/* Top band: logo left, controls right — inset, not glued to the edge */}
            <header className="ofi-login__bar">
                <img
                    src={logo}
                    srcSet={`${logo} 96w, ${logo2x} 180w`}
                    sizes="96px"
                    alt="Offitec ERP"
                    width={96}
                    height={38}
                    className="ofi-login__logo"
                />
                <div className="ofi-login__controls">
                    <InstallAppButton />
                    <LanguageToggle />
                    <ThemeToggle />
                </div>
            </header>

            <section className="ofi-login__body">
                <div className="ofi-login__grid">
                    {/* ── Form column ── */}
                    <div className="ofi-login__form-col">
                        <h1 className="ofi-login__title">{t('auth.loginTitle')}</h1>
                        <p className="ofi-login__lead">{t('auth.loginLead')}</p>

                        <form
                            onSubmit={handleSubmit}
                            noValidate
                            className={`ofi-login__form${shaking ? ' is-shaking' : ''}`}
                            onAnimationEnd={() => setShaking(false)}
                        >
                            <div className={`ofi-login__field${errors.email ? ' has-error' : ''}`}>
                                <label htmlFor="ofi-login-email" className="ofi-login__label">
                                    {t('auth.emailLabel')}
                                    <span className="ofi-login__req" aria-hidden="true">
                                        *
                                    </span>
                                </label>
                                <input
                                    id="ofi-login-email"
                                    ref={emailRef}
                                    type="email"
                                    inputMode="email"
                                    autoComplete="username"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    className="ofi-login__input"
                                    placeholder={t('auth.emailPlaceholder')}
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        if (errors.email || errors.form) setErrors((prev) => ({ ...prev, email: undefined, form: undefined }));
                                    }}
                                    aria-invalid={Boolean(errors.email)}
                                    aria-describedby={errors.email ? 'ofi-login-email-error' : undefined}
                                />
                                {errors.email && (
                                    <p id="ofi-login-email-error" className="ofi-login__error" role="alert">
                                        <LuTriangleAlert size={13} aria-hidden="true" />
                                        {errors.email}
                                    </p>
                                )}
                            </div>

                            <div className={`ofi-login__field${errors.password ? ' has-error' : ''}`}>
                                <label htmlFor="ofi-login-password" className="ofi-login__label">
                                    {t('auth.password')}
                                    <span className="ofi-login__req" aria-hidden="true">
                                        *
                                    </span>
                                </label>
                                <div className="ofi-login__input-wrap">
                                    <input
                                        id="ofi-login-password"
                                        ref={passwordRef}
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="current-password"
                                        className="ofi-login__input ofi-login__input--password"
                                        placeholder={t('auth.passwordPlaceholder')}
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            if (errors.password || errors.form) setErrors((prev) => ({ ...prev, password: undefined, form: undefined }));
                                        }}
                                        aria-invalid={Boolean(errors.password)}
                                        aria-describedby={errors.password ? 'ofi-login-password-error' : undefined}
                                    />
                                    <button
                                        type="button"
                                        className="ofi-login__eye"
                                        onClick={() => setShowPassword((v) => !v)}
                                        aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                                        aria-pressed={showPassword}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <LuEyeOff size={18} /> : <LuEye size={18} />}
                                    </button>
                                </div>
                                {errors.password && (
                                    <p id="ofi-login-password-error" className="ofi-login__error" role="alert">
                                        <LuTriangleAlert size={13} aria-hidden="true" />
                                        {errors.password}
                                    </p>
                                )}
                            </div>

                            <label className="ofi-login__remember">
                                <input
                                    type="checkbox"
                                    className="ofi-login__check-input"
                                    checked={remember}
                                    onChange={(e) => {
                                        setRemember(e.target.checked);
                                        if (!e.target.checked) writeRemembered(null);
                                    }}
                                />
                                <span className="ofi-login__check" aria-hidden="true">
                                    <svg viewBox="0 0 12 10" width="12" height="10" fill="none">
                                        <path d="M1 5.2 4.2 8.4 11 1.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                                <span>{t('auth.rememberMe')}</span>
                            </label>

                            <div className="ofi-login__actions">
                                <button type="submit" className={`ofi-login__submit${loading ? ' is-loading' : ''}`} disabled={loading}>
                                    <span className="ofi-login__submit-label">{t('auth.signIn')}</span>
                                    {loading && <span className="ofi-login__spinner" aria-hidden="true" />}
                                </button>
                                <button
                                    type="button"
                                    className="ofi-login__qr-btn"
                                    onClick={() => setQrOpen(true)}
                                    aria-label={t('auth.qrLogin')}
                                    title={t('auth.qrLogin')}
                                    disabled={loading}
                                >
                                    <LuQrCode size={20} />
                                </button>
                            </div>

                            {errors.form && (
                                <p className="ofi-login__error ofi-login__error--form" role="alert">
                                    <LuTriangleAlert size={14} aria-hidden="true" />
                                    {errors.form}
                                </p>
                            )}
                        </form>

                        <p className="ofi-login__fineprint">{t('auth.demoNotice')}</p>
                    </div>

                    {/* ── Explanatory column (desktop only) ── */}
                    {/* Kein `.ofi-serif`: der Erklärtext läuft seit 17.08.2026
                        ganz in der Programmschrift Open Sans (Nutzerwunsch) —
                        Titel, Fliesstext und die beiden Adressen. */}
                    <aside className="ofi-login__aside">
                        <h2>Offitec ERP</h2>
                        <p>{t('auth.asideText1')}</p>
                        <p>{t('auth.asideText2')}</p>
                        <p className="ofi-login__aside-mails">
                            {CONTACT_EMAILS.map((mail, index) => (
                                <Fragment key={mail}>
                                    {index > 0 && (
                                        <span className="ofi-login__aside-sep" aria-hidden="true">
                                            ·
                                        </span>
                                    )}
                                    <a href={`mailto:${mail}`} className="ofi-login__aside-link">
                                        {mail}
                                    </a>
                                </Fragment>
                            ))}
                        </p>
                    </aside>
                </div>
            </section>

            <footer className="ofi-login__footer">
                <span className="ofi-login__copyright">{t('auth.copyright')}</span>
            </footer>

            <LoginNotifications />
            <LoginQrDialog open={qrOpen} onClose={() => setQrOpen(false)} onCredentials={handleQrCredentials} />
        </main>
    );
};
