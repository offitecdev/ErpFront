import type { DraftOrderRow } from '../types';

/**
 * ── EXCEL AKTARIMI TABLOYA NASIL OTURUR ─────────────────────────────────────
 *
 * Kullanıcı isteği 2026-08-02: *"Excel aktarımında ürün/malzeme ve seri kod
 * tutuyorsa O SATIRIN ÜZERİNE yazsın."* Aktarım artık kör bir EKLEME değildir:
 *
 *   1. EŞLEŞEN SATIRIN ÜZERİNE YAZ — dosyadaki satır tablodaki bir satırla
 *      eşleşiyorsa o satır dosyanın değerleriyle DEĞİŞTİRİLİR (kopya satır
 *      oluşmaz; aynı dosyayı ikinci kez aktarmak tabloyu ikiye katlamaz).
 *   2. Kalanlar önce BOŞ satırları doldurur (satır anahtarı korunur),
 *   3. Artanlar tablonun SONUNA eklenir.
 *
 * EŞLEŞME ANAHTARI SERİ KODDUR: modülün kuralı gereği bir ürünün Excel'deki tek
 * kimliği `articleCode`tir (bkz. `columnMatch.ts`). Dosya satırında kod yoksa ad
 * ile eşleşilir. Kod tutup ad tutmuyorsa yine ÜZERİNE YAZILIR — dosya kazanır,
 * ad da dosyadakiyle güncellenir.
 *
 * ÜZERİNE YAZARKEN KORUNAN ÜÇ ALAN: satır anahtarı (React kimliği) ve MAL KABUL
 * durumu (`receivedQuantity` / `receivedAt`) — bir aktarım, stoğa alınmış
 * miktarı ASLA silmemelidir.
 */

const matchKey = (value: string): string => value.trim().toLowerCase();

/** Dosyadan gelen satır, tablodaki satırın aynısı mı (seri kod, yoksa ad)? */
export const importedRowMatches = (row: DraftOrderRow, incoming: DraftOrderRow): boolean => {
    const code = matchKey(incoming.code);
    if (code) return matchKey(row.code) === code;
    const name = matchKey(incoming.name);
    return Boolean(name) && matchKey(row.name) === name;
};

/**
 * Aktarılan satırları mevcut tabloya yerleştirir (yukarıdaki üç adım).
 * `isBlank` verilmezse boş satır doldurma adımı atlanır — mal kabul ekranında
 * tablo zaten dolu satırlardan oluşur.
 */
export const mergeImportedOrderRows = (
    current: DraftOrderRow[],
    additions: DraftOrderRow[],
    isBlank?: (row: DraftOrderRow) => boolean,
): DraftOrderRow[] => {
    const next = [...current];
    // Aynı satır iki dosya satırı tarafından ezilmesin: eşleşen indeksler işaretlenir.
    const taken = new Set<number>();
    const leftovers: DraftOrderRow[] = [];

    for (const addition of additions) {
        const index = next.findIndex((row, position) => !taken.has(position) && importedRowMatches(row, addition));
        if (index < 0) {
            leftovers.push(addition);
            continue;
        }
        taken.add(index);
        next[index] = {
            ...addition,
            key: next[index].key,
            receivedQuantity: next[index].receivedQuantity,
            receivedAt: next[index].receivedAt,
        };
    }

    if (!isBlank) return [...next, ...leftovers];

    let cursor = 0;
    for (let index = 0; index < next.length && cursor < leftovers.length; index += 1) {
        if (taken.has(index) || !isBlank(next[index])) continue;
        next[index] = { ...leftovers[cursor], key: next[index].key };
        cursor += 1;
    }
    return [...next, ...leftovers.slice(cursor)];
};
