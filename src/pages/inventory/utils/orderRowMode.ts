import type { OrderCalcMode } from '@/types/inventory';
import type { DraftOrderRow } from '../types';
import { parseNum } from './format';
import { computeOrderLine, discountFactor, round2 } from './orderPricing';

/**
 * ── SATIR KİPİ: ORTAK MANTIK (sipariş editörü + mal kabul ekranı) ───────────
 *
 * Satırın hesap kipi (DIRECT / AUTO / SUPPLIER) satır başınadır; buradaki iki
 * fonksiyon iki ekranda da AYNI davranışı verir (kullanıcı isteği 2026-08-02:
 * "mal kabuldeki mantık yukarıdakiyle birebir aynı olmalı").
 *
 * `draftRowFigures` — satırın tutarları, satırın KENDİ kipiyle.
 * `transitionRowMode` — kip geçişi:
 *   • Terk edilen DIRECT/SUPPLIER kipinin net fiyat + satır tutarı `modeStash`a
 *     saklanır; hedefe dönüşte `stash[hedef] ?? stash.DIRECT` (Excel'den içe
 *     aktarılan hâl) GERİ GELİR — AUTO'nun türettiği tutarlar kalmaz.
 *   • Saklanmış hâl yoksa ekrandaki tutar çıpa alınır ve birim fiyat TAM
 *     DUYARLIKLA türetilir (56.93 / 3 = 18.976666…) — tutar kaymaz.
 *   • AUTO → DIRECT bunun İSTİSNASIDIR: hücrelere hiçbir şey yazılmaz (aşağıda
 *     gerekçesi) — doğrudan giriş boş hücrede aynı tutarı zaten türetir.
 *   • `pinned` verilirse satırın "sabitlenmiş" bayrağı da güncellenir: sabit
 *     satırlar toplu kip değişiminden ETKİLENMEZ (boş daire = tabloyu izler).
 */
/**
 * TEDARİKÇİ kipinde çarpımın tabanı: `supplierUnitBase` varsa O (tam duyarlık),
 * yoksa ekrandaki net fiyat. Ekranda GÖRÜNEN fiyat her zaman `netPrice`tir —
 * Excel'de ne yazıyorsa o (kullanıcı isteği 2026-08-02); taban ise belgedeki
 * TUTARI korur (Excel'in kendi yuvarlaması ikisini ayırabilir: 18.98 görünür,
 * 3 × 18.9766… = 56.93 hesaplanır).
 */
export const supplierUnitBaseOf = (row: DraftOrderRow): number =>
    parseNum(row.supplierUnitBase) ?? parseNum(row.netPrice) ?? 0;

export const draftRowFigures = (row: DraftOrderRow) => {
    if (row.calcMode === 'SUPPLIER') {
        return computeOrderLine({
            quantity: parseNum(row.quantity) ?? 0,
            grossPrice: parseNum(row.grossPrice) ?? 0,
            netPrice: supplierUnitBaseOf(row),
            calcMode: 'SUPPLIER',
        });
    }
    if (row.calcMode !== 'DIRECT') {
        return computeOrderLine({
            quantity: parseNum(row.quantity) ?? 0,
            grossPrice: parseNum(row.grossPrice) ?? 0,
            discount: parseNum(row.discount) ?? 0,
            discount2: parseNum(row.discount2) ?? 0,
        });
    }
    const quantity = parseNum(row.quantity) ?? 0;
    const grossPrice = parseNum(row.grossPrice) ?? 0;
    // ── İNDİRİMLİ FİYAT (kullanıcı hatası 2026-08-02: "indirimli fiyatlar
    // kaydedilmiyor") ───────────────────────────────────────────────────────
    // Net fiyat hücresi BOŞSA satırın fiyatı brüt fiyat × indirim çarpanından
    // TÜRETİLİR — yalnızca brüt fiyat + indirim girilen doğrudan giriş satırı
    // eskiden 0 hesaplanıp 0 kaydediliyordu.
    // Hücreye bir fiyat YAZILMIŞSA o fiyat zaten indirimlidir (Excel dosyaları
    // brüt + indirim + net'i birlikte taşır) ve indirim İKİNCİ KEZ uygulanmaz:
    // doğrudan girişin sözü bozulmaz — yazılan değer ASLA ezilmez.
    const netUnitPrice = row.netPrice.trim()
        ? (parseNum(row.netPrice) ?? 0)
        : round2(grossPrice * discountFactor(parseNum(row.discount) ?? 0, parseNum(row.discount2) ?? 0));
    // Satır tutarı boş bırakılmışsa miktar × net fiyat gösterilir; girilmişse
    // ASLA ezilmez.
    const lineTotal = row.lineTotal.trim()
        ? (parseNum(row.lineTotal) ?? 0)
        : round2(quantity * netUnitPrice);
    const subtotal = round2(quantity * grossPrice);
    return {
        subtotal,
        lineTotal,
        netUnitPrice,
        discountAmount: round2(subtotal - lineTotal),
        lineVat: 0,
        lineGross: lineTotal,
    };
};

