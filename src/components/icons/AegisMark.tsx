/**
 * ── DAS AEGIS-ZEICHEN ───────────────────────────────────────────────────────
 *
 * Das Zeichen der Authenticator-App, die den zweiten Faktor ausgibt: ein «A»
 * aus zwei runden Strichen, einem kürzeren Innenstrich und einem Punkt.
 *
 * Nachgezeichnet und NICHT als Bilddatei eingebunden — aus denselben Gründen
 * wie beim Hauszeichen (OffitecMark): es sitzt auf der Anmeldeseite, die vor
 * jeder Sitzung geladen wird, bleibt in jeder Grösse scharf, kostet keinen
 * zweiten Netzzugriff und färbt sich mit.
 *
 * Die Farben stammen aus dem Zeichen selbst (abgegriffen: #17A0DA oben,
 * #005E9E unten, Platte #EBF4F9). Sie sind bewusst FEST und folgen nicht dem
 * Hell/Dunkel-Wechsel: ein Programmzeichen erkennt man an seiner Farbe.
 */
import { useId } from 'react';

export const AegisMark = ({
    size = 40,
    className = '',
    /** Die helle Platte darunter — wie das App-Symbol auf dem Telefon. */
    plated = true,
}: {
    size?: number;
    className?: string;
    plated?: boolean;
}) => {
    // Eigene Verlaufskennung je Vorkommen: das Zeichen steht mehrfach auf der
    // Seite, und zwei gleiche Kennungen wären ungültig (vgl. LoginWave).
    const gradientId = `ofi-aegis-${useId().replace(/:/g, '')}`;
    return (
        <svg
            viewBox="0 0 64 64"
            width={size}
            height={size}
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="32" y1="10" x2="32" y2="48">
                    <stop offset="0%" stopColor="#17A0DA" />
                    <stop offset="100%" stopColor="#005E9E" />
                </linearGradient>
            </defs>

            {plated && <rect x="0" y="0" width="64" height="64" rx="14" fill="#EDF5FA" />}

            <g
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {/* Das grosse A */}
                <path d="M13.5 44.5 L32 14.5 L50.5 44.5" strokeWidth="6.6" />
                {/* Der kürzere Innenstrich, parallel zum rechten Schenkel */}
                <path d="M31.4 33.5 L37.8 44.5" strokeWidth="6.2" />
            </g>
            <circle cx="25.2" cy="44.5" r="3.3" fill={`url(#${gradientId})`} />
        </svg>
    );
};
