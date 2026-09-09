import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LuEye, LuEyeOff, LuMoon, LuQrCode, LuSun, LuTriangleAlert } from '@/components/icons/lucideLocal';
import { InstallAppButton } from '@/components/ui-shared/InstallAppButton';
import { LoginWave } from '@/components/login/LoginWave';
import { LoginNotifications } from '@/components/login/LoginNotifications';
import { LoginQrDialog } from '@/components/login/LoginQrDialog';
import { LoginIntro } from '@/components/login/LoginIntro';
import { LoginMfaStep, type MfaChallengeView } from '@/components/login/LoginMfaStep';
import { LoginWordmark } from '@/components/login/LoginWordmark';
import { OffitecMark } from '@/components/icons/OffitecMark';
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
 * ── AUFGERÄUMT WIE DIE AEGIS-SEITE (09.09.2026) ─────────────────────────────
 * Vorgabe Samet: «Die erste Seite soll so sauber sein wie die Aegis-Seite —
 * kein Fliesstext, nur der Mitteilungsknopf.» Weggefallen sind damit die
 * Überschrift «Willkommen zurück», ihr Vorspann, die ganze Erklärspalte
 * rechts (zwei Absätze plus zwei Kontaktadressen) und der Demo-Hinweis unter
 * dem Formular. Was bleibt, sagt sich in einer Zeile: Zeichen, zwei Felder,
 * ein Knopf.
 *
 * Aufbau von oben nach unten:
 *   • Kopfzeile — nicht ganz am Rand — mit Logo links (es BLEIBT dort) und
 *     rechts Sprache TR·EN·DE, Hell/Dunkel und (falls installierbar) dem
 *     App-Installieren-Knopf. Die Welle läuft schmal darüber hinweg.
 *   • Mittig das Programmzeichen — dasselbe, das im Browserreiter steht
 *     (`public/fav4.svg`): der Offitec-Stern auf marineblauem Rund mit rotem
 *     Punkt. Es steht an DERSELBEN Stelle wie das Aegis-Zeichen einen
 *     Schritt weiter, damit die beiden Seiten wie eine wirken.
 *   • Formular: E-Mail und Passwort gleichzeitig sichtbar (kein Zwei-Schritt-
 *     Ablauf mehr), „E-Mail merken", grosser Anmelden-Knopf, daneben der
 *     kleine QR-Knopf, der die Kamera in einem Popup öffnet.
 *     Fehler: das Formular schüttelt sich (am Handy zusätzlich Vibration),
 *     rote Meldung direkt unter dem betroffenen Feld bzw. unter dem Knopf.
 *   • Ganz unten nur noch die Rechtezeile.
 *   • Unten links die Glocke mit der herausgleitenden Mitteilungsleiste —
 *     der einzige Knopf, der stehen bleiben durfte.
 *
 * Kein Ant Design, keine Animationsbibliothek — nur React, CSS und die
 * lokalen Lucide-Icons.
 */

// Accepted top-level domains for the workspace.
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.(com|eu|ch|uk|tr)$/i;
/** Feste Servermeldung für falsche Zugangsdaten (LoginUseCase) → wird übersetzt. */
const INVALID_CREDENTIALS_SERVER_MESSAGE = 'E-posta veya parola hatalı.';
/**
 * Die Fehler des zweiten Faktors kommen mit einer festen Marke (`code`) statt
 * eines Textes zurück — der Server antwortet türkisch, die Oberfläche soll in
 * der gewählten Sprache sprechen (siehe MfaUseCases im Backend).
 */
