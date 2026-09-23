import dayjs from 'dayjs';

import { t } from '@/i18n/translate';
import { useAuthStore } from '@/store/authStore';
import { parsePaymentStages } from '@/lib/paymentSchedule';
import type { InvoiceDto, InvoiceKind, InvoiceSortKey, InvoiceStateKey } from '@/types/billing';
import type { InvoiceOrderContext } from '@/utils/pdf/invoicePdf';
import { invoiceRecipient } from '@/pages/sales/invoices/invoiceShared';

/**
 * ── BUCHHALTUNG: GEMEINSAME REGELN DER RECHNUNGSSEITEN (16.09.2026, Schritt 5)
 *
 * Liste, Erstellen und Detail lesen den Stand einer Rechnung auf EINE Weise:
 *
 *   Entwurf     angelegt, noch ohne Nummer
 *   Offen       ausgestellt, nicht bezahlt
 *   Überfällig  offen UND die Fälligkeit liegt vor heute (kein eigener
 *               Status in der Datenbank — er ergibt sich aus dem Datum)
 *   Bezahlt     Zahlung erfasst
 *   Storniert   zurückgenommen, bleibt als Beleg stehen
 */

/** Derselbe Satz Stände wie im Server (types/billing.ts) — EINE Quelle. */
export type InvoiceState = InvoiceStateKey;

/** Die Reiter der Liste — «Alle» zuerst, dann der Lauf einer Rechnung, am Ende die Gegenbelege. */
export const STATE_TABS: Array<'ALL' | InvoiceState> = ['ALL', 'DRAFT', 'OPEN', 'OVERDUE', 'PAID', 'CANCELLED', 'CREDIT'];

/**
 * Wonach die Liste sortiert (22.09.2026). «Letzter Vorgang» ist die Vorgabe:
 * was zuletzt ausgestellt, bezahlt, geändert oder storniert wurde, steht
 * zuoberst — die Fälligkeit bleibt für das Nachfassen, der Betrag fürs Grosse.
 */
export const SORT_ORDER: InvoiceSortKey[] = ['activity', 'invoiceDate', 'dueDate', 'amount', 'number'];

export const sortLabel = (sort: InvoiceSortKey): string => t(`accounting.sort.${sort}`);

/** Storno-Rechnung oder Gutschrift (Schritt 6). */
export const isCreditDocument = (invoice: Pick<InvoiceDto, 'kind'>): boolean =>
    invoice.kind === 'STORNO' || invoice.kind === 'GUTSCHRIFT';

const today = () => dayjs().format('YYYY-MM-DD');

export const isOverdue = (invoice: Pick<InvoiceDto, 'status' | 'dueDate' | 'kind'>): boolean =>
    invoice.status === 'ISSUED' && !isCreditDocument(invoice)
    && Boolean(invoice.dueDate) && String(invoice.dueDate).slice(0, 10) < today();

export const invoiceState = (invoice: Pick<InvoiceDto, 'status' | 'dueDate' | 'kind'>): InvoiceState => {
    if (isCreditDocument(invoice)) return 'CREDIT';
    if (invoice.status === 'DRAFT') return 'DRAFT';
    if (invoice.status === 'PAID') return 'PAID';
    if (invoice.status === 'CANCELLED') return 'CANCELLED';
    return isOverdue(invoice) ? 'OVERDUE' : 'OPEN';
};

/** Passt die Rechnung in den gewählten Reiter? «Offen» schliesst «überfällig» ein. */
export const matchesTab = (invoice: InvoiceDto, tab: 'ALL' | InvoiceState): boolean => {
    if (tab === 'ALL') return true;
    const state = invoiceState(invoice);
    if (tab === 'OPEN') return state === 'OPEN' || state === 'OVERDUE';
    return state === tab;
};

export const stateLabel = (state: 'ALL' | InvoiceState): string => t(`accounting.state.${state}`);

/** Die Marke EINER Rechnung — bei Gegenbelegen genauer als «Gegenbeleg». */
export const invoiceStateLabel = (invoice: Pick<InvoiceDto, 'status' | 'dueDate' | 'kind' | 'paidAmount'>): string => {
    if (invoice.kind === 'STORNO') return t('accounting.creditState.STORNO');
    if (invoice.kind === 'GUTSCHRIFT') {
        return invoice.status === 'PAID' ? t('accounting.creditState.REFUNDED') : t('accounting.creditState.REFUND_OPEN');
    }
    const state = invoiceState(invoice);
    // Teilzahlung (Schritt 7): offen, aber schon etwas eingegangen.
    if ((state === 'OPEN' || state === 'OVERDUE') && (invoice.paidAmount ?? 0) > 0.005) {
        return state === 'OVERDUE' ? t('accounting.state.PARTIAL_OVERDUE') : t('accounting.state.PARTIAL');
    }
    return stateLabel(state);
};

