/**
 * ── MODERN TEKLİF PDF ŞABLONU ────────────────────────────────────────────────
 * `tenderPdf.ts`'in (klasik, sablon.pdf antetli sürüm) yerine geçen modern
 * şablon. Klasik dosya olduğu gibi korunur; geri dönmek için modallardaki
 * import satırlarını değiştirmek yeterlidir.
 *
 * Klasikten farkları:
 *  - Antet (logo + iletişim satırı) ve alt bilgi (BIC / MwSt / IBAN bandı)
 *    kod ile çizilir — sablon.pdf arka plan birleştirmesi YOKTUR.
 *  - Ferah tablo: dikey ızgara çizgisi yok, ince ayraç çizgileri ve çok hafif
 *    zemin tonlaması var; blok renkler yerine yumuşak dolgular kullanılır.
 *  - Uzun satırlar sayfa sonunda BÖLÜNEREK akmaya devam eder (satır bir üst
 *    sayfaya itilmez) ve içerik hiçbir zaman alt bilgi bölgesine taşmaz.
 */
import { jsPDF } from 'jspdf';
import { companySenderLine, drawAddressBlockLines, drawFittedSingleLine } from './addressBlock';
import QRCode from 'qrcode';
import { buildQrBillPayload, formatIban, formatReference } from './swissQrBill';
import type { PdfCompanySettings } from '../../store/pdfSettingsStore';
import { looksLikeRichHtml, richHtmlToPlainText } from '../../pages/sales/detail/utils/markdown.utils';
import { BULLET_INDENT, drawRichText, fontStyleOf, parseRichTextParagraphs, wrapRichParagraph } from './richTextPdf';
import type { RichVisualLine } from './richTextPdf';

// Arial yerine metrik olarak özdeş, Türkçe karakter destekli Arimo gömülür.
import arialBoldUrl from '../../assets/fonts/ARIALBD.ttf?url';
import arialRegularUrl from '../../assets/fonts/ARIAL.ttf?url';
import arialItalicUrl from '../../assets/fonts/ARIALI.ttf?url';
import offitecLogoUrl from '../../assets/images/offitec.png?url';
import headerWaveUrl from '../../assets/images/header-wave.svg?url';

export interface TenderPdfData {
    tenderNumber: string;
    version: number;
    createdAt: string;
    validUntil?: string | null;
    customerName: string;
    customerAddress?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    customerTaxNumber?: string | null;
    createdByName?: string | null;
    /** Kommission / Komisyon referansı (varsa kapak bilgi kartında gösterilir) */
    commission?: string | null;
    /** Kundenreferenz — müşterinin verdiği referans (kapak bilgi kartında "Referenz"). */
    customerReference?: string | null;
    activities?: Array<{ activityType: string; description?: string | null; activityDate: string; employeeName?: string | null }>;
    positions: Array<{
        rowKey?: string;
        sourceArticleId?: string | null;
        shortDescription: string;
        longDescription?: string | null;
        rowType?: string;
        quantity?: number;
        unit?: string | null;
        npkCode?: string | null;
        imageUrl?: string | null;
        unitPrice?: number;
        /** Satırın birleşik iskonto yüzdesi (İndirim sütununda gösterilir). */
        discount?: number;
        /**
         * Satırın yığılmış iskontoları. Doluysa İndirim sütununda her iskonto
         * AYRI SATIR olarak yazılır ve birleşik yüzde (`discount`) gizlenir.
         */
        discounts?: TenderPdfDiscount[];
        taxRate?: number;
        lineTotal?: number;
        total?: number;
        isParent?: boolean;
        isTopLevel?: boolean;
        hierarchyLevel?: number;
        isSectionSubtotal?: boolean;
        isGroupEnd?: boolean;
        articles?: Array<{ name: string; imageUrl?: string | null; qty: number; price: number }>;
    }>;
    grandTotal: number;
    /** Belge düzeyi (toplu) indirim özeti — ekrandaki fiyat özetiyle birebir. */
    totals?: TenderPdfTotals | null;
    /**
     * Ödeme planı taksitleri (`Tender.paymentStages` / `SalesOrder.paymentStages`).
     * Doluysa belgenin EN SONUNA "Zahlungsplan" tablosu eklenir; tutarlar burada
     * DEĞİL, basılan genel toplamdan türetilir — plan ile toplam asla ayrışmaz.
     * Vade tarihleri yalnızca siparişte vardır; teklif tarafında `date` null olur
     * ve tablo o sütunu hiç çizmez.
     */
    paymentStages?: Array<{ percent: number; date?: string | null }> | null;
    /**
     * "Zahlungsbedingungen" kartını basar. Ödeme koşulu bir ödeme talimatıdır ve
     * ancak FATURA aşamasında anlamlıdır; teklif belgesi bunu göstermez
     * (kullanıcı isteği 16.08.2026). Teklifin ödeme cevabı Zahlungsplan'dır.
     */
    showPaymentTerms?: boolean;
    referenceNumber?: string;
    qrBillEnabled?: boolean;
    /** PDF dili (indirmeden önce seçilir). Varsayılan: Almanca. */
    lang?: PdfLang;
    /** Opsiyonel içerik blokları — boş olanlar atlanır. */
    coverLetter?: string | null;
    closingImages?: string[] | null;
    /**
     * Belge başlığı ("Rechnung", "Akontorechnung" …). Boşsa teklif başlığı
     * (L.offerTitle) kullanılır — fatura PDF'leri bu şablonu başlık ve bilgi
     * kartı satırlarını değiştirerek yeniden kullanır.
     */
    docTitle?: string | null;
    /** Kapak bilgi kartının satırları. Verilirse teklif satırlarının yerine geçer. */
    infoRows?: Array<{ label: string; value: string; emphasize?: boolean }> | null;
    /** 'none': kapakta selamlama/giriş kalıbı basılmaz (faturalar için). */
    introMode?: 'default' | 'none';
    /**
     * true: pozisyon tablosu AYRI sayfaya değil, başlığın hemen altına — ilk
     * sayfaya — çizilir (fatura PDF'i kapak sayfası istemez, doğrudan başlar).
     */
    startTableOnFirstPage?: boolean;
    /** QR fatura borçlusu (Zahlbar durch) — yapılandırılmış adres. */
    qrDebtor?: {
        name: string;
        addressLine1?: string;
        addressLine2?: string;
        postalCode?: string;
        city?: string;
        country?: string;
    } | null;
    /** QR fatura "Zusätzliche Informationen" satırı (ör. fatura numarası). */
    qrAdditionalInfo?: string | null;
}

/** Tek bir iskonto satırı — adı, oranı ve para karşılığı. */
export interface TenderPdfDiscount {
    /** Kullanıcının verdiği ad ya da varsayılan ("Rabatt 1"). */
    name: string;
    /** Yüzde mi sabit tutar mı girildiği — sütunda hangi değerin yazılacağını belirler. */
    kind?: 'PERCENT' | 'AMOUNT';
    /** Kendi tabanına göre etkin yüzde (tutar tipindekiler için de doludur). */
    percent?: number;
    amount: number;
}

/** İndirim uygulanmış toplam özeti (ekrandaki `TenderPricingSummary` ile aynı). */
export interface TenderPdfTotals {
    /** İskontolardan ÖNCEKİ net toplam — iskonto varsa ara toplam satırı olur. */
    subtotal?: number;
    /**
     * Belge düzeyi iskontolar, uygulandıkları SIRAYLA. Her biri bir öncekinin
     * bıraktığı tutar üzerinden hesaplanır ve KDV'den ÖNCE listelenir.
     */
    discounts?: TenderPdfDiscount[];
    /** Tüm iskontoların birleşik etkisi (net üzerinden). */
    totalDiscountAmount?: number;
    combinedDiscountPercent?: number;
    netTotal: number;
    vatTotal: number;
    grossTotal: number;
}

export type PdfLang = 'tr' | 'de' | 'en';

export interface PdfStrings {
    offerNumber: string;
    kommission: string;
    referenz: string;
    offerDate: string;
    validUntil: string;
    /**
     * Die Zeile «wer betreut diesen Beleg». Sie heißt in ALLEN drei Sprachen
     * «Salesperson» (Benutzerwunsch 29.08.2026: «Verkaufer» soll nicht mehr
     * dastehen) — das ist die einzige Beschriftung des Dokuments, die nicht
     * übersetzt wird, und sie stimmt damit mit der Rechnung überein, die diese
     * Zeile schon immer fest als 'Salesperson' gedruckt hat (`invoicePdf.ts`).
     */
    seller: string;
    offerTitle: string;
    /** Sipariş belgesinin başlığı ve numara etiketi (satış PDF'i kullanır). */
    orderTitle: string;
    orderNumber: string;
    /**
     * AUFTRAGSBESTÄTIGUNG — Titel und Nummernbeschriftung des Belegs, den der
     * Auftrag dem Kunden schickt. Bewusst NICHT `orderTitle`: das rote
     * Verkaufsdokument ist ein INTERNER Ausdruck und heisst weiterhin
     * «Auftrag», die Bestätigung geht nach draussen.
     */
    confirmationTitle: string;
    confirmationNumber: string;
    /** Datum der Auftragsbestätigung (Entstehung des Auftrags). */
    confirmationDate: string;
    /** Yansız tarih etiketi — "Angebotsdatum" yalnızca teklif için doğrudur. */
    docDate: string;
    greeting: string;
    intro: string;
    colPos: string;
    colDesc: string;
    colQty: string;
    colUnitPrice: string;
    colDiscount: string;
    colTax: string;
    colPrice: string;
    subtotal: string;
    net: string;
    vat: string;
    discount: string;
    totalDiscount: string;
    grandTotal: string;
    paymentTerms: string;
    /** Ayarlarda ödeme koşulu boşsa basılan varsayılan cümle. */
    paymentTermsFallback: string;
    planTitle: string;
    planIntro: string;
    planStage: string;
    planDue: string;
    planShare: string;
    planAmount: string;
    planTotal: string;
    vatIdLabel: string;
    pageWord: string;
    pageOf: string;
    qrReceipt: string;
    qrPaymentPart: string;
    qrAccountPayableTo: string;
    qrCurrency: string;
    qrAmount: string;
    qrReference: string;
    qrPayableBy: string;
    qrAdditionalInfo: string;
    qrAcceptancePoint: string;
}

const I18N: Record<PdfLang, PdfStrings> = {
    tr: {
        offerNumber: 'Teklif Numarası :',
        kommission: 'Komisyon:',
        referenz: 'Referans:',
        offerDate: 'Teklif Tarihi:',
        validUntil: 'Teklif Bitiş Tarihi:',
        seller: 'Salesperson:',
        offerTitle: 'Teklif',
        orderTitle: 'Sipariş',
        orderNumber: 'Sipariş Numarası :',
        confirmationTitle: 'Sipariş Onayı',
        confirmationNumber: 'Sipariş Onay No :',
        confirmationDate: 'Sipariş Tarihi:',
        docDate: 'Tarih:',
        greeting: 'Sayın Yetkili,',
        intro: 'Talebiniz için teşekkür ederiz. Aşağıda teklifimizi memnuniyetle sunarız. Pozisyonların ayrıntılı dökümünü ilerleyen sayfalarda bulabilirsiniz.',
        colPos: 'Pos',
        colDesc: 'Açıklama',
        colQty: 'Miktar',
        colUnitPrice: 'B. Fiyat',
        colDiscount: 'İndirim',
        colTax: 'Vergi',
        colPrice: 'Fiyat',
        subtotal: 'Ara Toplam',
        net: 'Net Tutar',
        vat: 'KDV',
        discount: 'İndirim',
        totalDiscount: 'Toplam İndirim',
        grandTotal: 'TOPLAM',
        paymentTerms: 'Ödeme Koşulları',
        paymentTermsFallback: '30 gün içinde net ödenir.',
        planTitle: 'Ödeme Planı',
        planIntro: 'Faturalandırma aşağıdaki ödeme planına göre yapılır.',
        planStage: 'Taksit',
        planDue: 'Vade',
        planShare: 'Oran',
        planAmount: 'Tutar',
        planTotal: 'Toplam',
        vatIdLabel: 'Vergi No',
        pageWord: 'Sayfa',
        pageOf: '/',
        qrReceipt: 'Receipt',
        qrPaymentPart: 'Payment part',
        qrAccountPayableTo: 'Account / Payable to',
        qrCurrency: 'Currency',
        qrAmount: 'Amount',
        qrReference: 'Reference',
        qrPayableBy: 'Payable by',
        qrAdditionalInfo: 'Additional information',
        qrAcceptancePoint: 'Acceptance point',
    },
    de: {
        offerNumber: 'Angebots-Nr. :',
        kommission: 'Kommission:',
        referenz: 'Referenz:',
        offerDate: 'Angebotsdatum:',
        validUntil: 'Gültig bis:',
        seller: 'Salesperson:',
        offerTitle: 'Angebot',
        orderTitle: 'Auftrag',
        orderNumber: 'Auftrags-Nr. :',
        confirmationTitle: 'Auftragsbestätigung',
        confirmationNumber: 'Auftragsbestätigung-Nr. :',
        confirmationDate: 'Auftragsdatum:',
        docDate: 'Datum:',
        greeting: 'Sehr geehrte Damen und Herren',
        intro: 'Vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen nachfolgend unser Angebot. Eine detaillierte Aufstellung der Positionen finden Sie auf den folgenden Seiten.',
        colPos: 'Pos',
        colDesc: 'Beschreibung',
        colQty: 'Menge',
        colUnitPrice: 'E. Preis',
        colDiscount: 'Rabatt',
        colTax: 'MwSt.',
        colPrice: 'Preis',
        subtotal: 'Zwischensumme',
        net: 'Nettobetrag',
        vat: 'MwSt.',
        discount: 'Rabatt',
        totalDiscount: 'Gesamtrabatt',
        grandTotal: 'GESAMT',
        paymentTerms: 'Zahlungsbedingungen',
        paymentTermsFallback: 'Zahlbar innert 30 Tagen netto.',
        planTitle: 'Zahlungsplan',
        planIntro: 'Die Rechnungsstellung erfolgt gemäss nachstehendem Zahlungsplan.',
        planStage: 'Rate',
        planDue: 'Fällig am',
        planShare: 'Anteil',
        planAmount: 'Betrag',
        planTotal: 'Gesamt',
        vatIdLabel: 'MWST-Nr.',
        pageWord: 'Seite',
        pageOf: 'von',
        qrReceipt: 'Empfangsschein',
        qrPaymentPart: 'Zahlteil',
        qrAccountPayableTo: 'Konto / Zahlbar an',
        qrCurrency: 'Währung',
        qrAmount: 'Betrag',
        qrReference: 'Referenz',
        qrPayableBy: 'Zahlbar durch',
        qrAdditionalInfo: 'Zusätzliche Informationen',
        qrAcceptancePoint: 'Annahmestelle',
    },
    en: {
        offerNumber: 'Offer No. :',
        kommission: 'Commission:',
        referenz: 'Reference:',
        offerDate: 'Offer Date:',
        validUntil: 'Valid Until:',
        seller: 'Salesperson:',
        offerTitle: 'Offer',
        orderTitle: 'Order',
        orderNumber: 'Order No. :',
        confirmationTitle: 'Order Confirmation',
        confirmationNumber: 'Order Confirmation No. :',
        confirmationDate: 'Order Date:',
        docDate: 'Date:',
        greeting: 'Dear Sir or Madam,',
        intro: 'Thank you for your enquiry. We are pleased to submit our offer below. A detailed breakdown of the positions can be found on the following pages.',
        colPos: 'Pos',
        colDesc: 'Description',
        colQty: 'Quantity',
        colUnitPrice: 'U. Price',
        colDiscount: 'Discount',
        colTax: 'VAT',
        colPrice: 'Price',
        subtotal: 'Subtotal',
        net: 'Net Amount',
        vat: 'VAT',
        discount: 'Discount',
        totalDiscount: 'Total Discount',
        grandTotal: 'TOTAL',
        paymentTerms: 'Payment Terms',
        paymentTermsFallback: 'Payable net within 30 days.',
        planTitle: 'Payment Schedule',
        planIntro: 'Invoicing follows the payment schedule set out below.',
        planStage: 'Instalment',
        planDue: 'Due on',
        planShare: 'Share',
        planAmount: 'Amount',
        planTotal: 'Total',
        vatIdLabel: 'VAT No.',
        pageWord: 'Page',
        pageOf: 'of',
        qrReceipt: 'Receipt',
        qrPaymentPart: 'Payment part',
        qrAccountPayableTo: 'Account / Payable to',
        qrCurrency: 'Currency',
        qrAmount: 'Amount',
        qrReference: 'Reference',
        qrPayableBy: 'Payable by',
        qrAdditionalInfo: 'Additional information',
        qrAcceptancePoint: 'Acceptance point',
    },
};

