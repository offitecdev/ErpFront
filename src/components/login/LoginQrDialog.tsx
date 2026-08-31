import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LuQrCode, LuX } from '@/components/icons/lucideLocal';
import { formatCameraError } from '@/lib/cameraError';
import { parseLoginQr, type LoginQrPayload } from './loginQrPayload';

/**
 * ── QR-ANMELDUNG (kleines Popup mit Kamera) ─────────────────────────────────
 *
 * Öffnet die Rückkamera (`html5-qrcode`, erst hier nachgeladen — die Bibliothek
 * ist gross und die meisten melden sich per Passwort an), liest genau EINEN
 * Code und reicht die erkannten Zugangsdaten an die Anmeldeseite weiter, die
 * daraufhin das Formular füllt und absendet. Nicht erkannte Codes zeigen kurz
 * eine rote Meldung und der Scanner läuft weiter.
 *
 * Schliessen: ✕, ESC oder Klick auf den Hintergrund. Beim Schliessen wird die
 * Kamera immer sauber freigegeben (auch wenn html5-qrcode gerade startet).
 *
 * Der eigentliche Dialog (`QrDialogBody`) wird bei jedem Öffnen NEU montiert —
 * so startet jede Sitzung sauber in der Phase „starting" ohne setState im
 * Effekt, und der Aufräum-Code des Effekts ist zugleich der Schliess-Pfad.
 */

type Phase = 'starting' | 'scanning' | 'camera-error' | 'invalid' | 'success';

interface LoginQrDialogProps {
    open: boolean;
    onClose: () => void;
    /** Erkannte Nutzlast: entweder ein Personal-Schlüssel oder Zugangsdaten. */
    onCredentials: (payload: LoginQrPayload) => void;
}

type ScannerHandle = { stop: () => Promise<void>; clear: () => void; isScanning: boolean };

const QrDialogBody = ({ onClose, onCredentials }: Omit<LoginQrDialogProps, 'open'>) => {
    const { t } = useTranslation();
    const [phase, setPhase] = useState<Phase>('starting');
    const [cameraErrorDetails, setCameraErrorDetails] = useState('');
    const reactId = useId().replace(/:/g, '');
    const regionId = `ofi-login-qr-${reactId}`;

    // Callbacks über Refs lesen: der Kamera-Effekt darf sich nicht neu starten,
    // nur weil der Elternteil eine neue Funktionsidentität rendert.
    const onCredentialsRef = useRef(onCredentials);
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCredentialsRef.current = onCredentials;
        onCloseRef.current = onClose;
    }, [onCredentials, onClose]);

    useEffect(() => {
        let alive = true;
        let scanner: ScannerHandle | null = null;
        let invalidTimer: number | null = null;

        const start = async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                if (alive) {
                    setCameraErrorDetails('navigator.mediaDevices.getUserMedia is unavailable');
                    setPhase('camera-error');
                }
                return;
            }
            try {
                const { Html5Qrcode } = await import('html5-qrcode');
                if (!alive) return;
                const instance = new Html5Qrcode(regionId, false);
                scanner = instance;
                await instance.start(
                    { facingMode: { exact: 'user' } },
                    // Kein qrbox: html5-qrcode zeichnet sonst eine eigene graue
                    // Schattenmaske — der Rahmen kommt von unseren Ecken.
                    { fps: 10, aspectRatio: 1 },
                    (decoded) => {
                        if (!alive) return;
                        const creds = parseLoginQr(decoded);
                        if (!creds) {
                            setPhase('invalid');
                            if (invalidTimer) window.clearTimeout(invalidTimer);
                            invalidTimer = window.setTimeout(() => {
                                if (alive) setPhase('scanning');
                            }, 1600);
                            return;
                        }
                        alive = false;
                        setPhase('success');
                        void instance
                            .stop()
                            .catch(() => {})
                            .finally(() => {
                                try {
                                    instance.clear();
                                } catch {
                                    /* ignore */
                                }
                            });
                        // Kurz die grünen Ecken zeigen, dann übergeben.
                        window.setTimeout(() => onCredentialsRef.current(creds), 350);
                    },
                    () => {},
                );
                if (alive) setPhase('scanning');
            } catch (error) {
                if (alive) {
                    setCameraErrorDetails(formatCameraError(error));
                    setPhase('camera-error');
                }
            }
        };

        void start();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCloseRef.current();
        };
        document.addEventListener('keydown', onKeyDown);

        return () => {
            alive = false;
            document.removeEventListener('keydown', onKeyDown);
            if (invalidTimer) window.clearTimeout(invalidTimer);
            const s = scanner;
            if (!s) return;
            const clear = () => {
                try {
                    s.clear();
                } catch {
                    /* ignore */
                }
            };
            if (s.isScanning) s.stop().then(clear).catch(clear);
            else clear();
        };
    }, [regionId]);

    const message =
        phase === 'starting'
            ? t('auth.qrStarting')
            : phase === 'camera-error'
              ? t('auth.qrCameraError')
              : phase === 'invalid'
                ? t('auth.qrInvalid')
                : phase === 'success'
                  ? t('auth.qrSuccess')
                  : t('auth.qrHint');

    const isError = phase === 'camera-error' || phase === 'invalid';

    return (
        <div className="ofi-login__qr-layer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            {/* ofi-compact-modal: nimmt das Popup aus der globalen 1280-px-Dialogbreite (index.css) */}
            <section role="dialog" aria-modal="true" aria-labelledby="ofi-login-qr-title" className="ofi-login__qr ofi-compact-modal">
                <header className="ofi-login__qr-head">
                    <span className="ofi-login__qr-icon">
                        <LuQrCode size={18} />
                    </span>
                    <h2 id="ofi-login-qr-title" className="ofi-serif">
                        {t('auth.qrLogin')}
                    </h2>
                    <button type="button" className="ofi-login__icon-btn" onClick={onClose} aria-label={t('common.close')}>
                        <LuX size={16} />
                    </button>
                </header>

                <div className={`ofi-login__qr-view ofi-login__qr-view--${phase}`}>
                    <div id={regionId} className="ofi-login__qr-region" />
                    <span className="ofi-login__qr-corner ofi-login__qr-corner--tl" />
                    <span className="ofi-login__qr-corner ofi-login__qr-corner--tr" />
                    <span className="ofi-login__qr-corner ofi-login__qr-corner--bl" />
                    <span className="ofi-login__qr-corner ofi-login__qr-corner--br" />
                    {phase === 'scanning' && <span className="ofi-login__qr-beam" />}
                </div>

                <p
                    className={`ofi-login__qr-msg${isError ? ' is-error' : ''}${phase === 'success' ? ' is-success' : ''}`}
                    role="status"
                    aria-live="polite"
                >
                    {message}
                </p>
                {phase === 'camera-error' && cameraErrorDetails && (
                    <pre className="mx-4 mb-4 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-red-300 bg-red-50 p-3 text-left text-[11px] leading-relaxed text-red-900">
                        {cameraErrorDetails}
                    </pre>
                )}
            </section>
        </div>
    );
};

export const LoginQrDialog = ({ open, onClose, onCredentials }: LoginQrDialogProps) => {
    if (!open) return null;
    return createPortal(<QrDialogBody onClose={onClose} onCredentials={onCredentials} />, document.body);
};
