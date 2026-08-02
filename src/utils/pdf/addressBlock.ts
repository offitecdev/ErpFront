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
type CompanyAddressParts = {
    companyName: string;
    addressLine1: string;
    addressLine2: string;
    postalCode: string;
    city: string;
};

const clean = (value: string | null | undefined) => String(value || '').replace(/\s+/g, ' ').trim();

/**
 * ── GÖNDERİCİ SATIRI: HER ZAMAN TEK SATIR ───────────────────────────────────
 *
 * Firma adresi ayarlarda üç parça olarak durur; PDF'te pencere zarfı üstündeki
 * gönderici satırına TEK satır olarak iner:
 *
 *     OffiTec Heating & Cooling, Cores Tower - Hohenrainstrasse 24, 4133 Pratteln
 *
 * Sokak satırı `addressLine1 + addressLine2` ("Cores Tower - Hohenrainstrasse"
 * + "24") olarak birleşir; boş parçalar atlanır, böylece sarkan virgül/boşluk
 * kalmaz. Parçalar arası ayıraç virgüldür — sokak satırının kendisi tire
 * içerebildiği için tire ayıraç olarak kullanılmaz.
 */
export function companySenderLine(s: CompanyAddressParts): string {
    const street = [clean(s.addressLine1), clean(s.addressLine2)].filter(Boolean).join(' ');
    const town = [clean(s.postalCode), clean(s.city)].filter(Boolean).join(' ');
    return [clean(s.companyName), street, town].filter(Boolean).join(', ');
}

/**
 * Metni TEK satırda tutarak yazar: sığmıyorsa sarmak yerine punto `minSize`'a
 * kadar kademeli küçültülür. Çağıran font ailesini/rengini önceden ayarlar;
 * burada yalnızca punto değişir ve satır çizildikten sonra `size`'a geri döner.
 * Dönen değer, satırın gerçekten çizildiği puntodur.
 */
export function drawFittedSingleLine(
    doc: jsPDF,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    size: number,
    minSize = 6,
): number {
    let current = size;
    doc.setFontSize(current);
    while (current > minSize && doc.getTextWidth(text) > maxWidth) {
        current = Math.max(minSize, Math.round((current - 0.1) * 10) / 10);
        doc.setFontSize(current);
    }
    doc.text(text, x, y);
    doc.setFontSize(size);
    return current;
}

/**
 * Alıcı adres bloğunu satırları BÖLMEDEN yazar: her `\n` satırı kendi satırında
 * kalır — sokak bir satır, "PLZ Ort" bir satır. Sığmayan satır sarılmak yerine
 * `drawFittedSingleLine` ile puntosu küçültülür. Dönen değer bir sonraki
 * baseline'ın Y'sidir.
 */
export function drawAddressBlockLines(
    doc: jsPDF,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    size: number,
    lineH: number,
): number {
    const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
        drawFittedSingleLine(doc, line, x, y, maxWidth, size, Math.max(6, size - 2.5));
        y += lineH;
    }
    return y;
}

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
