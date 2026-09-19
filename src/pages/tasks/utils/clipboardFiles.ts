/**
 * Dateien aus einer Zwischenablage (Strg/⌘+V) — 15.09.2026, Samet: «görseli
 * ctrl+c ctrl+v ile de ekleyebilelim».
 *
 * - Bildschirmfoto / «Bild kopieren» im Browser liefern eine Bilddatei ohne Text.
 * - Excel/Word legen zu kopiertem TEXT zusätzlich ein Bild der Auswahl ab —
 *   dort gewinnt der Text, das Bild wird NICHT hochgeladen.
 * - Die Zwischenablage nennt jedes Bild «image.png»: es bekommt einen Namen mit Zeitstempel.
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** Name ohne Endung, den die Zwischenablage vergibt. */
const GENERIC_NAME = /^(image|blob)?$/i;

const withTimestampName = (file: File, index: number): File => {
    if (!file.type.startsWith('image/') || !GENERIC_NAME.test(file.name.replace(/\.[^.]+$/, ''))) return file;
    const now = new Date();
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'png';
    const name = `image-${stamp}${index ? `-${index + 1}` : ''}.${extension}`;
    return new File([file], name, { type: file.type, lastModified: file.lastModified });
};

export const clipboardFiles = (data: DataTransfer | null, options: { imagesOnly?: boolean } = {}): File[] => {
    if (!data) return [];
    const fromItems = Array.from(data.items ?? [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
    let files = fromItems.length ? fromItems : Array.from(data.files ?? []);
    if (!files.length) return [];
    // Kopierter Text (Excel, Word …) bringt ein Vorschaubild mit — der Text gewinnt.
    if (data.getData('text/plain').trim()) files = files.filter((file) => !file.type.startsWith('image/'));
    if (options.imagesOnly) files = files.filter((file) => file.type.startsWith('image/'));
    return files.map(withTimestampName);
};

/** Zielt das Einfügen auf ein Eingabefeld? Dann gehört es dem Feld, nicht der Seite. */
export const isEditableTarget = (target: EventTarget | null): boolean => {
    const element = target instanceof HTMLElement ? target : null;
    if (!element) return false;
    return Boolean(element.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
};
