/**
 * Kleine Texthilfen des Depos — ausserhalb der Komponentendateien, damit
 * Vites Fast Refresh sie nicht als Komponenten missversteht.
 */

/** Vergleich wie die Datenbank: ohne Gross/Klein, ohne Randleerzeichen. */
export const sameText = (a: string | null | undefined, b: string | null | undefined): boolean =>
    (a ?? '').trim().toLocaleLowerCase() === (b ?? '').trim().toLocaleLowerCase();

export const includesText = (haystack: string | null | undefined, needle: string): boolean =>
    !needle.trim() || (haystack ?? '').toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase());

/** «P-2026-104 · Hauptverteilung» — Nummer und Name eines Produktionsprojekts. */
export const projectLabel = (project: { number: string; name: string }): string =>
    [project.number, project.name].filter(Boolean).join(' · ');

/** «1.2 · Schaltschrank HV1» — Position und Name eines Geräts. */
export const deviceLabel = (device: { name: string; positionNumber?: string | null }): string =>
    device.positionNumber ? `${device.positionNumber} · ${device.name}` : device.name;
