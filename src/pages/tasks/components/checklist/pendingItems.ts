/**
 * Sofort sichtbare Checklistenpunkte (13.09.2026, Samet: «maddeler çok yavaş
 * ekleniyor»). Der Browser vergibt die Kennung selbst, zeigt den Punkt im
 * selben Tastendruck an und schickt ihn danach — Anfügen je Liste streng
 * hintereinander, damit «nach Punkt X» den Punkt X auf dem Server schon findet.
 * Handlungen an einem noch reisenden Punkt (abhaken, ändern, löschen) warten
 * mit `whenItemSaved` auf ihn.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export const newItemId = (): string => {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => ALPHABET[byte % 64]).join('');
};

const listQueues = new Map<string, Promise<unknown>>();
const pending = new Map<string, Promise<boolean>>();

/** Reiht das Speichern eines Punkts hinter die vorigen derselben Liste. */
export const queueItemSave = (checklistId: string, itemId: string, save: () => Promise<boolean>): Promise<boolean> => {
    const previous = listQueues.get(checklistId) ?? Promise.resolve();
    const run = previous.then(save, save).catch(() => false);
    listQueues.set(checklistId, run);
    pending.set(itemId, run);
    void run.finally(() => {
        if (pending.get(itemId) === run) pending.delete(itemId);
        if (listQueues.get(checklistId) === run) listQueues.delete(checklistId);
    });
    return run;
};

export const isItemPending = (itemId: string): boolean => pending.has(itemId);

/** true = der Punkt liegt auf dem Server (oder war nie ausstehend). */
export const whenItemSaved = (itemId: string): Promise<boolean> => pending.get(itemId) ?? Promise.resolve(true);
