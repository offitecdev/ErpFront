/**
 * ── BILD MIT TRENNLINIEN (27.09.2026, Vorgabe Samet) ─────────────────────────
 *
 * «Görsel yapıştırıyorsak birden fazla görsel olabilir; bir çizgi ekliyoruz
 *  veriler arasına, bu çizgi fark ediliyor ve bu şekilde burada boşluk var
 *  deniliyor.»
 *
 * Die Linien liegen als Anteile der Bildhöhe (0…1) vor und werden beim Senden
 * IN das Bild gezeichnet — kräftig rot, über die ganze Breite —, damit das
 * Modell sie sieht wie der Mensch. Das Bild wird dabei auf höchstens 2048 px
 * Kantenlänge gebracht (grösser liest das Modell ohnehin nicht).
 */

export interface AnnotatedImage {
    id: string;
    name: string;
    /** Object-URL für die Vorschau. */
    url: string;
    file: File;
    /** Trennlinien als Anteil der Höhe. */
    lines: number[];
}

const MAX_EDGE = 2048;

const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image-load-failed'));
    image.src = url;
});

/** Das Bild samt Linien als PNG (Base64, ohne `data:`-Kopf). */
export const renderAnnotated = async (entry: AnnotatedImage): Promise<{ data: string; mimeType: string }> => {
    const image = await loadImage(entry.url);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas-unavailable');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const stroke = Math.max(3, Math.round(height / 360));
    context.strokeStyle = '#ff1f1f';
    context.lineWidth = stroke;
    for (const ratio of entry.lines) {
        const y = Math.round(ratio * height) + 0.5;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
    }
    const dataUrl = canvas.toDataURL('image/png');
    return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/png' };
};

let seed = 0;
export const annotatedFromFile = (file: File): AnnotatedImage => ({
    id: `img-${Date.now().toString(36)}-${(seed += 1)}`,
    name: file.name || 'image.png',
    url: URL.createObjectURL(file),
    file,
    lines: [],
});
