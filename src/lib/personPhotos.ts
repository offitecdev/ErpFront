/**
 * ── PROFILBILDER: EIN SPEICHER FÜR DIE GANZE SITZUNG ─────────────────────────
 *
 * Seit dem 18.08.2026 IST das Profilbild die Person: wo vorher Vor- und
 * Nachname standen, steht jetzt das Bild (siehe `PersonAvatar`). Damit braucht
 * es das Bild an sehr vielen Stellen gleichzeitig — eine Personalliste zeigt
 * fünfzehn davon, ein Terminband ein Dutzend.
 *
 * Die Bilder deshalb an die bestehenden Antworten zu hängen, wäre der teuerste
 * Weg: die Kurzliste (/employees/directory) wird bei JEDEM Öffnen eines
 * Auswahlfelds geholt, und fünfzehn Daumennägel darin wären fünfzehnmal
 * dieselben Daten, immer wieder.
 *
 * Darum HIER: ein Speicher je Sitzung, eine gemeinsame Sammelabfrage.
 *
 *   • Jedes Bauteil meldet nur die id an, die es gerade zeigt.
 *   • Die Anmeldungen eines Bildaufbaus werden gesammelt (Mikrotask) und als
 *     EINE Anfrage verschickt — fünfzehn Zeilen = eine Runde, nicht fünfzehn.
 *   • Die Antwort bleibt liegen; ein zweites Mal wird dieselbe Person nie
 *     geholt. Auch das Wissen "diese Person HAT kein Bild" wird behalten,
 *     sonst fragte jede Liste erneut nach denselben Leermeldungen.
 *
 * Der Speicher lebt im Arbeitsspeicher, nicht in `localStorage`: Bilder sind
 * schnell einige hundert Kilobyte und würden dessen Platz sprengen.
 */
import { apiClient } from './axios';

/** `undefined` = noch nicht gefragt, `null` = gefragt, hat kein Bild. */
const cache = new Map<string, string | null>();
/** Angemeldet, aber noch nicht verschickt. */
const queued = new Set<string>();
/** Unterwegs — nicht erneut anmelden, sonst fragt jede Zeile zweimal. */
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

/** Mehr als das nimmt der Server je Anfrage ohnehin nicht an. */
const MAX_IDS_PER_REQUEST = 300;

let flushScheduled = false;

const notify = () => {
    for (const listener of listeners) listener();
};

const flush = async () => {
    flushScheduled = false;
    const ids = Array.from(queued);
    queued.clear();
    if (ids.length === 0) return;

    for (const id of ids) inFlight.add(id);

    for (let start = 0; start < ids.length; start += MAX_IDS_PER_REQUEST) {
        const chunk = ids.slice(start, start + MAX_IDS_PER_REQUEST);
        try {
            const res = await apiClient.get<{ photos?: Record<string, string> }>(
                '/personnel/photos',
                { params: { ids: chunk.join(',') } },
            );
            const photos = res.data?.photos || {};
            // ALLE angefragten ids beantworten, nicht nur die gefundenen: eine
            // Person ohne Bild muss als "kein Bild" hängen bleiben, sonst wird
            // sie bei jedem Bildaufbau erneut angefragt.
            for (const id of chunk) cache.set(id, photos[id] ?? null);
        } catch {
            // Ein Fehlschlag darf nicht zur Endlosschleife werden: die Person
            // gilt vorerst als bildlos und zeigt ihre Initialen.
            for (const id of chunk) cache.set(id, null);
        } finally {
            for (const id of chunk) inFlight.delete(id);
        }
        notify();
    }
};

/**
 * Bild einer Person anmelden. Mehrfaches Aufrufen ist ausdrücklich erlaubt und
 * kostet nichts — genau darauf beruht der Sammelversand.
 */
export const requestPersonPhoto = (id: string | null | undefined): void => {
    if (!id) return;
    if (cache.has(id) || queued.has(id) || inFlight.has(id)) return;
    queued.add(id);
    if (flushScheduled) return;
    flushScheduled = true;
    // Mikrotask statt Zeitgeber: alle Zeilen EINES Bildaufbaus melden sich im
    // selben Durchgang an, verschickt wird direkt danach — ohne sichtbare
    // Verzögerung und trotzdem als eine einzige Anfrage.
    queueMicrotask(() => { void flush(); });
};

/** Was bekannt ist: die Daten-URL, `null` (kein Bild) oder `undefined`. */
export const readPersonPhoto = (id: string | null | undefined): string | null | undefined =>
    id ? cache.get(id) : null;

/**
 * Ein frisch gespeichertes Bild sofort überall zeigen (und ein entferntes
 * sofort überall verschwinden lassen), ohne auf eine neue Abfrage zu warten.
 */
export const primePersonPhoto = (id: string, photo: string | null): void => {
    cache.set(id, photo);
    queued.delete(id);
    notify();
};

export const subscribePersonPhotos = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/** Nach einem Firmenwechsel: der nächste Aufbau holt die Bilder neu. */
export const clearPersonPhotos = (): void => {
    cache.clear();
    queued.clear();
    notify();
};