export const transitionRowMode = (row: DraftOrderRow, next: OrderCalcMode, pinned?: boolean): DraftOrderRow => {
    const modePinned = pinned ?? row.modePinned;
    if (row.calcMode === next) {
        return row.modePinned === modePinned ? row : { ...row, modePinned };
    }
    const quantity = parseNum(row.quantity) ?? 0;
    const figures = draftRowFigures(row);
    // Terk edilen kipin değerleri saklanır. SATIR TUTARI olarak O ANKİ HESAP
    // yazılır (ham hücre değil): tedarikçi kipinde hücre boş/eskimiş olabilir,
    // oysa çıpa gerçekten ekranda duran tutardır. `quantity` de saklanır ki
    // birim fiyat sonradan doğru bölenle türetilebilsin.
    const modeStash = { ...row.modeStash };
    if (row.calcMode === 'DIRECT' || row.calcMode === 'SUPPLIER') {
        modeStash[row.calcMode] = {
            netPrice: row.netPrice,
            lineTotal: row.calcMode === 'DIRECT' ? row.lineTotal : String(figures.lineTotal),
            quantity: row.quantity,
            ...(row.calcMode === 'SUPPLIER' && row.supplierUnitBase ? { base: row.supplierUnitBase } : {}),
        };
    }
    if (next === 'AUTO') return { ...row, calcMode: next, modeStash, modePinned };

    const savedTarget = modeStash[next];
    const savedDirect = modeStash.DIRECT;

    if (next === 'SUPPLIER') {
        // ── İKİ AYRI DEĞER (kullanıcı isteği 2026-08-02) ────────────────────
        // GÖSTERİLEN fiyat: Excel'de / tedarikçi listesinde ne yazıyorsa o
        //   (18.98) — kip değiştirmek bu fiyatı DEĞİŞTİRMEZ.
        // ÇARPIM TABANI: belgedeki TUTARI koruyan tam duyarlıklı birim
        //   (56.93 / 3 = 18.9766…) — 3 × 18.98 = 56.94 olurdu, satır ise 56.93.
        // Taban önceliği: (1) daha önce kullanılan taban, (2) doğrudan/Excel
        // tutarı ÷ o tutarın yakalandığı miktar, (3) ekrandaki tutar ÷ miktar.
        const directTotal = savedDirect ? (parseNum(savedDirect.lineTotal) ?? 0) : 0;
        const directQty = savedDirect ? (parseNum(savedDirect.quantity) ?? 0) : 0;
        const base = parseNum(savedTarget?.base ?? '')
            ?? (directTotal && directQty > 0 ? directTotal / directQty : null)
            ?? (figures.lineTotal && quantity > 0 ? figures.lineTotal / quantity : null);
        // Gösterilen fiyat: tedarikçi kipinin kendi fiyatı ?? Excel/doğrudan
        // giriş fiyatı ?? (hiçbiri yoksa) tabanın kendisi.
        const display = savedTarget?.netPrice.trim()
            || savedDirect?.netPrice.trim()
            || (base !== null ? String(round2(base)) : String(figures.netUnitPrice || ''));
        return {
            ...row,
            calcMode: next,
            netPrice: display,
            supplierUnitBase: base !== null ? String(base) : undefined,
            modeStash,
            modePinned,
        };
    }

    // DOĞRUDAN GİRİŞ: saklanmış hâl AYNEN geri gelir (Excel'den içe aktarılan
    // net fiyat + satır tutarı) — burada tutar hücrede durduğu için yuvarlama
    // sorunu yoktur.
    if (savedTarget && (savedTarget.netPrice.trim() || savedTarget.lineTotal.trim())) {
        return {
            ...row,
            calcMode: next,
            netPrice: savedTarget.netPrice,
            lineTotal: savedTarget.lineTotal,
            supplierUnitBase: undefined,
            modeStash,
            modePinned,
        };
    }
    // ── OTOMATİK → DOĞRUDAN GİRİŞ (kullanıcı isteği 2026-08-02: "otomatikten
    // doğrudan girişe geçmek doğrudan girişi ETKİLEMEMELİ") ──────────────────
    // Hücrelere otomatik hesabın sonucu YAZILMAZ: yazılsaydı satır donar
    // (brüt fiyat / indirim değişince tutar artık güncellenmez) ve kullanıcı
    // eliyle yazmadığı bir sayıyı silmek zorunda kalırdı. Boş hücreli doğrudan
    // giriş zaten brüt fiyat × indirim çarpanını gösterir — tutar birebir aynı
    // kalır, hücre ise yazılabilir durur.
    if (row.calcMode === 'AUTO') {
        return { ...row, calcMode: next, netPrice: '', lineTotal: '', supplierUnitBase: undefined, modeStash, modePinned };
    }
    if (!figures.lineTotal) return { ...row, calcMode: next, supplierUnitBase: undefined, modeStash, modePinned };
    return {
        ...row,
        calcMode: next,
        // Tedarikçiden geliniyorsa GÖSTERİLEN fiyat korunur, tutar hesaplanandır.
        netPrice: row.calcMode === 'SUPPLIER' ? row.netPrice : String(figures.netUnitPrice),
        lineTotal: String(figures.lineTotal),
        supplierUnitBase: undefined,
        modeStash,
        modePinned,
    };
};

