/**
 * ── AUFTRAGSBESTÄTIGUNG: DIE VORGABEN ────────────────────────────────────────
 * Der Beleg, den ein Auftrag dem Kunden schickt, hat zwei Angaben mit einem
 * Standard: das Datum (der Zeitpunkt, an dem der Auftrag entstanden ist — NICHT
 * das Offertdatum) und «Gültig bis» (Standard: ein Monat später).
 *
 * Beide werden an ZWEI Stellen gebraucht — im Fenster, das sie zeigt und
 * änderbar macht, und im Generator, der sie druckt. Sie stehen darum hier und
 * nicht in `utils/pdf/quotePdf.ts`: der Generator wird bewusst dynamisch
 * geladen (jsPDF plus die eingebetteten Schriften), und das Fenster darf darauf
 * nicht warten, nur um ein Datum vorzuschlagen.
 *
 * Ein am Auftrag GESICHERTER Wert schlägt den Standard immer; NULL heisst
 * «noch nie bearbeitet», nicht «leer».
 */

/** Standardgültigkeit einer Auftragsbestätigung, in Monaten. */
export const CONFIRMATION_VALIDITY_MONTHS = 1;

/**
 * Datum plus n Monate — mit der üblichen Klammer am Monatsende: der 31. Januar
 * plus ein Monat ist der 28./29. Februar und nicht der 3. März, den `setMonth`
 * allein daraus machen würde.
 */
const addMonths = (date: Date, count: number): Date => {
    const day = date.getDate();
    const result = new Date(date.getTime());
    result.setMonth(result.getMonth() + count);
    // Übergelaufen (aus dem 31.01. wurde der 03.03.): auf den letzten Tag des
    // Zielmonats zurücksetzen.
    if (result.getDate() < day) result.setDate(0);
    return result;
};

/** JJJJ-MM-TT in Ortszeit — das Format, das ein `<input type="date">` erwartet. */
export const toDayValue = (value: Date | string | null | undefined): string => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Das Datum der Bestätigung: der Geschäftstermin des Auftrags, ersatzweise sein
 * Entstehungszeitpunkt. Ausdrücklich NICHT das Datum der Offerte — bestätigt
 * wird der Auftrag, und der ist in dem Moment entstanden, in dem er erteilt
 * wurde.
 */
export const confirmationDateOf = (order: { orderDate?: string | null; createdAt?: string | null } | null | undefined): string =>
    order?.orderDate || order?.createdAt || new Date().toISOString();

/** Vorgabe für «Gültig bis»: Auftragsdatum + ein Monat, als JJJJ-MM-TT. */
export const defaultConfirmationValidUntil = (orderDate?: string | null): string => {
    const base = orderDate ? new Date(orderDate) : new Date();
    const start = Number.isNaN(base.getTime()) ? new Date() : base;
    return toDayValue(addMonths(start, CONFIRMATION_VALIDITY_MONTHS));
};

/**
 * Der Wert, der wirklich auf dem Beleg steht: das am Auftrag gesicherte Datum,
 * sonst die Vorgabe. Fenster und Generator fragen beide hier — so kann das
 * Fenster nie ein anderes Datum zeigen als das PDF druckt.
 */
export const resolveConfirmationValidUntil = (
    stored: string | null | undefined,
    orderDate?: string | null,
): string => toDayValue(stored) || defaultConfirmationValidUntil(orderDate);
