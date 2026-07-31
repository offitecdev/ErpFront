import type { jsPDF } from 'jspdf';

/**
 * ── PDF ALICI ADRES BLOĞU: EN FAZLA İKİ SATIR ───────────────────────────────
 *
 * Adres veri modelinde ayrı bileşenler olarak tutulur; ekrana ve PDF'e çıkarken
 * `formatAddressLines()` (`src/utils/address.ts`) ile İKİ satıra indirgenir:
 *
 *     Bahnhofstrasse 12, 3. OG          ← sokak + bina no (+ adres eki)
 *     8001 Zürich, ZH, Schweiz          ← PLZ + şehir (+ eyalet, ülke)
 *
 * PDF şablonlarına bu iki satır `\n` ile birleştirilmiş tek metin olarak gelir
 * (sipariş tarafında `PurchaseOrder.supplierAddress` snapshot'ı, teklif
 * tarafında `formatLocationAddress()` çıktısı). Buradaki iş yalnızca metni blok
 * genişliğine sığdırmak: satır sığmıyorsa kendi ayıracından ("," ) bölünür ve
 * blok EN FAZLA `maxLines` (varsayılan 3) satırda kalır — yani normalde iki,
 * metin taştığında üç satır. `doc.splitTextToSize` tek başına sınırsız sarar,
 * bu yüzden doğrudan kullanılmaz.
 */
export function fitAddressBlock(
    doc: jsPDF,
    text: string,
    maxWidth: number,
    maxLines = 3,
): string[] {
    const source = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const out: string[] = [];
    for (const line of source) {
        if (out.length >= maxLines) break;
        if (doc.getTextWidth(line) <= maxWidth) {
            out.push(line);
            continue;
        }
        const cut = line.lastIndexOf(', ');
        if (cut > 0 && out.length + 2 <= maxLines) {
            out.push(line.slice(0, cut), line.slice(cut + 2));
        } else {
            // Ayıracı yoksa sar; blok yine maxLines ile sınırlanır.
            out.push(...(doc.splitTextToSize(line, maxWidth) as string[]));
        }
    }
    return out.slice(0, maxLines);
}
