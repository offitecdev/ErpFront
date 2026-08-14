import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LuX } from '@/components/icons/lucideLocal';

/**
 * ── UPDATE-HINWEIS AUF DER ANMELDESEITE ────────────────────────────────────
 *
 * Das EINZIGE Popup der Anmeldeseite (v4, 07.08.2026): die frühere Abfolge
 * aus Update-Hinweis und Bestellanleitung samt gemeinsamer `LoginPopup`-Hülle
 * wurde entfernt. Übrig bleibt diese eine, bewusst schlichte Karte nach der
 * Gestaltungsvorlage: marineblaues Titelband mit zentriertem weissen Titel,
 * darunter auf Weiss die Liveschaltung in Orange, die Zwischenüberschrift in
 * Blau und die Punkte des Releases in Orange. Kein Symbol, keine Fusszeile,
 * keine Schaltflächen — geschlossen wird über das ✕ im Band oder ESC.
 *
 * KEIN MODAL: die Ebene fängt keine Klicks ab (`pointer-events: none`), nur
 * die Karte selbst — das Anmeldeformular dahinter bleibt voll bedienbar.
 *
 * EINMALIG: Wird der Hinweis geschlossen, merkt sich das der Browser unter
 * `DISMISS_KEY` und der Hinweis erscheint NIE WIEDER. Der Schlüssel trägt das
 * Release-Datum im Namen: ein künftiges Update bekommt einen neuen Schlüssel
 * und wird deshalb wieder einmalig angezeigt.
 *
 * `localStorage` ist in Zugriffe gekapselt, die nicht werfen dürfen: im
 * privaten Modus oder bei blockierten Cookies wirft schon das Lesen. Schlägt
 * es fehl, wird der Hinweis gezeigt (Lesefehler) bzw. das Schliessen bleibt
 * trotzdem sofort wirksam (Schreibfehler) — nur eben nicht dauerhaft.
 */

/** Datum des Releases, das dieser Hinweis ankündigt. */
export const UPDATE_RELEASE_DATE = '07.08.2026';

/** Uhrzeit der Liveschaltung am Release-Tag. */
const GO_LIVE_TIME = '20:15';

/** Ein Schlüssel pro Release — siehe Kommentar oben. */
const DISMISS_KEY = 'offitec-update-notice-2026-08-07';

/** Die Punkte des Releases — kurz, wie auf der Vorlage. */
const HIGHLIGHTS: string[] = [
    'Fakturierung erneuert und Rechnungs-PDF hinzugefügt.',
    'Startseite erneuert.',
    '„Meine Aufträge" erneuert.',
    'Allgemeine Codekorrekturen.',
    'Einige fehlerhafte Formulierungen korrigiert sowie Button- und Hintergrundfarben aktualisiert.',
];

interface LoginUpdateNoticeProps {
    /**
     * Zähler aus der Anmeldeseite: jede Erhöhung öffnet den Hinweis erneut.
     * So bleibt er einmalig, ist über die Pille „Neuerungen" im Schnellzugriff
     * aber jederzeit wieder aufrufbar. `0` heisst: nichts angefordert.
     */
    openSignal?: number;
}

export const LoginUpdateNotice = ({ openSignal = 0 }: LoginUpdateNoticeProps) => {
    // Keep the login screen unobstructed; the notice opens from "What's new".
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (openSignal > 0) setOpen(true);
    }, [openSignal]);

    /** Schliesst und merkt sich das dauerhaft. */
    const dismiss = () => {
        setOpen(false);
        try {
            window.localStorage.setItem(DISMISS_KEY, 'true');
        } catch {
            // Speicher nicht verfügbar — das Schliessen wirkt trotzdem sofort.
        }
    };

    // ESC schliesst. Der Listener hängt am Dokument, weil die Karte selbst
    // nicht zwingend den Fokus hält (der bleibt im Anmeldeformular).
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') dismiss();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="ofi-login2__update-layer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.14 }}
                >
                    <motion.section
                        role="dialog"
                        aria-labelledby="ofi-login-update-title"
                        className="ofi-login2__update"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <header className="ofi-login2__update-head">
                            <h2 id="ofi-login-update-title">{`Update vom ${UPDATE_RELEASE_DATE}`}</h2>
                            <button
                                type="button"
                                className="ofi-login2__update-close"
                                onClick={dismiss}
                                aria-label="Hinweis schliessen"
                            >
                                <LuX size={16} />
                            </button>
                        </header>

                        <div className="ofi-login2__update-body">
                            <p className="ofi-login2__update-golive">{`Liveschaltung: ${GO_LIVE_TIME} Uhr`}</p>
                            <p className="ofi-login2__update-sub">Enthaltene Verbesserungen</p>
                            <ul className="ofi-login2__update-list">
                                {HIGHLIGHTS.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    </motion.section>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
