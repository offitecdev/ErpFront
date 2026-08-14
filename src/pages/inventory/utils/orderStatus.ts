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

/** Mal kabul yapılabilir mi (satırlar stoğa aktarılabilir)? */
export const canReceiveGoods = (status: PurchaseOrderStatus): boolean =>
    status === 'PENDING' || status === 'ORDERED' || status === 'TO_BE_STOCKED';

/**
 * ── MAİL GİTMEDEN MAL KABUL ─────────────────────────────────────────────────
 * Sipariş ONAYLANMIŞ ama tedarikçiye MAİL GÖNDERİLMEMİŞSE (PENDING) mal kabul
 * ENGELLENMEZ, yalnızca UYARILIR (kullanıcı isteği 2026-08-03: "mail atılmadı,
 * yine de mal kabule geçmek istiyor musunuz?"). Mail gerçekten gönderilince
 * durum kendiliğinden ORDERED olur ve uyarı düşer.
 */
export const isMailPending = (order: { status: PurchaseOrderStatus; emailSentAt?: string | null }): boolean =>
    order.status === 'PENDING' && !order.emailSentAt;

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
 * ── ONAYI GERİ AL (kullanıcı isteği 2026-08-03) ─────────────────────────────
 * Onaylanan kayıt KİLİTLENİR; kilitli kayıt güncellenemediği için her onay adımı
 * artık BİR ADIM geri alınabilir — "onayı geri al, güncelle, yeniden onayla".
 *
 *   PENDING | ORDERED → ORDER_DRAFT   "siparişi onayla"nın geri alınması: kayıt
 *                                      yeniden düzenlenebilir hâle gelir.
 *   ORDER_DRAFT       → PRICE_REQUEST  "siparişe dönüştür"ün geri alınması: talep
 *                                      yeniden açılır. FİYATLAR SİLİNMEZ — talep
 *                                      aşamasında yalnızca gizlenirler ve kayıt
 *                                      tekrar dönüştürülünce olduğu gibi dönerler.
 *
 * MAL KABUL BAŞLADIYSA (TO_BE_STOCKED) ya da kayıt tamamlandıysa geri alma
 * YOKTUR: o aşamada stok hareketi yazılmış olabilir, durumu geri almak stoğu
 * geri almaz.
 */
export type RevokeTarget = Extract<PurchaseOrderStatus, 'ORDER_DRAFT' | 'PRICE_REQUEST'>;

export const revokeApprovalTarget = (status: PurchaseOrderStatus): RevokeTarget | null => {
    if (status === 'PENDING' || status === 'ORDERED') return 'ORDER_DRAFT';
    if (status === 'ORDER_DRAFT') return 'PRICE_REQUEST';
    return null;
};

export const canRevokeApproval = (status: PurchaseOrderStatus): boolean =>
    revokeApprovalTarget(status) !== null;

/**
 * DÜZENLENEBİLİR Mİ? Onaydan ÖNCEKİ tüm aşamalar (sipariş taslağı + fiyat
 * talebi akışı). Onaylanmış sipariş kilitlidir; değişiklik mal kabulden yapılır
 * (kullanıcı isteği 2026-08-02).
 */
export const isEditableStage = (status: PurchaseOrderStatus): boolean =>
    status === 'ORDER_DRAFT' || isPriceRequestStage(status);