// ── Sayfa geometrisi (A4, mm) ────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;

// Kenar boşlukları biraz daraltıldı: içerik 14–196 mm bandında akar; böylece
// tablo genişler ve sayısal sütunlardaki metinler rahat sığar.
const ML = 14;
const MR = 196;
const CONTENT_W = MR - ML;

// Antet: logo + iletişim satırı + iki tonlu çizgi (~10–30 mm bandı).
// Logo kutusu — antetteki marka hatları da bu kutuya göre konumlanır.
const LOGO_X = ML;
const LOGO_Y = 10;
const LOGO_H = 14;
const LOGO_MAX_W = 50;

const CONTENT_TOP_FIRST = 44;   // Kapak sayfası içerik başlangıcı
const CONTENT_TOP_REST = 38;    // Devam sayfaları içerik başlangıcı
// Alt bilgi bandı 272.5 mm'de başlar; içerik ASLA bu sınırı geçemez.
const CONTENT_BOTTOM = 266;

// ── Tablo sütunları (dikey ızgara yok; hizalama noktaları) ───────────────────
const C_POS_X = ML + 1.5; // Pos metni başlangıcı (sütun dar tutulur)
const C_DESC = 25;        // Açıklama sol kenarı (Pos'a 8.5 mm kalır: "1.2.10" sığar)
const C_DESC_END = 97;    // Açıklama sağ sınırı (biraz daraltıldı)
const C_QTY_R = 117;      // Miktar (sağa hizalı)
const C_UP_R = 139;       // Birim fiyat (sağa hizalı) — ~22 mm alan
const C_DISC_R = 154;     // İndirim (sağa hizalı)
const C_VAT_R = 167;      // Vergi (sağa hizalı)
const C_PRICE_R = MR - 1; // Tutar (sağa hizalı) — ~28 mm alan, taşma yok

const HEAD_H = 9.6;           // Tablo başlık bandı yüksekliği
const HEAD_GAP = 2;           // Başlık bandı ile ilk satır arası nefes payı
const ROW_PAD = 3;            // Satır üst/alt iç boşluğu (ferah görünüm)
const FIRST_BASELINE = 5.8;   // Satır üstünden ilk metin taban çizgisine
const ROW_MIN_H = 11;
const MIN_ROW_START = 16;     // Bir satıra başlamak için sayfada gereken asgari yer
// Kapitel bandının ÜSTÜNDEKİ boşluk: bir önceki bölümün son pozisyonundan
// görsel olarak kopar (band bu boşluğun altında başlar, satır yüksekliğine dahil).
const CHAPTER_GAP_ABOVE = 3.2;
const CHAPTER_ACCENT_W = 1.2; // Bandın sol kenarındaki lacivert şerit
/** Devam sayfalarında tablo başlığından sonraki ilk satırın y'si. */
const TABLE_TOP_Y = CONTENT_TOP_REST + HEAD_H + HEAD_GAP;

// ── Yazı tipi boyutları (puan) ───────────────────────────────────────────────
const FS_BASE = 9;
// Kapitel (Titel) ve Position dürfen NIE gleich aussehen: das Kapitel ist
// grösser, fett und marineblau auf grauem Band; die Position darunter ist eine
// normale, dunkle Zeile mit Zahlen. Vorher teilten sich beide FS_TITLE und
// waren im PDF nicht auseinanderzuhalten.
const FS_CHAPTER = 11.4;  // Kapitel/Titel satırı
const LH_CHAPTER = 5.4;
const FS_POSITION = 9.4;  // Pozisyon başlığı — kapitelden belirgin şekilde küçük
const FS_POS = 8.2;       // Pos numarası küçültüldü — sayısal sütunlara yer açar
const FS_CHAPTER_POS = 9.6; // Kapitel numarası ("1", "2") — başlıkla aynı ağırlıkta
const FS_LONG_DESC = 9;
const FS_HEADER = 8.9;    // Sütun adları — gövdeden ayırt edilecek kadar iri
const LH_TITLE = 4.7;
const LH_BODY = 4.4;
const UNIT_GAP = 4.2;
const IMG_SIZE = 24;      // Ürün görseli — 20 mm küçüktü, 28 mm satırı fazla yükseltti
// Satır içeriği HER ZAMAN başlık → paragraf → görsel sırasıyla dizilir; üç blok
// arasındaki boşluk tek bir değerden gelir. Ölçü, metin bloklarında SATIR
// ARALIĞINA eklenir (dolayısıyla gözle görülen aralık ~2.8 mm'dir).
const ROW_BLOCK_GAP = 1.4;
// Görselin üstünde/altında aynı optik aralığı tutturmak için iki düzeltme:
//  • ÜSTTE metin bloğu bittiğinde imleç son taban çizgisinin bir SATIR
//    altındadır; bu pay tek başına fazla geldiği için bir tık geri alınır.
//  • ALTTA böyle bir pay hiç yoktur; bu sabit olmadan görsel satır ayracına
//    yapışır.
const IMAGE_TOP_GAP = -0.9;
const IMAGE_BOTTOM_GAP = 2.6;

// ── Renk paleti ──────────────────────────────────────────────────────────────
// Belgenin TÜM renkleri tek bir palet nesnesinden okunur: Offitec laciverti +
// marka kırmızısı. Müşteriye giden her belge (teklif, AUFTRAGSBESTÄTIGUNG,
// fatura) bunu kullanır.
//
// ⚠ Bir zamanlar İKİNCİ bir palet vardı ('sales', baştan sona kırmızı) ve
// `theme` alanı aralarında seçim yapıyordu. Satış belgesi 29.08.2026'da
// emekliye ayrıldı (kullanıcı: «sipariş onayı diye bir buton yok, satış PDF'i
// var — o da lacivert olacak»), yerini aynı içeriği MARKA renkleriyle basan
// Auftragsbestätigung aldı. Palet artık değişmediği için `C` de sabittir.

type Rgb = readonly [number, number, number];

interface PdfPalette {
    TEXT: Rgb;
    MUTED: Rgb;
    /** Etiketler — muted'tan okunaklı. */
    LABEL: Rgb;
    /** Ana marka rengi: başlıklar, bantlar, sol şerit. */
    NAVY: Rgb;
    /** Vurgu rengi: başlık altındaki kısa çizgi. */
    RED: Rgb;
    /** Antet / alt bilgi şeridinin açık tonu — sakin bir marka bandı. */
    NAVY_SOFT: Rgb;
    /** Satır ayraçları. */
    HAIRLINE: Rgb;
    /** Tablo başlığı. */
    HEAD_BG: Rgb;
    /** Çok hafif satır tonlaması. */
    ZEBRA: Rgb;
    /** Ara toplam / genel toplam bandı. */
    BAND_BG: Rgb;
    /** Kapitel bandı: zebra tonundan BELİRGİN şekilde koyu — başlık satırı bir
     *  fiyat satırı gibi okunmasın diye tek bakışta ayrılır. */
    CHAPTER_BG: Rgb;
    /** Kapak bilgi kartı & alt bilgi kutusu. */
    CARD_BG: Rgb;
    CARD_BORDER: Rgb;
    /** Antet dalgasının iki ucu (SVG gradyanı bu renklerle yeniden boyanır). */
    WAVE_FROM: string;
    WAVE_TO: string;
}

const BRAND_PALETTE: PdfPalette = {
    TEXT: [30, 32, 40],
    MUTED: [120, 126, 140],
    LABEL: [88, 95, 114],
    NAVY: [31, 42, 84],
    RED: [211, 32, 38],
    NAVY_SOFT: [104, 116, 158],
    HAIRLINE: [226, 229, 237],
    HEAD_BG: [238, 241, 247],
    ZEBRA: [249, 250, 252],
    BAND_BG: [244, 246, 250],
    CHAPTER_BG: [230, 234, 242],
    CARD_BG: [248, 249, 252],
    CARD_BORDER: [226, 230, 238],
    WAVE_FROM: '#1f2a54',
    WAVE_TO: '#d32026',
};

/** Belgenin paleti — tek palet kaldı (bkz. yukarıdaki not). */
const C: PdfPalette = BRAND_PALETTE;

// ── Marka sabitleri (antet & alt bilgi) ──────────────────────────────────────
const CONTACT_PHONE = '+41 56 556 24 68';
const CONTACT_EMAIL = 'info@offitec.ch';
const CONTACT_WEB = 'www.offitec.ch';
const FOOTER_BIC = 'RAIFCH22XXX';
const FOOTER_VAT = 'CHE-201.098.592';
const FOOTER_IBAN = 'CH50 8080 8005 5315 3585 1';

// ── Fontlar (Türkçe karakter desteği için Arimo gömülür) ─────────────────────
const FONT = 'Arial';
let fontFiles: { regular: string; bold: string; italic: string } | null = null;

const bufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
};

async function registerFonts(doc: jsPDF) {
    if (!fontFiles) {
        const [regular, bold, italic] = await Promise.all([
            fetch(arialRegularUrl).then((r) => r.arrayBuffer()),
            fetch(arialBoldUrl).then((r) => r.arrayBuffer()),
            fetch(arialItalicUrl).then((r) => r.arrayBuffer()),
        ]);
        fontFiles = {
            regular: bufferToBase64(regular),
            bold: bufferToBase64(bold),
            italic: bufferToBase64(italic),
        };
    }
    doc.addFileToVFS('Arial-Regular.ttf', fontFiles.regular);
    doc.addFileToVFS('Arial-Bold.ttf', fontFiles.bold);
    doc.addFileToVFS('Arial-Italic.ttf', fontFiles.italic);
    doc.addFont('Arial-Regular.ttf', FONT, 'normal');
    doc.addFont('Arial-Bold.ttf', FONT, 'bold');
    doc.addFont('Arial-Italic.ttf', FONT, 'italic');
    doc.setFont(FONT, 'normal');
}

// ── Logo (bir kez indirilir, oranı korunarak antete yerleştirilir) ───────────
let logoDataUrl: string | null = null;

async function loadLogo(doc: jsPDF): Promise<{ dataUrl: string; w: number; h: number } | null> {
    try {
        if (!logoDataUrl) {
            const buf = await fetch(offitecLogoUrl).then((r) => r.arrayBuffer());
            logoDataUrl = `data:image/png;base64,${bufferToBase64(buf)}`;
        }
        const props = doc.getImageProperties(logoDataUrl);
        const h = LOGO_H;
        const w = Math.min(LOGO_MAX_W, h * (props.width / props.height));
        return { dataUrl: logoDataUrl, w, h };
    } catch (e) {
        console.warn('Offitec logo could not be loaded for the PDF header:', e);
        return null;
    }
}

