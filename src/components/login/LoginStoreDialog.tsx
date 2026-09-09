import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { LuX } from '@/components/icons/lucideLocal';
import { AegisMark } from '@/components/icons/AegisMark';

/**
 * ── «AEGIS HOLEN» (kleines Popup mit dem Ladecode) ──────────────────────────
 *
 * Der QR-Code zum Play Store stand vorher fest neben der Einrichtung und nahm
 * dort dauerhaft eine halbe Spalte ein — für einen Code, den man EINMAL
 * braucht und danach nie wieder. Jetzt steht dort nur noch ein Knopf, und der
 * Code kommt auf Wunsch als Popup.
 *
 * Er ist bewusst vom EINRICHTUNGS-Code getrennt: der eine führt in den Store,
 * der andere trägt das Konto in die App ein. Zwei QR-Bilder nebeneinander
 * werden verwechselt.
 *
 * Schliessen: ✕, ESC oder Klick auf den Hintergrund — wie beim QR-Anmelde-
 * popup nebenan (LoginQrDialog).
 */

export const AEGIS_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.beemdevelopment.aegis';
/** Für Geräte ohne Play Store — die App ist quelloffen. */
export const AEGIS_FDROID_URL = 'https://f-droid.org/packages/com.beemdevelopment.aegis/';

const StoreDialogBody = ({ onClose }: { onClose: () => void }) => {
    const { t } = useTranslation();

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="ofi-login__qr-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            {/* ofi-compact-modal: nimmt das Popup aus der globalen 1280-px-Dialogbreite (index.css) */}
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="ofi-login-store-title"
                className="ofi-login__store ofi-compact-modal"
            >
                <button type="button" className="ofi-login__store-close" onClick={onClose} aria-label={t('common.close')}>
                    <LuX size={16} />
                </button>

                <AegisMark size={54} className="ofi-login__store-mark" />
                <h2 id="ofi-login-store-title" className="ofi-login__store-title">{t('auth.mfa.getApp')}</h2>
                <p className="ofi-login__store-text">{t('auth.mfa.getAppText')}</p>

                <div className="ofi-login__store-qr">
                    {/* Weisser Grund, dunkler Vordergrund — ein umgefärbter QR-Code
                        ist für viele Telefonkameras nicht mehr lesbar. */}
                    <QRCodeSVG value={AEGIS_PLAY_STORE_URL} size={168} level="M" marginSize={2} bgColor="#ffffff" fgColor="#00436F" />
                </div>

                <a className="ofi-btn-apple ofi-btn-apple--aegis ofi-login__store-open" href={AEGIS_PLAY_STORE_URL} target="_blank" rel="noreferrer noopener">
                    {t('auth.mfa.playStore')}
                </a>
                <a className="ofi-login__store-alt" href={AEGIS_FDROID_URL} target="_blank" rel="noreferrer noopener">
                    {t('auth.mfa.fdroid')}
                </a>
                <p className="ofi-login__store-note">{t('auth.mfa.anyApp')}</p>
            </section>
        </div>
    );
};

export const LoginStoreDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    if (!open) return null;
    return createPortal(<StoreDialogBody onClose={onClose} />, document.body);
};
