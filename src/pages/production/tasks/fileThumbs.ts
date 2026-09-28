/**
 * ── VORSCHAUBILDER DER DATEIEN (28.09.2026) ─────────────────────────────────
 *
 * «The files in the files section should be visible like this» — je Datei
 * ein Bild: ein Foto als es selbst, ein PDF als seine erste Seite. Die Datei
 * kommt über den angemeldeten Weg (Blob); PDF.js wird erst geladen, wenn
 * wirklich ein PDF zu zeigen ist. Einmal gebaut, bleibt ein Bild im Speicher
 * der Seite (höchstens THUMB_CACHE Stück, die ältesten gehen zuerst).
 */

const THUMB_CACHE = 120;
/** So breit wird die erste Seite eines PDFs gezeichnet (Pixel). */
const PDF_THUMB_WIDTH = 480;

const cache = new Map<string, Promise<string | null>>();

const remember = (key: string, value: Promise<string | null>) => {
    cache.set(key, value);
    while (cache.size > THUMB_CACHE) {
        const [oldest, entry] = cache.entries().next().value as [string, Promise<string | null>];
        cache.delete(oldest);
        void entry.then((url) => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url); });
    }
};

let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;
/** PDF.js — erst geladen, wenn wirklich ein PDF zu zeigen ist (auch die Prüfansicht der Dateien nutzt es). */
export const loadPdfjs = () => {
    pdfjsReady ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
        .then(([pdfjs, worker]) => {
            pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
            return pdfjs;
        });
    return pdfjsReady;
};

/** Die erste Seite eines PDFs als JPEG-Adresse. */
const renderPdf = async (blob: Blob): Promise<string | null> => {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    try {
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: PDF_THUMB_WIDTH / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) return null;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.82);
    } finally {
        void doc.destroy();
    }
};

/**
 * Das Vorschaubild einer Datei (Adresse für `<img>`), oder null, wenn es
 * keins gibt. `load` holt die Datei nur beim ersten Mal.
 */
export const thumbnailOf = (fileId: string, type: string, load: () => Promise<Blob>): Promise<string | null> => {
    const known = cache.get(fileId);
    if (known) return known;
    const made = (async () => {
        const blob = await load();
        if (type.startsWith('image/')) return URL.createObjectURL(blob);
        if (type === 'application/pdf') return renderPdf(blob);
        return null;
    })().catch(() => {
        // Ein Fehler bleibt nicht im Speicher — beim nächsten Mal wieder versuchen.
        cache.delete(fileId);
        return null;
    });
    remember(fileId, made);
    return made;
};

/** Die Endung für das Plättchen: PDF, PNG, JPG, WEBP, HEIC. */
export const fileTypeLabel = (type: string, name: string): string => {
    if (type === 'application/pdf') return 'PDF';
    if (type === 'image/jpeg') return 'JPG';
    const fromType = type.split('/')[1];
    if (fromType) return fromType.toUpperCase().slice(0, 4);
    return (name.split('.').pop() ?? 'FILE').toUpperCase().slice(0, 4);
};
