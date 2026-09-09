import { ARTICLE_IMAGE_MAX_BYTES } from '@/types/inventory';

/**
 * Das Foto für die Texterkennung vorbereiten.
 *

 *
 * Angezeigt wird das Bild als `<img>` von der Objekt-URL der Datei: der
 * Browser dreht es nach EXIF genauso wie `drawImage` — Rahmen und Anzeige
 * passen also übereinander, solange beides in PROZENT der Bildgrösse
 * gerechnet wird (das Fenster tut das). `release()` gibt die Objekt-URL
 * wieder frei.
 */
export interface PreparedImage {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
    previewUrl: string;
    release: () => void;
}

const MAX_EDGE = 1800;

const decode = async (img: HTMLImageElement): Promise<void> => {
    if (typeof img.decode === 'function') {
        try {
            await img.decode();
            return;
        } catch {
            /* ältere WebViews: unten der klassische Weg */
        }
    }
    await new Promise<void>((resolve, reject) => {
        if (img.complete && img.naturalWidth) { resolve(); return; }
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image-decode'));
    });
};

export const prepareImage = async (file: Blob, maxEdge = MAX_EDGE): Promise<PreparedImage> => {
    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = previewUrl;
    try {
        await decode(img);
    } catch (error) {
        URL.revokeObjectURL(previewUrl);
        throw error;
    }
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    if (!naturalWidth || !naturalHeight) {
        URL.revokeObjectURL(previewUrl);
        throw new Error('image-empty');
    }
    const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
        URL.revokeObjectURL(previewUrl);
        throw new Error('canvas');
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
        canvas,
        width: canvas.width,
        height: canvas.height,
        previewUrl,
        release: () => URL.revokeObjectURL(previewUrl),
    };
};

/**
 * Dasselbe Foto als Produktbild (JPEG-Daten-URL), klein genug für die
 * 2-MB-Grenze der Produktkarte. Liefert `null`, wenn es auch mit der kleinsten
 * Stufe nicht darunter passt — dann wird das Produkt ohne Bild angelegt.
 */
export const canvasToProductImage = (source: HTMLCanvasElement): string | null => {
    const attempts: Array<{ edge: number; quality: number }> = [
        { edge: 1280, quality: 0.82 },
        { edge: 1024, quality: 0.75 },
        { edge: 800, quality: 0.7 },
    ];
    // Eine Daten-URL ist ~1,37× so lang wie die Datei (Base64 + Kopf).
    const limit = ARTICLE_IMAGE_MAX_BYTES * 1.36;
    for (const attempt of attempts) {
        const scale = Math.min(1, attempt.edge / Math.max(source.width, source.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(source.width * scale));
        canvas.height = Math.max(1, Math.round(source.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', attempt.quality);
        if (dataUrl.length <= limit) return dataUrl;
    }
    return null;
};
