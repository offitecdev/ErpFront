/* Der eine Weg, IRGENDWO im ERP das Schreiben-Fenster zu öffnen (Angebot,
   Rechnung, Kundenakte, Postfach-Seite): `openMailCompose({...})`. Das Fenster
   selbst hängt einmal im Layout (`MailComposeHost`) — so gibt es keine zweite
   Kopie des Formulars und ein halb geschriebener Text überlebt Seitenwechsel.

   Nach erfolgreichem Versand feuert `window` das Ereignis `ofi:mail-sent`
   (Detail = Ergebnis + Anfrage), damit Listen sich nachladen können. */

export interface ComposeAttachment {
    filename: string;
    contentType: string;
    /** Entweder Base64 …  */
    contentBase64?: string;
    /** … oder ein Blob (wird beim Senden gelesen). */
    blob?: Blob;
    size?: number;
}

export interface ComposeCustomer { id: string; companyName: string; }

export interface ComposeRequest {
    to?: string;
    cc?: string[];
    subject?: string;
    body?: string;
    customer?: ComposeCustomer | null;
    contactId?: string | null;
    contactName?: string | null;
    entity?: { type: string; id: string; label?: string | null } | null;
    attachments?: ComposeAttachment[];
    /** Antwort auf eine Nachricht: Betreff/Zitat werden vom Aufrufer gesetzt. */
    replyToMessageId?: string | null;
}

export interface MailSentEventDetail {
    request: ComposeRequest;
    transport: 'GRAPH' | 'SMTP';
    mailMessageId?: string;
}

type Listener = (request: ComposeRequest) => void;
let listener: Listener | null = null;
let queued: ComposeRequest | null = null;

export const setComposeListener = (next: Listener | null) => {
    listener = next;
    if (next && queued) { const request = queued; queued = null; next(request); }
};

export const openMailCompose = (request: ComposeRequest = {}) => {
    if (listener) listener(request);
    else queued = request; // Host noch nicht montiert (früher Aufruf) → nachreichen
};

export const MAIL_SENT_EVENT = 'ofi:mail-sent';
export const emitMailSent = (detail: MailSentEventDetail) => {
    window.dispatchEvent(new CustomEvent<MailSentEventDetail>(MAIL_SENT_EVENT, { detail }));
};

export const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
});
