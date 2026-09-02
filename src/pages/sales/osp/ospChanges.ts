import { t } from '@/i18n/translate';

/**
 * ── WAS SICH GEÄNDERT HAT (§1a `changes`) ────────────────────────────────────
 *
 * Eine Überarbeitung beantwortet die Frage, die der Körper sonst offenlässt:
 * es ist etwas neu — aber WAS hat sich bewegt? Es gibt zwei Listen, und in
 * welcher ein Wert steht, sagt schon, worum es geht:
 *
 *  • an der ANFRAGE   — das Projekt selbst (Name, Sprache, Kontakt, Adressen);
 *  • an der EINHEIT   — diese eine Einheit (neu gerechnet, Optionen, Werte).
 *
 * Zwei Dinge sind dabei wichtig und stehen deshalb hier und nicht verstreut:
 *
 *  1. Ein unbekannter Eintrag ist KEIN Fehler. Der Vertrag nennt die Liste
 *     ausdrücklich eine Beschreibung und keinen geschlossenen Wortschatz — was
 *     wir nicht kennen, wird gezeigt, wie es kam.
 *  2. Eine LEERE Liste an einer Einheit ist eine Aussage: das Datenblatt wurde
 *     durch eine Änderung am PROJEKT neu gerendert (Umbenennung, Sprache), an
 *     der Einheit selbst hat sich nichts bewegt.
 */

/** Die Wortliste des Vertrags → unsere Beschriftung. */
const CHANGE_KEYS: Record<string, string> = {
    'project name': 'projectName',
    language: 'language',
    company: 'company',
    phone: 'phone',
    country: 'country',
    city: 'city',
    'project address': 'projectAddress',
    'shipping address': 'shippingAddress',
    'billing address': 'billingAddress',
    recalculated: 'recalculated',
    'unit options': 'unitOptions',
    'custom values': 'customValues',
};

export const changeLabel = (value: string): string => {
    const key = CHANGE_KEYS[value.trim().toLowerCase()];
    // Unbekanntes bleibt stehen, wie die OSP es geschrieben hat: "sonst etwas
    // hat sich geändert" ist eine brauchbare Auskunft, ein Fehler wäre keine.
    return key ? t(`osp.change.${key}`) : value;
};

/**
 * Die Liste als ein Satz. `null`/fehlt = es gab nichts zu melden; `[]` an einer
 * Einheit heisst "durch eine Projektänderung neu gerendert" und bekommt genau
 * diesen Satz statt einer leeren Zeile.
 */
export const changeSummary = (
    changes: string[] | null | undefined,
    emptyMeansRerendered = false,
): string | null => {
    if (!Array.isArray(changes)) return null;
    if (!changes.length) return emptyMeansRerendered ? t('osp.change.rerendered') : null;
    return changes.map(changeLabel).join(', ');
};
