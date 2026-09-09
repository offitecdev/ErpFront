import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { LuArrowLeft, LuCheck, LuCopy, LuSmartphone, LuTriangleAlert } from '@/components/icons/lucideLocal';
import { AegisMark } from '@/components/icons/AegisMark';
import { LoginStoreDialog } from './LoginStoreDialog';
import { LoginWordmark } from './LoginWordmark';

/**
 * ── ZWEITE HÄLFTE DER ANMELDUNG (29.09.2026) ────────────────────────────────
 *
 * Kennwort und E-Mail stimmen — jetzt fehlt der sechsstellige Code aus der
 * Authenticator-App auf dem Telefon (Aegis). Der Code wird nicht verschickt:
 * Telefon und Server rechnen ihn aus einem gemeinsamen Geheimnis und der
 * Uhrzeit aus, jede halbe Minute einen neuen. Deshalb geht das ohne SMS, ohne
 * Zustellung und ohne Kosten.
 *
 * Die Fläche hat zwei Gesichter, und die Antwort des Servers entscheidet:
 *
 *   stage="enroll"  Erste Anmeldung: zwei Karten nebeneinander — links Aegis
 *                   holen (der Ladecode kommt als Popup, nicht als dauerhaftes
 *                   Bild), rechts der Einrichtungscode. Darunter das Codefeld.
 *   stage="verify"  Alltag: nur noch Zeichen, Titel und sechs Kästchen.
 *
 * ── EINE SPALTE, MITTIG ─────────────────────────────────────────────────────
 * Anders als das Anmeldeformular hat diese Fläche KEINE zweite Spalte. Sie
 * stand hier zuerst (der Weg zur App als Kachel daneben) und machte den
 * Bildschirm unruhig: rechts eine Kachel, die man einmal im Leben braucht.
 * Jetzt steht alles in einer mittigen Bahn, und der Ladecode kommt auf Wunsch.
 *
 * Gebaut wie der Rest der Anmeldeseite: reines React und CSS, keine
 * Komponenten- oder Animationsbibliothek. Das QR-Bild zeichnet `qrcode.react`,
 * dieselbe Stelle, die im Personalmodul die Ausweise druckt.
 */

const CODE_LENGTH = 6;
/** Muss zur Fensterlänge des Servers passen (shared/totp.ts). */
const PERIOD_SECONDS = 30;

export interface MfaSetupData {
    otpauthUri: string;
    secret: string;
    secretGrouped: string;
}

export interface MfaChallengeView {
    stage: 'enroll' | 'verify';
    issuer: string;
    account: string;
    setup?: MfaSetupData;
}

interface Props {
    challenge: MfaChallengeView;
    loading: boolean;
    /** Rote Zeile unter dem Feld — vom Aufrufer übersetzt. */
    error?: string | undefined;
    /** Schüttelt nach einem Fehlversuch (dieselbe Geste wie beim Kennwort). */
    shaking: boolean;
    onShakeEnd: () => void;
    onSubmit: (code: string) => void;
    /** Zurück zu E-Mail und Kennwort. */
    onCancel: () => void;
    /** Tippen räumt die Fehlermeldung weg. */
    onDirty: () => void;
}

/**
 * Wie viele Sekunden der laufende Code noch gilt. Reine Anzeige — geprüft wird
 * am Server, der zusätzlich das Fenster davor und danach durchgehen lässt
 * (die Uhr des Telefons darf etwas danebenliegen).
 */
const secondsLeft = () => PERIOD_SECONDS - (Math.floor(Date.now() / 1000) % PERIOD_SECONDS);

/** Der Ring um die Restsekunden: ein Kreis, dessen Strich abläuft. */
const CountdownRing = ({ seconds }: { seconds: number }) => {
    const radius = 9;
    const circumference = 2 * Math.PI * radius;
    return (
        <svg className="ofi-login__mfa-ring" viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
            <circle cx="12" cy="12" r={radius} className="ofi-login__mfa-ring-track" />
            <circle
                cx="12"
                cy="12"
                r={radius}
                className="ofi-login__mfa-ring-fill"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - seconds / PERIOD_SECONDS)}
            />
        </svg>
    );
};

