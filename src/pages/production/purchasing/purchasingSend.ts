import { t } from '@/i18n/translate';
import { isRequestTimeout } from '@/lib/axios';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { productionBomErrorOf, productionBomErrorText } from '@/lib/api/productionBom';
import { getPdfSettings } from '@/store/pdfSettingsStore';
import type { PurchaseOrderRow } from '@/types/inventory';
import { localizePurchaseCode } from '@/utils/purchaseCode';
import { orderForSupplier } from '@/pages/inventory/utils/requestSuppliers';

/* ── Mail an den Lieferanten — dasselbe PDF, derselbe Weg wie der Mailreiter der Bestellung (MailPanel). ── */

const PDF_LANG = 'de' as const;

/** PDF-Bytes → base64 (Mailanhang). `btoa` verträgt kein grosses Feld auf einmal. */
const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
};

const attachment = (filename: string, bytes: Uint8Array) => ({ filename, contentType: 'application/pdf', contentBase64: bytesToBase64(bytes) });

/** Betreff und Text wie im Mailreiter — ein Nachtrag trägt «aktualisiert». */
export const orderMailDefaults = (order: PurchaseOrderRow): { subject: string; message: string } => {
    const number = localizePurchaseCode(order.referenceNumber, PDF_LANG);
    const subject = t('inv.orders.mail.subject', { number });
    return {
        subject: order.revision > 0 && order.emailSentAt ? `${subject} (${t('inv.orders.updatedTag')})` : subject,
        message: t('inv.orders.mail.defaultMessage'),
    };
};

/**
 * Die Bestellung mit ihrem PDF — nach einer BOM-Revision zusätzlich mit dem
 * Änderungsblatt. `preview` = ohne SMTP-Einstellung, nichts ging hinaus.
 */
export const mailOrder = async (
    order: PurchaseOrderRow,
    input: { to: string; subject: string; message: string },
): Promise<{ preview: boolean }> => {
    const settings = getPdfSettings();
    const pdf = await import('@/utils/pdf/orderPdf');
    const code = localizePurchaseCode(order.referenceNumber, PDF_LANG);
    const revision = order.bomOrigin?.revision?.number ?? 0;
    const attachments = [attachment(`${code}.pdf`, await pdf.buildOrderPdfBytes(order, settings, PDF_LANG))];
    if (revision > 0) attachments.push(attachment(`${code}_Rev${revision}.pdf`, await pdf.buildOrderRevisionPdfBytes(order, settings, PDF_LANG)));
    const result = await purchaseOrdersApi.sendMail(order.id, {
        to: input.to.trim() || undefined,
        subject: input.subject.trim(),
        message: input.message,
        attachments,
    });
    return { preview: Boolean(result.preview) };
};

/** Eine Preisanfrage an IHREN Lieferanten, mit ihrem PDF (Name, Modell, Menge). */
export const mailPriceRequest = async (purchaseOrderId: string, input?: { message?: string }): Promise<{ preview: boolean }> => {
    const order = await purchaseOrdersApi.get(purchaseOrderId);
    const target = orderForSupplier(order, order.requestSuppliers?.[0]);
    const code = localizePurchaseCode(order.referenceNumber, PDF_LANG);
    const bytes = await (await import('@/utils/pdf/priceRequestPdf')).buildPriceRequestPdfBytes(target, getPdfSettings(), PDF_LANG);
    const result = await purchaseOrdersApi.sendMail(order.id, {
        subject: t('inv.orders.mail.subjectPriceRequest', { number: code }),
        message: input?.message ?? t('inv.orders.mail.defaultMessagePriceRequest'),
        ...(order.requestSuppliers?.length ? { supplierIndex: 0 } : {}),
        attachments: [attachment(`${code}.pdf`, bytes)],
    });
    return { preview: Boolean(result.preview) };
};

/** Die Meldung zu einem Fehler — Kennungen der BOM übersetzt, sonst der Text des Bestellwegs. */
export const failureText = (failure: unknown): string => {
    if (isRequestTimeout(failure)) return t('common.mailTimeout');
    if (productionBomErrorOf(failure).code) return productionBomErrorText(failure);
    const message = (failure as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message.trim() ? message : productionBomErrorText(failure);
};

/** Eine Zahl, wie der Mensch sie tippt: «1’234,50», «1234.5» → 1234.5; leer/ungültig → null. */
export const parseAmount = (text: string): number | null => {
    const raw = String(text ?? '').trim().replace(/['’\s]/g, '');
    if (!raw) return null;
    if (!/^[+]?(?:\d[\d.,]*|[.,]\d+)$/.test(raw)) return null;
    const comma = raw.lastIndexOf(',');
    const dot = raw.lastIndexOf('.');
    // Mixed formats: 1.234,50 and 1,234.50. The final separator is decimal.
    const normalized = comma >= 0 && dot >= 0
        ? (comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, ''))
        : comma >= 0 ? raw.replace(',', '.') : raw;
    const value = Number(normalized);
    return Number.isFinite(value) && value >= 0 ? value : null;
};
