import type { PurchaseOrderStatus } from '@/types/inventory';

// Sipariş durum rozetleri — StockMovementsPage'deki KIND_META ile aynı desen
// (modül içi yumuşak tonlu pill'ler, koyu tema sınıflarıyla birlikte).
//
// YAŞAM DÖNGÜSÜ (2026-08-01; 2026-08-03: ORDERED eklendi, UPDATED ve
// AWAITING_CONFIRMATION kaldırıldı):
//   DRAFT → PRICE_REQUEST → PENDING → ORDERED → TO_BE_STOCKED → COMPLETED
//   DRAFT = TALEP TASLAĞI (henüz gönderilmedi), PRICE_REQUEST = GÖNDERİLMİŞ talep;
//   "onay bekleniyor" ayrı durumu kaldırıldı (kullanıcı isteği: sipariş taslağıyla
//   aynı şeyi anlatıyordu).
//   PENDING = SİPARİŞ ONAYLANDI (mail henüz gitmedi), ORDERED = SİPARİŞ VERİLDİ
//   (sipariş maili gerçekten gönderildi — geçişi backend mail gönderiminde yazar).
//   "Güncellendi" AYRI BİR DURUM DEĞİLDİR: mail sonrası içerik değişikliği yalnızca
//   `revision`ı artırır ve başlıkta rozet olarak görünür.
export const ORDER_STATUS_META: Record<PurchaseOrderStatus, { labelKey: string; className: string }> = {
    // TALEP TASLAĞI: gri değil TEAL — "daha belirgin olsun" (kullanıcı isteği
    // 2026-08-03) ve sipariş taslağının (zinc) yanında ayırt edilebilsin. Talep
    // ailesi: teal (taslak) → cyan (gönderilmiş talep).
    DRAFT: { labelKey: 'inv.orders.status.draft', className: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
    ORDER_DRAFT: { labelKey: 'inv.orders.status.orderDraft', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300' },
    PRICE_REQUEST: { labelKey: 'inv.orders.status.priceRequest', className: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300' },
    PENDING: { labelKey: 'inv.orders.status.pending', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
    ORDERED: { labelKey: 'inv.orders.status.ordered', className: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
    TO_BE_STOCKED: { labelKey: 'inv.orders.status.toBeStocked', className: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
    COMPLETED: { labelKey: 'inv.orders.status.completed', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
};

export const FILTERABLE_ORDER_STATUSES: PurchaseOrderStatus[] = [
    'ORDER_DRAFT',
    'DRAFT',
    'PRICE_REQUEST',
    'PENDING',
    'ORDERED',
    'TO_BE_STOCKED',
    'COMPLETED',
];

/**
 * Fiyat talebi aşaması: satırlar FİYATSIZDIR, PDF/mail "Preisanfrage" olur.
 * SİPARİŞ TASLAĞI (ORDER_DRAFT) buna DAHİL DEĞİLDİR — o fiyatlı bir siparişin
 * henüz onaylanmamış hâlidir ve normal sipariş belgesini kullanır.
 */
export const isPriceRequestStage = (status: PurchaseOrderStatus): boolean =>
    status === 'DRAFT' || status === 'PRICE_REQUEST';

/**
 * Mal kabul yapılabilir mi (satırlar stoğa aktarılabilir)?
 *
 * YALNIZCA MAL KABUL AŞAMASINDA (08.09.2026, Vorgabe Samet: «eine Stufe muss
 * fertig sein, bevor die nächste beginnt»). Onaylanmış sipariş (PENDING) ya da
 * verilmiş sipariş (ORDERED) HENÜZ mal kabul aşamasında DEĞİLDİR: oraya geçiş
 * sipariş sayfasındaki «Zum Wareneingang» ile yapılır ve durumu TO_BE_STOCKED'a
 * yazar. Adresi elle yazıp aşamayı atlamak, akışın tek yerde başlamasını
 * bozardı — sayfa o durumda yalnızca nereden başlanacağını söyler.
 * COMPLETED de dışarıdadır: aktarım bitmiştir.
 */
export const canReceiveGoods = (status: PurchaseOrderStatus): boolean =>
    status === 'TO_BE_STOCKED';

/**
 * ── FİYAT TALEBİ → SİPARİŞ: İKİ AYRI ADIM (kullanıcı isteği 2026-08-02) ──────
 *
 * FİYAT TALEBİ AŞAMASINDA ONAY YOKTUR: talep fiyatsızdır, orada ne fiyat ne KDV
 * girilebilir — dolayısıyla oradan doğrudan resmî siparişe geçmek, fiyatı ASLA
 * girilemeyen (çünkü onaylanan sipariş kilitlenir) bir sipariş üretiyordu.
 *
 *   1. `canConvertToOrder` → "Siparişe dönüştür": talep KAPANIR ve kayıt SİPARİŞ
 *      TASLAĞINA (ORDER_DRAFT) döner. Fiyat, KDV ve ek ücretler ANCAK BUNDAN
 *      SONRA açılır.
 *   2. `canConfirmToOrder` → "Siparişi oluştur/onayla": yalnızca FİYATLI taslakta
 *      (ORDER_DRAFT) sunulur ve siparişi resmîleştirip kilitler (PENDING).
 */
export const canConvertToOrder = (status: PurchaseOrderStatus): boolean =>
    isPriceRequestStage(status);

/** Resmî siparişe YALNIZCA fiyatlı taslaktan geçilir (fiyat talebinden DEĞİL). */
export const canConfirmToOrder = (status: PurchaseOrderStatus): boolean =>
    status === 'ORDER_DRAFT';

/**
 * DÜZENLENEBİLİR Mİ? Onaydan ÖNCEKİ tüm aşamalar (sipariş taslağı + fiyat
 * talebi akışı). Onaylanmış sipariş kilitlidir; değişiklik mal kabulden yapılır
 * (kullanıcı isteği 2026-08-02).
 */
export const isEditableStage = (status: PurchaseOrderStatus): boolean =>
    status === 'ORDER_DRAFT' || isPriceRequestStage(status);

/* ═══════════════════════════════════════════════════════════════════════════
   DER ABLAUF IN DREI STUFEN (Vorgabe Samet, 08.09.2026)

   «Statt Popups eine Seite. Der Vorgang läuft der Reihe nach: eine Stufe muss
   fertig sein, bevor die nächste beginnt. Wird die Bestellung gelöscht, geht
   er eine Stufe zurück; wird der Wareneingang gelöscht, ebenfalls.»

   Die sieben Status sind die FEINE Auskunft (Entwurf, gesendet, bestätigt …),
   die drei Stufen sind die GROBE — und nur sie stehen im Schrittband:

     1 PREISANFRAGE   DRAFT (noch nicht gesendet) · PRICE_REQUEST (gesendet)
     2 BESTELLUNG     ORDER_DRAFT (Preise erfassen) · PENDING (bestätigt) ·
                      ORDERED (an den Lieferanten gesendet)
     3 WARENEINGANG   TO_BE_STOCKED (läuft) · COMPLETED (eingelagert)

   Eine Bestellung, die ohne Anfrage begonnen hat, startet auf Stufe 2; Stufe 1
   gilt dann als erledigt. Das ist gewollt: «Bestellung löschen» wirft sie auf
   die Anfrage zurück, und dort kann sie ohne Preise weiterlaufen.
   ═════════════════════════════════════════════════════════════════════════ */
export type OrderStage = 'REQUEST' | 'ORDER' | 'RECEIPT';

export const ORDER_STAGES: OrderStage[] = ['REQUEST', 'ORDER', 'RECEIPT'];

export const ORDER_STAGE_META: Record<OrderStage, { labelKey: string; hintKey: string }> = {
    REQUEST: { labelKey: 'inv.orders.flow.request', hintKey: 'inv.orders.flow.requestHint' },
    ORDER: { labelKey: 'inv.orders.flow.order', hintKey: 'inv.orders.flow.orderHint' },
    RECEIPT: { labelKey: 'inv.orders.flow.receipt', hintKey: 'inv.orders.flow.receiptHint' },
};

export const stageOfStatus = (status: PurchaseOrderStatus): OrderStage => {
    if (status === 'DRAFT' || status === 'PRICE_REQUEST') return 'REQUEST';
    if (status === 'ORDER_DRAFT' || status === 'PENDING' || status === 'ORDERED') return 'ORDER';
    return 'RECEIPT';
};

export const stageIndexOf = (status: PurchaseOrderStatus): number =>
    ORDER_STAGES.indexOf(stageOfStatus(status));

/**
 * ── DIE MAIL JE STUFE ───────────────────────────────────────────────────────
 * `emailSentAt` trägt nur die LETZTE Sendung — welches Dokument sie war, sagt
 * der STATUS: der Server schaltet DRAFT → PRICE_REQUEST, sobald die Anfrage
 * wirklich draussen ist, und PENDING → ORDERED, sobald die Bestellung draussen
 * ist (siehe `send-mail`). Darum ist der Status hier die verlässliche Auskunft
 * und nicht der Zeitstempel.
 *
 * Auf der Wareneingangsstufe lässt sich nicht mehr unterscheiden, welches der
 * beiden Dokumente zuletzt ging — dort meldet die Seite darum nur «zuletzt
 * gesendet am …» und behauptet nichts über das Dokument.
 */
export type StageMailState = 'SENT' | 'NOT_SENT' | 'LAST_KNOWN';

export const stageMailState = (order: {
    status: PurchaseOrderStatus;
    emailSentAt?: string | null;
}): StageMailState => {
    const stage = stageOfStatus(order.status);
    if (stage === 'REQUEST') return order.status === 'PRICE_REQUEST' ? 'SENT' : 'NOT_SENT';
    if (stage === 'ORDER') return order.status === 'ORDERED' ? 'SENT' : 'NOT_SENT';
    return order.emailSentAt ? 'LAST_KNOWN' : 'NOT_SENT';
};

/**
 * WARENEINGANG LÖSCHEN — nur auf der dritten Stufe, und nur solange es etwas
 * zurückzunehmen gibt. Der Server nimmt dabei die Lagerbuchungen zurück, nicht
 * bloss den Status.
 */
export const canRevertReceipt = (status: PurchaseOrderStatus): boolean =>
    status === 'TO_BE_STOCKED' || status === 'COMPLETED';
