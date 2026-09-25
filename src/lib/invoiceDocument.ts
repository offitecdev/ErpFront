export type InvoiceDocumentLanguage = 'de' | 'en' | 'tr';

export interface InvoiceDocumentOptions {
    language: InvoiceDocumentLanguage;
    showQr: boolean;
    showFooter: boolean;
    vatEnabled: boolean;
    recipientFields?: { street: string; supplement: string; postalCode: string; city: string; country: string };
}

export const INVOICE_INTRO: Record<InvoiceDocumentLanguage, string> = {
    de: 'Für die ausgeführten Arbeiten erlauben wir uns zu berechnen:',
    en: 'We are invoicing you for the work carried out:',
    tr: 'Gerçekleştirilen çalışmalar için aşağıdaki tutarları faturalandırıyoruz:',
};

export const invoiceLanguage = (value?: string): InvoiceDocumentLanguage =>
    value?.startsWith('en') ? 'en' : value?.startsWith('tr') ? 'tr' : 'de';

export function readInvoiceDocument(invoice: { sections?: string | null; vatRate?: number | null }): InvoiceDocumentOptions {
    let value: Partial<InvoiceDocumentOptions> = {};
    try { value = JSON.parse(invoice.sections || '{}').document || {}; } catch { /* Legacy invoice. */ }
    return {
        language: invoiceLanguage(value.language),
        showQr: value.showQr !== false,
        showFooter: value.showFooter !== false,
        vatEnabled: value.vatEnabled ?? Number(invoice.vatRate ?? 8.1) > 0,
        recipientFields: value.recipientFields,
    };
}

export const invoicePdfFilename = (number: string): string =>
    `${(number.trim() || 'Invoice').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')}.pdf`;

export function downloadInvoiceBlob(blob: Blob, number: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = invoicePdfFilename(number);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
