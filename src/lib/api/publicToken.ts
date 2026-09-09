/**
 * Der Schlüssel öffentlicher Seiten (Unterschrift, Terminbestätigung) reist im
 * KOPF, nicht mehr im Pfad. Ein Pfad landet wörtlich im Zugriffsprotokoll des
 * Servers, im Verlauf des Browsers und im Protokoll jedes Zwischenservers —
 * wer eines davon lesen darf, könnte damit unterschreiben.
 *
 * Die Adresse der SEITE (`/report-sign/<schlüssel>`) bleibt wie sie ist: sie
 * steht so in bereits verschickten Mails. Nur der Aufruf der Schnittstelle
 * dahinter ändert sich.
 */
export const publicTokenHeader = (token: string) => ({
    headers: { 'X-Public-Token': token },
});
