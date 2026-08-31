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

/**
 * ── ABGELÖSTE SEITENSCHLÜSSEL (26.08.2026) ──────────────────────────────────
 *
 * Die Karte, die eine Anmeldung mitbringt, kann noch den ALTEN Schlüssel einer
 * inzwischen ersetzten Seite tragen — sie stammt aus einer Rolle, die seither
 * niemand gespeichert hat. Ohne diese Umschrift stünde die Nachfolgeseite für
 * jede bestehende Rolle auf Stufe 0, also gesperrt.
 *
 * WORTGLEICH mit `RETIRED_PAGE_KEYS` im Backend (shared/pageCatalog.ts) — dort
 * wird beim Einlesen der Rolle dasselbe gerechnet. Beide Kopien müssen im
 * Gleichschritt bleiben.
 */
const RETIRED_PAGE_KEYS: Readonly<Record<string, string>> = {
    'personnel.reports': 'personnel.timeRecords',
    'personnel.accounting': 'personnel.timeRecords',
    'personnel.leaves': 'personnel.requests',
    'personnel.approvals': 'personnel.requestsIncoming',
    'personnel.incoming': 'personnel.requestsIncoming',
};

/**
 * Stufe eines SEITENSCHLÜSSELS (nicht eines Pfads). Die Antragsseite liest
 * damit ihre drei Reiter: sie ist EINE Adresse, aber drei Katalogzeilen.
 */
export const pageLevelForKey = (
    pageAccess: Record<string, number> | null | undefined,
    pageKey: string,
): PageLevel => {
    if (!hasPageRules(pageAccess)) return 3;
    const map = pageAccess as Record<string, number>;
    if (Object.prototype.hasOwnProperty.call(map, pageKey)) return map[pageKey] as PageLevel;
    return inheritedLevel(map, pageKey) as PageLevel;
};

/**
 * ── NEUE SEITEN ERBEN VON EINER BESTEHENDEN (10.09.2026) ────────────────────
 *
 * Das Gegenstück zu RETIRED_PAGE_KEYS. Eine NEU in den Katalog gekommene Zeile
 * steht in jeder schon gespeicherten Rolle auf Stufe 0 — der frische Menüpunkt
 * wäre also für alle gesperrt, bis jemand jede Rolle von Hand wieder aufmacht.
 * Darum nennt die neue Seite hier ihre verwandte bestehende Seite und übernimmt
 * deren Stufe, solange die Rolle keinen eigenen Wert für sie trägt.
 *
 * WORTGLEICH mit `PAGE_LEVEL_FALLBACKS` im Backend (shared/pageCatalog.ts).
 */
const PAGE_LEVEL_FALLBACKS: Readonly<Record<string, string>> = {
    'crm.enquiries': 'crm.customers',
    'crm.activities': 'crm.communication',
};

/**
 * Die höchste Stufe, die diese Seite von anderen übernimmt: von ihren
 * abgelösten Vorgängern oder — neu hinzugekommen — von ihrer verwandten Seite.
 */
const inheritedLevel = (pageAccess: Record<string, number>, pageKey: string): number => {
    let best = 0;
    for (const [retired, successor] of Object.entries(RETIRED_PAGE_KEYS)) {
        if (successor !== pageKey) continue;
        const level = pageAccess[retired] ?? 0;
        if (level > best) best = level;
    }
    const relative = PAGE_LEVEL_FALLBACKS[pageKey];
    if (relative) {
        const level = pageAccess[relative] ?? 0;
        if (level > best) best = level;
    }
    return best;
};

/** Stufe einer Adresse (0 = kein Zugriff). Ohne Regeln gilt die Höchststufe. */
export const pageLevelForPath = (
    pageAccess: Record<string, number> | null | undefined,
    path: string,
): PageLevel => {
    if (!hasPageRules(pageAccess)) return 3;
    const key = pageKeyForPath(path);
    if (!key) return 3;
    const map = pageAccess as Record<string, number>;
    // Der eigene Schlüssel zuerst; fehlt er ganz, erben die Vorgänger.
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key] as PageLevel;
    return inheritedLevel(map, key) as PageLevel;
};

export const isPathAllowed = (
    pageAccess: Record<string, number> | null | undefined,
    path: string,
): boolean => pageLevelForPath(pageAccess, path) > 0;
