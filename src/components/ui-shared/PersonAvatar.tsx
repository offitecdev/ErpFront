import { memo, useEffect, useSyncExternalStore } from 'react';

import {
    readPersonPhoto,
    requestPersonPhoto,
    subscribePersonPhotos,
} from '@/lib/personPhotos';

/**
 * ── DER PERSONENKREIS ────────────────────────────────────────────────────────
 *
 * Überall dort, wo die Anwendung eine Person als runden Knopf zeigt, stand
 * bisher ein blauer Kreis mit ihren Initialen („ES"). Vorgabe vom 18.08.2026:
 * hat die Person ein Profilbild hinterlegt, steht STATTDESSEN das Bild darin —
 * ohne Bild bleibt es beim Kreis mit den Initialen.
 *
 * Der NAME bleibt, wo er steht. Dieses Bauteil ersetzt ausschliesslich den
 * Kreis, niemals die Beschriftung daneben: in Tabellen, Auswahlfeldern und
 * Listen muss eine Person weiterhin gelesen und gesucht werden können.
 *
 * Der Name reist trotzdem mit — als `title` (Kurzhinweis der Maus) und als
 * `alt` des Bildes, damit auch ein allein stehender Kreis benannt ist.
 */

const initialsOf = (name?: string | null): string =>
    (name || '')
        .trim()
        .split(/\s+/)
        .map((part) => part.charAt(0))
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

export interface PersonAvatarProps {
    /** Personal-id — womit das Bild geholt wird. */
    id?: string | null;
    /** Quelle der Initialen und des Kurzhinweises. */
    name?: string | null;
    /** Bereits vorliegendes Bild (Personenseite) — spart die Nachfrage. */
    photo?: string | null;
    size?: number;
    /** Der helle Ring der App; im Gedränge einer Gruppe unerwünscht. */
    ring?: boolean;
    /**
     * Wie der Kreis OHNE Bild aussieht. `brand` ist der volle Hausfarbkreis
     * (Kopfleiste, Personalliste), `subtle` der leise graue mit Rand, wie ihn
     * die Listenspalten „Ersteller" tragen. MIT Bild ist der Unterschied ohne
     * Bedeutung — dann füllt das Bild den Kreis.
     */
    tone?: 'brand' | 'subtle';
    className?: string;
}

const TONE_CLASS: Record<'brand' | 'subtle', string> = {
    brand: 'bg-[#272f67] font-semibold text-white',
    subtle: 'border border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70',
};

export const PersonAvatar = memo(({
    id,
    name,
    photo,
    size = 28,
    ring = true,
    tone = 'brand',
    className = '',
}: PersonAvatarProps) => {
    // Die Anmeldung gehört in einen Effekt, nicht in den Aufbau: React darf
    // einen Aufbau verwerfen, ein Effekt läuft nur für das, was steht.
    useEffect(() => {
        if (!photo) requestPersonPhoto(id);
    }, [id, photo]);

    const stored = useSyncExternalStore(
        subscribePersonPhotos,
        () => (id ? readPersonPhoto(id) : null),
    );

    const shown = photo ?? stored ?? null;
    const label = name?.trim() || undefined;
    const initials = initialsOf(name);

    return (
        <span
            title={label}
            style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)) }}
            className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full ${TONE_CLASS[tone]} ${
                ring ? 'ring-2 ring-[#d3e3fd] dark:ring-white/20' : ''
            } ${className}`}
        >
            {shown
                ? <img src={shown} alt={label || ''} className="size-full object-cover" draggable={false} />
                : <span>{initials || '?'}</span>}
        </span>
    );
});

