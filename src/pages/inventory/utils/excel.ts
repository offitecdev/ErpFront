// Excel/CSV dosyası okuma. `xlsx` paketi yalnızca gerektiğinde (dinamik import)
// yüklenir — sihirbaz açılmadan ana pakete girmez.

import type { ParsedSheet } from '../types';

export const readSpreadsheetFile = async (file: File): Promise<ParsedSheet> => {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    // cellNF: hücrenin sayı biçimi (`z`) okunur — YÜZDE biçimli sütunları
    // ayırt etmenin tek yolu bu (varsayılan olarak `z` hiç doldurulmaz).
    const workbook = XLSX.read(buffer, { type: 'array', cellNF: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('empty');
    const sheet = workbook.Sheets[sheetName];
    // header:1 → satır dizileri; raw değerler korunur, tarih vs. string'e çevrilir.
    const matrix = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
        header: 1,
        defval: null,
        raw: true,
        blankrows: false,
    });
    if (!matrix.length) throw new Error('empty');

    const headers = (matrix[0] ?? []).map((cell) => (cell === null || cell === undefined ? '' : String(cell).trim()));
    const rows = matrix
        .slice(1)
        .map((row) => headers.map((_, index) => {
            const cell = row[index];
            if (cell === undefined || cell === null) return null;
            return typeof cell === 'number' ? cell : String(cell).trim();
        }))
        .filter((row) => row.some((cell) => cell !== null && cell !== ''));

    // YÜZDE BİÇİMLİ SÜTUNLAR: Excel'de "%20" yazan hücrenin ham değeri 0.2'dir
    // (`raw: true`). Hücrenin kendi sayı biçimi (`z`) '%' içeriyorsa sütun
    // işaretlenir; sihirbaz o sütunun değerlerini 100 ile çarpar. Böylece hem
    // düz sayı yazan dosyalar (bizim şablonumuz: 20) hem gerçek yüzde biçimli
    // dosyalar doğru okunur — tahmin yürütülmez, dosyanın biçimi okunur.
    const percentColumns = headers.map(() => false);
    const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
    if (range) {
        for (let col = range.s.c; col <= range.e.c && col - range.s.c < headers.length; col += 1) {
            for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
                const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
                const format = cell && typeof cell.z === 'string' ? cell.z : '';
                if (cell?.t === 'n' && format.includes('%')) {
                    percentColumns[col - range.s.c] = true;
                    break;
                }
            }
        }
    }

    return { fileName: file.name, headers, rows, percentColumns };
};

export const isSpreadsheetFile = (file: File): boolean => /\.(xlsx|xls|csv)$/i.test(file.name);
