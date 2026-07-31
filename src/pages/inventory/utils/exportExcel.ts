import { t } from '@/i18n/translate';
import type { PurchaseOrderRow } from '@/types/inventory';
import { orderGrandTotal } from './orderPricing';

/**
 * Sipariş → Excel dışa aktarımı. `xlsx` yalnızca burada ve içe aktarma
 * sihirbazında dinamik import edilir (ana pakete girmez).
 *
 * Kolonlar sipariş tablosuyla (OrderSheet kalem tablosu / PDF) AYNI SIRADADIR:
 * Ürün / Malzeme · Seri Kod · Miktar · Brüt Fiyat · Net Fiyat · İndirim ·
 * İndirim 2 · İndirim 3 · KDV · Toplam. "Seri No" sütunu YOKTUR (kullanıcı
 * isteği).
 *
 * ⚠ İNDİRİM VE KDV SÜTUNLARI HER ZAMAN YAZILIR (kullanıcı isteği 2026-07-30).
 * Eskiden yalnızca kayıtta sıfırdan büyük bir değer varsa yazılırlardı; kayıt
 * "sütun açık ama değer 0" ile "sütun hiç açılmadı"yı ayırt edemediği için
 * girilen indirim/KDV Excel'de kaybolabiliyordu. Ekranda ve PDF'te yer dar
 * olduğu için oradaki koşullu davranış KORUNUR; Excel'de genişlik bedava ve
 * dosya aynı zamanda İÇE AKTARMA ŞABLONUdur — sütunlar sabit kalmalı.
 *
 * Toplam bloğu: net toplam → ek ücretler (ad + tutar, tek tek) → KDV → genel
 * toplam. Genel toplam net toplamdan farklıysa yazılır.
 */
export const exportOrderExcel = async (order: PurchaseOrderRow): Promise<void> => {
    const XLSX = await import('xlsx');

    const showVat = order.items.some((item) => (item.vatRate ?? 0) > 0);
    const fees = order.additionalFees ?? [];

    // Yüzde sütunları SAYI olarak yazılır (10 = %10); başlığa "(%)" eklenir ki
    // tutarla karışmasın. Aynı başlıklar içe aktarma sihirbazında birebir
    // eşleşir (dosya kendi kendine geri yüklenebilir).
    const percentLabel = (label: string) => `${label} (%)`;

    const header: string[] = [
        t('inv.columns.item'),
        t('inv.columns.serialCode'),
        t('inv.columns.quantity'),
        t('inv.orders.columns.grossPrice'),
        t('inv.orders.columns.netPrice'),
        percentLabel(t('inv.orders.columns.discount')),
        percentLabel(t('inv.orders.columns.discount2')),
        percentLabel(t('inv.orders.columns.discount3')),
        percentLabel(t('inv.orders.columns.vat')),
        t('inv.columns.total'),
    ];

    const itemRows = order.items.map((item) => [
        item.name,
        item.code || '',
        item.quantity,
        item.grossPrice,
        item.netPrice,
        item.discount ?? 0,
        item.discount2 ?? 0,
        item.discount3 ?? 0,
        item.vatRate ?? 0,
        item.lineTotal,
    ]);

    // Toplam satırları: etiket son sütunun solunda, değer son sütunda.
    const totalRow = (label: string, value: number): Array<string | number | null> => [
        ...Array<null>(header.length - 2).fill(null),
        label,
        value,
    ];

    // Üst bilgi + boş satır + ürün tablosu tek sayfada (array-of-arrays).
    const rows: Array<Array<string | number | null>> = [
        [t('inv.orders.columns.reference'), order.referenceNumber],
        [t('inv.orders.columns.quoteNumber'), order.quoteNumber || ''],
        [t('inv.orders.columns.orderedBy'), order.orderedByName || ''],
        [t('inv.orders.columns.project'), order.projectName || ''],
        [t('inv.columns.supplier'), order.supplierName],
        [t('inv.orders.supplierAddress'), (order.supplierAddress || '').replace(/\s*\n\s*/g, ', ')],
        [t('common.date'), new Date(order.createdAt).toLocaleString('de-CH')],
        [],
        header,
        ...itemRows,
        [],
        totalRow(t('inv.orders.totalNet'), order.totalNet),
        // Ek ücretler: net toplamın altında adıyla ve tutarıyla tek tek.
        ...fees.map((fee) => totalRow(fee.name, fee.amount)),
        ...(showVat ? [totalRow(t('inv.orders.columns.vat'), order.totalVat ?? 0)] : []),
        // Genel toplam yalnızca net toplamdan farklıysa — ekrandaki tabloyla aynı kural.
        ...(showVat || fees.length > 0
            ? [totalRow(t('inv.orders.grandTotal'), orderGrandTotal(order))]
            : []),
    ];

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    // Genişlikler başlık sırasıyla: ad, kod, miktar, brüt, net, dört yüzde
    // sütunu (indirim 1-3 + KDV), toplam.
    sheet['!cols'] = [
        { wch: 40 },
        { wch: 16 },
        { wch: 10 },
        { wch: 12 },
        { wch: 12 },
        ...Array.from({ length: 4 }, () => ({ wch: 12 })),
        { wch: 14 },
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, order.referenceNumber.slice(0, 31));

    const buffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${order.referenceNumber}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