// ── Antet dalgası (logodan sağa uzanan şerit) ────────────────────────────────
// SVG'nin kendisi vektör; jsPDF gradient/mask desteklemediği için şeridi bir kez
// hedef ölçüsünde rasterleştirip PNG olarak gömüyoruz. Aynı takma adla
// eklendiğinden jsPDF görseli tek sefer saklar, her sayfada yeniden yazmaz.
// Anahtar ölçüYE ve PALETE göredir: satış belgesi aynı şeridi altın/turuncu
// gradyanla ister, marka belgesi laciverti — ikisi aynı önbellek satırını
// paylaşamaz.
let wavePngCache: { key: string; dataUrl: string } | null = null;

async function loadHeaderWave(wMm: number, hMm: number): Promise<string | null> {
    const key = `${wMm.toFixed(2)}x${hMm.toFixed(2)}`;
    if (wavePngCache?.key === key) return wavePngCache.dataUrl;

    try {
        // Şeridi hedef en/boy oranında rasterleştir: SVG kendi oranından
        // (1460×280) esnetilir, ama vektör olduğu için kenarlar keskin kalır.
        const pxW = Math.round((wMm / 25.4) * WAVE_RASTER_DPI);
        const pxH = Math.round((hMm / 25.4) * WAVE_RASTER_DPI);

        // Şerit olduğu gibi kullanılır; ikinci palet gittiğinden yeniden
        // boyama adımı da gitti (gradyan zaten marka renklerini taşıyor).
        const svgText = await fetch(headerWaveUrl).then((r) => r.text());
        // Yalnızca kök <svg> çerçevesi değişir; yollar, gradyan ve maske olduğu
        // gibi kalır. viewBox şeridin canlı alanına kırpılır (bkz. WAVE_VIEW) ve
        // preserveAspectRatio="none" ile banda tam oturur — varsayılan "meet"
        // olsaydı şerit bandın ortasına sığdırılıp iki yana boşluk bırakırdı.
        const sized = svgText.replace(/<svg\b[^>]*>/, (tag) =>
            tag
                .replace(/\swidth="[^"]*"/, ` width="${pxW}"`)
                .replace(/\sheight="[^"]*"/, ` height="${pxH}"`)
                .replace(/\sviewBox="[^"]*"/, ` viewBox="${WAVE_VIEW}"`)
                .replace(/\s*>$/, ' preserveAspectRatio="none">')
        );

        const img = new Image();
        img.decoding = 'sync';
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('wave svg decode failed'));
            img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
        });

        const canvas = document.createElement('canvas');
        canvas.width = pxW;
        canvas.height = pxH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, pxW, pxH);

        const dataUrl = canvas.toDataURL('image/png');
        wavePngCache = { key, dataUrl };
        return dataUrl;
    } catch (e) {
        console.warn('Header wave could not be rendered for the PDF header:', e);
        return null;
    }
}

// ── Sayı / tarih biçimleyiciler (klasik şablon ile birebir) ──────────────────
const fmtMoneyForCurrency = (currency: string) => (v: number) =>
    `${currency} ${new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(v || 0)}`;

const fmtUnitPrice = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v || 0);

const fmtQty = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

const fmtDiscount = (v: number) =>
    `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(v)}%`;

const fmtVatRate = (v: number) =>
    `${new Intl.NumberFormat('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`;

/**
 * Bilgi kartındaki tarihler. Belge GENELİNDE tek biçim: 16.08.2026 — fatura
 * kartı (`invoicePdf.fmtDay`) ve ödeme planı tablosu da böyle yazar. Eskiden
 * teklif kartı "26-08-16" basıyordu ve aynı belgede üç ayrı tarih biçimi
 * görünüyordu.
 */
const fmtDateShort = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()}`;
};

/** Live status of the PDF pipeline, for download-progress UIs. */
/**
 * Belge metinleri, dil koduyla. Satış PDF'i kendi bilgi kartı satırlarını
 * (Auftrags-Nr. / Datum / Verkäufer) burada kurduğu için tablo dışarı açıktır.
 */
export const pdfStringsFor = (lang: PdfLang = 'de'): PdfStrings => I18N[lang] ?? I18N.de;

export type TenderPdfProgress =
    | { stage: 'positions'; done: number; total: number }
    | { stage: 'finalize' }
    | { stage: 'download' };

/** True once the rich HTML holds something other than empty markup. */
const hasRichContent = (value?: string | null) =>
    Boolean(value && value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());

const drawRichTextFlow = (doc: jsPDF, html: string, startY: number): number =>
    drawRichText(doc, parseRichTextParagraphs(html), {
        x: ML,
        y: startY,
        maxWidth: CONTENT_W,
        fontFamily: FONT,
        fontSize: FS_BASE + 0.5,
        lineHeight: LH_BODY + 0.6,
        defaultColor: C.TEXT,
        maxY: CONTENT_BOTTOM,
        onOverflow: () => {
            doc.addPage();
            return CONTENT_TOP_REST;
        },
    });

/**
 * Kapanış görselleri (imza, kaşe, fotoğraf) — toplamların altına akar. Eskiden
 * üstünde bir "Schlusstext" bloğu vardı; o metin tamamen kaldırıldı, geriye
 * yalnızca görseller kaldı.
 */
const appendClosingBlocks = async (doc: jsPDF, data: TenderPdfData, contentY: number) => {
    const images = data.closingImages ?? [];
    if (images.length === 0) return;

    let y = contentY;
    if (y + 24 > CONTENT_BOTTOM) {
        doc.addPage();
        y = CONTENT_TOP_REST;
    } else {
        y += 10;
    }

    for (const image of images) {
        try {
            const properties = doc.getImageProperties(image);
            const maxWidth = CONTENT_W;
            const maxHeight = 90;
            const ratio = Math.min(maxWidth / properties.width, maxHeight / properties.height);
            const width = properties.width * ratio;
            const height = properties.height * ratio;
            if (y + height > CONTENT_BOTTOM) {
                doc.addPage();
                y = CONTENT_TOP_REST;
            }
            doc.addImage(image, image.includes('image/png') ? 'PNG' : 'JPEG', ML, y, width, height, undefined, 'FAST');
            y += height + 4;
        } catch (err) {
            console.error('Closing image could not be embedded:', err);
        }
    }
};

/**
 * Belge kuyruğu. Etkin palet (`C`) modül düzeyinde bir değişkendir; iki belge
 * aynı anda üretilirse (ör. biri marka, biri satış) `await` noktalarında
 * birbirlerinin rengini çalarlardı. Kuyruk bunu imkânsız kılar: bir belge
 * bitmeden diğeri başlamaz. Zaten CPU'ya bağlı bir iş olduğu için paralellikten
 * kazanılacak bir şey de yok.
 */
let buildQueue: Promise<unknown> = Promise.resolve();

export function buildTenderPdfBytes(
    data: TenderPdfData,
    settings: PdfCompanySettings,
    onProgress?: (p: TenderPdfProgress) => void
): Promise<Uint8Array> {
    // Önceki belge hata verse bile sıradaki çalışır (`.catch` ile zincir
    // temizlenir); dönen söz ise çağıranın kendi hatasını taşır.
    const run = buildQueue.then(() => renderTenderPdfBytes(data, settings, onProgress));
    buildQueue = run.catch(() => undefined);
    return run;
}

async function renderTenderPdfBytes(
    data: TenderPdfData,
    settings: PdfCompanySettings,
    onProgress?: (p: TenderPdfProgress) => void
): Promise<Uint8Array> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const logo = await loadLogo(doc);
    const wave = await loadHeaderWave(WAVE_W, WAVE_H);
    const fmt = fmtMoneyForCurrency(settings.currency);
    const L = I18N[data.lang ?? 'de'];
    data = { ...data, tenderNumber: data.tenderNumber };

    // ── SAYFA 1: Kapak & giriş ───────────────────────────────────────────────
    // Einleitungstext (Anschreiben) artık AYRI SAYFA DEĞİL: başlığın hemen
    // altında akar, taşarsa kapak devam sayfalarına geçer (kapak içinde çizilir).
    const coverEndY = drawCoverPage(doc, data, settings, L);

    // ── Pozisyon tablosu ─────────────────────────────────────────────────────
    // Faturalar kapak sayfası istemez: tablo başlığın hemen altında, İLK
    // sayfada başlar. Teklifler eskisi gibi 2. sayfadan devam eder.
    const st: TableState = { y: 0, rowIdx: 0 };
    if (data.startTableOnFirstPage && coverEndY + 30 <= CONTENT_BOTTOM) {
        st.y = drawTableHeader(doc, coverEndY + 6, L);
    } else {
        doc.addPage();
        st.y = drawTableHeader(doc, CONTENT_TOP_REST, L);
    }

    let drawn = 0;
    for (const pos of data.positions) {
        if (pos.isSectionSubtotal) {
            if (st.y + 10 > CONTENT_BOTTOM) newTablePage(doc, st, L);
            st.y = drawSectionSubtotal(doc, st.y, pos.total ?? 0, fmt, L);
            st.rowIdx++;
        } else {
            const h = measureRow(doc, pos);
            // Kapitel satırı zebra sırasını TÜKETMEZ: kendi bandı vardır, sayacı
            // ilerletirse altındaki pozisyonların şeritlenmesi keyfi görünür.
            const isChapter = isChapterRow(pos);
            const zebraStep = isChapter ? 0 : 1;
            // Dul başlık yok: bir kapitel bandı sayfanın en altında TEK BAŞINA
            // kalmamalı — altına en az bir pozisyon satırı sığmıyorsa başlık
            // baştan yeni sayfaya alınır.
            // `st.y > TABLE_TOP_Y`: yeni sayfanın başındaysak zaten taşınacak
            // yer yok — koşul olmasa boş bir sayfa açılırdı.
            if (isChapter && st.y + h + MIN_ROW_START > CONTENT_BOTTOM && st.y > TABLE_TOP_Y) {
                newTablePage(doc, st, L);
            }
            if (st.y + h <= CONTENT_BOTTOM) {
                st.y = drawRowAtomic(doc, pos, st.y, h, fmt, st.rowIdx);
                st.rowIdx += zebraStep;
            } else if (CONTENT_BOTTOM - st.y < MIN_ROW_START) {
                // Kalan yer bir satıra başlamaya bile yetmiyor → yeni sayfa.
                newTablePage(doc, st, L);
                if (st.y + h <= CONTENT_BOTTOM) {
                    st.y = drawRowAtomic(doc, pos, st.y, h, fmt, st.rowIdx);
                    st.rowIdx += zebraStep;
                } else {
                    drawRowFlowing(doc, pos, fmt, L, st);
                }
            } else {
                // Uzun satır: bir sonraki sayfaya İTİLMEZ — kaldığı yerden
                // bölünerek akmaya devam eder (kullanıcı isteği).
                drawRowFlowing(doc, pos, fmt, L, st);
            }
        }
        drawn++;
        if (onProgress) {
            onProgress({ stage: 'positions', done: drawn, total: data.positions.length });
            if (drawn % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    onProgress?.({ stage: 'finalize' });

    // ── Toplamlar + ödeme koşulu kartı ───────────────────────────────────────
    // Blok ÖLÇÜLEREK yerleştirilir: sağdaki toplam sütunu ile soldaki
    // "Zahlungsbedingungen" kartı aynı hizada başlar, sayfaya sığmıyorsa
    // ikisi birlikte yeni sayfaya taşınır.
    const totalsBlockHeight = measureTotalsBlock(doc, data, settings, L);
    let y = st.y;
    if (y + totalsBlockHeight > CONTENT_BOTTOM) {
        doc.addPage();
        y = CONTENT_TOP_REST + 4;
    } else {
        y += 9;
    }
    let contentBottomY = drawTotals(doc, y, data, settings, fmt, L);

    // ── Ödeme planı — belgenin EN SONUNDA, kendi tablosunda ──────────────────
    contentBottomY = drawPaymentPlan(doc, contentBottomY, data, fmt, L);

    // ── Opsiyonel: Schlusstext & Schlussbild ─────────────────────────────────
    await appendClosingBlocks(doc, data, contentBottomY);

    // ── Antet & alt bilgi dekorasyonu (QR sayfası hariç tüm sayfalar) ────────
    const contentPageCount = doc.getNumberOfPages();

    // ── QR Fatura (Swiss QR-Bill) — ödeme fişi olduğu için antet almaz ──────
    if (data.qrBillEnabled === true) {
        await appendQrBillPage(doc, data, settings, L);
    }

    for (let i = 1; i <= contentPageCount; i++) {
        doc.setPage(i);
        drawPageHeader(doc, logo, wave, settings);
        drawPageFooter(doc, i, contentPageCount, L);
    }

    return new Uint8Array(doc.output('arraybuffer'));
}

export async function exportTenderPdf(
    data: TenderPdfData,
    settings: PdfCompanySettings,
    onProgress?: (p: TenderPdfProgress) => void
): Promise<void> {
    const finalBytes = await buildTenderPdfBytes(data, settings, onProgress);
    onProgress?.({ stage: 'download' });
    downloadPdf(finalBytes, `${data.tenderNumber}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTET — logo, iletişim satırı, iki tonlu ayraç çizgisi (her sayfada)
// ─────────────────────────────────────────────────────────────────────────────

type ContactIcon = 'phone' | 'mail' | 'web';

