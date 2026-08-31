import { tenderApi } from '@/lib/api/tender';

/**
 * ── DAS ANGEBOT AUS DER STANDARD-ANGEBOTSSEITE ──────────────────────────────
 *
 * Vorgabe Samet, 29.08.2026, in zwei Schritten:
 *
 *   1. «Leg in die Schnellzugriffe einen Knopf, der ein Angebot öffnet — aber
 *      eines, das nicht in die Datenbank geht.»
 *   2. «Öffne ein Angebot aus unserer STANDARD-Angebotsseite.»
 *
 * Der zweite Satz hat den ersten Bau abgelöst. Es gab hier eine eigene,
 * gezeichnete Musterangebots-Seite (`pages/sales/SampleQuotePage.tsx`, am
 * 29.08.2026 wieder entfernt): ein zweites Angebotsblatt, das dem echten nur
 * ÄHNLICH sah und bei jeder Änderung an der Angebotsmaske hinterherhinken
 * musste. Gezeigt wird jetzt die Maske selbst.
 *
 * UND ES WIRD NICHTS ANGELEGT. Der Schnellzugriff öffnet das ZULETZT
 * angelegte Angebot des Mandanten — ein reiner Blick auf einen bestehenden
 * Beleg, kein `POST`, keine neue Zeile in der Datenbank. Genau das war die
 * Bedingung des ersten Satzes, und sie gilt weiter: `/sales/quotes/new` legt
 * ein Angebot an, dieser Weg nie.
 *
 * Findet sich kein Angebot (frischer Mandant), bleibt es bei der Liste — die
 * IST die Standard-Angebotsseite, und leer ist sie eine ehrliche Antwort.
 */

/** Kennung des Eintrags in der Liste «Schnell erstellen». */
export const SAMPLE_QUOTE_ITEM_ID = 'sample-quote';

/** Die Standard-Angebotsseite: die Liste. */
export const QUOTES_PATH = '/sales/quotes';

/**
 * Die Adresse des zuletzt angelegten Angebots — oder die Liste, wenn es keines
 * gibt bzw. der Server nicht antwortet. Ein Fehler darf hier nichts umwerfen:
 * der Aufrufer ist ein Knopf im Kopf und eine Ankündigung, beide sollen im
 * Zweifel einfach die Liste zeigen.
 */
export const newestQuotePath = async (): Promise<string> => {
    try {
        const rows = await tenderApi.list({ page: 1, pageSize: 1 });
        const id = rows[0]?.id;
        return id ? `${QUOTES_PATH}/${id}` : QUOTES_PATH;
    } catch {
        return QUOTES_PATH;
    }
};
