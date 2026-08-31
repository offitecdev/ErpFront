/**
 * IT-Schleuse im Browser — der Ausweis, den der Server nach richtigem Kennwort
 * ausstellt (`POST /settings/it-gate/verify`).
 *
 * Bis zum Produkt-Upload merkte sich die Schleuse bloss ein Häkchen; die Seiten
 * dahinter waren zusätzlich durch ihre eigene Berechtigung geschützt, das
 * genügte. Der Upload hat diese zweite Schranke nicht, deshalb legt die Schleuse
 * jetzt den Ausweis ab und die geschützten Aufrufe weisen ihn vor.
 *
 * Ablage im `sessionStorage`: der Ausweis gilt für DIESES Fenster und stirbt
 * mit ihm — ein zurückgelassener Rechner öffnet die IT-Fläche nicht von selbst
 * wieder.
 */

const TICKET_KEY = 'offitec:it-gate:ticket';

/** Kopfzeile, in der geschützte Aufrufe den Ausweis mitschicken. */
export const IT_GATE_HEADER = 'x-it-gate';

interface StoredTicket {
    ticket: string;
    expiresAt: number;
}

export const storeItGateTicket = (ticket: string, expiresAt: number): void => {
    try {
        sessionStorage.setItem(TICKET_KEY, JSON.stringify({ ticket, expiresAt } satisfies StoredTicket));
    } catch {
        // Privater Modus ohne Speicher: die Schleuse fragt dann jedes Mal neu.
    }
};

export const clearItGateTicket = (): void => {
    try {
        sessionStorage.removeItem(TICKET_KEY);
    } catch {
        // s. o.
    }
};

/** Der gültige Ausweis — `null`, sobald er fehlt oder abgelaufen ist. */
export const readItGateTicket = (): string | null => {
    try {
        const raw = sessionStorage.getItem(TICKET_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredTicket;
        // Der Server prüft die Frist selbst; hier wird sie mitgeführt, damit die
        // Schleuse den abgelaufenen Ausweis gar nicht erst als "offen" anzeigt.
        if (!parsed?.ticket || !(parsed.expiresAt > Date.now())) {
            clearItGateTicket();
            return null;
        }
        return parsed.ticket;
    } catch {
        return null;
    }
};

/** Kopfzeilen für einen IT-geschützten Aufruf (leer, wenn kein Ausweis da ist). */
export const itGateHeaders = (): Record<string, string> => {
    const ticket = readItGateTicket();
    return ticket ? { [IT_GATE_HEADER]: ticket } : {};
};
