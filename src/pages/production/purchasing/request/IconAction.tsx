import { useState, type ReactNode } from 'react';
import { ArrowRight, Link2 } from 'lucide-react';

/** Die Farben der Handgriffe — jede Art ihre eigene (30.09.2026: «ikonlar farklı renklerde»). */
export type IconTone = 'blue' | 'indigo' | 'teal' | 'orange' | 'green' | 'gray' | 'red' | 'purple';

/**
 * ── EIN HANDGRIFF ALS FARBIGES SYMBOL (30.09.2026, Vorgabe Samet) ─────────
 * «Bütün butonlar ikon şeklinde, farklı renkte, üstüne gelince hover şeklinde
 *  sola doğru açılsın — çok temiz.» Ein runder Knopf mit Symbol; unter dem
 * Zeiger (oder mit der Tastatur) gleitet sein Wort links heraus — die rechte
 * Kante bleibt stehen, weil die Handgriffe rechtsbündig stehen.
 */
export const IconAction = ({ icon, label, tone, onClick, disabled = false, busy = false, title, badge }: {
    icon: ReactNode;
    label: string;
    tone: IconTone;
    onClick: () => void;
    disabled?: boolean;
    busy?: boolean;
    /** Warum gesperrt (sonst das Wort). */
    title?: string;
    /** Eine kleine Zahl am Symbol (z. B. wie viele gesendet würden). */
    badge?: number;
}) => (
    <button
        type="button"
        className={`ofi-iact is-${tone} ofi-nosize`}
        // Ohne das Aufleuchten/Eindrücken der Anwendung — ruhig (30.09.2026: «parlama ve gölge olmasın»).
        data-motion="off"
        disabled={disabled || busy}
        title={title ?? label}
        aria-label={label}
        onClick={(event) => {
            event.stopPropagation();
            onClick();
        }}
    >
        <span className="ofi-iact__label">{label}</span>
        <span className="ofi-iact__icon" aria-hidden>
            {busy ? <span className="ofi-iact__spin" /> : icon}
            {badge !== undefined && badge > 0 && <i className="ofi-iact__badge">{badge}</i>}
        </span>
    </button>
);

/**
 * Das Schild der Preisanfrage, aus der eine Bestellung entstand — erst nur ein
 * kleines Symbol; ein Klick öffnet es nach rechts (die Nummer), der zweite
 * führt hin («o etiket de üstüne tıklayınca sağa doğru açılacak»).
 */
export const SourceTag = ({ code, title, onOpen }: { code: string; title: string; onOpen: () => void }) => {
    const [open, setOpen] = useState(false);
    return (
        <button
            type="button"
            className={`ofi-buy-srctag ofi-nosize${open ? ' is-open' : ''}`}
            data-motion="off"
            title={open ? title : code}
            aria-expanded={open}
            onClick={(event) => {
                event.stopPropagation();
                if (open) onOpen();
                else setOpen(true);
            }}
            onBlur={() => setOpen(false)}
        >
            <Link2 aria-hidden />
            <span className="ofi-buy-srctag__code">{code}</span>
            <ArrowRight className="ofi-buy-srctag__go" aria-hidden />
        </button>
    );
};