/** Die Nummer — ein Entwurf hat noch keine. */
export const displayNumber = (invoice: Pick<InvoiceDto, 'invoiceNumber' | 'status'>): string =>
    invoice.status === 'DRAFT' || !invoice.invoiceNumber ? t('accounting.draftNumber') : invoice.invoiceNumber;

export const kindLabel = (kind?: InvoiceKind | null): string => t(`billing.kind_${kind || 'RECHNUNG'}`);

/** Woher die Rechnung kommt: Auftrag (und Projekt) oder frei erfasst. */
export const invoiceSource = (invoice: InvoiceDto): { primary: string; secondary: string | null } => {
    if (invoice.reversesInvoice) {
        return {
            primary: t('accounting.reversesShort', { number: invoice.reversesInvoice.invoiceNumber }),
            secondary: invoice.salesOrder?.orderNumber ?? null,
        };
    }
    if (invoice.salesOrder) {
        const project = invoice.project
            ? [invoice.project.projectNumber, invoice.project.projectName].filter(Boolean).join(' · ')
            : null;
        return { primary: invoice.salesOrder.orderNumber, secondary: project };
    }
    if (invoice.project) {
        return { primary: invoice.project.projectNumber || invoice.project.projectName, secondary: invoice.project.projectName };
    }
    return { primary: t('accounting.freeInvoice'), secondary: null };
};

/**
 * Bauplan des PDF — dieselbe Regel wie bisher: eine Auftragsrechnung zieht
 * Positionen und Adresse aus der Offerte hinter dem Auftrag, die
 * Direktrechnung trägt alles selbst.
 */
export const pdfContextOf = (invoice: InvoiceDto): InvoiceOrderContext => ({
    orderNumber: invoice.salesOrder?.orderNumber || '—',
    tenderId: invoice.salesOrder?.tenderId ?? null,
    customerName: invoiceRecipient(invoice) || null,
    salespersonName: invoice.salespersonName ?? null,
    commissionNumber: invoice.commissionNumber ?? null,
    paymentStages: parsePaymentStages(invoice.salesOrder?.paymentStages ?? invoice.paymentStages ?? null),
});

/** Ein Entwurf druckt «ENTWURF» an der Stelle der Nummer. */
export const pdfInvoiceOf = (invoice: InvoiceDto): InvoiceDto =>
    (invoice.status === 'DRAFT' ? { ...invoice, invoiceNumber: t('accounting.draftNumber').toUpperCase() } : invoice);

/** Kalendertag (`YYYY-MM-DD`) eines Datumsfeldes. */
export const dayOf = (value?: string | null): string => (value ? String(value).slice(0, 10) : '');

/**
 * Die Art folgt aus dem Prozentsatz (G17) — dieselbe Regel wie im Server:
 * deckt der Anteil den offenen Rest, schliesst die Rechnung ab.
 */
export const proposedKind = (billedPercent: number, percent: number, remainingPercent: number): InvoiceKind => {
    const closes = Math.abs(percent - remainingPercent) <= 0.005 || percent > remainingPercent;
    if (closes) return billedPercent > 0.005 ? 'SCHLUSS' : 'RECHNUNG';
    return billedPercent > 0.005 ? 'ZWISCHEN' : 'AKONTO';
};

/**
 * Was diese Person in der Buchhaltung darf — der Server prüft dasselbe.
 *   anlegen/ausstellen  billing.create
 *   Zahlung, Daten      billing.manage
 *   stornieren          invoices.cancel
 */
export const useBillingRights = () => {
    const permissions = useAuthStore((state) => state.permissions);
    const isSystemAdmin = useAuthStore((state) => Boolean(state.isSystemAdmin));
    const has = (name: string) => isSystemAdmin || permissions.includes(name);
    return {
        canCreate: has('billing.create'),
        canManage: has('billing.manage'),
        canCancel: has('invoices.cancel'),
    };
};
