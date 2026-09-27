/**
 * Zahlen, Beträge und Daten des Depos — im Schweizer Satz der ganzen
 * Anwendung (1'234.5), unabhängig von der Oberflächensprache.
 */

const QTY = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 3 });

export const fmtQuantity = (value: number | null | undefined): string => QTY.format(Number(value) || 0);

export const fmtPrice = (value: number | null | undefined, currency?: string | null): string => {
    if (value === null || value === undefined) return '';
    try {
        return new Intl.NumberFormat('de-CH', {
            style: 'currency',
            currency: currency || 'CHF',
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
        }).format(Number(value) || 0);
    } catch {
        return `${(Number(value) || 0).toFixed(2)} ${currency || 'CHF'}`;
    }
};

export const fmtDate = (value: string | null | undefined): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const fmtTime = (value: Date): string =>
    value.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });

/**
 * Eine Zahl aus einem Eingabefeld: «12,5», «1'200.50», «12.5». Leer → null,
 * unlesbar → NaN (die Karte zeigt dann einen Fehler statt still 0 zu senden).
 */
export const parseInputNumber = (raw: string): number | null => {
    const text = raw.trim().replace(/['’\s]/g, '');
    if (!text) return null;
    const normalized = /,\d{1,4}$/.test(text) ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
    const value = Number(normalized);
    return Number.isFinite(value) ? value : Number.NaN;
};

/** Eine gespeicherte Zahl zurück ins Feld (ohne Tausendertrenner, mit Punkt). */
export const numberToInput = (value: number | null | undefined): string =>
    value === null || value === undefined ? '' : String(Number(value));

/** Ein Preis zurück ins Feld: immer mindestens zwei Nachkommastellen (412.50), mehr nur, wenn gespeichert. */
export const priceToInput = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    // 0.1 × 100 ist in Gleitkomma 10.000000000000002 — mit Spielraum vergleichen.
    return Math.abs(Math.round(number * 100) - number * 100) < 1e-6 ? number.toFixed(2) : String(number);
};
