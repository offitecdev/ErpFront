import { pageKeyForPath, type PageLevel } from './pageCatalog';

/**
 * ── SEITENZUGRIFF IM BROWSER (17.08.2026) ────────────────────────────────────
 *
 * Der Server liefert mit der Anmeldung die Stufe je Seite (`pageAccess` aus
 * /auth/me/permissions). Menü und Seitenwächter lesen hier hinein.
 *
 * ZWEI Grundsätze, damit daraus keine Sperre wird, die niemand mehr aufmacht:
 *
 *   1. LEERE Karte = keine Prüfung. Wer (noch) keine Rolle mit Stufen trägt,
 *      steht sonst vor einem leeren Programm — und die Altrollen aus der
 *      abgelösten Stufenseite tragen erst nach dem ersten Speichern eine
 *      Karte. (Der Server rechnet ihnen zwar eine zurück, aber verlassen wollen
 *      wir uns hier nicht darauf.)
 *   2. Seiten AUSSERHALB des Katalogs bleiben frei. Der Katalog führt die fünf
 *      aktiven Module; Kalender, Einstellungen, Logistik und Wartung regeln
 *      sich weiterhin über Modulpaket und Rechte.
 *
 * Die Sperre ist Anzeige, keine Sicherheit: was der Server herausgibt,
 * entscheidet weiterhin `requirePermission` dort.
 */

export const hasPageRules = (pageAccess: Record<string, number> | null | undefined): boolean =>
    Boolean(pageAccess && Object.keys(pageAccess).length > 0);

/** Stufe einer Adresse (0 = kein Zugriff). Ohne Regeln gilt die Höchststufe. */
export const pageLevelForPath = (
    pageAccess: Record<string, number> | null | undefined,
    path: string,
): PageLevel => {
    if (!hasPageRules(pageAccess)) return 3;
    const key = pageKeyForPath(path);
    if (!key) return 3;
    return (pageAccess?.[key] ?? 0) as PageLevel;
};

export const isPathAllowed = (
    pageAccess: Record<string, number> | null | undefined,
    path: string,
): boolean => pageLevelForPath(pageAccess, path) > 0;
