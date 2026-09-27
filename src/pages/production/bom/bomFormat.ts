import i18n from '@/i18n';
import { t } from '@/i18n/translate';
import type { BomUnit } from '@/types/productionBom';
import { fmtQuantity } from '@/pages/warehouse/warehouseFormat';
import { localizePurchaseCode, purchaseLangOf } from '@/utils/purchaseCode';

/**
 * ── ZAHLEN UND EINHEITEN DER BOM (27.09.2026) ────────────────────────────────
 * Im Schweizer Satz der ganzen Anwendung (1'234.5), wie das Depo.
 */

export const fmtQty = (value: number | null | undefined): string => fmtQuantity(value ?? 0);

export const unitLabel = (unit: BomUnit | string | null | undefined): string =>
    t(`productionBom.unit.${unit && ['PCS', 'M', 'KG', 'SET', 'PACK'].includes(unit) ? unit : 'PCS'}`);

export { fmtDate as shortDate, fmtPrice, parseInputNumber, numberToInput } from '@/pages/warehouse/warehouseFormat';

/* Die Bestellung speichert die Einheit als Text (productionBomPurchaseWriter:
   Adet · m · kg · Set · Paket) — auf dem Schirm in der Sprache der Oberfläche. */
const ORDER_UNIT_TEXT: Record<string, BomUnit> = { adet: 'PCS', m: 'M', kg: 'KG', set: 'SET', paket: 'PACK' };
export const orderUnitLabel = (text: string | null | undefined): string => {
    const unit = ORDER_UNIT_TEXT[String(text ?? '').trim().toLocaleLowerCase('tr-TR')];
    return unit ? unitLabel(unit) : String(text ?? '');
};

let tempSeed = 0;
/** Schlüssel einer Zeile, die der Server noch nicht kennt. */
export const tempKey = (): string => `tmp-${Date.now().toString(36)}-${(tempSeed += 1)}`;

export const parseQuantityText = (text: string): number => {
    const parsed = Number(String(text).trim().replace(/['\s]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const quantityToText = (value: number): string => String(Math.round(value * 1000) / 1000);

/**
 * Ein Bestell-/Anfragecode in der Sprache der Oberfläche (BE-2026-004 → SP-/PO-,
 * PA-… → FT-/PR-) — für Texte, Titel und Hinweise, wo `<PurchaseCode>` nicht passt.
 */
export const shownPurchaseCode = (value: unknown): string =>
    localizePurchaseCode(value, purchaseLangOf(i18n.resolvedLanguage || i18n.language));