/** Küçük vektör ikonlar (telefon / e-posta / web) — 3 mm kutuya çizilir. */
function drawContactIcon(doc: jsPDF, kind: ContactIcon, x: number, top: number, s: number) {
    doc.setDrawColor(...C.NAVY);
    doc.setFillColor(...C.NAVY);
    doc.setLineWidth(0.26);

    if (kind === 'phone') {
        const w = s * 0.62;
        const bx = x + (s - w) / 2;
        doc.roundedRect(bx, top, w, s, 0.35, 0.35, 'F');
        // Ekran boşluğu — dolu blok yerine gerçek bir ahize silueti verir.
        doc.setFillColor(255, 255, 255);
        doc.rect(bx + 0.22, top + 0.42, w - 0.44, s - 1.2, 'F');
        doc.setFillColor(...C.NAVY);
    } else if (kind === 'mail') {
        const h = s * 0.74;
        const ty = top + (s - h) / 2;
        doc.rect(x, ty, s, h, 'S');
        doc.line(x, ty, x + s / 2, ty + h * 0.55);
        doc.line(x + s, ty, x + s / 2, ty + h * 0.55);
    } else {
        const r = s / 2;
        doc.circle(x + r, top + r, r, 'S');
        doc.ellipse(x + r, top + r, r * 0.44, r, 'S');
        doc.line(x, top + r, x + s, top + r);
    }
}

/**
 * Antetteki marka işareti: sağ marja hizalı dalga şeridi
 * (assets/images/header-wave.svg). Bükülen kurdele: 18 ince şerit aynı sinüs
 * omurgasını kayan faz ve genlikle izler — kesişmeler eğik süpürmeler olur,
 * orta hat bandın biraz altında salınır (dalga aşağıya dolar, lob uçları
 * yuvarlaktır). İki uç da tek noktada TOPLANMAZ: teller kademeli x'lerde
 * serbest biter (açık saç uçları). Renkler logonun laciverti → kırmızısı,
 * sağ uç kırmızı bölgede açık bir yelpazeyle biter. Kompozisyon simetrik
 * 3 lob: kesişme süpürmeleri x=365/1095'te aynalı, iki uç da tam yelpazeyle
 * açılır; omurga sağa doğru hafifçe yükselir (logosuz taraf ~2 mm yukarıda).
 * TÜM teller tuvalin tamamını (x 0→1460) kat eder — uçlar aynı hizada biter,
 * uzun/kısa karışımı yok; İKİ kenarı da maske rampası yumuşatır (sol %15,
 * sağ %85→100), kesik görüntüsü yok. SVG, 146×28 mm bandı için 1460×280 tuvalde
 * birebir tasarlandı (10 birim/mm); sol kenar x=50'de başlar, uzun maske
 * rampası (%15) sayesinde mürekkep ancak x≈66'dan sonra görünür — logoya
 * (mürekkep kenarı ≈47.5) değmez, kesik yok. İletişim satırı bu banda yer
 * açmak için 32 tabanına indirildi.
 */
const WAVE_W = 146;              // Şerit genişliği — sağa hizalı, x 50→196
const WAVE_H = 28;               // Şerit bandının yüksekliği (y 0–28; mürekkep ~5.5–24.5)
const WAVE_CENTER_Y = LOGO_Y + LOGO_H / 2 - 3;  // Logo ortasından 3 mm yukarı
const WAVE_RASTER_DPI = 400;     // Rasterleştirme çözünürlüğü
const WAVE_VIEW = '0 0 1460 280';           // Tuvalin tamamı — kırpma yok

function drawHeaderWave(doc: jsPDF, wave: string | null) {
    if (!wave) return;
    try {
        doc.addImage(
            wave, 'PNG',
            MR - WAVE_W, WAVE_CENTER_Y - WAVE_H / 2, WAVE_W, WAVE_H,
            'offitec-header-wave', 'FAST'
        );
    } catch { /* şerit çizilemezse antet logo + iletişim satırı olarak kalır */ }
}

/**
 * Sütun adlarını taşıyan bant: hafif lacivert tonlu zemin + altında ince
 * lacivert hat. Pozisyon tablosu, ödeme planı tablosu ve bilgi kartının başlığı
 * AYNI biçimi kullanır — belge tek bir görsel dile oturur.
 */
function drawBandHeader(doc: jsPDF, y: number, x: number, w: number, h: number) {
    doc.setFillColor(...C.HEAD_BG);
    doc.rect(x, y, w, h, 'F');
    doc.setFillColor(...C.NAVY_SOFT);
    doc.rect(x, y + h - 0.35, w, 0.35, 'F');
}

/** Tek, ince ayraç çizgisi. */
function drawHairline(doc: jsPDF, y: number, tone: readonly [number, number, number], thickness = 0.2) {
    doc.setFillColor(tone[0], tone[1], tone[2]);
    doc.rect(ML, y - thickness / 2, CONTENT_W, thickness, 'F');
}