export const LoginMfaStep = ({
    challenge,
    loading,
    error,
    shaking,
    onShakeEnd,
    onSubmit,
    onCancel,
    onDirty,
}: Props) => {
    const { t } = useTranslation();
    const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
    const [remaining, setRemaining] = useState(secondsLeft);
    const [copied, setCopied] = useState(false);
    const [storeOpen, setStoreOpen] = useState(false);
    const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
    /* Die Selbstabgabe darf für EINE Eingabe nur einmal auslösen — sonst
       schickt ein erneutes Rendern denselben Code hinterher. */
    const submittedRef = useRef('');

    const code = digits.join('');
    const complete = code.length === CODE_LENGTH;
    const isEnroll = challenge.stage === 'enroll';
    const setup = challenge.setup;

    useEffect(() => {
        const id = window.setInterval(() => setRemaining(secondsLeft()), 500);
        return () => window.clearInterval(id);
    }, []);

    /* Beim Aufbau in das erste Kästchen — aber NUR im Alltag, nicht bei der
       Einrichtung. Die Einrichtungsfläche ist auf dem Telefon höher als der
       Bildschirm; der Blinker im Codefeld ganz unten liess den Browser
       dorthin springen, und die Person landete unter den beiden Karten, ohne
       den QR-Code je gesehen zu haben. (Gemessen: das Zeichen stand bei 430 px
       Breite 356 px ÜBER dem sichtbaren Bereich.) Bei `verify` ist das Feld
       das einzige auf der Seite — da gehört der Blinker hin. */
    useEffect(() => {
        if (isEnroll) return undefined;
        const id = window.setTimeout(() => inputsRef.current[0]?.focus(), 80);
        return () => window.clearTimeout(id);
    }, [isEnroll]);

    /* ── Ein neuer Fehler leert die Kästchen ─────────────────────────────────
       Derselbe falsche Sechser hilft nicht weiter, und der Code ist ohnehin
       schon abgelaufen, wenn die Antwort da ist.

       Angepasst wird WÄHREND des Rendervorgangs, nicht in einem Effekt: das
       ist der vorgesehene Weg, Zustand an eine geänderte Eigenschaft
       nachzuziehen. React verwirft den halbfertigen Durchgang und rechnet
       sofort neu — es gibt kein Zwischenbild mit dem alten Code darin. */
    const [shownError, setShownError] = useState(error);
    if (error !== shownError) {
        setShownError(error);
        if (error) setDigits(Array(CODE_LENGTH).fill(''));
    }

    /* Danach der Rest, der KEIN Zustand ist: der Blinker zurück in das erste
       Kästchen, und die Merkstelle der Selbstabgabe zurücksetzen. Beides sind
       Zugriffe ausserhalb des Rendervorgangs — dafür ist der Effekt da.

       Die Merkstelle muss wirklich fallen: tippt jemand denselben Sechser noch
       einmal (innerhalb derselben halben Minute gut möglich), erkennte sie ihn
       sonst als „schon geschickt" und die Eingabe bliebe voll stehen, ohne
       loszugehen. */
    useEffect(() => {
        if (!error) return;
        submittedRef.current = '';
        inputsRef.current[0]?.focus();
    }, [error]);

    const fillFrom = useCallback((start: number, text: string) => {
        const cleaned = text.replace(/\D/g, '');
        if (!cleaned) return;
        setDigits((prev) => {
            const next = [...prev];
            for (let index = 0; index < cleaned.length && start + index < CODE_LENGTH; index += 1) {
                next[start + index] = cleaned[index] as string;
            }
            const landed = Math.min(start + cleaned.length, CODE_LENGTH - 1);
            window.setTimeout(() => inputsRef.current[landed]?.focus(), 0);
            return next;
        });
        onDirty();
    }, [onDirty]);

    /* Sechs Ziffern beisammen → losschicken, ohne dass jemand den Knopf sucht.
       Das ist bei Einmalcodes die Erwartung; der Knopf bleibt für die Tastatur
       und für den Fall, dass die Selbstabgabe einmal nicht greift. */
    useEffect(() => {
        if (!complete || loading || submittedRef.current === code) return;
        submittedRef.current = code;
        onSubmit(code);
    }, [code, complete, loading, onSubmit]);

    const handleChange = (index: number, value: string) => {
        // Mehr als ein Zeichen heisst: eingefügt oder vom Telefon selbst
        // ausgefüllt (autoComplete="one-time-code").
        if (value.length > 1) return fillFrom(index, value);
        const digit = value.replace(/\D/g, '').slice(-1);
        setDigits((prev) => {
            const next = [...prev];
            next[index] = digit;
            return next;
        });
        if (digit && index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
        onDirty();
    };

    const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Backspace') {
            // Leeres Kästchen: eines zurück und DORT löschen — sonst müsste man
            // zweimal drücken, um eine Ziffer loszuwerden.
            if (!digits[index] && index > 0) {
                event.preventDefault();
                setDigits((prev) => {
                    const next = [...prev];
                    next[index - 1] = '';
                    return next;
                });
                inputsRef.current[index - 1]?.focus();
            }
            return;
        }
        if (event.key === 'ArrowLeft' && index > 0) {
            event.preventDefault();
            inputsRef.current[index - 1]?.focus();
        }
        if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
            event.preventDefault();
            inputsRef.current[index + 1]?.focus();
        }
    };

    /* Hängt an den Kästchen UND am Rahmen darum: wer einen kopierten Code
       irgendwo in die Reihe einfügt, soll ihn nicht in ein einzelnes Kästchen
       gepresst bekommen. Darum `Element` und nicht `HTMLInputElement`. */
    const handlePaste = (index: number, event: ClipboardEvent<Element>) => {
        event.preventDefault();
        fillFrom(index, event.clipboardData.getData('text'));
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (loading || !complete) return;
        submittedRef.current = code;
        onSubmit(code);
    };

    const copySecret = async () => {
        if (!setup) return;
        try {
            await navigator.clipboard.writeText(setup.secret);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            /* Zwischenablage gesperrt (unsicherer Kontext) — der Schlüssel steht
               daneben und lässt sich von Hand markieren. */
        }
    };

    return (
        <div className="ofi-login__mfa">
            <header className="ofi-login__mfa-head">
                <AegisMark size={56} className="ofi-login__mfa-mark" />
                <LoginWordmark />
                <h1 className="ofi-login__mfa-title">
                    {isEnroll ? t('auth.mfa.enrollTitle') : t('auth.mfa.verifyTitle')}
                </h1>
                <p className="ofi-login__mfa-lead">
                    {isEnroll ? t('auth.mfa.enrollLead') : t('auth.mfa.verifyLead', { issuer: challenge.issuer })}
                </p>
                <span className="ofi-login__mfa-account">{challenge.account}</span>
            </header>

            {/* ── Einrichtung: zwei Karten, App holen und Konto eintragen ── */}
            {isEnroll && setup && (
                <div className="ofi-login__mfa-cards">
                    <section className="ofi-login__mfa-card">
                        <span className="ofi-login__mfa-step-no" aria-hidden="true">1</span>
                        <h2>{t('auth.mfa.cardInstallTitle')}</h2>
                        <p>{t('auth.mfa.cardInstallText')}</p>
                        {/* Der Ladecode steht NICHT dauerhaft da — er kommt als Popup. */}
                        <button type="button" className="ofi-btn-apple ofi-btn-apple--aegis" onClick={() => setStoreOpen(true)}>
                            {t('auth.mfa.showStoreQr')}
                        </button>
                    </section>

                    <section className="ofi-login__mfa-card">
                        <span className="ofi-login__mfa-step-no" aria-hidden="true">2</span>
                        <h2>{t('auth.mfa.cardScanTitle')}</h2>
                        <p>{t('auth.mfa.cardScanText')}</p>
                        <div className="ofi-login__mfa-qr">
                            {/* Weisser Grund und dunkler Vordergrund fest: ein QR-Code
                                im Dunkelmodus umzufärben macht ihn für viele Kameras
                                unlesbar. */}
                            <QRCodeSVG value={setup.otpauthUri} size={132} level="M" marginSize={2} bgColor="#ffffff" fgColor="#00436F" />
                        </div>
                        {/* Wer die Einrichtung AUF dem Telefon macht, kann den QR-Code
                            nicht scannen — die Kamera sieht den eigenen Bildschirm
                            nicht. Android reicht eine `otpauth`-Adresse aber direkt an
                            die App weiter; auf dem Schreibtisch führt der Verweis ins
                            Leere und ist darum nur schmal sichtbar (login.css). */}
                        <a className="ofi-login__mfa-open-app" href={setup.otpauthUri}>
                            <LuSmartphone size={14} aria-hidden="true" />
                            {t('auth.mfa.openInApp')}
                        </a>
                        <details className="ofi-login__mfa-manual">
                            <summary>{t('auth.mfa.manualTitle')}</summary>
                            <code className="ofi-login__mfa-secret">{setup.secretGrouped}</code>
                            <button type="button" className="ofi-login__mfa-copy" onClick={() => void copySecret()}>
                                {copied ? <LuCheck size={13} aria-hidden="true" /> : <LuCopy size={13} aria-hidden="true" />}
                                {copied ? t('auth.mfa.copied') : t('auth.mfa.copy')}
                            </button>
                        </details>
                    </section>
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                noValidate
                className={`ofi-login__mfa-form${shaking ? ' is-shaking' : ''}`}
                onAnimationEnd={onShakeEnd}
            >
                <div className={`ofi-login__mfa-entry${error ? ' has-error' : ''}`}>
                    <div className="ofi-login__mfa-entry-head">
                        {isEnroll && <span className="ofi-login__mfa-step-no" aria-hidden="true">3</span>}
                        <label htmlFor="ofi-mfa-0">{t('auth.mfa.codeLabel')}</label>
                        <span className="ofi-login__mfa-countdown">
                            <CountdownRing seconds={remaining} />
                            {remaining}s
                        </span>
                    </div>

                    <div className="ofi-login__mfa-boxes" onPaste={(event) => handlePaste(0, event)}>
                        {digits.map((digit, index) => (
                            <input
                                // Die sechs Kästchen sind ortsfest und werden nie
                                // umsortiert — der Index IST hier die Kennung.
                                key={index}
                                id={`ofi-mfa-${index}`}
                                ref={(element) => { inputsRef.current[index] = element; }}
                                className="ofi-login__mfa-box"
                                type="text"
                                inputMode="numeric"
                                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                                // `maxLength` nicht auf 1: das Telefon füllt den
                                // ganzen Code in EIN Feld, und `fillFrom` verteilt ihn.
                                maxLength={CODE_LENGTH}
                                pattern="[0-9]*"
                                value={digit}
                                disabled={loading}
                                aria-label={t('auth.mfa.digitLabel', { index: index + 1, total: CODE_LENGTH })}
                                aria-invalid={Boolean(error)}
                                onChange={(event) => handleChange(index, event.target.value)}
                                onKeyDown={(event) => handleKeyDown(index, event)}
                                onPaste={(event) => handlePaste(index, event)}
                                onFocus={(event) => event.target.select()}
                            />
                        ))}
                    </div>

                    {error && (
                        <p className="ofi-login__mfa-error" role="alert">
                            <LuTriangleAlert size={13} aria-hidden="true" />
                            {error}
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    className={`ofi-btn-apple ofi-btn-apple--aegis ofi-btn-apple--block${loading ? ' is-loading' : ''}`}
                    disabled={loading || !complete}
                >
                    <span className="ofi-btn-apple__label">
                        {isEnroll ? t('auth.mfa.submitEnroll') : t('auth.mfa.submit')}
                    </span>
                    {loading && <span className="ofi-btn-apple__spinner" aria-hidden="true" />}
                </button>

                <button type="button" className="ofi-login__mfa-back" onClick={onCancel} disabled={loading}>
                    <LuArrowLeft size={15} aria-hidden="true" />
                    {t('auth.mfa.back')}
                </button>
            </form>

            <p className="ofi-login__mfa-foot">{t('auth.mfa.lostPhone')}</p>

            <LoginStoreDialog open={storeOpen} onClose={() => setStoreOpen(false)} />
        </div>
    );
};