/** Satırın o anki fiyat alanlarından ÖZGÜN HÂL anlık görüntüsü. */
export const captureRowOrigin = (row: DraftOrderRow): DraftOrderRow['origin'] => ({
    grossPrice: row.grossPrice,
    netPrice: row.netPrice,
    lineTotal: row.lineTotal,
    discount: row.discount,
    discount2: row.discount2,
    calcMode: row.calcMode,
});

/**
 * GERİ ÇAĞIR — satırın fiyatını ÖZGÜN hâline döndürür (kullanıcı isteği
 * 2026-08-02: "fiyatı ileri geri taşıyoruz"). Kipler arasında gezinirken ya da
 * elle düzenlerken bozulan fiyat, Excel'den geldiği / kayıttan yüklendiği hâle
 * döner: brüt, net, satır tutarı, indirimler VE satırın o günkü hesap kipi.
 * Miktar KORUNUR (fiyat değil) ve `modeStash` özgün değerlerle tazelenir ki
 * sonraki kip geçişleri de bu tabanı kullansın.
 */
export const restoreRowOrigin = (row: DraftOrderRow): DraftOrderRow => {
    const origin = row.origin;
    if (!origin) return row;
    const mode = origin.calcMode;
    return {
        ...row,
        calcMode: mode,
        grossPrice: origin.grossPrice,
        netPrice: origin.netPrice,
        lineTotal: origin.lineTotal,
        discount: origin.discount,
        discount2: origin.discount2,
        modeStash: mode === 'AUTO'
            ? undefined
            : { [mode]: { netPrice: origin.netPrice, lineTotal: origin.lineTotal, quantity: row.quantity } },
    };
};

/** Satırın fiyatı özgün hâlinden farklı mı (geri çağır düğmesi buna göre açılır)? */
export const rowDiffersFromOrigin = (row: DraftOrderRow): boolean => {
    const origin = row.origin;
    if (!origin) return false;
    return origin.calcMode !== row.calcMode
        || origin.grossPrice !== row.grossPrice
        || origin.netPrice !== row.netPrice
        || origin.lineTotal !== row.lineTotal
        || origin.discount !== row.discount
        || origin.discount2 !== row.discount2;
};

/** Sağdaki dairenin döngüsü: boş → D → A → T → boş (boş = tabloyu izler). */
export const cycleRowMode = (row: DraftOrderRow, tableDefault: OrderCalcMode): DraftOrderRow => {
    if (!row.modePinned) return transitionRowMode(row, 'DIRECT', true);
    if (row.calcMode === 'DIRECT') return transitionRowMode(row, 'AUTO', true);
    if (row.calcMode === 'AUTO') return transitionRowMode(row, 'SUPPLIER', true);
    // Sabitleme kalkar: satır tablo varsayılanına döner ve onu izlemeye başlar.
    return transitionRowMode(row, tableDefault, false);
};
