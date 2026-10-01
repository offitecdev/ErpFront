import type { OrderPdfLang } from '@/utils/pdf/orderPdf';

export const DOC_LANGS: OrderPdfLang[] = ['de', 'tr', 'en'];

/* BELGE DİLİ (01.10.2026, Samet: «İngilizce seçtiysem İngilizce PDF gitmek
   zorundadır»): PDF ve Mail reiterleri AYNI dili kullanır — sayfada durur ve
   kayıt başına tarayıcıda hatırlanır. */
const storageKey = (orderId: string) => `ofi:purchaseDocLang:${orderId}`;

export const readDocLang = (orderId: string | null | undefined): OrderPdfLang => {
    if (!orderId) return 'de';
    try {
        const raw = localStorage.getItem(storageKey(orderId));
        return DOC_LANGS.includes(raw as OrderPdfLang) ? (raw as OrderPdfLang) : 'de';
    } catch { return 'de'; }
};

export const writeDocLang = (orderId: string, lang: OrderPdfLang): void => {
    try { localStorage.setItem(storageKey(orderId), lang); } catch { /* privates Fenster */ }
};
