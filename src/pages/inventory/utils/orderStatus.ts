import type { PurchaseOrderStatus } from '@/types/inventory';

/* ═══════════════════════════════════════════════════════════════════════════
   İKİ AYRI MODÜL — ARTIK BİR SÜREÇ DEĞİL (Vorgabe Samet, 22.09.2026)

   «Fiyat modülü ile sipariş modülünü ayırman lazım, yani artık bir süreç değil.
    Eğer fiyat modülü siparişe dönüştür derse fiyat talebi yine listede kalması
    lazım ama YENİ sipariş oluşturması lazım. Bu fiyat talebi – sipariş – mal
    kabul sıralaması olmayacak. Mal kabul de siparişin içine dahil olacak …
    mal kabul artık süreç olarak değil ana listede DURUM olarak gösterilecek,
    turuncu MAL KABULDE şeklinde.»

   Bir kayıt ya FİYAT TALEBİDİR ya SİPARİŞTİR ve bunu hiç değiştirmez:

     FİYAT TALEBİ   DRAFT (kaydedildi) · PRICE_REQUEST (gönderildi)
     SİPARİŞ        ORDER_DRAFT (kaydedildi) · ORDERED (gönderildi) ·
                    TO_BE_STOCKED (MAL KABULDE) · COMPLETED (stokta)

   Dönüştürme bir AŞAMA DEĞİŞİMİ DEĞİL, bir KOPYALAMADIR: talep listede kalır,
   sunucu yeni bir sipariş kaydı açar (`convertToOrder`) ve o kayıt açılır.

   PENDING («sipariş onaylandı») artık ÜRETİLMEZ: onay butonları kalktı, bir
   sipariş doğduğu anda siparıştir. Eski kayıtlar için rozeti duruyor ve
   sipariş ailesinden sayılıyor.
   ═════════════════════════════════════════════════════════════════════════ */

/** Kaydın modülü. Durumundan okunur ve ömrü boyunca değişmez. */
export type PurchaseKind = 'PRICE_REQUEST' | 'ORDER';

const REQUEST_SET = new Set<PurchaseOrderStatus>(['DRAFT', 'PRICE_REQUEST']);

export const kindOfStatus = (status: PurchaseOrderStatus): PurchaseKind =>
    (REQUEST_SET.has(status) ? 'PRICE_REQUEST' : 'ORDER');

/** Fiyat talebi mi? Satırlar fiyatsızdır, belge «Preisanfrage» olur. */
export const isPriceRequestStage = (status: PurchaseOrderStatus): boolean =>
    kindOfStatus(status) === 'PRICE_REQUEST';

// Sipariş durum rozetleri — StockMovementsPage'deki KIND_META ile aynı desen.
export const ORDER_STATUS_META: Record<PurchaseOrderStatus, { labelKey: string; className: string }> = {
    // Talep ailesi: teal (kaydedildi) → cyan (gönderildi).
    DRAFT: { labelKey: 'inv.orders.status.draft', className: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
    PRICE_REQUEST: { labelKey: 'inv.orders.status.priceRequest', className: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300' },
    // Sipariş ailesi: zinc (kaydedildi) → indigo (gönderildi).
    ORDER_DRAFT: { labelKey: 'inv.orders.status.orderDraft', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300' },
    // Eski kayıtların «onaylandı»sı — yeni kayıtlarda üretilmez.
    PENDING: { labelKey: 'inv.orders.status.pending', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
    ORDERED: { labelKey: 'inv.orders.status.ordered', className: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
    /* MAL KABULDE = TURUNCU (Vorgabe Samet, 22.09.2026). Ana listede mal kabul
       bir aşama değil, siparişin bu turuncu durumudur. */
    TO_BE_STOCKED: { labelKey: 'inv.orders.status.toBeStocked', className: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300' },
    COMPLETED: { labelKey: 'inv.orders.status.completed', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
};

/** Fiyat talepleri listesinin durum süzgeci. */
export const REQUEST_STATUSES: PurchaseOrderStatus[] = ['DRAFT', 'PRICE_REQUEST'];

/** Siparişler listesinin durum süzgeci — eski PENDING de burada görünür. */
export const ORDER_STATUSES: PurchaseOrderStatus[] = ['ORDER_DRAFT', 'PENDING', 'ORDERED', 'TO_BE_STOCKED', 'COMPLETED'];

export const statusesOfKind = (kind: PurchaseKind): PurchaseOrderStatus[] =>
    (kind === 'PRICE_REQUEST' ? REQUEST_STATUSES : ORDER_STATUSES);

/* ── AŞAĞIDAKİ İKİSİ UYKUDA (22.09.2026) ────────────────────────────────────
   Mal kabul sekmeleri geçici olarak kaldırıldı («mal kabul bölümünü şimdilik
   kaldır»); tafeller `_disabled/inventory-receive/` altında duruyor. Bu iki
   yardımcı, geri geldiğinde yeniden bağlanacakları için SİLİNMEDİ. Bugün
   `TO_BE_STOCKED`'u «Siparişi onayla» düğmesi yazıyor. */

/** MAL KABUL SEKMESİ AÇIK MI? (uyuyor — bkz. yukarıdaki not) */
export const canReceiveGoods = (status: PurchaseOrderStatus): boolean =>
    kindOfStatus(status) === 'ORDER' && status !== 'COMPLETED';

/** Mal kabulü geri almaya değer bir şey var mı? (uyuyor) */
export const canRevertReceipt = (status: PurchaseOrderStatus): boolean =>
    status === 'TO_BE_STOCKED' || status === 'COMPLETED';

/** Satırlar düzenlenebilir mi? Stoğa aktarılmış sipariş kilitlenir. */
export const isEditableStage = (status: PurchaseOrderStatus): boolean =>
    status !== 'COMPLETED';

/**
 * ── MAİL DURUMU ─────────────────────────────────────────────────────────────
 * `emailSentAt` yalnızca SON gönderimi taşır; hangi belge olduğunu DURUM
 * söyler: sunucu talep gerçekten çıkınca DRAFT → PRICE_REQUEST, sipariş
 * çıkınca ORDER_DRAFT/PENDING → ORDERED yazar. Mal kabuldeki bir siparişte
 * artık ayırt edilemez — orada yalnızca «en son gönderildi» denir.
 */
export type StageMailState = 'SENT' | 'NOT_SENT' | 'LAST_KNOWN';

export const stageMailState = (order: {
    status: PurchaseOrderStatus;
    emailSentAt?: string | null;
}): StageMailState => {
    if (kindOfStatus(order.status) === 'PRICE_REQUEST') {
        return order.status === 'PRICE_REQUEST' ? 'SENT' : 'NOT_SENT';
    }
    if (order.status === 'ORDERED') return 'SENT';
    if (order.status === 'TO_BE_STOCKED' || order.status === 'COMPLETED') {
        return order.emailSentAt ? 'LAST_KNOWN' : 'NOT_SENT';
    }
    return 'NOT_SENT';
};
