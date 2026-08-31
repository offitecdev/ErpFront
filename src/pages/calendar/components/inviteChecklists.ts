import { formsApi, type FormSubmissionRow } from '@/lib/api/forms';
import type { InviteAttachmentInput } from '@/lib/api/project';

/* ── CHECKLISTEN AN DER TERMINMAIL (19.08.2026) ───────────────────────────────
   Vorgabe: hängt am Projekt oder am Auftrag eine Checkliste, geht sie als PDF
   mit der Terminmail an die Monteurin.

   Gezeichnet wird hier, im Browser: jsPDF, die Schriften, das Firmenlogo und
   die PDF-Einstellungen leben nur auf dieser Seite ([[quote-pdf-anywhere]]).
   Der Server bekommt fertige Base64-PDFs — denselben Weg gehen Angebot,
   Auftragsbestätigung und Rechnung schon.

   WELCHE Checklisten: `GET /forms/context/appointment/:id` löst die ganze Kette
   auf (Termin → Auftrag → Angebot/Projekt → Kunde) und liefert damit genau die
   Checklisten des Projekts UND des Auftrags — ohne zweite Abfrage.

   Die Grenzen sind die des Mailservers, nicht der Anzeige: der Server nimmt
   zusammen 5 MB, hier wird bei 4,5 MB aufgehört, damit die Kalenderdatei und
   der MIME-Rahmen noch Platz haben. Was nicht mehr passte, wird GEZÄHLT und
   zurückgemeldet — stillschweigend weglassen wäre schlimmer als weglassen. */

/** Höchstens so viele Checklisten — ein Termin mit 40 Checklisten wäre keine Mail mehr. */
const MAX_FILES = 10;
/** 4,5 MB; der Server lässt 5 MB zu und muss noch die .ics unterbringen. */
const MAX_BYTES = 4.5 * 1024 * 1024;

export interface ChecklistAttachments {
    attachments: InviteAttachmentInput[];
    /** Gefunden, aber nicht mitgeschickt (Anzahl/Grösse) — die Anwenderin erfährt es. */
    skipped: number;
}

/** Die Checklisten des Termins samt seiner Kette (Projekt, Auftrag, Angebot). */
export const loadAppointmentChecklists = async (appointmentId: string): Promise<FormSubmissionRow[]> => {
    const result = await formsApi.getContext('appointment', appointmentId);
    return Array.isArray(result?.submissions) ? result.submissions : [];
};

/** `data:application/pdf;base64,XXXX` → nur das XXXX. */
const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.onload = () => {
            const value = String(reader.result || '');
            const comma = value.indexOf(',');
            resolve(comma >= 0 ? value.slice(comma + 1) : value);
        };
        reader.readAsDataURL(blob);
    });

/** Dateiname aus dem Vorlagennamen; doppelte Namen bekommen eine Nummer. */
const fileNameFor = (row: FormSubmissionRow, used: Set<string>): string => {
    const base = String(row.templateName || 'Checkliste')
        .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60) || 'Checkliste';
    let name = `${base}.pdf`;
    let counter = 2;
    while (used.has(name.toLowerCase())) name = `${base} (${counter++}).pdf`;
    used.add(name.toLowerCase());
    return name;
};

/**
 * Zeichnet die übergebenen Checklisten und gibt sie als Anhänge zurück. Eine
 * Checkliste, die sich nicht zeichnen lässt, zählt als übersprungen und hält
 * den Versand nicht auf — die Einladung ist wichtiger als ihr Beiblatt.
 */
export const buildChecklistAttachments = async (rows: FormSubmissionRow[]): Promise<ChecklistAttachments> => {
    if (!rows.length) return { attachments: [], skipped: 0 };
    // Der Generator zieht jsPDF nach — niemals in den Startpfad der Seite.
    const { exportFormSubmissionPdf } = await import('@/utils/pdf/formSubmissionPdf');

    const attachments: InviteAttachmentInput[] = [];
    const used = new Set<string>();
    let bytes = 0;
    let skipped = 0;

    for (const row of rows) {
        if (attachments.length >= MAX_FILES) { skipped += 1; continue; }
        try {
            // Die Liste ist schlank; Felder und Werte kommen erst beim Einzelabruf.
            const submission = await formsApi.getSubmission(row.id);
            const blob = await exportFormSubmissionPdf({ submission, output: 'blob' });
            if (!blob) { skipped += 1; continue; }
            if (bytes + blob.size > MAX_BYTES) { skipped += 1; continue; }
            bytes += blob.size;
            attachments.push({
                filename: fileNameFor(row, used),
                contentType: 'application/pdf',
                contentBase64: await blobToBase64(blob),
            });
        } catch {
            skipped += 1;
        }
    }
    return { attachments, skipped };
};
