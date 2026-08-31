import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { t } from '@/i18n/translate';
import { useAuthStore } from '@/store/authStore';
import type { TenantOption } from '@/store/authStore';
import '@/styles/tenantSwitcher.css';

/**
 * ── DIE UNTERNEHMENSWAHL IM KOPF ─────────────────────────────────────────────
 *
 * Vorgabe (28.08.2026, Samet): «Dieses Feld für die Unternehmenswahl soll viel
 * moderner werden — wie bei Apple, Google und anderen heutigen Oberflächen —
 * und KLEINER. Die Unternehmenswahl gehört in den Kopf des Menüs, das sich
 * öffnet.»
 *
 * Vorher: ein 190px breites `<select>` mit Rahmen, Haus-Zeichen und getipptem
 * Pfeil. Es stand als breitestes Feld im Kopf und sah aus wie ein Formular,
 * obwohl man es an den meisten Tagen kein einziges Mal anfasst.
 *
 * Jetzt trägt der Kopf nur noch ein KENNZEICHEN: das farbige Kürzel der
 * aktiven Firma, 32px hoch wie Glocke und Kalenderknopf daneben. Alles
 * Erklärende — Name, Kategorie, Firmennummer und die Wahl selbst — steht im
 * geöffneten Menü, und zwar OBEN als dessen Kopf.
 *
 * WARUM DAS KÜRZEL FARBIG IST: die Farbe kommt fest aus der Kennung der Firma
 * (`monogramTone`). Wer zwischen zwei Häusern hin und her arbeitet, sieht am
 * Fleck im Kopf ohne Lesen, wo er gerade schreibt — das ist der einzige Grund,
 * warum an dieser Stelle überhaupt noch etwas stehen bleibt.
 *
 * Das Kleid liegt in styles/tenantSwitcher.css (`.ofi-tsw*`) und malt aus den
 * Kalender-Merkmalen, damit der Dunkelmodus derselbe Variablentausch ist.
 */

/* Die Hausfarben. Alle tragen weisse Schrift und stehen im Hellen wie im
   Dunkeln — ruhige, gesättigte Töne, keine Signalfarben: das Kürzel soll die
   Firma unterscheiden und nicht neben der Glocke um Aufmerksamkeit rufen.
   Die erste ist das Marken-Navy. */
const TONES = ['#07145c', '#0b57d0', '#0e7c66', '#5b2ea8', '#b3245c'] as const;

/* Rechtsformen tragen nichts zur Unterscheidung bei — «OFFITEC GMBH» und
   «OFFITEC SERVICE GMBH» ergäben sonst beide «OG». */
const LEGAL_FORMS = new Set([
    'gmbh', 'ag', 'sa', 'sarl', 'sàrl', 'ltd', 'ltda', 'llc', 'inc', 'co', 'kg', 'ohg', 'se',
    'as', 'a.s.', 'ltd.', 'inc.', 'co.', 'gmbh.', 'ug', 'eg', 'kgaa', 'bv', 'nv',
]);

/** Zwei Buchstaben aus dem Firmennamen — Rechtsform weggelassen. */
const monogram = (name: string): string => {
    const words = name
        .split(/[\s\-_.]+/)
        .map((word) => word.trim())
        .filter((word) => word.length > 0 && !LEGAL_FORMS.has(word.toLowerCase()));
    const useful = words.length > 0 ? words : [name.trim() || '?'];
    if (useful.length === 1) return useful[0].slice(0, 2).toUpperCase();
    return (useful[0][0] + useful[1][0]).toUpperCase();
};

/** Immer dieselbe Farbe für dieselbe Firma — aus der Kennung, nicht aus der
    Reihenfolge in der Liste (die ändert sich, sobald eine Firma dazukommt). */
const monogramTone = (id: string): string => {
    let sum = 0;
    for (let index = 0; index < id.length; index += 1) sum = (sum * 31 + id.charCodeAt(index)) % 100_000;
    return TONES[sum % TONES.length];
};

