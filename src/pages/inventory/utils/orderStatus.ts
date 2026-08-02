import type { PurchaseOrderStatus } from '@/types/inventory';

// Sipariş durum rozetleri — StockMovementsPage'deki KIND_META ile aynı desen
// (modül içi yumuşak tonlu pill'ler, koyu tema sınıflarıyla birlikte).
//
// YAŞAM DÖNGÜSÜ (2026-08-01):
//   DRAFT → PRICE_REQUEST → AWAITING_CONFIRMATION → PENDING → TO_BE_STOCKED → COMPLETED
//   UPDATED: mail gönderildikten sonra içerik değişti (yan durum).
export const ORDER_STATUS_META: Record<PurchaseOrderStatus, { labelKey: string; className: string }> = {
    DRAFT: { labelKey: 'inv.orders.status.draft', className: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300' },
    ORDER_DRAFT: { labelKey: 'inv.orders.status.orderDraft', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300' },
    PRICE_REQUEST: { labelKey: 'inv.orders.status.priceRequest', className: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300' },
    AWAITING_CONFIRMATION: { labelKey: 'inv.orders.status.awaitingConfirmation', className: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
    PENDING: { labelKey: 'inv.orders.status.pending', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
    TO_BE_STOCKED: { labelKey: 'inv.orders.status.toBeStocked', className: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
    UPDATED: { labelKey: 'inv.orders.status.updated', className: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
    COMPLETED: { labelKey: 'inv.orders.status.completed', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
};

export const FILTERABLE_ORDER_STATUSES: PurchaseOrderStatus[] = [
    'ORDER_DRAFT',
    'DRAFT',
    'PRICE_REQUEST',
    'AWAITING_CONFIRMATION',
    'PENDING',
    'TO_BE_STOCKED',
    'UPDATED',
    'COMPLETED',
];

/**
 * Fiyat talebi aşaması: satırlar FİYATSIZDIR, PDF/mail "Preisanfrage" olur.
 * SİPARİŞ TASLAĞI (ORDER_DRAFT) buna DAHİL DEĞİLDİR — o fiyatlı bir siparişin
 * henüz onaylanmamış hâlidir ve normal sipariş belgesini kullanır.
 */
export const isPriceRequestStage = (status: PurchaseOrderStatus): boolean =>
    status === 'DRAFT' || status === 'PRICE_REQUEST' || status === 'AWAITING_CONFIRMATION';

/** Mal kabul yapılabilir mi (satırlar stoğa aktarılabilir)? */
export const canReceiveGoods = (status: PurchaseOrderStatus): boolean =>
    status === 'PENDING' || status === 'UPDATED' || status === 'TO_BE_STOCKED';

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
