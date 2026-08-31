import dayjs from 'dayjs';

import { t } from '@/i18n/translate';
import type { InvoiceCategory, InvoiceDto, InvoiceStatus } from '@/types/billing';
import type { Variant } from '@/components/ui-shared/StatusBadge';

/**
 * ── RECHNUNGSSEITEN: gemeinsame Rechnung und Beschriftung ────────────────────
 *
 * Liste (`/sales/invoices`), „Rechnung aus Auftrag" und „Direktrechnung" teilen
 * sich Zahlenformat, Typbeschriftung und die beiden Feldklassen. Die BAUTEILE
 * (Seitenkopf, Feldrahmen) stehen daneben in `components/InvoiceFormBits.tsx` —
 * eine Datei, die Komponenten UND Hilfsfunktionen ausliefert, verliert das
 * schnelle Nachladen im Entwicklungsserver.
 *
 * Kleid: das der ÜBRIGEN LISTEN der Anwendung (Kundenliste, Auftragsliste,
 * Lager) — `InventoryListHeader` als Kopf, `SectionCard` als Rahmen und die
 * gemeinsame Tabelle `data-inv-table data-list-table`. Vorgabe Samet: „die
 * Tabellen müssen sauber sein — so wie in der Kundenliste."
 */

export const fmtMoney = (value?: number | null): string =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 })
        .format(Number(value) || 0);

export const fmtDate = (value?: string | null): string => (value ? dayjs(value).format('DD.MM.YYYY') : '—');

export const isoToday = (): string => dayjs().format('YYYY-MM-DD');

export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const apiError = (error: unknown, fallback: string): string =>
    (error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error
    || (error instanceof Error && error.message)
    || fallback;

/**
 * Reihenfolge der Rechnungstypen in der Liste (Vorgabe: sortiert nach
 * Rechnungstyp, innerhalb des Typs die neueste zuoberst).
 */
export const CATEGORY_ORDER: InvoiceCategory[] = ['PROJECT', 'DELIVERY', 'DIRECT'];

export const categoryRank = (category: InvoiceCategory): number => {
    const index = CATEGORY_ORDER.indexOf(category);
    return index < 0 ? CATEGORY_ORDER.length : index;
};

export const categoryLabel = (category: InvoiceCategory): string => t(`invoices.category_${category}`);

/** Marke des Rechnungstyps — dieselbe Chip-Familie wie in der Auftragsliste. */
export const categoryVariant = (category: InvoiceCategory): Variant =>
    category === 'PROJECT' ? 'approved' : category === 'DELIVERY' ? 'neutral' : 'info';

/**
 * Der Typ kommt vom Server (abgeleitet, nicht gespeichert). Antworten ohne ihn
 * — etwa die Rechnung, die eine Erfassungsseite gerade zurückbekommen hat —
 * werden hier nach derselben Regel eingeordnet.
 */
export const invoiceCategory = (invoice: InvoiceDto): InvoiceCategory => {
    if (invoice.category) return invoice.category;
    if (invoice.projectId) return 'PROJECT';
    if (invoice.salesOrderId) return String(invoice.orderType || '').startsWith('PROJECT') ? 'PROJECT' : 'DELIVERY';
    return 'DIRECT';
};

/** Empfängername: Bestandskunde, sonst der frei erfasste Empfänger. */
export const invoiceRecipient = (invoice: InvoiceDto): string =>
    invoice.customer?.companyName || invoice.recipientName || '';

export const statusLabel = (status: InvoiceStatus): string => t(`invoices.status_${status}`);

export const statusVariant = (status: InvoiceStatus): Variant =>
    status === 'PAID' ? 'active' : status === 'CANCELLED' ? 'passive' : 'warning';

/** Preis einer Katalogzeile: Verkaufspreis, sonst der Einstandswert. */
export const articlePrice = (article: { salePrice?: number; baseCost?: number }): number =>
    Number(article.salePrice || 0) || Number(article.baseCost || 0) || 0;

/**
 * Feld der Erfassungsseiten — EINE Klasse statt einer Kette von Hilfsklassen:
 * Höhe (40px, Vorgabe „grössere Eingabefelder"), Radius und Fokusring stehen
 * in der `.ofi-invp-*`-Lage, damit ein Feld und der Knopf daneben zwingend
 * dieselbe Kante zeigen. Für das Absatzfeld dieselbe Klasse — die Regel für
 * `textarea` lässt es wachsen.
 */
export const FIELD_INPUT_CLASS = 'ofi-invp-input';
export const FIELD_TEXTAREA_CLASS = 'ofi-invp-input';
/** Zahlenfeld: rechtsbündig mit Tabellenziffern. */
export const FIELD_NUM_CLASS = 'ofi-invp-input is-num';