function drawPageHeader(
    doc: jsPDF,
    logo: { dataUrl: string; w: number; h: number } | null,
    wave: string | null,
    s: PdfCompanySettings
) {
    if (logo) {
        try {
            doc.addImage(logo.dataUrl, 'PNG', LOGO_X, LOGO_Y, logo.w, logo.h, 'offitec-logo', 'FAST');
        } catch { /* logo yüklenemezse antet metin-only kalır */ }
    } else {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(15);
        doc.setTextColor(...C.NAVY);
        doc.text(s.companyName, ML, 19);
    }

    // Sağ marja hizalı, iletişim satırının üzerinde kalan dalga şeridi.
    drawHeaderWave(doc, wave);

    // İletişim bilgileri — her biri kendi ikonuyla, sağa yaslı tek satır.
    // Taban çizgisi 32: dalga bandı (y 6–28) ile içerik (38) arasında kalır.
    const baseline = 32;
    const ICON = 2.9;
    const ICON_GAP = 1.5;
    const ITEM_GAP = 6;
    const items: Array<{ icon: ContactIcon; text: string }> = [
        { icon: 'phone', text: CONTACT_PHONE },
        { icon: 'mail', text: CONTACT_EMAIL },
        { icon: 'web', text: CONTACT_WEB },
    ];

    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    const widths = items.map((it) => ICON + ICON_GAP + doc.getTextWidth(it.text));
    const totalW = widths.reduce((a, b) => a + b, 0) + ITEM_GAP * (items.length - 1);

    let x = MR - totalW;
    items.forEach((it, i) => {
        drawContactIcon(doc, it.icon, x, baseline - 2.6, ICON);
        doc.setFont(FONT, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...C.LABEL);
        doc.text(it.text, x + ICON + ICON_GAP, baseline);
        x += widths[i] + ITEM_GAP;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ALT BİLGİ — lacivert BIC / MwSt / IBAN satırı, altında tek bir çizgi
// ─────────────────────────────────────────────────────────────────────────────

function drawPageFooter(doc: jsPDF, page: number, total: number, L: PdfStrings) {
    const textY = 274.5;

    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...C.NAVY);
    const details = `BIC: ${FOOTER_BIC}     ${L.vatIdLabel}: ${FOOTER_VAT}     IBAN: ${FOOTER_IBAN}`;
    doc.text(details, ML, textY);

    doc.setFontSize(7.2);
    doc.setTextColor(...C.NAVY_SOFT);
    doc.text(`${L.pageWord} ${page} ${L.pageOf} ${total}`, MR, textY, { align: 'right' });

    // Sayfayı kapatan tek çizgi — alt bilginin altında.
    drawHairline(doc, 278.5, C.NAVY, 0.4);
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 1 — Kapak: gönderici satırı + alıcı (sol), bilgi kartı (sağ)
// ─────────────────────────────────────────────────────────────────────────────

/** Kapak içeriğini çizer; içeriğin bittiği y'yi döndürür (ilk-sayfa tablo başlangıcı için). */
function drawCoverPage(doc: jsPDF, data: TenderPdfData, s: PdfCompanySettings, L: PdfStrings): number {
    const y0 = CONTENT_TOP_FIRST;

    // ── Sol: belge bilgi kartı ───────────────────────────────────────────────
    // Aufbau wie ein sauberer Datenkopf, nicht wie eine gedrängte Liste:
    //  • getöntes KOPFBAND für die Belegnummer, unten mit derselben Kante wie
    //    der Tabellenkopf (`drawBandHeader`),
    //  • darunter weisse Datenzeilen (Beschriftung links, Wert fett rechts),
    //    getrennt von eingerückten Haarlinien,
    //  • EIN durchgehender marineblauer Streifen an der linken Kante.
    // Rechnungs-PDFs liefern ihre Zeilen über `infoRows`; dann bleiben die
    // Offertzeilen ungenutzt. Referenz steht direkt über dem Verkäufer.
    const cardX = ML;
    const cardW = 82;
    const CARD_ACCENT_W = 1.2;
    const CARD_PAD_X = 4.4;
    const CARD_HEAD_H = 9.6;
    const CARD_ROW_H = 6.4;
    const rows: Array<[string, string, boolean]> = (
        data.infoRows?.length
            ? data.infoRows.map((row): [string, string, boolean] => [row.label, row.value || '', Boolean(row.emphasize)])
            : ([
                [L.offerNumber.replace(/\s*:\s*$/, ''), data.tenderNumber, true],
                [L.kommission.replace(/\s*:\s*$/, ''), data.commission || '', false],
                [L.offerDate.replace(/\s*:\s*$/, ''), fmtDateShort(data.createdAt), false],
                [L.validUntil.replace(/\s*:\s*$/, ''), fmtDateShort(data.validUntil), false],
                [L.referenz.replace(/\s*:\s*$/, ''), data.customerReference || '', false],
                [L.seller.replace(/\s*:\s*$/, ''), data.createdByName || '', false],
            ] as Array<[string, string, boolean]>)
    ).filter(([, value]) => value.trim().length > 0);
    const cardY = y0 - 4;
    const cardH = rows.reduce((sum, [, , emphasize]) => sum + (emphasize ? CARD_HEAD_H : CARD_ROW_H), 0);

    // Gövde beyaz kalır ki tonlu kopfband gerçekten öne çıksın. Çerçeve EN SON
    // çizilir (aşağıda), aksi hâlde kopfband üst kenarı örter.
    doc.setFillColor(255, 255, 255);
    doc.rect(cardX, cardY, cardW, cardH, 'F');

    const textLeft = cardX + CARD_ACCENT_W + CARD_PAD_X;
    const textRight = cardX + cardW - CARD_PAD_X;
    let ry = cardY;
    rows.forEach(([label, value, emphasize], idx) => {
        const h = emphasize ? CARD_HEAD_H : CARD_ROW_H;
        if (emphasize) drawBandHeader(doc, ry, cardX, cardW, h);

        const base = ry + h / 2 + (emphasize ? 1.4 : 1.2);
        const inner = textRight - textLeft;
        doc.setFont(FONT, 'normal');
        doc.setTextColor(...C.LABEL);
        // Auch die BESCHRIFTUNG wird gesetzt: eine lange
        // («Auftragsbestätigung-Nr.», «Order Confirmation No.») darf dem Wert
        // nicht den Platz nehmen, also bekommt sie höchstens die Hälfte der
        // Karte und schrumpft davor.
        fitFontSize(doc, label, inner * 0.56, 7.4, 5.6);
        const labelW = doc.getTextWidth(label);
        doc.text(label, textLeft, base);

        // Der Wert wird bei Bedarf verkleinert, damit er in der schmaleren
        // Karte nicht mit der Beschriftung kollidiert.
        doc.setFont(FONT, 'bold');
        const valueBase = emphasize ? 10 : 8.2;
        const valueMaxW = inner - labelW - 3;
        fitFontSize(doc, value, valueMaxW, valueBase, 5.8);
        if (emphasize) doc.setTextColor(...C.NAVY);
        else doc.setTextColor(...C.TEXT);
        doc.text(value, textRight, base, { align: 'right' });

        ry += h;
        // Haarlinie NUR zwischen zwei Datenzeilen — das Kopfband bringt seine
        // eigene Unterkante mit.
        if (idx < rows.length - 1 && !emphasize) {
            doc.setDrawColor(...C.HAIRLINE);
            doc.setLineWidth(0.12);
            doc.line(textLeft, ry, textRight, ry);
        }
    });

    // Durchgehender Streifen + Rahmen zuletzt: beide liegen über den Füllungen
    // (das Kopfband reicht sonst bis an die Kante und überdeckt sie).
    doc.setFillColor(...C.NAVY);
    doc.rect(cardX, cardY, CARD_ACCENT_W, cardH, 'F');
    doc.setDrawColor(...C.CARD_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(cardX, cardY, cardW, cardH, 'S');

    // ── Sağ: tek satır gönderici + montaj/alıcı adresi ───────────────────────
    // "Offitec GmbH, Ceres Tower - Hohenrainstrasse 24, 4133 Pratteln"
    // — küçük punto, TEK satır (sığmazsa punto küçülür, satır bölünmez); hemen
    // altında müşterinin (montaj yerinin) adresi.
    const addrX = 112;
    const addrW = MR - addrX;
    const sender = companySenderLine(s);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...C.MUTED);
    drawFittedSingleLine(doc, sender, addrX, y0, addrW, 7.5, 5.8);
    doc.setDrawColor(...C.HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(addrX, y0 + 1.6, MR, y0 + 1.6);

    let addrY = y0 + 8;
    doc.setTextColor(...C.TEXT);
    if (data.customerName) {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(10.5);
        const nameLines = doc.splitTextToSize(data.customerName, addrW);
        doc.text(nameLines, addrX, addrY);
        addrY += nameLines.length * 5;
    }
    if (data.customerAddress) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(10);
        // Name / Strasse / "PLZ Ort" — jede Zeile bleibt GANZ (schrumpft statt
        // umzubrechen), damit PLZ und Ort immer auf derselben Zeile stehen.
        addrY = drawAddressBlockLines(doc, data.customerAddress, addrX, addrY, addrW, 10, 4.9);
    }
    // Müşteri e-postası / telefonu bilinçli olarak PDF'e yazılmaz.

    // ── Başlık + kısa kırmızı vurgu + giriş metni ────────────────────────────
    let yTitle = Math.max(addrY, cardY + cardH) + 16;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(16.5);
    doc.setTextColor(...C.NAVY);
    doc.text(`${data.docTitle || L.offerTitle} ${data.tenderNumber}`, ML, yTitle);
    doc.setDrawColor(...C.RED);
    doc.setLineWidth(0.8);
    doc.line(ML, yTitle + 2.6, ML + 14, yTitle + 2.6);

    // Ayar notu ÖNCE çizilir: sayfa 1'in altına sabittir; giriş metni taşıp
    // yeni sayfa açarsa not yine kapak sayfasında kalır.
    if (s.footerNote) {
        doc.setFont(FONT, 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(...C.MUTED);
        const note = doc.splitTextToSize(s.footerNote, CONTENT_W);
        doc.text(note, ML, CONTENT_BOTTOM - 4 - note.length * 4);
        doc.setFont(FONT, 'normal');
    }

    yTitle += 12;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...C.TEXT);

    if (hasRichContent(data.coverLetter)) {
        // Kullanıcının (şablondan gelen) giriş metni — "Sehr geehrte …" dahil
        // metnin kendisidir, bu yüzden kalıp selamlama/giriş cümlesi atlanır.
        return drawRichTextFlow(doc, data.coverLetter as string, yTitle);
    }
    if (data.introMode !== 'none') {
        doc.text(L.greeting, ML, yTitle);
        yTitle += 6.4;
        const introLines = doc.splitTextToSize(L.intro, CONTENT_W);
        doc.text(introLines, ML, yTitle, { lineHeightFactor: 1.35 });
        return yTitle + introLines.length * (LH_BODY + 1.5);
    }
    // introMode 'none': içerik başlığın (kırmızı vurgu çizgisinin) hemen altında biter.
    return yTitle - 8;
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 2+ — Tablo başlığı, satırlar (ızgarasız, ferah düzen)
// ─────────────────────────────────────────────────────────────────────────────

interface TableState { y: number; rowIdx: number }

function newTablePage(doc: jsPDF, st: TableState, L: PdfStrings) {
    doc.addPage();
    st.rowIdx = 0;
    st.y = drawTableHeader(doc, CONTENT_TOP_REST, L);
}

function drawTableHeader(doc: jsPDF, y: number, L: PdfStrings): number {
    // Hafif lacivert tonlu bant + altında ince lacivert hat. Sütun adları
    // gövdeden bir tık büyük yazılır (FS_HEADER 8.4 → 8.9): eski punto bandın
    // üstünde zor okunuyordu (kullanıcı geri bildirimi).
    drawBandHeader(doc, y, ML, CONTENT_W, HEAD_H);

    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_HEADER);
    doc.setTextColor(...C.NAVY);

    // Başlıklar da sütun genişliğine sığdırılır — hiçbir dilde taşma olmaz.
    const ty = y + HEAD_H / 2 + 1.3;
    fitFontSize(doc, L.colPos, C_DESC - C_POS_X - 1, FS_HEADER, 5.8);
    doc.text(L.colPos, C_POS_X, ty);
    doc.setFontSize(FS_HEADER);
    doc.text(L.colDesc, C_DESC, ty);

    const headCells: Array<[string, number, number]> = [
        [L.colQty, C_QTY_R, W_QTY],
        [L.colUnitPrice, C_UP_R, W_UP],
        [L.colDiscount, C_DISC_R, W_DISC],
        [L.colTax, C_VAT_R, W_VAT],
        [L.colPrice, C_PRICE_R, W_PRICE],
    ];
    for (const [label, rightX, maxW] of headCells) {
        fitFontSize(doc, label, maxW, FS_HEADER, 5.8);
        doc.text(label, rightX, ty, { align: 'right' });
    }
    doc.setFontSize(FS_HEADER);

    return y + HEAD_H + HEAD_GAP;
}

/** "1.1 TCL 5484 Klima" → { pos: "1.1", text: "TCL 5484 Klima" } */
function splitPosLabel(short: string): { pos: string; text: string } {
    const m = (short || '').match(/^(\d+(?:\.\d+)*)\s+([\s\S]*)$/);
    if (m) return { pos: m[1], text: m[2] };
    return { pos: '', text: short || '' };
}

/**
 * Satırın KENDİ tutarı var mı — sayısal sütunlarda (Menge/E. Preis/Rabatt/
 * MwSt./Preis) yazılacak bir şey bulunup bulunmadığı. `drawNumerics` ile
 * BİREBİR aynı koşul: ikisi ayrışırsa başlık bandı fiyatlı bir satırın altına
 * girer.
 */
function rowHasOwnAmount(pos: TenderPdfData['positions'][number]): boolean {
    const qty = pos.quantity || 0;
    const unitPrice = pos.unitPrice ?? 0;
    return (pos.lineTotal ?? 0) > 0 || (qty > 0 && unitPrice > 0);
}

/** Bu satır türleri her zaman POZİSYON/metin satırıdır — asla kapitel olmaz. */
const NEVER_CHAPTER_ROW_TYPES = new Set(['DESCRIPTION', 'PRODUCT', 'CUSTOM']);

/**
 * ── KAPITEL Mİ POZİSYON MU ───────────────────────────────────────────────────
 * Kapitel (Titel/Bölüm) = "1 Kältemaschine R290" gibi, ALTINDAKİ pozisyonları
 * toplayan başlık satırı; kendi fiyatı yoktur. Pozisyon = "1.1 OffiTec
 * AWSC-900.2CI290" — miktarı, birim fiyatı ve tutarı olan satış kalemi.
 *
 * Ölçüt satır TÜRÜ değil, KENDİ TUTARININ olup olmamasıdır: eski kayıtlarda
 * başlıklar 'SECTION', yenilerde 'TITLE' olarak durur; buna karşılık fatura
 * PDF'inin tek satırlık "Anzahlung von 50%" kalemi de 'TITLE' türündedir ama
 * fiyatı vardır — o bir pozisyondur ve fiyat sütunlarını KAYBETMEMELİDİR.
 */
function isChapterRow(pos: TenderPdfData['positions'][number]): boolean {
    const rowType = (pos.rowType || 'SECTION').toUpperCase();
    if (NEVER_CHAPTER_ROW_TYPES.has(rowType)) return false;
    return !rowHasOwnAmount(pos);
}

function rowVisualMeta(pos: TenderPdfData['positions'][number]) {
    const rowType = (pos.rowType || 'SECTION').toUpperCase();
    const rawLevel = pos.hierarchyLevel ?? (pos.isTopLevel ? 1 : 2);
    const level = Math.max(0, rawLevel - 1);
    const indent = Math.min(level * 4, 16);

    if (isChapterRow(pos)) {
        return {
            rowType, indent, isChapter: true,
            titleFontSize: FS_CHAPTER, titleLineHeight: LH_CHAPTER,
            titleStyle: 'bold' as const, titleColor: C.NAVY,
            longFontSize: FS_LONG_DESC,
        };
    }
    if (rowType === 'DESCRIPTION') {
        return {
            rowType, indent, isChapter: false,
            titleFontSize: FS_BASE, titleLineHeight: LH_BODY,
            titleStyle: 'normal' as const, titleColor: C.TEXT,
            longFontSize: FS_LONG_DESC,
        };
    }
    return {
        rowType, indent, isChapter: false,
        titleFontSize: FS_POSITION, titleLineHeight: LH_TITLE,
        titleStyle: 'bold' as const, titleColor: C.TEXT,
        longFontSize: FS_BASE,
    };
}

// ── Satır içeriği "atom" listesi olarak kurulur ───────────────────────────────
// Atomlar hem ölçüm hem çizim için tek kaynak: uzun satırlar sayfa sınırında
// atom (satır/görsel) bazında bölünebilir.
type RowAtom =
    | { kind: 'lines'; lines: string[]; font: 'normal' | 'bold'; size: number; lineH: number; indent: number; color?: readonly [number, number, number] }
    // Zengin metin paragrafı: kalın/italik/renk KORUNUR, madde imleri desteklenir.
    | { kind: 'rich'; lines: RichVisualLine[]; bullet: boolean; size: number; lineH: number }
    | { kind: 'image'; url: string; alias?: string; h: number }
    | { kind: 'gap'; h: number };

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'AUTO' {
    if (dataUrl.startsWith('data:image/png')) return 'PNG';
    if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
    return 'AUTO' as any;
}

function normalizeTrackedLetters(line: string): string {
    return line
        .split(/(\s{2,})/)
        .map((part) => {
            if (/^\s+$/.test(part)) return ' ';
            return /^(?:\p{L}\s){3,}\p{L}$/u.test(part.trim())
                ? part.replace(/\s+/g, '')
                : part;
        })
        .join('')
        .replace(/\s{2,}/g, ' ');
}

function looksLikeCatalogCode(line: string): boolean {
    const text = line.trim();
    if (!text || text.length > 36 || /\s{2,}/.test(text)) return false;
    if (!/[0-9]/.test(text)) return false;
    if (/[a-zäöüéèàç]/.test(text)) return false;
    return /^[A-Z0-9][A-Z0-9._/\\#:-]*$/.test(text);
}

/**
 * `dropCatalogCodes` yalnızca BAŞLIK için açıktır: içe aktarılan tekliflerde
 * ürün adının altında tek başına duran katalog kodu satırı temizlenir.
 *
 * Açıklama metninde ASLA satır atılmaz. Bu filtre "büyük harf + rakam, boşluksuz"
 * her satırı kod sanıyordu; stoktan gelen açıklamaların "G4G4", "230V", "IP54"
 * gibi satırları — hatta tamamı böyle olan kısa açıklamalar — bu yüzden PDF'e
 * hiç yazılmıyordu. Editörden gelen zengin metin zaten bu yoldan geçmediği için
 * kayıp sadece stoktan/dışa aktarımdan gelen düz metinde görünüyordu.
 */
function normalizePdfText(text: string, options?: { dropCatalogCodes?: boolean }): string {
    if (looksLikeRichHtml(text)) text = richHtmlToPlainText(text);
    const lines = text
        .replace(/ /g, ' ')
        .replace(/[‐‑‒–—−]/g, '-')
        .replace(/­/g, '')
        .split(/\r?\n/)
        .map((line) => normalizeTrackedLetters(line));
    return (options?.dropCatalogCodes ? lines.filter((line) => !looksLikeCatalogCode(line)) : lines)
        .join('\n')
        .trim();
}

function plainMarkdownLine(line: string): string {
    return line
        .trimStart()
        .replace(/^#{1,2}\s+/, '')
        .replace(/^[-•] /, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/_(.+?)_/g, '$1');
}

/** Markdown-vari uzun açıklamayı stillendirilmiş satır atomlarına çevirir. */
function buildMarkdownAtoms(doc: jsPDF, rawText: string, maxW: number, fontSize: number, lineHeight: number): RowAtom[] {
    const atoms: RowAtom[] = [];
    for (const rawLine of normalizePdfText(rawText).split(/\r?\n/)) {
        if (!rawLine.trim()) { atoms.push({ kind: 'gap', h: lineHeight * 0.5 }); continue; }

        const trimmed = rawLine.trimStart();
        const heading = trimmed.match(/^(#{1,2})\s+(.*)$/);
        const headingLevel = heading ? (heading[1]?.length === 1 ? 1 : 2) : 0;
        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ');
        const cleaned = heading ? plainMarkdownLine(heading[2] ?? '') : plainMarkdownLine(trimmed);
        const text = `${isBullet ? '• ' : ''}${cleaned}`;
        const size = headingLevel === 1 ? fontSize + 1.4 : headingLevel === 2 ? fontSize + 0.8 : fontSize;
        const lineH = headingLevel > 0 ? lineHeight + 0.5 : lineHeight;

        doc.setFont(FONT, headingLevel > 0 ? 'bold' : 'normal');
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(text, maxW - (isBullet ? 2 : 0));
        atoms.push({ kind: 'lines', lines, font: headingLevel > 0 ? 'bold' : 'normal', size, lineH, indent: isBullet ? 2 : 0 });
    }
    return atoms;
}

/**
 * Zengin HTML açıklamayı stilli satır atomlarına çevirir: kalın/italik/renk
 * korunur, `<li>` maddeleri imli girintiyle yazılır. Başlıklar (H1–H4) parser
 * tarafından kalın koşuya çevrilir ve GÖVDE puntosunda kalır — başlık ile metin
 * arasında yalnızca satır aralığı vardır (istenen "minimal spacing").
 */
function buildRichAtoms(doc: jsPDF, rawHtml: string, maxW: number, fontSize: number, lineHeight: number): RowAtom[] {
    const atoms: RowAtom[] = [];
    for (const paragraph of parseRichTextParagraphs(rawHtml)) {
        if (paragraph.runs.length === 0) { atoms.push({ kind: 'gap', h: lineHeight * 0.5 }); continue; }
        const runs = paragraph.runs.map((run) => ({
            ...run,
            // PDF fontunda sorun çıkaran karakterler ekran HTML'inden gelebilir.
            text: run.text.replace(/ /g, ' ').replace(/[‐‑‒–—−]/g, '-').replace(/­/g, ''),
        }));
        const indent = paragraph.bullet ? BULLET_INDENT : 0;
        const lines = wrapRichParagraph(doc, runs, maxW - indent, FONT, fontSize);
        atoms.push({ kind: 'rich', lines, bullet: paragraph.bullet, size: fontSize, lineH: lineHeight });
    }
    return atoms;
}

function buildRowAtoms(doc: jsPDF, pos: TenderPdfData['positions'][number]): { atoms: RowAtom[]; descX: number; descW: number } {
    const meta = rowVisualMeta(pos);
    const descX = C_DESC + meta.indent;
    // Kapitel satırında sayısal sütun YOKTUR; başlık bandın tamamını kullanır ve
    // "Beschreibung" sütununun dar sınırında gereksiz yere sarmaz.
    const descW = (meta.isChapter ? C_PRICE_R : C_DESC_END) - descX;
    const atoms: RowAtom[] = [];

    const { text: titleText } = splitPosLabel(pos.shortDescription || '');
    doc.setFont(FONT, meta.titleStyle);
    doc.setFontSize(meta.titleFontSize);
    const titleLines = doc.splitTextToSize(normalizePdfText(titleText, { dropCatalogCodes: true }), descW);
    atoms.push({
        kind: 'lines', lines: titleLines, font: meta.titleStyle,
        size: meta.titleFontSize, lineH: meta.titleLineHeight, indent: 0,
        color: meta.titleColor,
    });

    if (pos.longDescription) {
        atoms.push({ kind: 'gap', h: ROW_BLOCK_GAP });
        // Editörden gelen zengin HTML stiliyle çizilir; içe aktarılmış düz /
        // markdown-vari metin eski yalın yoldan geçer.
        if (looksLikeRichHtml(pos.longDescription)) {
            atoms.push(...buildRichAtoms(doc, pos.longDescription, descW, meta.longFontSize, LH_BODY));
        } else {
            atoms.push(...buildMarkdownAtoms(doc, pos.longDescription, descW, meta.longFontSize, LH_BODY));
        }
    }

    // Görsel satırın EN SONUNDA durur: başlık → paragraf → görsel. Üstündeki ve
    // altındaki boşluk, başlık ile paragraf arasındakiyle aynı görünür.
    if (pos.imageUrl) {
        atoms.push({ kind: 'gap', h: IMAGE_TOP_GAP });
        atoms.push({
            kind: 'image',
            url: pos.imageUrl,
            alias: pos.sourceArticleId ? `art-${pos.sourceArticleId}` : undefined,
            h: IMG_SIZE,
        });
        atoms.push({ kind: 'gap', h: IMAGE_BOTTOM_GAP });
    }

    return { atoms, descX, descW };
}

const atomHeight = (a: RowAtom) =>
    (a.kind === 'lines' || a.kind === 'rich' ? a.lines.length * a.lineH : a.h);

function measureRow(doc: jsPDF, pos: TenderPdfData['positions'][number]): number {
    const { atoms } = buildRowAtoms(doc, pos);
    const contentH = atoms.reduce((sum, a) => sum + atomHeight(a), 0);
    // The numeric columns can also run past the first baseline: the unit sits
    // under the quantity, and a discount STACK adds a line per entry. Whichever
    // of the two goes deepest decides how much room the numerics need.
    const unitDrop = (pos.quantity || 0) > 0 && pos.unit ? UNIT_GAP : 0;
    const discountDrop = Math.max(0, discountColumnLines(pos).length - 1) * DISC_LINE_H;
    const numericsH = FIRST_BASELINE - 2 + Math.max(unitDrop, discountDrop);
    // Kapitel bandının üstündeki ayırıcı boşluk satır yüksekliğine dahildir;
    // band bu boşluğun ALTINDA başlar (bkz. `drawRowAtomic`).
    return chapterTopGap(pos) + Math.max(ROW_MIN_H, Math.max(contentH, numericsH) + ROW_PAD * 2);
}

/** Kapitel satırının üstüne bırakılan ayırıcı boşluk (pozisyonlarda 0). */
const chapterTopGap = (pos: TenderPdfData['positions'][number]) =>
    (isChapterRow(pos) ? CHAPTER_GAP_ABOVE : 0);

/**
 * Metni sütununa sığdırır: gerekiyorsa punto kademeli küçültülür. Böylece
 * uzun tutarlar (ör. "CHF 123.456,78") komşu sütuna taşamaz.
 */
function fitFontSize(doc: jsPDF, text: string, maxW: number, base: number, min = 6.4): number {
    let size = base;
    doc.setFontSize(size);
    while (size > min && doc.getTextWidth(text) > maxW) {
        size -= 0.2;
        doc.setFontSize(size);
    }
    return size;
}

/** Sağa hizalı, sütun genişliğine sığdırılmış sayısal hücre. */
function drawFittedRight(
    doc: jsPDF,
    text: string,
    rightX: number,
    maxW: number,
    baseY: number,
    style: 'normal' | 'bold',
    base = FS_BASE
) {
    doc.setFont(FONT, style);
    fitFontSize(doc, text, maxW, base);
    doc.text(text, rightX, baseY, { align: 'right' });
    doc.setFontSize(FS_BASE);
}

/**
 * Pos numarası dar sütuna sığdırılarak yazılır (açıklamaya taşmaz). Kapitel
 * numarası ("1") başlığın ağırlığını taşır: büyük, kalın, lacivert ve sol
 * şeritten sonra başlar; pozisyon numarası ("1.1") küçük ve normaldir.
 */
function drawPosLabel(doc: jsPDF, label: string, baseY: number, isChapter: boolean) {
    if (!label) return;
    const x = isChapter ? C_POS_X + CHAPTER_ACCENT_W + 0.6 : C_POS_X;
    doc.setFont(FONT, isChapter ? 'bold' : 'normal');
    fitFontSize(doc, label, C_DESC - x - 1, isChapter ? FS_CHAPTER_POS : FS_POS, 5.8);
    if (isChapter) doc.setTextColor(...C.NAVY);
    else doc.setTextColor(...C.TEXT);
    doc.text(label, x, baseY, { baseline: 'alphabetic' });
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...C.TEXT);
}

/**
 * Kapitel bandı: açık gri zemin + sol kenarda lacivert şerit. Fiyat satırlarının
 * zebra tonundan ayrı bir renktir, bu yüzden başlık satırı asla bir pozisyonla
 * karıştırılmaz.
 */
function drawChapterBand(doc: jsPDF, y: number, h: number) {
    doc.setFillColor(...C.CHAPTER_BG);
    doc.rect(ML, y, CONTENT_W, h, 'F');
    doc.setFillColor(...C.NAVY);
    doc.rect(ML, y, CHAPTER_ACCENT_W, h, 'F');
}

// Sayısal sütunların kullanılabilir genişlikleri (komşuya 2 mm nefes payı).
const W_QTY = C_QTY_R - C_DESC_END - 2;
const W_UP = C_UP_R - C_QTY_R - 2;
const W_DISC = C_DISC_R - C_UP_R - 2;
const W_VAT = C_VAT_R - C_DISC_R - 2;
const W_PRICE = C_PRICE_R - C_VAT_R - 2;

// Yığılmış iskontolar İndirim sütununda ALT ALTA yazılır; satırlar arası boşluk.
const DISC_LINE_H = 4.0;

/**
 * İndirim sütununun içeriği: satırda iskonto yığını varsa her iskonto AYRI BİR
 * SATIR olarak (ör. "12%", "16%"), yoksa tek bir birleşik yüzde. Birleşik yüzde
 * (ör. %26,1) yığın varken YAZILMAZ — okuyucunun gördüğü, gerçekten pazarlık
 * edilen oranlardır.
 *
 * Sabit tutarlı iskontolar para birimi ön eki olmadan yazılır: 13 mm'lik sütun
 * "CHF 300.00" taşımaz, "300,00" ise rahat sığar ve yüzdelerden ayırt edilir.
 */
function discountColumnLines(pos: TenderPdfData['positions'][number]): string[] {
    const stacked = (pos.discounts ?? []).filter((entry) => (entry?.amount ?? 0) > 0);
    if (stacked.length > 0) {
        return stacked.map((entry) => (entry.kind === 'AMOUNT'
            ? fmtUnitPrice(entry.amount)
            : fmtDiscount(entry.percent ?? 0)));
    }
    const discount = pos.discount ?? 0;
    return discount > 0 ? [fmtDiscount(discount)] : [];
}

/** Sayısal sütunlar — yalnızca kendi tutarı olan satırlarda çizilir. */
function drawNumerics(doc: jsPDF, pos: TenderPdfData['positions'][number], baseY: number, fmt: (v: number) => string) {
    const qty = pos.quantity || 0;
    const unit = pos.unit || '';
    const unitPrice = pos.unitPrice ?? 0;
    const discount = pos.discount ?? 0;
    const taxRate = pos.taxRate ?? 0;
    const fallbackLineTotal = qty * unitPrice * (1 - discount / 100) * (1 + (taxRate || 8.1) / 100);
    const total = pos.lineTotal ?? (!pos.isParent ? (pos.total ?? fallbackLineTotal) : 0);
    // Kapitel/Titel satırında Menge · E. Preis · Rabatt · MwSt. · Preis sütunları
    // HİÇ çizilmez (kullanıcı isteği): başlık bir fiyat satırı gibi görünmemeli.
    if (!rowHasOwnAmount(pos)) return;

    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...C.TEXT);

    if (qty > 0) {
        drawFittedRight(doc, fmtQty(qty), C_QTY_R, W_QTY, baseY, 'normal');
        if (unit) {
            doc.setTextColor(...C.LABEL);
            drawFittedRight(doc, unit, C_QTY_R, W_QTY, baseY + UNIT_GAP, 'normal', FS_BASE - 0.4);
            doc.setTextColor(...C.TEXT);
        }
    } else {
        drawFittedRight(doc, '—', C_QTY_R, W_QTY, baseY, 'normal');
    }

    drawFittedRight(doc, unitPrice > 0 ? fmtUnitPrice(unitPrice) : '—', C_UP_R, W_UP, baseY, 'normal');
    discountColumnLines(pos).forEach((line, index) => {
        drawFittedRight(doc, line, C_DISC_R, W_DISC, baseY + index * DISC_LINE_H, 'normal');
    });
    doc.setTextColor(...C.LABEL);
    drawFittedRight(doc, fmtVatRate(taxRate || 8.1), C_VAT_R, W_VAT, baseY, 'normal');
    doc.setTextColor(...C.TEXT);
    if (total > 0) {
        drawFittedRight(doc, fmt(total), C_PRICE_R, W_PRICE, baseY, 'bold');
        doc.setFont(FONT, 'normal');
    }
}

function drawAtomLines(doc: jsPDF, atom: Extract<RowAtom, { kind: 'lines' }>, x: number, startBaseY: number): number {
    doc.setFont(FONT, atom.font);
    doc.setFontSize(atom.size);
    doc.setTextColor(...(atom.color ?? C.TEXT));
    let cy = startBaseY;
    for (const line of atom.lines) {
        doc.text(line, x + atom.indent, cy);
        cy += atom.lineH;
    }
    return cy;
}

/** Zengin metin atomunun TEK görsel satırını çizer (stil koşu koşu uygulanır). */
function drawRichAtomLine(
    doc: jsPDF,
    atom: Extract<RowAtom, { kind: 'rich' }>,
    lineIdx: number,
    x: number,
    baseY: number,
) {
    doc.setFontSize(atom.size);
    if (atom.bullet && lineIdx === 0) {
        doc.setFont(FONT, 'normal');
        doc.setTextColor(...C.TEXT);
        doc.text('•', x, baseY);
    }
    let cursorX = x + (atom.bullet ? BULLET_INDENT : 0);
    for (const { run, text } of atom.lines[lineIdx] ?? []) {
        doc.setFont(FONT, fontStyleOf(run));
        const [r, g, b] = run.color ?? C.TEXT;
        doc.setTextColor(r, g, b);
        doc.text(text, cursorX, baseY);
        cursorX += doc.getTextWidth(text);
    }
    doc.setTextColor(...C.TEXT);
}

function drawRowHairline(doc: jsPDF, y: number) {
    doc.setDrawColor(...C.HAIRLINE);
    doc.setLineWidth(0.15);
    doc.line(ML, y, MR, y);
}

/** Sayfaya sığan satır: kapitel bandı ya da hafif zebra zemin + tek parça çizim. */
function drawRowAtomic(
    doc: jsPDF,
    pos: TenderPdfData['positions'][number],
    y: number,
    rowH: number,
    fmt: (v: number) => string,
    rowIdx: number
): number {
    const isChapter = isChapterRow(pos);
    const topGap = isChapter ? CHAPTER_GAP_ABOVE : 0;
    const bandY = y + topGap;
    const bandH = rowH - topGap;

    if (isChapter) {
        drawChapterBand(doc, bandY, bandH);
    } else if (rowIdx % 2 === 1) {
        doc.setFillColor(...C.ZEBRA);
        doc.rect(ML, y, CONTENT_W, rowH, 'F');
    }

    const { atoms, descX } = buildRowAtoms(doc, pos);
    const { pos: posLabel } = splitPosLabel(pos.shortDescription || '');
    const baseY = bandY + FIRST_BASELINE;

    drawPosLabel(doc, posLabel, baseY, isChapter);

    let cy = baseY;
    for (const atom of atoms) {
        if (atom.kind === 'gap') { cy += atom.h; continue; }
        if (atom.kind === 'image') {
            try {
                doc.addImage(atom.url, detectImageFormat(atom.url) as any, descX, cy, IMG_SIZE, IMG_SIZE, atom.alias, 'NONE');
            } catch { /* bozuk görsel satırı düşürmesin */ }
            cy += atom.h;
            continue;
        }
        if (atom.kind === 'rich') {
            for (let i = 0; i < atom.lines.length; i++) {
                drawRichAtomLine(doc, atom, i, descX, cy);
                cy += atom.lineH;
            }
            continue;
        }
        cy = drawAtomLines(doc, atom, descX, cy);
    }

    drawNumerics(doc, pos, baseY, fmt);
    // Kapitel bandının kendi kenarı zaten ayraçtır — altına ikinci bir çizgi
    // çekmek bandı çerçeveye çevirir.
    if (!isChapter) drawRowHairline(doc, y + rowH);
    return y + rowH;
}

/**
 * Sayfaya sığmayan uzun satır: bir üst sayfaya itilmek yerine kaldığı yerden
 * satır satır akar; sayfa dolunca yeni sayfada tablo başlığıyla devam eder.
 * İçerik hiçbir koşulda CONTENT_BOTTOM sınırını (alt bilgi bölgesini) geçmez.
 */
function drawRowFlowing(
    doc: jsPDF,
    pos: TenderPdfData['positions'][number],
    fmt: (v: number) => string,
    L: PdfStrings,
    st: TableState
) {
    const { atoms, descX } = buildRowAtoms(doc, pos);
    const { pos: posLabel } = splitPosLabel(pos.shortDescription || '');
    const isChapter = isChapterRow(pos);

    // Bölünen kapitel: bandın yüksekliği ölçümden gelir, sayfa sonunda kırpılır.
    // (Kapitel satırları kısadır; bu yol yalnızca çok uzun başlık + açıklama
    // birleşiminde çalışır.)
    if (isChapter) {
        const measured = measureRow(doc, pos) - CHAPTER_GAP_ABOVE;
        const bandY = st.y + CHAPTER_GAP_ABOVE;
        drawChapterBand(doc, bandY, Math.min(measured, CONTENT_BOTTOM - bandY));
        st.y = bandY;
    }

    let baseY = st.y + FIRST_BASELINE;
    const breakPage = () => {
        newTablePage(doc, st, L);
        baseY = st.y + FIRST_BASELINE;
        return baseY;
    };

    drawPosLabel(doc, posLabel, baseY, isChapter);
    drawNumerics(doc, pos, baseY, fmt);

    let cy = baseY;
    for (const atom of atoms) {
        if (atom.kind === 'gap') { cy += atom.h; continue; }
        if (atom.kind === 'image') {
            if (cy - 3 + atom.h > CONTENT_BOTTOM) cy = breakPage();
            try {
                doc.addImage(atom.url, detectImageFormat(atom.url) as any, descX, cy, IMG_SIZE, IMG_SIZE, atom.alias, 'NONE');
            } catch { /* bozuk görsel satırı düşürmesin */ }
            cy += atom.h;
            continue;
        }
        if (atom.kind === 'rich') {
            for (let i = 0; i < atom.lines.length; i++) {
                if (cy > CONTENT_BOTTOM - 1.5) cy = breakPage();
                drawRichAtomLine(doc, atom, i, descX, cy);
                cy += atom.lineH;
            }
            continue;
        }
        const atomColor = atom.color ?? C.TEXT;
        doc.setFont(FONT, atom.font);
        doc.setFontSize(atom.size);
        doc.setTextColor(...atomColor);
        for (const line of atom.lines) {
            if (cy > CONTENT_BOTTOM - 1.5) {
                cy = breakPage();
                // Sayfa kırılınca font durumu tablo başlığından kalır — geri yükle.
                doc.setFont(FONT, atom.font);
                doc.setFontSize(atom.size);
                doc.setTextColor(...atomColor);
            }
            doc.text(line, descX + atom.indent, cy);
            cy += atom.lineH;
        }
        doc.setTextColor(...C.TEXT);
    }

    st.y = Math.min(cy + ROW_PAD - 3, CONTENT_BOTTOM);
    if (!isChapter) drawRowHairline(doc, st.y);
    st.rowIdx++;
}

function drawSectionSubtotal(
    doc: jsPDF,
    y: number,
    total: number,
    fmt: (v: number) => string,
    L: PdfStrings
): number {
    const h = 9;
    doc.setFillColor(...C.BAND_BG);
    doc.rect(ML, y + 0.5, CONTENT_W, h - 1, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...C.NAVY);
    doc.text(L.subtotal, C_VAT_R, y + 5.6, { align: 'right' });
    doc.text(fmt(total), C_PRICE_R, y + 5.6, { align: 'right' });
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...C.TEXT);
    return y + h;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPLAMLAR — sağda toplam sütunu, solda ödeme koşulu kartı (aynı hizada)
// ─────────────────────────────────────────────────────────────────────────────

/** Toplam sütununun sol kenarı — solunda kalan alan ödeme koşulu kartınındır. */
const TOTALS_BLOCK_X = 116;
const TOTALS_ROW_H = 5.4 + 2.8;   // `totalRow` bir satırda ne kadar ilerliyor
const TOTALS_BAND_H = 12;         // GESAMT bandı
const TERMS_CARD_W = TOTALS_BLOCK_X - ML - 8;
const TERMS_PAD = 3.2;
const TERMS_LINE_H = 4.4;

/**
 * ── ÖDEME KOŞULU YALNIZCA FATURADA ──────────────────────────────────────────
 * "Zahlbar innert 30 Tagen netto" bir ödeme TALİMATIDIR: ancak ödenecek bir
 * tutar doğduğunda, yani faturalama aşamasında anlamlıdır. Teklifte ödemenin
 * nasıl yapılacağını Zahlungsplan tablosu (yüzdeler) anlatır; koşul cümlesi
 * teklife basılmaz (kullanıcı isteği 16.08.2026). `invoicePdf.ts`
 * `showPaymentTerms: true` gönderir.
 */
const wantsPaymentTerms = (data: TenderPdfData) => data.showPaymentTerms === true;

/** Ayarlarda metin varsa o, boşsa belge dilinin varsayılan cümlesi. */
const paymentTermsText = (s: PdfCompanySettings, L: PdfStrings) =>
    (s.paymentTerms || '').trim() || L.paymentTermsFallback;

/**
 * Ödeme koşulu kartının yüksekliği. Sarma genişliği `drawTermsCard` ile
 * BİREBİR aynı olmalı — ayrışırsa ölçü bir satır eksik çıkar ve kart taşar.
 */
function measureTermsCard(doc: jsPDF, s: PdfCompanySettings, L: PdfStrings): number {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    const lines = doc.splitTextToSize(paymentTermsText(s, L), TERMS_CARD_W - TERMS_PAD * 2 - 2) as string[];
    return TERMS_PAD * 2 + 4.6 + lines.length * TERMS_LINE_H;
}

/**
 * Toplam bloğunun (sağdaki sütun ile soldaki koşul kartının yükseği hangisiyse)
 * gerçek yüksekliği. Sayfa sonu kararı bu ölçüye göre verilir.
 */
function measureTotalsBlock(doc: jsPDF, data: TenderPdfData, s: PdfCompanySettings, L: PdfStrings): number {
    const discountRows = (data.totals?.discounts ?? []).filter((entry) => (entry?.amount ?? 0) > 0).length;
    const rowCount = (discountRows > 0 ? 1 + discountRows : 0) + 2; // [Zwischensumme + Rabatte] + Netto + MwSt.
    const totalsH = rowCount * TOTALS_ROW_H + 1 + TOTALS_BAND_H;
    const termsH = wantsPaymentTerms(data) ? measureTermsCard(doc, s, L) : 0;
    return Math.max(totalsH, termsH) + 4;
}

/**
 * "Zahlungsbedingungen" kartı — toplam sütununun SOLUNDA, onunla aynı hizada;
 * bilgi kartıyla aynı dil: açık zemin, ince çerçeve, solda lacivert şerit.
 */
function drawTermsCard(doc: jsPDF, y: number, s: PdfCompanySettings, L: PdfStrings): number {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    const lines = doc.splitTextToSize(paymentTermsText(s, L), TERMS_CARD_W - TERMS_PAD * 2 - 2) as string[];
    const h = TERMS_PAD * 2 + 4.6 + lines.length * TERMS_LINE_H;

    doc.setFillColor(...C.CARD_BG);
    doc.setDrawColor(...C.CARD_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(ML, y, TERMS_CARD_W, h, 'FD');
    doc.setFillColor(...C.NAVY);
    doc.rect(ML, y, 1.2, h, 'F');

    const textX = ML + 1.2 + TERMS_PAD;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(...C.NAVY);
    doc.text(L.paymentTerms, textX, y + TERMS_PAD + 2.6);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...C.TEXT);
    let ty = y + TERMS_PAD + 4.6 + 2.6;
    for (const line of lines) {
        doc.text(line, textX, ty);
        ty += TERMS_LINE_H;
    }
    return y + h;
}

/** Toplam bloğunu çizer ve içeriğin bittiği y'yi döndürür. */
function drawTotals(
    doc: jsPDF,
    y: number,
    data: TenderPdfData,
    s: PdfCompanySettings,
    fmt: (v: number) => string,
    L: PdfStrings
): number {
    const blockTop = y;
    const p = data.totals ?? null;
    const net = p ? p.netTotal : (s.vatRate > 0 ? data.grandTotal / (1 + s.vatRate / 100) : data.grandTotal);
    const vat = p ? p.vatTotal : data.grandTotal - net;
    const grand = p ? p.grossTotal : data.grandTotal;
    const discounts = (p?.discounts ?? []).filter((entry) => (entry?.amount ?? 0) > 0);
    const subtotal = p?.subtotal ?? net;

    const blockX = TOTALS_BLOCK_X;
    const labelX = blockX + 4;
    const valueX = C_PRICE_R;

    // Etiket kullanıcının yazdığı iskonto adı olabilir (80 karaktere kadar), bu
    // yüzden tutarın soluna kalan boşluğa sığdırılır: önce punto küçültülür,
    // hâlâ taşıyorsa kırpılır. Aksi hâlde ad tutarın üstüne biner.
    const totalRow = (label: string, value: string) => {
        doc.setDrawColor(...C.HAIRLINE);
        doc.setLineWidth(0.15);
        doc.line(blockX, y, MR, y);
        y += 5.4;
        doc.setFont(FONT, 'bold');
        doc.setFontSize(FS_BASE);
        const labelMaxW = Math.max(14, valueX - doc.getTextWidth(value) - labelX - 3);
        doc.setFont(FONT, 'normal');
        fitFontSize(doc, label, labelMaxW, FS_BASE, 6.4);
        let text = label;
        if (doc.getTextWidth(text) > labelMaxW) {
            const lines = doc.splitTextToSize(text, labelMaxW) as string[];
            text = `${(lines[0] ?? text).trim()}…`;
        }
        doc.setTextColor(...C.LABEL);
        doc.text(text, labelX, y);
        doc.setFontSize(FS_BASE);
        doc.setFont(FONT, 'bold');
        doc.setTextColor(...C.TEXT);
        doc.text(value, valueX, y, { align: 'right' });
        y += 2.8;
    };

    // İskontolar KDV'DEN ÖNCE, her biri KENDİ ADIYLA ve uygulandıkları sırayla
    // listelenir; her satır bir öncekinin bıraktığı tutar üzerinden hesaplanmıştır.
    // Hiç iskonto yoksa blok eskisi gibi net + KDV olarak kalır.
    if (discounts.length > 0) {
        totalRow(L.subtotal, fmt(subtotal));
        discounts.forEach((entry) => {
            const name = (entry.name || '').trim() || L.discount;
            const label = (entry.percent ?? 0) > 0 ? `${name} ${fmtDiscount(entry.percent!)}` : name;
            totalRow(label, `− ${fmt(entry.amount)}`);
        });
        // Birleşik iskonto ("Gesamtrabatt %X − CHF Y") özet satırı BİLİNÇLİ OLARAK
        // yazılmaz: her iskonto zaten kendi satırında, kendi adıyla listeleniyor;
        // toplamı ayrıca yazmak aynı indirimi iki kez veriyormuş gibi okunuyordu.
    }
    totalRow(L.net, fmt(net));
    totalRow(`${L.vat} ${fmtVatRate(s.vatRate)}`, fmt(vat));

    // Genel toplam: sert blok yerine yumuşak tonlu bant + lacivert vurgu.
    // Bant, ekrandaki büyütülmüş toplam satırıyla uyumlu olsun diye eskisinden
    // daha yüksek ve daha büyük puntolu.
    // Genel toplam: yumuşak tonlu bant + sol kenarda lacivert vurgu.
    y += 1;
    const bandH = TOTALS_BAND_H;
    doc.setFillColor(...C.HEAD_BG);
    doc.rect(blockX, y, MR - blockX, bandH, 'F');
    doc.setFillColor(...C.NAVY);
    doc.rect(blockX, y, 1.2, bandH, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...C.NAVY);
    doc.text(L.grandTotal, labelX, y + bandH / 2 + 1.8);
    doc.text(fmt(grand), valueX, y + bandH / 2 + 1.8, { align: 'right' });
    y += bandH;

    // Ödeme koşulu kartı toplam sütunuyla AYNI hizada başlar (soldaki boş alan)
    // ve yalnızca faturada çizilir.
    const termsBottom = wantsPaymentTerms(data) ? drawTermsCard(doc, blockTop, s, L) : 0;
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...C.TEXT);
    return Math.max(y, termsBottom);
}

// ─────────────────────────────────────────────────────────────────────────────
// ÖDEME PLANI — belgenin en sonunda, taksit başına bir satır
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_HEAD_H = 8;
const PLAN_ROW_H = 7;
const PLAN_TITLE_H = 11;
// Sütunlar: Rate (sol) · Fällig am (sol) · Anteil (sağ) · Betrag (sağ).
const PLAN_C_DUE = 62;
const PLAN_C_SHARE_R = 132;
const PLAN_C_AMOUNT_R = C_PRICE_R;

/** Geçerli taksitler: yüzdesi olan satırlar; hiç yoksa tablo çizilmez. */
const planStages = (data: TenderPdfData) =>
    (data.paymentStages ?? []).filter((stage) => Number(stage?.percent) > 0);

/**
 * "Wie wird bezahlt" tablosu: her taksit kendi satırında — sıra numarası,
 * (siparişte) vade tarihi, oranı ve genel toplamdan türetilen tutarı. Tutarlar
 * plan verisinden DEĞİL basılan brüt toplamdan hesaplanır, böylece plan ile
 * belge toplamı asla ayrışmaz. Plan yoksa fonksiyon hiçbir şey çizmez.
 */
function drawPaymentPlan(
    doc: jsPDF,
    y: number,
    data: TenderPdfData,
    fmt: (v: number) => string,
    L: PdfStrings
): number {
    const stages = planStages(data);
    if (stages.length === 0) return y;

    const grand = data.totals?.grossTotal ?? data.grandTotal;
    const showDue = stages.some((stage) => Boolean(stage.date));
    const blockH = PLAN_TITLE_H + 6 + PLAN_HEAD_H + stages.length * PLAN_ROW_H + PLAN_ROW_H + 2;

    y += 12;
    if (y + blockH > CONTENT_BOTTOM) {
        doc.addPage();
        y = CONTENT_TOP_REST;
    }

    // Başlık + kısa kırmızı vurgu — kapak başlığıyla aynı işaret.
    doc.setFont(FONT, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...C.NAVY);
    doc.text(L.planTitle, ML, y + 4.4);
    doc.setDrawColor(...C.RED);
    doc.setLineWidth(0.8);
    doc.line(ML, y + 7, ML + 14, y + 7);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...C.LABEL);
    doc.text(L.planIntro, ML, y + 12.6);
    y += PLAN_TITLE_H + 6;

    // Başlık bandı — pozisyon tablosunun bandıyla AYNI biçim.
    drawBandHeader(doc, y, ML, CONTENT_W, PLAN_HEAD_H);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_HEADER);
    doc.setTextColor(...C.NAVY);
    const headY = y + PLAN_HEAD_H / 2 + 1.3;
    doc.text(L.planStage, ML + 3, headY);
    if (showDue) doc.text(L.planDue, PLAN_C_DUE, headY);
    doc.text(L.planShare, PLAN_C_SHARE_R, headY, { align: 'right' });
    doc.text(L.planAmount, PLAN_C_AMOUNT_R, headY, { align: 'right' });
    y += PLAN_HEAD_H;

    stages.forEach((stage, index) => {
        if (index % 2 === 1) {
            doc.setFillColor(...C.ZEBRA);
            doc.rect(ML, y, CONTENT_W, PLAN_ROW_H, 'F');
        }
        const baseY = y + PLAN_ROW_H / 2 + 1.3;
        const amount = (grand * Number(stage.percent)) / 100;

        doc.setFont(FONT, 'bold');
        doc.setFontSize(FS_BASE);
        doc.setTextColor(...C.TEXT);
        doc.text(`${index + 1}. ${L.planStage}`, ML + 3, baseY);

        if (showDue) {
            doc.setFont(FONT, 'normal');
            doc.setTextColor(...C.LABEL);
            doc.text(fmtPlanDate(stage.date) || '—', PLAN_C_DUE, baseY);
        }

        doc.setFont(FONT, 'normal');
        doc.setTextColor(...C.TEXT);
        doc.text(fmtStagePercent(Number(stage.percent)), PLAN_C_SHARE_R, baseY, { align: 'right' });
        doc.setFont(FONT, 'bold');
        doc.text(fmt(amount), PLAN_C_AMOUNT_R, baseY, { align: 'right' });

        drawRowHairline(doc, y + PLAN_ROW_H);
        y += PLAN_ROW_H;
    });

    // Kapanış satırı: taksitlerin toplamı = belgenin genel toplamı.
    doc.setFillColor(...C.BAND_BG);
    doc.rect(ML, y, CONTENT_W, PLAN_ROW_H + 1, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_BASE + 0.4);
    doc.setTextColor(...C.NAVY);
    const totalY = y + (PLAN_ROW_H + 1) / 2 + 1.4;
    doc.text(L.planTotal, ML + 3, totalY);
    doc.text(
        fmtStagePercent(stages.reduce((sum, stage) => sum + Number(stage.percent), 0)),
        PLAN_C_SHARE_R, totalY, { align: 'right' },
    );
    doc.text(fmt(grand), PLAN_C_AMOUNT_R, totalY, { align: 'right' });
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...C.TEXT);

    return y + PLAN_ROW_H + 1;
}

/**
 * "30" → "30,00 %". Ondalık ayıracı KOMŞU "Betrag" sütunuyla aynı olmalı
 * (`fmtMoneyForCurrency` de-DE kullanır), yoksa aynı satırda "30.00 %" ile
 * "17.732,37" yan yana düşer.
 */
const fmtStagePercent = (value: number) =>
    `${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)} %`;

/** Taksit vadesi ISO gün olarak durur; belgede 31.12.2026 biçiminde yazılır. */
const fmtPlanDate = (date?: string | null): string => {
    if (!date) return '';
    const [year, month, day] = String(date).slice(0, 10).split('-');
    return year && month && day ? `${day}.${month}.${year}` : String(date);
};

// ─────────────────────────────────────────────────────────────────────────────
// QR Fatura (Swiss QR-Bill) — klasik şablonla birebir; antet/alt bilgi almaz
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `"Steinrebenstrasse 156\n4153 Reinach"` gibi bir serbest adres bloğunu QR
 * faturasının beklediği yapılandırılmış alanlara ayırır: "PLZ Ort" satırı posta
 * kodu + şehir olur, kalan ilk satır sokak satırıdır.
 */
function splitPostalAddress(address: string | null | undefined): { line1: string; postalCode: string; city: string } {
    const lines = (address || '')
        .split(/\r?\n|,/)
        .map((line) => line.trim())
        .filter(Boolean);
    let postalCode = '';
    let city = '';
    const rest: string[] = [];
    for (const line of lines) {
        const m = line.match(/^(?:CH[-\s])?(\d{4,6})\s+(.+)$/i);
        if (m && !postalCode) {
            postalCode = m[1];
            city = m[2];
        } else {
            rest.push(line);
        }
    }
    return { line1: rest.join(', '), postalCode, city };
}

/** QR'ın ortasına bindirilen İsviçre haçı — siyah kare içinde beyaz artı. */
function drawSwissCross(doc: jsPDF, cx: number, cy: number) {
    const box = 7;            // 7×7 mm — SIX şartnamesindeki logo ölçüsü
    const pad = 0.35;         // haçı QR modüllerinden ayıran beyaz çerçeve
    const armLen = 4.6;
    const armW = 1.4;
    doc.setFillColor(255, 255, 255);
    doc.rect(cx - box / 2 - pad, cy - box / 2 - pad, box + pad * 2, box + pad * 2, 'F');
    doc.setFillColor(0, 0, 0);
    doc.rect(cx - box / 2, cy - box / 2, box, box, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(cx - armW / 2, cy - armLen / 2, armW, armLen, 'F');
    doc.rect(cx - armLen / 2, cy - armW / 2, armLen, armW, 'F');
}

async function appendQrBillPage(doc: jsPDF, data: TenderPdfData, s: PdfCompanySettings, L: PdfStrings) {
    doc.addPage();

    const yTop = PAGE_H - 105;

    doc.setDrawColor(120, 120, 120);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(0, yTop, PAGE_W, yTop);
    doc.line(62, yTop, 62, PAGE_H);
    doc.setLineDashPattern([], 0);

    const amount = data.grandTotal;
    // İsviçre QR faturası yalnızca CHF/EUR için geçerlidir; diğer para
    // birimlerinde QR kısmı CHF'ye düşer ki kod taranabilir kalsın.
    const qrCurrency: 'CHF' | 'EUR' = s.currency === 'EUR' ? 'EUR' : 'CHF';

    // Borçlu (Zahlbar durch): fatura yolundan yapılandırılmış gelir; teklif
    // yolunda müşteri adresi satırlarından ayrıştırılır. PLZ + şehir olmadan
    // yapılandırılmış borçlu GEÇERSİZ olur ve kod taranmaz — o durumda borçlu
    // bloğu boş bırakılır (ödeyen elle doldurur), kod geçerli kalır.
    const parsed = splitPostalAddress(data.customerAddress);
    const debtor = (data.qrDebtor?.postalCode && data.qrDebtor.city)
        ? data.qrDebtor
        : (data.customerName && parsed.postalCode && parsed.city)
            ? {
                name: data.customerName,
                addressLine1: parsed.line1,
                addressLine2: '',
                postalCode: parsed.postalCode,
                city: parsed.city,
                country: 'CH',
            }
            : null;

    const additionalInfo = (data.qrAdditionalInfo || '').trim()
        || `${data.docTitle || L.offerTitle} ${data.tenderNumber}`;

    const payload = buildQrBillPayload({
        iban: s.iban,
        creditorName: s.companyName,
        creditorAddressLine1: s.addressLine1,
        creditorAddressLine2: s.addressLine2,
        creditorPostalCode: s.postalCode,
        creditorCity: s.city,
        creditorCountry: s.country,
        amount,
        currency: qrCurrency,
        debtorName: debtor?.name,
        debtorAddressLine1: debtor?.addressLine1 || '',
        debtorAddressLine2: debtor?.addressLine2 || '',
        debtorPostalCode: debtor?.postalCode || '',
        debtorCity: debtor?.city || '',
        debtorCountry: debtor?.country || 'CH',
        referenceType: data.referenceNumber ? 'SCOR' : 'NON',
        reference: data.referenceNumber || '',
        unstructuredMessage: additionalInfo,
    });

    const QR_X = 67;
    const QR_Y = yTop + 11;
    const QR_SIZE = 46;
    try {
        const qrDataUrl = await QRCode.toDataURL(payload, {
            errorCorrectionLevel: 'M',
            margin: 0,
            width: 500,
        });
        doc.addImage(qrDataUrl, 'PNG', QR_X, QR_Y, QR_SIZE, QR_SIZE);
    } catch {
        doc.setDrawColor(0);
        doc.rect(QR_X, QR_Y, QR_SIZE, QR_SIZE);
    }
    // İsviçre haçı QR'ın tam ortasına bindirilir (hata düzeltme payı bunu taşır).
    drawSwissCross(doc, QR_X + QR_SIZE / 2, QR_Y + QR_SIZE / 2);

    doc.setFont(FONT, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(L.qrReceipt, 5, yTop + 7);
    doc.text(L.qrPaymentPart, QR_X, yTop + 7);

    // Etiket + değer satırları — makbuz 6/8 pt, ödeme bölümü 8/10 pt yerine
    // şartnamenin kompakt ölçüleri (başlık 6/8, değer 8/10 yaklaşık).
    const writeLabel = (text: string, x: number, y: number, size = 6) => {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(size);
        doc.text(text, x, y);
    };
    const writeLines = (lines: string[], x: number, y: number, size = 8, lineH = 3.5): number => {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(size);
        let yy = y;
        for (const line of lines.filter(Boolean)) {
            doc.text(line, x, yy);
            yy += lineH;
        }
        return yy;
    };

    const creditorLines = [
        formatIban(s.iban),
        s.companyName,
        `${s.addressLine1} ${s.addressLine2}`.replace(/\s+/g, ' ').trim(),
        `${s.postalCode} ${s.city}`,
    ];
    const debtorLines = debtor
        ? [
            debtor.name,
            `${debtor.addressLine1 || ''} ${debtor.addressLine2 || ''}`.replace(/\s+/g, ' ').trim(),
            `${debtor.postalCode || ''} ${debtor.city || ''}`.trim(),
        ]
        : [];

    // ── Empfangsschein (sol) ────────────────────────────────────────────────
    writeLabel(L.qrAccountPayableTo, 5, yTop + 12);
    let ry = writeLines(creditorLines, 5, yTop + 15.5);
    if (debtorLines.length > 0) {
        ry += 3;
        writeLabel(L.qrPayableBy, 5, ry);
        writeLines(debtorLines, 5, ry + 3.5);
    }
    writeLabel(L.qrCurrency, 5, yTop + 68);
    writeLabel(L.qrAmount, 25, yTop + 68);
    writeLines([qrCurrency], 5, yTop + 72);
    writeLines([amount.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })], 25, yTop + 72);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(6);
    doc.text(L.qrAcceptancePoint, 57, yTop + 82, { align: 'right' });

    // ── Zahlteil (QR altı: para birimi + tutar) ─────────────────────────────
    writeLabel(L.qrCurrency, QR_X, yTop + 70);
    writeLabel(L.qrAmount, QR_X + 20, yTop + 70);
    writeLines([qrCurrency], QR_X, yTop + 74);
    writeLines([amount.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })], QR_X + 20, yTop + 74);

    // ── Zahlteil sağ bilgi sütunu ───────────────────────────────────────────
    const infoX = 118;
    writeLabel(L.qrAccountPayableTo, infoX, yTop + 12);
    let iy = writeLines(creditorLines, infoX, yTop + 15.5);
    if (data.referenceNumber) {
        iy += 3;
        writeLabel(L.qrReference, infoX, iy);
        iy = writeLines([formatReference(data.referenceNumber)], infoX, iy + 3.5);
    }
    iy += 3;
    writeLabel(L.qrAdditionalInfo, infoX, iy);
    iy = writeLines([additionalInfo], infoX, iy + 3.5);
    if (debtorLines.length > 0) {
        iy += 3;
        writeLabel(L.qrPayableBy, infoX, iy);
        writeLines(debtorLines, infoX, iy + 3.5);
    }
}

function downloadPdf(bytes: Uint8Array, filename: string) {
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