const MFA_ERROR_KEYS: Record<string, string> = {
    mfa_code_invalid: 'auth.mfa.errorInvalid',
    mfa_code_reused: 'auth.mfa.errorReused',
    mfa_challenge_expired: 'auth.mfa.errorExpired',
    mfa_challenge_missing: 'auth.mfa.errorExpired',
    mfa_account_blocked: 'auth.mfa.errorBlocked',
    mfa_too_many_attempts: 'auth.mfa.errorTooMany',
};
/** Nach diesen Fehlern hat die halbe Anmeldung keinen Wert mehr — von vorne. */
const MFA_FATAL_CODES = new Set(['mfa_challenge_expired', 'mfa_challenge_missing', 'mfa_account_blocked']);
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
    /* ── Eröffnung ──────────────────────────────────────────────────────
       Die schwarze Bühne (O·C·C — Rauch, Feuer, violettes Licht) liegt vor
       der Seite und läuft bei JEDEM Aufruf der Anmeldung an; sie lässt sich
       mit Klick, Taste oder dem Knopf unten abbrechen (LoginIntro.tsx).
       `revealed` fällt schon, wenn die Bühne zu VERSCHWINDEN beginnt —
       Bühne und Formular blenden dadurch ineinander über. `introMounted`
       fällt erst danach und entfernt die Bühne aus dem Baum. */
    const [introMounted, setIntroMounted] = useState(true);
    const [revealed, setRevealed] = useState(false);
    /* ── Zweiter Faktor ─────────────────────────────────────────────────────
       Ist das gesetzt, stimmten E-Mail und Kennwort und es fehlt nur noch der
       Einmalcode. Die Seite tauscht dann BEIDE Spalten: links das Codefeld
       (bzw. bei der ersten Anmeldung die Einrichtung), rechts der Weg zur App
       statt des Erklärtextes. Das Zwischentoken liegt im HttpOnly-Keks
       `ofi_mfa` — hier steht nur, was auf den Bildschirm gehört. */
    const [mfa, setMfa] = useState<MfaChallengeView | null>(null);

    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    // Gemerkte Adresse → direkt ins Passwortfeld, sonst in die E-Mail.
    // Läuft zweimal: beim Aufbau und noch einmal, wenn die Eröffnung abtritt —
    // ein Klick auf die schwarze Bühne nimmt dem Feld sonst den Blinker.
    useEffect(() => {
        // Während der Codeeingabe setzt LoginMfaStep den Blinker selbst — hier
        // würde er ihn dem ersten Kästchen wieder wegnehmen.
        if (mfa) return undefined;
        const target = readRemembered() ? passwordRef.current : emailRef.current;
        const id = window.setTimeout(() => target?.focus(), 80);
        return () => window.clearTimeout(id);
    }, [mfa, revealed]);

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
                /* Das Kennwort allein meldet seit dem 29.09.2026 NICHT mehr an:
                   die Antwort ist die Aufforderung zum zweiten Faktor. Das
                   Zwischentoken bleibt im HttpOnly-Keks, hier kommt nur an, was
                   die Fläche zeigen soll. */
                const { mfaRequired, stage, issuer, account, setup } = response.data || {};
                if (!mfaRequired) {
                    throw new Error(response.data?.error || response.data?.message || t('auth.errorMissingData'));
                }
                // Die Adresse wird schon jetzt gemerkt: das Kennwort stimmte,
                // und beim nächsten Mal soll das Feld wieder vorausgefüllt sein.
                writeRemembered(remember ? trimmedEmail : null);
                setPassword('');
                setMfa({
                    stage: stage === 'enroll' ? 'enroll' : 'verify',
                    issuer: String(issuer || 'Offitec Control Center'),
                    account: String(account || trimmedEmail),
                    ...(setup ? { setup } : {}),
                });
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
        // `login`/`fetchProfile` stehen hier nicht mehr: die erste Hälfte meldet
        // niemanden mehr an — das tut erst `submitMfaCode`.
        [fail, remember, t],
    );

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (loading) return;
        void submit(email, password);
    };

    /**
     * Zweite Hälfte: der Einmalcode. Erst DIESE Antwort trägt die Person —
     * vorher gibt es keine Sitzung.
     */
    const submitMfaCode = useCallback(
        async (code: string) => {
            setErrors({});
            setLoading(true);
            try {
                const response = await apiClient.post('/auth/mfa/verify', { code });
                const { employee, enrolled } = response.data || {};
                if (!employee) throw new Error(t('auth.errorMissingData'));
                setMfa(null);
                login(employee);
                await fetchProfile();
                toast.success(enrolled ? t('auth.mfa.enrolledToast') : t('auth.successLogin'));
            } catch (error: unknown) {
                const err = error as {
                    response?: { data?: { error?: string; code?: string } };
                    request?: unknown;
                };
                const serverCode = err.response?.data?.code;
                const messageKey = serverCode ? MFA_ERROR_KEYS[serverCode] : undefined;
                const message = messageKey
                    ? t(messageKey)
                    : err.request && !err.response
                      ? t('auth.errorNetwork')
                      : t('auth.mfa.errorInvalid');

                /* Abgelaufen, Konto gesperrt, Kennwort inzwischen gewechselt:
                   die halbe Anmeldung ist wertlos, der Keks ist schon weg. Es
                   geht zurück an den Anfang, mit der Meldung dort. */
                if (serverCode && MFA_FATAL_CODES.has(serverCode)) {
                    setMfa(null);
                    fail({ form: message }, passwordRef.current);
                    return;
                }
                fail({ form: message });
            } finally {
                setLoading(false);
            }
        },
        [fail, fetchProfile, login, t],
    );

    /** «Andere Anmeldung»: zurück zu E-Mail und Kennwort. */
    const cancelMfa = useCallback(() => {
        setMfa(null);
        setErrors({});
        setPassword('');
    }, []);

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
        <main
            className={`ofi-login${introMounted && !revealed ? ' is-intro' : ''}${revealed ? ' is-revealed' : ''}${mfa ? ' is-mfa' : ''}`}
        >
            {introMounted && (
                <LoginIntro onReveal={() => setRevealed(true)} onDone={() => setIntroMounted(false)} />
            )}
            {/* Die Welle läuft oben herein und beginnt erst unterhalb von Logo
                und Bedienelementen (siehe CSS). */}
            <LoginWave className="ofi-login__wave ofi-login__wave--top" />

            {/* Top band: logo left, controls right — inset, not glued to the edge */}
            <header className="ofi-login__bar">
                {/* Während des zweiten Faktors trägt die Fläche das Zeichen der
                    Authenticator-App, nicht das Hauszeichen: dort geht es um
                    Aegis, und zwei Marken nebeneinander wären eine zu viel. */}
                {mfa ? (
                    <span aria-hidden="true" />
                ) : (
                    <img
                        src={logo}
                        srcSet={`${logo} 96w, ${logo2x} 180w`}
                        sizes="96px"
                        alt="Offitec Control Center"
                        width={96}
                        height={38}
                        className="ofi-login__logo"
                    />
                )}
                <div className="ofi-login__controls">
                    <InstallAppButton />
                    <LanguageToggle />
                    <ThemeToggle />
                </div>
            </header>

            <section className="ofi-login__body">
                <div className={`ofi-login__grid${mfa ? ' is-mfa' : ''}`}>
                    {/* ── Form column ── */}
                    {/* Der zweite Faktor übernimmt beide Spalten: links das
                        Codefeld (bzw. die Einrichtung), rechts der Weg zur App
                        statt des Erklärtextes. */}
                    <div className="ofi-login__form-col">
                        {mfa ? (
                            <LoginMfaStep
                                challenge={mfa}
                                loading={loading}
                                error={errors.form}
                                shaking={shaking}
                                onShakeEnd={() => setShaking(false)}
                                onSubmit={(code) => void submitMfaCode(code)}
                                onCancel={cancelMfa}
                                onDirty={() => {
                                    if (errors.form) setErrors((prev) => ({ ...prev, form: undefined }));
                                }}
                            />
                        ) : (
                        <>
                        {/* Das Zeichen aus dem Browserreiter (public/fav4.svg),
                            hier aus denselben Kurven gezeichnet wie dort:
                            weisser Stern auf marineblauem Rund, roter Punkt.
                            Es sitzt genau dort, wo einen Schritt weiter das
                            Aegis-Zeichen steht. */}
                        {/* Zeichen — Name — Felder. Der Name steht auf beiden
                            Schritten an derselben Stelle (LoginWordmark). */}
                        <span className="ofi-login__appmark" aria-hidden="true">
                            {/* 46 auf 56: im Reitersymbol reicht der Stern fast an den Rand des
                                Kreises (Pfad 50 von 64, Kreis 60 von 64). Kleiner gezeichnet
                                wirkt er wie eine Schneeflocke statt wie das Hauszeichen. */}
                            <OffitecMark size={46} spokes={['#ffffff', '#ffffff', '#ffffff']} dot="#d30f15" />
                        </span>
                        <LoginWordmark />

                        <form
                            onSubmit={handleSubmit}
                            noValidate
                            className={`ofi-login__form${shaking ? ' is-shaking' : ''}`}
                            onAnimationEnd={() => setShaking(false)}
                        >
                            <div className={`ofi-login__field${errors.email ? ' has-error' : ''}`}>
                                {/* Kein rotes Pflichtsternchen mehr: beide Felder sind
                                    ohnehin Pflicht, und der Stern war nur Lärm. */}
                                <label htmlFor="ofi-login-email" className="ofi-login__label">
                                    {t('auth.emailLabel')}
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

                        </>
                        )}
                    </div>

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