const Caret = () => (
    <svg className="ofi-tsw-btn__caret" viewBox="0 0 10 6" width="9" height="6" aria-hidden focusable="false">
        <path d="M1 1.2 5 5 9 1.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const Check = () => (
    <svg className="ofi-tsw__check" viewBox="0 0 16 16" width="16" height="16" aria-hidden focusable="false">
        <path d="M3 8.4 6.3 11.7 13 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

/** Kürzel-Fliese; `size` steuert nur das Mass, die Farbe hängt an der Firma. */
const Monogram = ({ tenant, size }: { tenant: TenantOption; size?: 'lg' | 'sm' }) => (
    <span
        className={`ofi-tsw-mono${size ? ` ofi-tsw-mono--${size}` : ''}`}
        style={{ '--ofi-tsw-tone': monogramTone(tenant.id) } as CSSProperties}
        aria-hidden
    >
        {monogram(tenant.tenantName)}
    </span>
);

export const TenantSwitcher = ({ className = '' }: { className?: string }) => {
    const tenants = useAuthStore((state) => state.tenants);
    const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
    const setSelectedTenant = useAuthStore((state) => state.setSelectedTenant);

    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Klick daneben und Escape schliessen — wie jedes Menü im Kopf.
    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent) => {
            if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const active = useMemo(
        () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0],
        [tenants, selectedTenantId],
    );

    if (!active) return null;

    /* Die Auskunft unter dem Namen: Kategorie und Firmennummer, sofern
       vorhanden — sonst gar nichts statt einer leeren Zeile. */
    const metaOf = (tenant: TenantOption): string => {
        const parts: string[] = [];
        if (tenant.moduleProfile?.name) parts.push(tenant.moduleProfile.name);
        if (tenant.companyNumber) parts.push(t('tenant.companyNumber', { number: tenant.companyNumber }));
        return parts.join(' · ');
    };

    const activeMeta = metaOf(active);

    return (
        <div className={`relative ${className}`} ref={wrapRef}>
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`${t('tenant.switch')} — ${active.tenantName}`}
                title={active.tenantName}
                className={`ofi-hdr-ctl ofi-hdr-ctl--wide ofi-glass-ctl ofi-tsw-btn${open ? ' is-open' : ''}`}
            >
                <Monogram tenant={active} />
                {/* Die Beschriftung (Vorgabe 28.08.2026: «es soll eine
                    Beschriftung haben»): der Firmenname steht wieder in der
                    Leiste — aber als Wort neben dem Kürzel, nicht als Feld.
                    Auf schmalen Fenstern tritt er weg und das Kürzel bleibt,
                    siehe styles/tenantSwitcher.css. */}
                <span className="ofi-tsw-btn__label">{active.tenantName}</span>
                <Caret />
            </button>

            {open && (
                <div role="menu" aria-label={t('tenant.switch')} className="ofi-tsw">
                    {/* ── DER KOPF: die Unternehmenswahl selbst ──────────────
                        Genau der Platz, den die Vorgabe verlangt — wer das
                        Menü öffnet, liest zuerst, in welchem Haus er steht. */}
                    <header className="ofi-tsw__head">
                        <Monogram tenant={active} size="lg" />
                        <span className="ofi-tsw__headtext">
                            <span className="ofi-tsw__eyebrow">{t('tenant.active')}</span>
                            <span className="ofi-tsw__name">{active.tenantName}</span>
                            {activeMeta && <span className="ofi-tsw__meta">{activeMeta}</span>}
                        </span>
                    </header>

                    {/* DIE LISTE IST FLACH (Vorgabe 28.08.2026): «keine
                        Rangordnung, keine Gruppierung — die Firmen einfach
                        untereinander». Mutter und Tochter standen vorher
                        eingerückt an einer Haarlinie; wer hier wählt, will
                        eine Firma anklicken und keinen Stammbaum lesen.

                        SIE STEHT AUCH BEI EINER EINZIGEN FIRMA (Vorgabe
                        31.08.2026). Vorher verschwand sie unter `length > 1`:
                        wer nur eine Firma erreichte, öffnete ein Menü, in dem
                        nichts anzuklicken war — die Firma stand da wie ein
                        Schild, nicht wie eine Wahl. Jetzt ist sie immer eine
                        Zeile mit Haken, und wer mehr Häuser erreichen soll,
                        bekommt sie über den Firmenwechsel seiner Rolle
                        (Einstellungen → Berechtigungen) dazu. */}
                    <div className="ofi-tsw__list">
                        <span className="ofi-tsw__listhead">{t('tenant.switch')}</span>
                        {tenants.map((tenant) => {
                            const isActive = tenant.id === active.id;
                            const meta = metaOf(tenant);
                            return (
                                <button
                                    key={tenant.id}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={isActive}
                                    onClick={() => {
                                        setOpen(false);
                                        if (!isActive) setSelectedTenant(tenant.id);
                                    }}
                                    className={`ofi-tsw__opt${isActive ? ' is-active' : ''}`}
                                >
                                    <Monogram tenant={tenant} size="sm" />
                                    <span className="ofi-tsw__opttext">
                                        <span className="ofi-tsw__optname">{tenant.tenantName}</span>
                                        {meta && <span className="ofi-tsw__optmeta">{meta}</span>}
                                    </span>
                                    {isActive && <Check />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
