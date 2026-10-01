/**
 * ── SATIN ALMA SİPARİŞİ PDF ŞABLONU ─────────────────────────────────────────
 * Tedarikçiye giden sipariş belgesi (Bestellung). Twin von `priceRequestPdf.ts`
 * — Masse und Toene gemeinsam ändern.
 *
 * DAS BLATT WIE DIE OFFERTE (29.09.2026 abends, Vorgabe Samet: «direkt
 * teklifteki gibi yap — satırları, kartları, her şeyi — sipariş formunda da»,
 * und dazu: «sadece tasarımsal olarak benzer olacak ama uzun metinlere,
 * fiyatlara ve 8–9 sütun adına dayanıklı olmalı»):
 *  - Briefkopf, Raster, Töne und Schrift der Offerte (`supplierPdfKit` → OFFER).
 *  - LINKS die Belegkarte der Offerte (getöntes Kopfband mit der Nummer,
 *    Navy-Streifen, Haarlinien): Bestell-Nr. · Projekt-Nr./Kommission · Datum ·
 *    Revision · Ihre Offerte · Besteller. RECHTS Absenderzeile und Anschrift.
 *  - Titel «Bestellung BE-… (Rev. n)» mit dem kurzen roten Strich; darunter
 *    die Revisionskarte und das Anschreiben, wenn es sie gibt.
 *  - Tabelle wie die Offerte (getöntes Kopfband, Zebra, fette Namen), aber mit
 *    den Spalten DER VORLAGE und dem messenden Layout: lange Namen und Werte
 *    brechen um, Titel werden zweizeilig, Zahlen brechen nie.
 *  - Summen wie die Offerte (GESAMT-Band), links daneben die Hinweiskarte.
 *  - Kein Gruss am Schluss (29.09.2026: «Freundliche Grüsse … sil»).
 */
import { jsPDF } from 'jspdf';
import { companySenderLine } from './addressBlock';
import type { PdfCompanySettings } from '../../store/pdfSettingsStore';
import type { PurchaseOrderRow } from '../../types/inventory';
import { resolveSupplierPdfColumns, type SupplierPdfColumn } from './supplierPdfColumns';
import { itemDisplayNetPrice } from '../../pages/inventory/utils/orderPricing';

import {
    OFFER,
    SUPPLIER_FONT,
    drawOfferBand,
    drawOfferFooter,
    drawOfferHeader,
    drawOfferInfoCard,
    drawOfferNoteCard,
    drawOfferRecipient,
    drawOfferTitle,
    drawOfferTotals,
    fmtDocDate,
    loadOfferLogo,
    loadOfferWave,
    measureOfferNoteCard,
    offerTotalsHeight,
    registerSupplierFonts,
    titleCaption,
} from './supplierPdfKit';
import { localizePurchaseCode } from '@/utils/purchaseCode';
import { isProductionColumns, localizeProductionCells } from '@/utils/standardOrderColumns';
import { purchaseCommissionOf, purchaseProjectOf } from '@/utils/purchaseProject';

export type OrderPdfLang = 'tr' | 'de' | 'en';

interface OrderPdfStrings {
    docTitle: string;
    orderNumber: string;
    orderDate: string;
    orderedBy: string;
    quoteNumber: string;
    project: string;
    /** Die Projektnummer — eine eigene Zeile neben der Kommission (29.09.2026). */
    projectNumber: string;
    supplier: string;
    /** Vor dem Namen des Empfängers in der Anschrift («z. Hd.»). */
    attention: string;
    greeting: string;
    intro: string;
    /** HINWEISE unter der Tabelle (29.09.2026): Überschrift und Punkte; `{number}`
        = Bestellnummer, `{commission}` = `notesCommission` oder nichts. */
    notesTitle: string;
    notes: string[];
    notesCommission: string;
    /** Statt der Kommission: die Projektnummer (29.09.2026) — `{p}`. */
    notesProject: string;
    /** Der Gruss am Schluss («Freundliche Grüsse»). */
    regards: string;
    /** Überschrift des Informationsblocks links («Bestellangaben»). */
    infoCaption: string;
    colPos: string;
    colDesc: string;
    colCode: string;
    colQty: string;
    colGrossPrice: string;
    colNetPrice: string;
    colPrice: string;
    colDiscount: string;
    colVat: string;
    gross: string;
    discount: string;
    netSubtotal: string;
    vat: string;
    grandTotal: string;
    pageWord: string;
    pageOf: string;
    serialShort: string;
    /** Kapak kartındaki ALICI ADI satırının etiketi (Empfänger). */
    recipient: string;
    /** BOM-Revision der Bestellung (27.09.2026): Kartenzeile, Zeilenhinweis, entfernte Positionen. */
    revision: string;
    revisionWas: string;
    revisionRemoved: string;
    /** REVIDIERTE BESTELLUNG (29.09.2026): der Hinweis unter dem Titel (`{orderDate}` =
        Datum der Bestellung) und die Überschrift der Änderungstabelle am Schluss. */
    revisionText: string;
    changesTitle: string;
    /** Die Änderungstabelle einer Revision (Kopf, bereits geliefert, Art der Änderung). */
    changeBefore: string;
    changeAfter: string;
    changeKind: string;
    changeReceived: string;
    changeKinds: Record<'added' | 'removed' | 'increased' | 'decreased' | 'edited', string>;
}

const I18N: Record<OrderPdfLang, OrderPdfStrings> = {
    tr: {
        docTitle: 'Sipariş',
        // Sipariş numarasının etiketi ARTIK DİLE GÖRE ÇEVRİLİR (kullanıcı isteği
        // 2026-08-02 — önceden tüm dillerde Almanca belge adı kalıyordu).
        // Numara BE-{yıl}-{sıra} biçimindedir (BE-2026-001).
        orderNumber: 'Sipariş No',
        orderDate: 'Sipariş Tarihi',
        orderedBy: 'Sipariş veren',
        quoteNumber: 'Teklif Numaranız',
        project: 'Komisyon',
        projectNumber: 'Proje No',
        supplier: 'Tedarikçi',
        attention: 'Dikkatine:',
        notesTitle: 'Bilgilendirme',
        notes: [
            'Lütfen bu siparişi bağlayıcı teslim tarihiyle birlikte yazılı olarak onaylayınız.',
            'Lütfen irsaliye ve faturada sipariş numaramızı ({number}){commission} belirtiniz.',
            'Fiyat, miktar, özellik veya teslim tarihinde bir sapma olursa lütfen teslimattan önce bize bildiriniz.',
            'Genel İşlem Koşullarımız (AGB) geçerlidir: offitec.ch/agb',
        ],
        notesCommission: ' ve «{c}» komisyonunu',
        notesProject: ' ve {p} proje numaramızı',
        regards: 'Saygılarımızla',
        infoCaption: 'Sipariş bilgileri',
        colPos: 'Poz.',
        greeting: 'Sayın Yetkili,',
        intro: 'Siparişimizi bilgilerinize sunarız. Sipariş edilen pozisyonlara, miktarlara ve spesifikasyonlara ilişkin ayrıntılı bilgileri lütfen aşağıdaki siparişten veya ekli belgeden alınız.\n\nSizden yazılı bir sipariş onayı (AB) ile bağlayıcı veya öngörülen teslim tarihinin bildirilmesini rica ederiz. Tek tek pozisyonların sipariş edildiği şekilde teslim edilememesi ya da fiyat, miktar, spesifikasyon veya teslim tarihi bakımından sapmaların bulunması hâlinde, siparişin ifasından önce tarafımıza bilgi verilmesini rica ederiz.\n\nTarafınızdan aksi yönde bir geri bildirim almadığımız sürece, siparişin siparişimizde belirtilen koşullarla yerine getirileceğini varsayarız.\n\nBu siparişe ilişkin tüm yazışmalarda lütfen sipariş numaramızı belirtiniz.\n\nGenel İşlem Koşullarımız (AGB) siparişimizin ayrılmaz bir parçasıdır ve sözleşme ilişkisi için geçerlidir. Güncel AGB\'ye https://offitec.ch/agb adresinden ulaşabilirsiniz. Tedarikçinin aykırı veya farklı koşulları, yalnızca açıkça ve yazılı olarak onayladığımız takdirde geçerlidir.\n\nİlginiz için teşekkür eder, sorunsuz bir süreç dileriz.\n\nSaygılarımızla\nOffiTec Ekibi',
        colDesc: 'Ürün / Malzeme',
        colCode: 'Seri Kod',
        colQty: 'Miktar',
        colGrossPrice: 'Birim Fiyat',
        colNetPrice: 'Net Fiyat',
        colPrice: 'Tutar',
        colDiscount: 'İndirim',
        colVat: 'KDV',
        gross: 'Brüt Tutar',
        discount: 'İndirim',
        netSubtotal: 'Ara Toplam (Net)',
        vat: 'KDV',
        grandTotal: 'TOPLAM',
        pageWord: 'Sayfa',
        pageOf: '/',
        serialShort: 'Seri No',
        recipient: 'Alıcı',
        revision: 'Revizyon',
        revisionWas: 'Rev. {n} ile değişti — önceki: {before}',
        revisionRemoved: 'Revizyon {n} ile iptal edilen pozisyonlar',
        revisionText: 'Bu sürüm, {orderDate} tarihli siparişimizin yerine geçer. Yalnızca aşağıda «Değişiklikler» başlığı altında listelenen pozisyonlar değişmiştir; diğer tüm pozisyonlar ve koşullar aynen geçerlidir. Değişiklikleri yazılı olarak onaylamanızı ve teslim tarihine olası etkilerini bize bildirmenizi rica ederiz.',
        changesTitle: 'Değişiklikler',
        changeBefore: 'Önceki',
        changeAfter: 'Yeni',
        changeKind: 'Değişiklik',
        changeReceived: 'teslim alınan: {q}',
        changeKinds: { added: 'Yeni pozisyon', removed: 'İptal edildi', increased: 'Artırıldı', decreased: 'Azaltıldı', edited: 'Birim değişti' },
    },
    de: {
        // BELGE ALMANCADA "BESTELLUNG"DUR (kullanıcı isteği 2026-08-03; arada
        // denenen "Auftrag" geri alındı): başlık satırı "Bestellung BE-2026-001"
        // olarak basılır. Diğer dillerde belge adı kendi dilindedir
        // (Sipariş / Purchase Order).
        docTitle: 'Bestellung',
        orderNumber: 'Bestell-Nr.',
        orderDate: 'Bestelldatum',
        orderedBy: 'Besteller',
        quoteNumber: 'Ihre Offerte',
        project: 'Kommission',
        projectNumber: 'Projekt-Nr.',
        supplier: 'Lieferant',
        attention: 'z. Hd.',
        notesTitle: 'Hinweise',
        notes: [
            'Bitte bestätigen Sie uns diese Bestellung schriftlich mit dem verbindlichen Liefertermin.',
            'Bitte geben Sie auf Lieferschein und Rechnung unsere Bestellnummer {number}{commission} an.',
            'Abweichungen bei Preis, Menge, Ausführung oder Liefertermin melden Sie uns bitte vor der Auslieferung.',
            'Es gelten unsere Allgemeinen Geschäftsbedingungen: offitec.ch/agb',
        ],
        notesCommission: ' sowie die Kommission «{c}»',
        notesProject: ' sowie die Projektnummer {p}',
        regards: 'Freundliche Grüsse',
        infoCaption: 'Bestellangaben',
        colPos: 'Pos.',
        greeting: 'Sehr geehrte Damen und Herren',
        intro: 'Hiermit erhalten Sie unsere Bestellung. Die detaillierten Angaben zu den bestellten Positionen, Mengen und Spezifikationen entnehmen Sie bitte der nachfolgenden Bestellung bzw. dem beigefügten Dokument.\n\nWir bitten Sie um eine schriftliche Auftragsbestätigung (AB) sowie um Mitteilung des verbindlichen bzw. voraussichtlichen Liefertermins. Sollten einzelne Positionen nicht wie bestellt lieferbar sein oder Abweichungen bezüglich Preis, Menge, Spezifikation oder Liefertermin bestehen, bitten wir um entsprechende Mitteilung vor Ausführung der Bestellung.\n\nSofern wir von Ihnen keine anderslautende Rückmeldung erhalten, gehen wir davon aus, dass die Bestellung zu den in unserer Bestellung aufgeführten Konditionen ausgeführt wird.\n\nBitte geben Sie bei sämtlicher Korrespondenz zu dieser Bestellung unsere Bestellnummer an.\n\nUnsere Allgemeinen Geschäftsbedingungen (AGB) sind Bestandteil unserer Bestellung und gelten für das Vertragsverhältnis. Die jeweils gültigen AGB finden Sie unter https://offitec.ch/agb. Entgegenstehende oder abweichende Geschäftsbedingungen des Lieferanten gelten nur, wenn wir diesen ausdrücklich und schriftlich zugestimmt haben.\n\nWir danken Ihnen für die Bearbeitung und freuen uns auf eine reibungslose Abwicklung.\n\nFreundliche Grüsse\nDas OffiTec Team',
        colDesc: 'Produkt / Material',
        colCode: 'Seriencode',
        colQty: 'Menge',
        colGrossPrice: 'Einzelpreis',
        colNetPrice: 'Nettopreis',
        colPrice: 'Betrag',
        colDiscount: 'Rabatt',
        colVat: 'MwSt',
        gross: 'Bruttobetrag',
        discount: 'Rabatt',
        netSubtotal: 'Zwischensumme (Netto)',
        vat: 'MwSt',
        grandTotal: 'GESAMT',
        pageWord: 'Seite',
        pageOf: 'von',
        serialShort: 'Serien-Nr.',
        recipient: 'Empfänger',
        revision: 'Revision',
        revisionWas: 'Geändert mit Rev. {n} — bisher: {before}',
        revisionRemoved: 'Mit Revision {n} stornierte Positionen',
        revisionText: 'Diese Fassung ersetzt unsere Bestellung vom {orderDate}. Geändert sind nur die Positionen, die unten unter «Änderungen» aufgeführt sind; alle übrigen Positionen und Konditionen bleiben unverändert gültig. Bitte bestätigen Sie uns die Änderungen schriftlich und teilen Sie uns allfällige Auswirkungen auf den Liefertermin mit.',
        changesTitle: 'Änderungen',
        changeBefore: 'Bisher',
        changeAfter: 'Neu',
        changeKind: 'Änderung',
        changeReceived: 'bereits geliefert: {q}',
        changeKinds: { added: 'Neue Position', removed: 'Entfällt', increased: 'Erhöht', decreased: 'Reduziert', edited: 'Einheit geändert' },
    },
    en: {
        docTitle: 'Purchase Order',
        orderNumber: 'Order no.',
        orderDate: 'Order date',
        orderedBy: 'Ordered by',
        quoteNumber: 'Your quotation',
        project: 'Commission',
        projectNumber: 'Project no.',
        supplier: 'Supplier',
        attention: 'Attn.',
        notesTitle: 'Notes',
        notes: [
            'Please confirm this order in writing together with the binding delivery date.',
            'Please quote our order number {number}{commission} on the delivery note and invoice.',
            'Please notify us of any deviation in price, quantity, specification or delivery date before shipment.',
            'Our General Terms and Conditions apply: offitec.ch/agb',
        ],
        notesCommission: ' and the commission “{c}”',
        notesProject: ' and the project number {p}',
        regards: 'Kind regards',
        infoCaption: 'Order details',
        colPos: 'Pos.',
        greeting: 'Dear Sir or Madam,',
        intro: 'Please find our purchase order enclosed. For detailed information on the ordered positions, quantities and specifications, please refer to the following order or the attached document.\n\nWe kindly ask you for a written order confirmation as well as notification of the binding or expected delivery date. Should individual positions not be available as ordered, or should there be any deviations regarding price, quantity, specification or delivery date, please inform us before executing the order.\n\nUnless we receive notice to the contrary from you, we assume that the order will be executed under the conditions stated in our purchase order.\n\nPlease quote our order number in all correspondence relating to this order.\n\nOur General Terms and Conditions (GTC) form an integral part of our order and govern the contractual relationship. The current version is available at https://offitec.ch/agb. Conflicting or deviating terms of the supplier apply only if we have expressly agreed to them in writing.\n\nThank you for processing our order — we look forward to a smooth handling.\n\nKind regards\nThe OffiTec Team',
        colDesc: 'Product / Material',
        colCode: 'Serial Code',
        colQty: 'Quantity',
        colGrossPrice: 'Unit Price',
        colNetPrice: 'Net Price',
        colPrice: 'Amount',
        colDiscount: 'Discount',
        colVat: 'VAT',
        gross: 'Gross Amount',
        discount: 'Discount',
        netSubtotal: 'Subtotal (Net)',
        vat: 'VAT',
        grandTotal: 'TOTAL',
        pageWord: 'Page',
        pageOf: 'of',
        serialShort: 'Serial No.',
        recipient: 'Recipient',
        revision: 'Revision',
        revisionWas: 'Changed in rev. {n} — previously: {before}',
        revisionRemoved: 'Items cancelled in revision {n}',
        revisionText: 'This version replaces our purchase order of {orderDate}. Only the items listed below under “Changes” have changed; all other items and conditions remain unchanged. Please confirm the changes in writing and let us know of any impact on the delivery date.',
        changesTitle: 'Changes',
        changeBefore: 'Previous',
        changeAfter: 'New',
        changeKind: 'Change',
        changeReceived: 'already delivered: {q}',
        changeKinds: { added: 'New item', removed: 'Cancelled', increased: 'Increased', decreased: 'Reduced', edited: 'Unit changed' },
    },
};

// ── Sayfa geometrisi (A4, mm) — priceRequestPdf ile birebir ──────────────────
/* Die Raender sind seit dem 09.09.2026 zwei Millimeter schmaler (Vorgabe
   Samet: «margini azaltin, ama sigmali ve duezguen durmali»): 12 statt 14 mm
   links, 198 statt 196 mm rechts — vier Millimeter mehr fuer die Tabelle,
   ohne dass ein Drucker etwas abschneidet. */
/* Seit dem 29.09.2026 abends das Raster der Offerte (ML 14 · MR 196). */
const ML = OFFER.ML;
const MR = OFFER.MR;
const CONTENT_W = MR - ML;
const PT_MM = 25.4 / 72;

/** Tabellenkopf der Folgeseiten und unterste Zeilenkante — wie die Offerte (Seite 1 setzt der Baukasten). */
const CONTENT_TOP_REST = OFFER.CONTENT_TOP_REST;
const CONTENT_BOTTOM = OFFER.CONTENT_BOTTOM;
/**
 * ÖN YAZI (Anschreiben) sayfa taşırmamalıdır: EN GEÇ bu çizgide biter.
 * Satır tavanı SABİT DEĞİLDİR: kalan boşluğa kaç satır sığıyorsa o kadar
 * basılır, fazlası sessizce kırpılır (standart ön yazı ~25 satırdır ve sığar).
 */
const COVER_LETTER_BOTTOM = CONTENT_BOTTOM;
/** So viel Platz muss unter dem Anschreiben bleiben, damit die Tabelle auf Seite 1 beginnt. */
const TABLE_START_MIN = 70;
/** Von der letzten Zeile des Anschreibens bis zum Tabellenkopf. */
const TABLE_GAP = 7;

/* Die Tabelle wie die Offerte (29.09.2026 abends): kein Rahmen, der Kopf im
   getönten Band, die Zeilen im Zebra, dazwischen Haarlinien. Pos 1.5 mm vom
   Rand, der Betrag endet 1 mm vor dem rechten Rand — wie dort. */
const C_POS_X = ML + 1.5;
/* Die Pos-Spalte trägt ihren Titel («Pos») — 11 mm wie die Offerte. */
const C_DESC = ML + 11;
const C_PRICE_R = OFFER.PRICE_R;
/* Der Produktname FETT wie die Positionstitel der Offerte (9.4 pt bei 9 pt Tabelle). */
const NAME_STYLE = 'bold' as const;
const nameSizeOf = (fs: number): number => fs + 0.4;

// Es gibt KEINE festen Spaltenbreiten mehr (09.09.2026): `buildTableLayout`
// misst Titel und Werte und teilt das Blatt danach auf — siehe dort.

/**
 * ── DIE EIGENEN SPALTEN IM PDF (07.09.2026, Vorgabe Samet) ─────────────────
 * «Wir nehmen sie als feste Spalten RECHTS NEBEN den Produktnamen — nicht
 *  darunter —, insgesamt drei.»
 *
 * Sie schneiden ihre Breite vom BESCHREIBUNGSFELD ab, denn rechts ist kein
 * Platz mehr: dort stehen Menge, Preise, Rabatt und Betrag mit festen Massen.
 *
 * DIE GRENZE, die das Blatt lesbar hält: die Beschreibung behält mindestens
 * `DESC_MIN_W` Millimeter. Reicht es für alle drei nicht, werden so viele
 * gezeichnet, wie hineinpassen; der Rest wandert in die kleine Zeile unter den
 * Namen — dort, wo sie vorher alle standen. Lieber eine Angabe eine Zeile
 * tiefer als ein Produktname, von dem drei Buchstaben übrig sind.
 */
const DESC_MIN_W = 28;
/** Bis hierhin waechst die Beschreibung, BEVOR die Titel in eine Zeile kommen (Referenz: 60 mm). */
const DESC_FLOOR_W = 64;

/** Eine gezeichnete Spalte: ihre Rolle, ihre linke Kante, ihr Mass. */
interface LayoutCell {
    column: SupplierPdfColumn;
    /** Linke Kante (mm). */
    x: number;
    /** Breite SAMT dem Abstand `GAP` zur naechsten Spalte. */
    width: number;
    /** Zahlen (Menge, Preise, eine rein numerische eigene Spalte) stehen rechtsbuendig. */
    align: 'left' | 'right';
}

interface TableLayout {
    /** Alle Spalten von links nach rechts — in der Reihenfolge der Vorlage. */
    cells: LayoutCell[];
    /** Linke Kante und rechtes Ende der Beschreibung (Produktname). */
    descX: number;
    descEnd: number;
    /** Die EINE Schrift der Tabelle (pt) und ihr Zeilenabstand (mm). */
    fs: number;
    lh: number;
    /** Luft zwischen zwei Spalten und Schrift der Titel — aus der Dichtestufe. */
    gap: number;
    headFs: number;
}


/* ═══════════════════════════════════════════════════════════════════════════
   DIE SPALTEN RICHTEN SICH NACH IHREM INHALT (Vorgabe Samet, 09.09.2026)

   «In den PDFs schrumpft es: manche Spaltentitel winzig, andere riesig. So
    nicht. Wenn es sein muss, untereinander — aber versuch NIE, den Code unter
    den Produktnamen zu schieben, um Platz zu sparen. Was wo ist, bleibt wo es
    ist. Notfalls mehrzeilig, die Tabelle darf wachsen, der Rand darf kleiner
    werden — aber es muss passen und ordentlich stehen.»

   Bis heute hatte jede Spalte ein FESTES Mass (19 mm Nettopreis, 22 mm Code …)
   und drei Auswege, wenn der Inhalt nicht passte: kleiner drucken
   (`fitFontSize`), abschneiden («…») oder unter den Namen schieben. Alle drei
   sind jetzt weg. Stattdessen wird gemessen:

     · Jede Spalte braucht MINDESTENS ihr laengstes einzelnes Wort — Titel
       oder Wert, in der Schrift, in der es gedruckt wird. Unter dieses Mass
       faellt sie nie; darum bricht kein Wort mehr in der Mitte.
     · Was nach den Mindestmassen uebrig ist, teilen sich die Spalten im
       Verhaeltnis ihres VOLLEN Textes (Titel + laengster Wert), gedeckelt bei
       dem, was sie ganz ausschreiben koennte. Die Beschreibung bekommt den
       Rest — sie ist die einzige Spalte, die von Natur aus umbricht.
     · Reicht das Blatt nicht einmal fuer die Mindestmasse, wird ein
       spaceloser Code (kein Wort, eine Zeichenkette) an seinen Bindestrichen
       geteilt — sonst nichts. Ein echtes Wort wird nie zerschnitten.

   Ein Wert, der breiter ist als seine Spalte, bricht dort UM (siehe
   `cellLines`), und `measureRow` macht die Zeile so hoch wie ihre hoechste
   Zelle. Die Zahlenspalten sind davon ausgenommen: eine Zahl bricht nicht um,
   sie bekommt ihr Mass gleich hier.
   ═════════════════════════════════════════════════════════════════════════ */

/** Laengstes einzelnes Wort eines Textes, in mm bei der gegebenen Schrift. */
const widestWord = (doc: jsPDF, text: string, style: 'normal' | 'bold', size: number): number => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    // Der Nullbreiten-Trenner aus `breakableCode` ist ein Umbruchpunkt — auch
    // beim Messen, sonst zaehlt ein Code mit Bindestrichen als ein Wort.
    return Math.max(0, ...text.split(/[\s\u200b]+/).filter(Boolean).map((word) => doc.getTextWidth(word)));
};

/** Voller Text in einer Zeile, in mm. */
const fullWidth = (doc: jsPDF, text: string, style: 'normal' | 'bold', size: number): number => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    // Der Nullbreiten-Trenner aus `breakableCode` ist im Druck unsichtbar —
    // gemessen als Glyphe waere er eine ganze Breite (die Spalte wuchs dadurch
    // auf 40 mm statt 26).
    return doc.getTextWidth(text.replace(/\u200b/g, ''));
};

/* Spaltentitel stehen in GROSSBUCHSTABEN, leicht gesperrt (Referenz): ihre
   Breite ist die der Glyphen plus `CAPTION_SPACING` je Zeichen. */
const captionWidth = (doc: jsPDF, text: string, size: number): number => {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(size);
    return doc.getTextWidth(text) + CAPTION_SPACING * text.length;
};

/* ── EIN TITEL BRICHT AN SEINER FUGE, MIT TRENNSTRICH (Referenz-PDF) ────────
   «PRODUKTTYP-» / «NUMMER», «GESAMT-» / «MENGE»: so schmal wie ihre Werte
   duerfen die Spalten werden — der Titel folgt. Die Fuge findet sich an
   einem weichen Trennzeichen, einem Bindestrich oder vor einem bekannten
   Grundwort (`CAPTION_TAILS`); ein Wort ohne Fuge bleibt ganz. */
const CAPTION_TAILS = [
    'BESCHREIBUNG', 'BEZEICHNUNG', 'NUMMER', 'MENGE', 'LÄNGE', 'BREITE', 'HÖHE', 'TIEFE',
    'GEWICHT', 'ANZAHL', 'EINHEIT', 'BETRAG', 'RABATT', 'GRÖSSE', 'KLASSE', 'GRUPPE',
    'TERMIN', 'STÜCK', 'PREIS', 'DATUM', 'FARBE', 'SUMME', 'NAME', 'TEXT', 'WERT', 'ZEIT',
    'CODE', 'TYP', 'ART', 'NR',
];
const captionPieces = (word: string): string[] => {
    const explicit = word.split(/[\u00ad-]+/).filter(Boolean);
    if (explicit.length > 1) return explicit;
    const upper = word.toUpperCase();
    if (upper.length < 9) return [word];
    for (const tail of CAPTION_TAILS) {
        if (upper.endsWith(tail) && upper.length - tail.length >= 4) {
            const head = word.slice(0, word.length - tail.length);
            return [...captionPieces(head), word.slice(word.length - tail.length)];
        }
    }
    return [word];
};

/** Das schmalste Mass eines Titels: sein breitestes Wort — oder, bei einem
    zusammengesetzten Wort, sein breitestes Glied samt Trennstrich. */
const widestCaptionWord = (doc: jsPDF, text: string, size: number): number =>
    Math.max(0, ...text.split(/\s+/).filter(Boolean).map((word) => {
        const pieces = captionPieces(word);
        if (pieces.length === 1) return captionWidth(doc, word, size);
        return Math.max(...pieces.map((piece, index) => captionWidth(doc, piece + (index < pieces.length - 1 ? '-' : ''), size)));
    }));

/**
 * Eine spacelose Zeichenkette (Code) an ihren Trennzeichen teilen, damit sie
 * umbrechen kann. Eine lange Kette OHNE Trennzeichen («HMIP6DDB0NA0WNAN00»)
 * bekommt alle sechs Zeichen einen Umbruchpunkt — das ist kein Wort, das man
 * zerschneidet, sondern eine Nummer, die man in Gruppen liest. Ein echtes
 * Wort (ohne Ziffer) bleibt ganz. Genutzt wird der Punkt nur, wenn die
 * Spalte sonst der Beschreibung den Platz naehme (siehe `buildTableLayout`).
 */
const breakableCode = (code: string): string => code
    .replace(/([-_/.])/g, '$1\u200b')
    .replace(/(?=[A-Za-z0-9]{12,})(?=[A-Za-z]*\d)[A-Za-z0-9]{12,}/g, (run) => run.replace(/(.{6})(?=.)/g, '$1\u200b'));

type ColumnKind = 'code' | 'qty' | 'gross' | 'net' | 'disc' | 'vat' | 'price' | string;

interface MeasuredColumn {
    kind: ColumnKind;
    /** Ohne dieses Mass bricht ein Wort in der Mitte. */
    min: number;
    /** Mit diesem Mass steht alles in einer Zeile (Titel und laengster Wert). */
    full: number;
    align: 'left' | 'right';
}

const measureColumn = (
    doc: jsPDF,
    kind: ColumnKind,
    header: string,
    values: string[],
    align: 'left' | 'right',
    step: TableStep,
    valueStyle: 'normal' | 'bold' = 'normal',
): MeasuredColumn => {
    const { fs, gap } = step;
    // Der Titel darf ein wenig schrumpfen (`headerSizeFor`), bevor er die Spalte breiter macht.
    const headMin = widestCaptionWord(doc, header, step.head * CAPTION_SQUEEZE);
    const headFull = captionWidth(doc, header, step.head);
    const valueMin = Math.max(0, ...values.map((value) => widestWord(doc, value, valueStyle, fs)));
    const valueFull = Math.max(0, ...values.map((value) => fullWidth(doc, value, valueStyle, fs)));
    /* Eine Zahl ist EIN Wort: «CHF 9.514,96» darf nicht an seinem Leerzeichen
       gemessen werden, sonst bekommt die Betragsspalte nur Platz fuer die
       Ziffern. Rechtsbuendige Spalten sind Zahlen. */
    const valueNeed = align === 'right' ? valueFull : valueMin;
    // Drei Prozent Luft: `splitTextToSize` misst einen Hauch strenger als
    // `getTextWidth` und hackte sonst den letzten Buchstaben ab.
    const min = Math.max(headMin, valueNeed) * 1.03 + gap;
    return {
        kind,
        min,
        full: Math.max(min, Math.max(headFull, valueFull) * 1.03 + gap),
        align,
    };
};

/** Hebt jede Spalte anteilig Richtung `caps[i]`, soweit `spare` reicht; gibt den Rest zurueck. */
const growToward = (widths: number[], caps: number[], spare: number): number => {
    const needs = widths.map((width, index) => Math.max(0, caps[index] - width));
    const needSum = needs.reduce((sum, need) => sum + need, 0);
    if (needSum <= 0 || spare <= 0) return Math.max(0, spare);
    const share = Math.min(1, spare / needSum);
    needs.forEach((need, index) => { widths[index] += need * share; });
    return spare - needSum * share;
};

/* DIE SPALTEN KOMMEN AUS DER VORLAGE (`resolveSupplierPdfColumns`, Vorgabe
   Samet 11.09.2026): ihre Reihenfolge ist die der Liste, ihre Titel die
   Namen der Vorlage («GESAMTMENGE», nicht «Menge»). Gemessen wird wie oben
   beschrieben; die Beschreibung nimmt, was uebrig bleibt — wo immer die
   Vorlage sie hingestellt hat. */
/**
 * Die MwSt, die der Betrag JEDER Zeile enthält: bei Gesamt-MwSt sonst der
 * Satz der Bestellung. Belege der BOM (01.10.2026, Samet: «Satır Fiyatı … KDV
 * en sona»): die Zeile bleibt netto, die MwSt steht NUR unten in den Summen.
 */
const lineVatRateOf = (order: PurchaseOrderRow): number | null =>
    (order.vatMode === 'TOTAL' && !isProductionColumns(order.tableColumns) ? (order.orderVatRate || 0) : null);

const buildTableLayout = (
    doc: jsPDF,
    order: PurchaseOrderRow,
    columns: SupplierPdfColumn[],
    fmt: (value: number) => string,
): TableLayout => {
    const items = order.items ?? [];
    const names = items.map((item) => (item.name || '').trim());
    const totalVatRate = lineVatRateOf(order);
    const desc = columns.find((column) => column.kind === 'desc');
    const others = columns.filter((column) => column.kind !== 'desc');
    // Der Betrag endet an `C_PRICE_R` — sein eigener Abstand faellt dort weg.
    const roomFor = (gap: number): number => C_PRICE_R + gap - C_DESC;
    const aligns = others.map((column): 'left' | 'right' => (
        column.kind === 'extra'
            ? (columnIsNumeric(items.map((item) => extraRaw(item, column.key))) ? 'right' : 'left')
            : 'right'
    ));

    /* ── Was in jeder Spalte stehen wird — genau die Texte, die `drawRow` druckt ─ */
    const valuesOf = (column: SupplierPdfColumn, align: 'left' | 'right'): string[] => {
        switch (column.kind) {
            case 'extra':
                return align === 'right'
                    ? items.map((item) => extraRaw(item, column.key) || '—')
                    : items.map((item) => extraValue(item, column.key) || '—');
            case 'qty':
                return items.map((item) => fmtQty(item.quantity || 0));
            case 'gross':
                return items.map((item) => ((item.grossPrice || 0) > 0 ? fmtUnitPrice(item.grossPrice) : '—'));
            case 'net':
                return items.map((item) => {
                    // Tedarikçi listesindeki fiyat; tedarikçi hesabında satır indirimleri de iner.
                    const shown = itemDisplayNetPrice(item);
                    return shown > 0 ? fmtUnitPrice(shown) : '—';
                });
            case 'disc':
                return items.flatMap((item) => discountLines(item)).concat('—');
            case 'vat':
                return items.map((item) => fmtPercent(item.vatRate || 0));
            default:
                return items.map((item) => {
                    const lineVat = totalVatRate === null ? (item.lineVat || 0) : (item.lineTotal || 0) * (totalVatRate / 100);
                    return fmt(Math.round(((item.lineTotal || 0) + lineVat) * 100) / 100);
                });
        }
    };
    const measureAll = (step: TableStep): MeasuredColumn[] =>
        others.map((column, index) => measureColumn(doc, column.key, column.caption, valuesOf(column, aligns[index]), aligns[index], step));
    const descMinFor = (step: TableStep): number => Math.max(
        DESC_MIN_W,
        widestCaptionWord(doc, desc?.caption ?? '', step.head * CAPTION_SQUEEZE) * 1.03 + step.gap,
        ...names.map((name) => widestWord(doc, name, NAME_STYLE, nameSizeOf(step.fs)) * 1.03 + step.gap),
    );
    const minSumOf = (measured: MeasuredColumn[]) => measured.reduce((sum, column) => sum + column.min, 0);

    /* ── Die Dichtestufe: die erste, in der jede Spalte ihr Mindestmass bekommt.
       Sie gilt fuer die GANZE Tabelle — Titel, Namen, Werte, Abstände. ──── */
    /* 01.10.2026 (Samet: «tablo biraz daha büyük … malzeme adı sığmayan aşağı
       satıra geçsin»): eine grössere Stufe nur, wenn der Name dabei seine
       Hauptspalte behält (bis `DESC_FLOOR_W` bzw. so breit wie der längste
       Name) — sonst die erste Stufe, in der wenigstens die Mindestmasse passen. */
    const descWantFor = (candidate: TableStep): number => Math.max(
        descMinFor(candidate),
        Math.min(DESC_FLOOR_W, ...names.map((name) => fullWidth(doc, name, NAME_STYLE, nameSizeOf(candidate.fs)) * 1.03 + candidate.gap)),
    );
    const roomyStep = TABLE_STEPS.find((candidate) =>
        minSumOf(measureAll(candidate)) + descWantFor(candidate) <= roomFor(candidate.gap));
    let step: TableStep = roomyStep ?? TABLE_STEPS[TABLE_STEPS.length - 1];
    if (!roomyStep) {
        for (const candidate of TABLE_STEPS) {
            if (minSumOf(measureAll(candidate)) + descMinFor(candidate) <= roomFor(candidate.gap)) { step = candidate; break; }
        }
    }
    const { fs, gap } = step;
    const room = roomFor(gap);
    const measured = measureAll(step);
    const descMin = descMinFor(step);
    const minSum = minSumOf(measured);

    let widths: number[];
    let descW: number;
    if (minSum + descMin > room) {
        /* Selbst die kleinste Stufe traegt die Mindestmasse nicht (sechs
           breite eigene Spalten neben einem langen Produktwort). Dann gibt
           ZUERST die Beschreibung nach — bis auf ihr hartes Minimum —, und erst
           danach die TEXTSPALTEN (eigene Angaben), anteilig. Die
           Zahlenspalten geben nie nach. */
        descW = Math.max(DESC_HARD_MIN_W, room - minSum);
        const deficit = Math.max(0, minSum + descW - room);
        const textMin = measured.reduce((sum, column) => sum + (column.align === 'left' ? column.min : 0), 0);
        const textScale = textMin > 0 ? Math.max(0.4, (textMin - deficit) / textMin) : 1;
        widths = measured.map((column) => (column.align === 'left' ? column.min * textScale : column.min));
    } else {
        /* Der Rest wird in einer festen REIHENFOLGE verteilt — sie haelt die
           Tabelle im Gleichgewicht (Vorgabe Samet, 11.09.2026):
             1. die Beschreibung bis `DESC_FLOOR_W` — sie ist die Hauptspalte:
                ein Name in sieben Zeilen neben zwei 40-mm-Codespalten war
                genau das Bild, das nicht mehr vorkommen soll;
             2. jeder Titel in EINE Zeile;
             3. jeder Wert in eine Zeile («Kablo kanalları» nicht umbrochen
                neben einem Namen, der ohnehin zwei Zeilen braucht);
             4. was dann noch bleibt, bekommt die Beschreibung. */
        /* Reihenfolge nach der Referenz (Vorgabe Samet, 11.09.2026, dritte
           Runde: «die Spalten muessen sich so teilen wie dort» — nachgemessen:
           Beschreibung 60 mm, Produkttypnummer 26 mm bei 34 mm langen Codes):
             1. jede Spalte ihr Mindestmass (breitestes Wort bzw. Titel-Glied);
             2. die Beschreibung bis `DESC_FLOOR_W` (60 mm wie im Referenzblatt);
             3. der Rest an die Spalten, IM VERHAELTNIS dessen, was ihnen bis
                zur einen Zeile fehlt (Titel + laengster Wert) — ein langer
                Code bricht dann in seiner Spalte um, ein Titel an seiner Fuge
                («PRODUKTTYP-» / «NUMMER», siehe `splitCaption`);
             4. was danach noch bleibt, bekommt die Beschreibung. */
        widths = measured.map((column) => column.min);
        let spare = room - minSum - descMin;
        const descFull = Math.max(descMin, ...names.map((name) => fullWidth(doc, name, NAME_STYLE, nameSizeOf(fs)) * 1.03 + gap));
        const floorGrow = Math.min(spare, Math.max(0, Math.min(DESC_FLOOR_W, descFull) - descMin));
        spare -= floorGrow;
        spare = growToward(widths, measured.map((column) => column.full), spare);
        descW = descMin + floorGrow + spare;
    }

    /* ── Von links nach rechts aufstellen — in der Reihenfolge der Vorlage ── */
    const cells: LayoutCell[] = [];
    let x = C_DESC;
    let descX = C_DESC;
    let descEnd = C_DESC + descW - gap;
    let position = 0;
    for (const column of columns) {
        if (column.kind === 'desc') {
            descX = x;
            descEnd = x + descW - gap;
            cells.push({ column, x, width: descW, align: 'left' });
            x += descW;
            continue;
        }
        const width = widths[position];
        cells.push({ column, x, width, align: aligns[position] });
        x += width;
        position += 1;
    }
    return { cells, descX, descEnd, fs, lh: fs * LH_RATIO, gap, headFs: step.head };
};

/** Siparişte hiç seri kod / brüt fiyat / indirim / KDV var mı. */
/**
 * ── WAS DIE VORLAGE AUSGEBLENDET HAT, ZEICHNET DAS BLATT NICHT ─────────────
 * Vorgabe Samet (09.09.2026): «Haben wir im PDF, in der Tabelle, wo auch immer
 * etwas entfernt oder aufs Auge gedrueckt, darf es nicht zu sehen sein.»
 *
 * Die Bestellung traegt den Schnappschuss (`hiddenColumnKeys`, Vorlagen-
 * schluessel wie `priceGross`), weil das PDF spaeter ohne die Vorlage neu
 * gebaut und gemailt wird. Die Werte bleiben an den Positionen stehen — das
 * Blatt zeigt sie nur nicht. Was sich AUSBLENDEN laesst: der Seriencode, der
 * Einzelpreis, der Rabatt und die eigenen Spalten. Menge, Nettopreis und
 * Betrag bleiben immer stehen: ohne sie ist die Zeile keine Bestellung mehr.
 */
const orderHiddenKeys = (order: PurchaseOrderRow): Set<string> =>
    new Set(order.hiddenColumnKeys ?? []);

const orderHasGross = (order: PurchaseOrderRow): boolean =>
    order.items.some((item) => (item.grossPrice || 0) > 0);
const orderHasDiscount = (order: PurchaseOrderRow): boolean =>
    order.items.some((item) => (item.discount || 0) > 0 || (item.discount2 || 0) > 0 || (item.discount3 || 0) > 0);
const orderHasVat = (order: PurchaseOrderRow): boolean =>
    order.items.some((item) => (item.vatRate || 0) > 0);

/**
 * İndirim sütununun satırları: girilmiş her yüzde (indirim / indirim 2 / 3)
 * ALT ALTA yazılır — yüzdeler sırayla uygulandığı için tek bir bileşik oran
 * yerine dökümün kendisi gösterilir (kullanıcı isteği).
 */
const discountLines = (item: PurchaseOrderRow['items'][number]): string[] =>
    [item.discount, item.discount2, item.discount3]
        .filter((value) => (value || 0) > 0)
        .map((value) => fmtPercent(value || 0));

/* ═══════════════════════════════════════════════════════════════════════════
   DAS BLATT NACH DER REFERENZ (Vorgabe Samet, 11.09.2026)

   «Bunun aynısı — sadece pdf'i daha temiz yapmak.»

     · EINE Schrift fuer die ganze Tabelle (8 pt; passt sie nicht, wird die
       GANZE Tabelle eine Stufe kleiner — `TABLE_SIZES`, nie eine Zelle).
     · Spaltentitel klein (5.6 pt), grau, gesperrt, in Grossbuchstaben; die
       Pos-Spalte hat keinen Titel.
     · Kein Rahmen, kein getoenter Kopf, keine senkrechten Linien: Zeilen nur
       durch Haarlinien getrennt, unter Kopf und Tabelle eine dunklere Linie.
     · Angaben und Summen je in einer hellgrauen, abgerundeten Karte.

   DIE ZWEI SCHRIFTEN DER TABELLE (Vorgabe Samet, 11.09.2026, als CSS notiert):
     Spaltentitel    Liberation Sans Regular · 5.6 pt · UPPERCASE · letter-spacing 0.35px · #8E8E92
     Normaler Text   Liberation Sans Regular · 8 pt · ohne Umwandlung · letter-spacing 0 · #1D1D1F
   8 pt ist DIE Groesse; `TABLE_SIZES` geht nur tiefer, wenn eine Tabelle
   (sechs eigene Spalten neben allen Preisen) sonst nicht aufs Blatt passt.
   ═════════════════════════════════════════════════════════════════════════ */
/* 29.09.2026, zweite Runde (Arial, «yazı tiplerini netleştir»): die Tabelle in
   Lesegrösse (8.8 pt — die Bestellung trägt mehr Spalten als der Lieferschein,
   und der Produktname soll nicht in drei Zeilen stehen); die Titel FETT in
   Navy-Versalien statt 5.6 pt Hellgrau. Kleinere Stufen nur, wenn eine breite
   Vorlage sonst nicht aufs Blatt passt. */
/* Wie die Offerte: 9 pt, der Name 9.4 pt fett. Kleinere Stufen NUR, wenn eine
   breite Vorlage (8–9 Spalten) sonst nicht aufs Blatt passt — dann die ganze
   Tabelle eine Stufe, nie eine einzelne Zelle. */
/* DIE DICHTESTUFEN (29.09.2026 abends, Samet: «uzun metinlere, fiyatlara ve 8–9
   sütun adına dayanıklı olmalı»): Schrift, Spaltenabstand und Titelschrift gehen
   GEMEINSAM eine Stufe tiefer, bis jede Spalte ihr Mindestmass bekommt — das
   breiteste Wort ihres Werts, bei Zahlen der ganze Betrag. Die erste passende
   Stufe gilt für die GANZE Tabelle. Neun Spalten stehen so ohne ein zerhacktes
   Wort; erst jenseits davon bricht als letzter Ausweg ein Wort. */
/* 01.10.2026 (Samet: «tablo biraz daha büyük olsun») eine grössere Stufe vorn. */
const TABLE_STEPS: ReadonlyArray<{ fs: number; gap: number; head: number }> = [
    { fs: 9.6, gap: 4.4, head: 8.8 },
    { fs: 9.2, gap: 4.2, head: 8.5 },
    { fs: 9, gap: 4.2, head: 8.4 },
    { fs: 8.6, gap: 3.8, head: 8.1 },
    { fs: 8.2, gap: 3.4, head: 7.8 },
    { fs: 7.8, gap: 3, head: 7.4 },
    { fs: 7.4, gap: 2.6, head: 7 },
    { fs: 7, gap: 2.2, head: 6.6 },
];
type TableStep = (typeof TABLE_STEPS)[number];
/** Ein Titel darf bis auf diesen Anteil seiner Stufe schrumpfen, bevor er seine Spalte breiter macht. */
const CAPTION_SQUEEZE = 0.88;
/** Das harte Minimum der Beschreibung, wenn selbst die kleinste Stufe nicht reicht —
    der Produktname bleibt lesbar; nachgeben müssen zuerst die eigenen Textspalten. */
const DESC_HARD_MIN_W = 34;
/** Spaltentitel: fett in Navy wie die Offerte (8.9 pt dort; 8.4 pt hier, weil die Vorlage mehr und längere Titel trägt). */
const HEAD_FS = 8.4;
/** Keine Sperrung — die Titel stehen in Gross-/Kleinschreibung. */
const CAPTION_SPACING = 0;
/** Zeilenabstand zweizeiliger Titel in mm je pt. */
const CAPTION_LH = 0.43;
/** Zeilenabstand des Fliesstexts in mm je pt (9 pt → 4.4 mm wie die Offerte). */
const LH_RATIO = 0.489;
/** Zeilen wie die Offerte: 3 mm Innenabstand, mindestens 11 mm hoch. */
const ROW_PAD = 3;
const ROW_MIN_H = 11;
/** Zwischen Name und Seriennummer darunter (Offerte: ROW_BLOCK_GAP). */
const ROW_BLOCK_GAP = 1.4;
const MIN_ROW_START = 16;
/** Das Kopfband der Tabelle (Offerte: 9.6 mm, danach 2 mm Luft). */
const HEAD_H = 9.6;
const HEAD_GAP = 2;
const HAIRLINE_W = 0.15;
/** Der Name: Zeilenabstand und erste Grundlinie (9.4 pt → 4.7 mm, 5.8 mm unter der Zeilenkante). */
const nameLhOf = (fs: number): number => nameSizeOf(fs) * 0.5;
const firstBaseOf = (fs: number): number => ROW_PAD + 2.8 * nameSizeOf(fs) / 9.4;

/* Das Anschreiben wie der Einleitungstext der Offerte: 10 pt, Zeilenfaktor 1.35. */
const FS_LETTER = 10;
const LETTER_LHF = 1.35;


/* Die Töne der Offerte (`tenderPdfModern` BRAND_PALETTE über `OFFER.tones`). */
const TONES = OFFER.tones;
const COLOR_NAVY = TONES.NAVY;
const COLOR_TEXT = TONES.TEXT;
const COLOR_CAPTION = TONES.LABEL;
const COLOR_MUTED = TONES.MUTED;
/** Spaltentitel: fett in Navy auf dem getönten Band. */
const COLOR_COLUMN_HEAD = TONES.NAVY;
const COLOR_POS = TONES.TEXT;
const COLOR_HAIRLINE = TONES.HAIRLINE;

/* ARIAL — `supplierPdfKit.registerSupplierFonts`, dieselbe Datei wie die Offerte. */
const FONT = SUPPLIER_FONT;

// ── Biçimleyiciler ───────────────────────────────────────────────────────────
const fmtMoneyForCurrency = (currency: string) => (v: number) =>
    `${currency} ${new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(v || 0)}`;

const fmtUnitPrice = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v || 0);

/* Mengen ohne leere Nachkommastellen — «2», «2,5» (Referenz). */
const fmtQty = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v || 0);

const fmtPercent = (v: number) =>
    `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(v || 0)}%`;

const oneLine = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();

/* Grossbuchstaben nach der Sprache des WORTES, nicht nur des Dokuments: ein
   tuerkisches i wird İ («BİRİM»), ein deutsches bleibt I («EINHEIT»). Die
   Spaltennamen tippt der Benutzer in der Vorlage — sie verraten ihre Sprache
   an ı/ğ/ş bzw. ä/ß/ei/ch/ck; sonst gilt die Sprache des Dokuments. */
const captionLocale = (label: string, lang: OrderPdfLang): string => {
    if (/[ıİğĞşŞ]/.test(label)) return 'tr-TR';
    if (/ß|ä|ei|ie|eu|ch|ck|tz/i.test(label)) return 'de-CH';
    return lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-CH' : 'en-GB';
};

/* Eine eigene Spalte, in der NUR Zahlen stehen («0,00», «1'250», «12.5»),
   steht rechtsbuendig; eine Null ist so blass wie ein fehlender Wert. */
const NUMBER_RE = /^[-+]?(?:\d{1,3}(?:[.'\u2019 ]\d{3})+|\d+)(?:[.,]\d+)?$/;
const isNumberText = (value: string) => NUMBER_RE.test(value.trim());
const isZeroText = (value: string) => isNumberText(value) && !/[1-9]/.test(value);
const columnIsNumeric = (values: string[]) => {
    const filled = values.map((value) => value.trim()).filter(Boolean);
    return filled.length > 0 && filled.every(isNumberText);
};

// ─────────────────────────────────────────────────────────────────────────────
// ANA GİRİŞ NOKTALARI
// ─────────────────────────────────────────────────────────────────────────────

export async function buildOrderPdfBytes(
    sourceOrder: PurchaseOrderRow,
    settings: PdfCompanySettings,
    lang: OrderPdfLang = 'de'
): Promise<Uint8Array> {
    // DER CODE STEHT IN DER SPRACHE DES BELEGS (Vorgabe Samet, 21.09.2026):
    // gespeichert ist die deutsche Schreibweise (`PA-`/`BE-`), gedruckt wird
    // `FT-`/`SP-` (tr) bzw. `PR-`/`PO-` (en). Die Kopie traegt sie durch das
    // ganze Dokument — Fusszeile, Karte, Titel und Dateiname.
    // Die Einheit der Produktion (`stdUnit`) in der Sprache des Belegs — «Adet» wird «Stk» (30.09.2026).
    const order = {
        ...sourceOrder,
        referenceNumber: localizePurchaseCode(sourceOrder.referenceNumber, lang),
        items: localizeProductionCells(sourceOrder.items ?? [], lang),
    };
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    // Der Titel ersetzt in der Vorschau (blob:-URL) die UUID als Dokumentname.
    doc.setProperties({ title: order.referenceNumber || 'Bestellung' });
    doc.viewerPreferences({ DisplayDocTitle: true });
    await registerSupplierFonts(doc);
    // Jede Zeile setzt ihre Sperrung selbst (0 Tc) — sonst erbte der Text nach
    // einem gesperrten Spaltentitel dessen Sperrung.
    doc.setCharSpace(0);
    const logo = await loadOfferLogo(doc);
    const wave = await loadOfferWave();
    const fmt = fmtMoneyForCurrency(order.currency || settings.currency);
    const L = I18N[lang];
    // Die Tabelle traegt ihre Titel in Grossbuchstaben (Referenz).
    // Heisst noch `upper`, schreibt seit 29.09.2026 spät aber «Produkt - Material» («başlık harfleri Büyük ile başlayıp küçük ile devam etsin»).
    const upper = (label: string) => titleCaption(label, captionLocale(label, lang));

    /* BOM-REVISION (29.09.2026, Samet — ersetzt das eigene Änderungsblatt vom
       27.09.): eine Bestellung, die nach dem Versand revidiert wurde, geht als
       EIN PDF hinaus — dieselbe Nummer, die Revision in der Karte, unter dem
       Titel der Hinweis «Revision n — ersetzt unsere Bestellung vom …» und am
       Schluss die Tabelle «Änderungen» (Pos · Artikel · Bisher · Neu · Änderung). */
    const revision = order.bomOrigin?.revision && order.bomOrigin.revision.number > 0 ? order.bomOrigin.revision : null;
    const items: PdfItem[] = order.items;

    // ── Seite 1: Karte, Adressen, Titel, Anschreiben ─────────────────────────
    const letterEnd = drawCoverPage(doc, order, settings, L, revision);

    // ── Sipariş satırları ────────────────────────────────────────────────────
    // Kolon düzeni siparişin kendisine göre kurulur: brüt fiyat / indirim /
    // KDV yoksa o sütunlar hiç çizilmez.
    /* DIE SPALTEN DER VORLAGE (Vorgabe Samet, 11.09.2026): Titel = die Namen
       der Vorlage, Reihenfolge = die der Vorlage; eigene Spalten stehen, wo
       die Vorlage sie hatte. Feste Spalten ohne Vorlagenspalte (Nettopreis,
       MwSt, Betrag) stehen an ihrem herkoemmlichen Platz mit dem Titel des
       Dokuments. DER ERP-CODE STEHT NIE IM PDF: er ist eine Hausnummer, keine
       Angabe fuer den Lieferanten. Kopf, Masse und Zeilen lesen DIESELBE Liste. */
    const hidden = orderHiddenKeys(order);
    /* ÜRETİM ŞABLONU (30.09.2026): «birim fiyat, indirim, satır tutarı» — die
       Bestellung der BOM hat keinen Nettopreis; ohne Vorlagenspalte fehlt er. */
    const noNetColumn = isProductionColumns(order.tableColumns)
        && !(order.tableColumns ?? []).some((column) => column?.label === 'netPrice');
    const columns = resolveSupplierPdfColumns(order, {
        captions: {
            desc: L.colDesc,
            qty: L.colQty,
            gross: L.colGrossPrice,
            net: L.colNetPrice,
            disc: L.colDiscount,
            vat: L.colVat,
            price: L.colPrice,
        },
        fixed: [
            'qty',
            ...(orderHasGross(order) && !hidden.has('priceGross') ? ['gross' as const] : []),
            ...(noNetColumn ? [] : ['net' as const]),
            ...(orderHasDiscount(order) && !hidden.has('discount') ? ['disc' as const] : []),
            ...(orderHasVat(order) ? ['vat' as const] : []),
            'price',
        ],
        hidden: new Set([...hidden, 'code']),
        maxExtras: PDF_MAX_EXTRA_COLUMNS,
        lang,
        // Belege der BOM: eine Spalte ohne einen einzigen Wert wird nicht gedruckt (01.10.2026).
        dropEmptyExtras: isProductionColumns(order.tableColumns),
    }).map((column) => ({ ...column, caption: upper(column.caption) }));
    const layout = buildTableLayout(doc, order, columns, fmt);
    const posCaption = upper(L.colPos);
    // Bleibt unter dem Anschreiben genug Platz, beginnt die Tabelle dort;
    // das volle Standard-Anschreiben fuellt Seite 1, dann steht sie auf Seite 2.
    const st: TableState = { y: 0 };
    if (CONTENT_BOTTOM - letterEnd >= TABLE_START_MIN) {
        st.y = drawTableHeader(doc, letterEnd + TABLE_GAP, layout, posCaption);
    } else {
        doc.addPage();
        st.y = drawTableHeader(doc, CONTENT_TOP_REST, layout, posCaption);
    }

    items.forEach((item, index) => {
        const h = measureRow(doc, item, L, layout);
        if (st.y + h > CONTENT_BOTTOM || CONTENT_BOTTOM - st.y < MIN_ROW_START) {
            newTablePage(doc, st, layout, posCaption);
        }
        st.y = drawRow(
            doc,
            item,
            index,
            st.y,
            Math.min(h, CONTENT_BOTTOM - st.y),
            fmt,
            L,
            layout,
            lineVatRateOf(order),
        );
    });

    // ── Toplamlar (en altta) ─────────────────────────────────────────────────
    const hasGrossRow = (order.totalGross || 0) > (order.totalNet || 0) + 0.005;
    const hasVatRow = (order.totalVat || 0) > 0.005;
    // Ek ücretler (nakliye, ambalaj…): her biri toplam bloğunda kendi satırını alır.
    const fees = (order.additionalFees ?? []).filter((fee) => (fee?.name || '').trim() || fee?.amount);
    /* SUMMEN RECHTS, HINWEISE LINKS DANEBEN — wie die Rechnung ihre
       Zahlungsbedingungen neben die Summen stellt (29.09.2026 abends: «direkt
       teklifteki gibi»). Beide beginnen auf derselben Höhe; passt der Block
       nicht mehr aufs Blatt, geht er geschlossen auf die nächste Seite. Kein
       Gruss danach (Samet: «Freundliche Grüsse … sil»). */
    const notes = orderNotes(order, L);
    const notesW = OFFER.TOTALS_X - ML - 8;
    const totals = totalsRows(doc, order, fmt, L, hasGrossRow, hasVatRow, fees);
    const blockH = Math.max(offerTotalsHeight(totals.rows.length), measureOfferNoteCard(doc, notes, notesW));
    let y = st.y + 9;
    if (y + blockH > CONTENT_BOTTOM) {
        doc.addPage();
        y = CONTENT_TOP_REST + 4;
    }
    drawOfferTotals(doc, y, totals.rows, totals.grand);
    if (notes.length) drawOfferNoteCard(doc, { x: ML, y, w: notesW, title: L.notesTitle, notes });
    y += blockH;

    // Die Änderungen der Revision — am Schluss.
    if (revision && revision.changes?.length) {
        drawChangesSection(doc, y + 11, revision.changes as OrderRevisionChange[], L, upper);
    }

    // ── Antet & alt bilgi dekorasyonu (tüm sayfalar) ─────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawOfferHeader(doc, logo, wave, settings);
        drawOfferFooter(doc, companySenderLine(settings, '  ·  '), `${L.pageWord} ${i} ${L.pageOf} ${pageCount}`);
    }

    return new Uint8Array(doc.output('arraybuffer'));
}

export async function exportOrderPdf(
    order: PurchaseOrderRow,
    settings: PdfCompanySettings,
    lang: OrderPdfLang = 'de'
): Promise<void> {
    const bytes = await buildOrderPdfBytes(order, settings, lang);
    downloadPdf(bytes, `${localizePurchaseCode(order.referenceNumber, lang)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// REVISION EINER BOM-BESTELLUNG — die Änderungen, die die Bestellung am Schluss
// druckt (seit 29.09.2026 im selben PDF; das eigene Änderungsblatt vom 27.09.
// ist fort)
// ─────────────────────────────────────────────────────────────────────────────

/** Eine geänderte Position, wie die Revision sie festhielt (BomOrderActionLine). */
export interface OrderRevisionChange {
    index: number;
    bomLineId: string;
    code: string | null;
    name: string;
    unitBefore: string | null;
    unitAfter: string | null;
    before: number;
    after: number;
    received: number;
}

type RevisionChangeKind = 'added' | 'removed' | 'increased' | 'decreased' | 'edited';

const revisionKindOf = (line: OrderRevisionChange): RevisionChangeKind => {
    if (line.before <= 1e-9) return 'added';
    if (line.after <= 1e-9) return 'removed';
    if (line.after > line.before + 1e-9) return 'increased';
    if (line.after < line.before - 1e-9) return 'decreased';
    return 'edited';
};

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 1 — Karte (links), Absender & Lieferant (rechts), Titel, Anschreiben
// ─────────────────────────────────────────────────────────────────────────────

/* ═══ SEITE 1 WIE DIE OFFERTE (29.09.2026 abends) ═══════════════════════════
   Links die Belegkarte der Offerte, rechts Absenderzeile und Anschrift, darunter
   der Titel mit dem roten Strich (`supplierPdfKit`). */

/** Die Anschrift des Lieferanten rechts; gibt die Unterkante zurück. */
function drawRecipientOf(doc: jsPDF, order: PurchaseOrderRow, s: PdfCompanySettings, L: OrderPdfStrings): number {
    const attention = oneLine(order.recipientName || '');
    return drawOfferRecipient(doc, {
        sender: companySenderLine(s, ' · '),
        name: order.supplierName || '',
        attention: attention ? `${L.attention} ${attention}` : '',
        address: order.supplierAddress,
    });
}

/** Die Hinweise dieser Bestellung — mit ihrer Nummer und, falls vorhanden, der Kommission. */
/* PROJEKTNUMMER STATT KOMMISSION (29.09.2026, Samet: «siparişlerde komisyon yerine proje
   numarası olması gerekiyor»): auf Lieferschein, Rechnung und Offerte soll der Lieferant
   unsere Projektnummer angeben; ohne Projekt bleibt die Kommission (freier Text). */
function orderNotes(order: PurchaseOrderRow, L: OrderPdfStrings): string[] {
    const project = purchaseProjectOf(order);
    const commission = purchaseCommissionOf(order, project);
    const reference = project?.number
        ? L.notesProject.replace('{p}', project.number)
        : commission ? L.notesCommission.replace('{c}', commission) : '';
    return L.notes.map((note) => note
        .replace('{number}', order.referenceNumber)
        .replace('{commission}', reference));
}

/** Das Anschreiben ab der Grundlinie `firstBase`; gibt die Grundlinie der letzten Zeile zurück. */
function drawLetter(doc: jsPDF, text: string, firstBase: number, maxLines: number): number {
    const y = firstBase;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_LETTER);
    doc.setTextColor(...COLOR_TEXT);
    const letterLh = FS_LETTER * PT_MM * LETTER_LHF;
    const lines = text
        .split('\n')
        .flatMap((line) => (line.trim() ? (doc.splitTextToSize(line, CONTENT_W) as string[]) : ['']))
        .slice(0, maxLines);
    doc.text(lines, ML, y, { lineHeightFactor: LETTER_LHF });
    return y + (lines.length - 1) * letterLh;
}

/**
 * Seite 1 bis zum Anschreiben. Gibt die Höhe zurück, unter der (plus
 * `TABLE_GAP`) die Tabelle beginnt: die letzte Zeile des Anschreibens — oder,
 * ohne Anschreiben, gleich unter dem Titel.
 */
function drawCoverPage(
    doc: jsPDF,
    order: PurchaseOrderRow,
    s: PdfCompanySettings,
    L: OrderPdfStrings,
    revision: { number: number; createdAt: string | null } | null = null,
): number {
    /* Die Karte der Offerte. Wo es ein Projekt gibt, steht seine Nummer statt der
       Kommission (29.09.2026: «komisyon yazmasın, proje numarası yazsın»); ohne
       Projekt die frei geschriebene Kommission. `utils/purchaseProject.ts`. */
    const project = purchaseProjectOf(order);
    const cardBottom = drawOfferInfoCard(doc, [
        { label: L.orderNumber, value: order.referenceNumber, emphasize: true },
        project?.number
            ? { label: L.projectNumber, value: project.number }
            : { label: L.project, value: purchaseCommissionOf(order, null) },
        { label: L.orderDate, value: fmtDocDate(order.createdAt) },
        { label: L.revision, value: revision ? [String(revision.number), fmtDocDate(revision.createdAt)].filter(Boolean).join(' · ') : '' },
        { label: L.quoteNumber, value: oneLine(order.quoteNumber || '') },
        { label: L.orderedBy, value: oneLine(order.orderedByName || '') },
    ]);
    const addrBottom = drawRecipientOf(doc, order, s, L);
    const titleBase = Math.max(cardBottom, addrBottom) + 16;
    // «Bestellung BE-2026-008 (Rev. 1)» — die Nummer immer, die Revision in Klammern.
    drawOfferTitle(doc, titleBase, `${L.docTitle} ${order.referenceNumber}`, revision ? `(Rev. ${revision.number})` : null);

    /* Unter dem Titel einer REVIDIERTEN Bestellung: was diese Fassung ist — als
       Karte der Offerte (heller Grund, Navy-Streifen). */
    let letterTop = titleBase + 12;
    let tableTop = titleBase + 10;
    if (revision) {
        const lead = [`${L.revision} ${revision.number}`, fmtDocDate(revision.createdAt)].filter(Boolean).join(' · ');
        const text = L.revisionText.replace('{orderDate}', fmtDocDate(order.createdAt));
        const cardEnd = drawOfferNoteCard(doc, { x: ML, y: titleBase + 9, w: CONTENT_W, title: lead, notes: [text], bullets: false });
        letterTop = cardEnd + 8.5;
        tableTop = cardEnd + 6;
    }

    /* ÖN YAZI: nur, was der Vorgang selbst trägt — leer heisst kein
       Anschreiben (die Standardvorlage setzt die Oberfläche ein). */
    const letter = (order.coverLetter || '').trim();
    if (!letter) return tableTop - TABLE_GAP;
    const letterLh = FS_LETTER * PT_MM * LETTER_LHF;
    const maxLines = Math.max(4, Math.floor((COVER_LETTER_BOTTOM - letterTop) / letterLh) + 1);
    return drawLetter(doc, letter, letterTop, maxLines);
}

// ─────────────────────────────────────────────────────────────────────────────
// TABELLE — Kopf, düz satırlar, Schlusslinie
// ─────────────────────────────────────────────────────────────────────────────

/** Wo die Tabelle steht: die Unterkante der letzten Zeile. */
interface TableState { y: number }

function newTablePage(doc: jsPDF, st: TableState, layout: TableLayout, posCaption: string) {
    doc.addPage();
    st.y = drawTableHeader(doc, CONTENT_TOP_REST, layout, posCaption);
}

/**
 * Wie viele freie Spalten das Blatt neben den festen traegt. Die Vorlage darf
 * zwoelf haben (11.09.2026) — auf A4 hochkant sind sechs das Ende der
 * Lesbarkeit; was darueber liegt, bleibt in der Tabelle und im Excel.
 */
const PDF_MAX_EXTRA_COLUMNS = 6;

/** Der rohe Wert einer eigenen Spalte an einer Position ('' = nichts eingetragen). */
function extraRaw(item: OrderItem, key: string): string {
    for (const entry of item.extras ?? []) {
        if (entry?.key === key) return String(entry.value ?? '').trim();
    }
    return '';
}

/** Derselbe Wert mit Umbruchpunkten fuer lange Nummern (`breakableCode`) — `cellLines` entfernt sie. */
function extraValue(item: OrderItem, key: string): string {
    return breakableCode(extraRaw(item, key));
}

/**
 * ── DIE KOPFZEILE BRICHT UM, STATT ZU SCHRUMPFEN (Vorgabe Samet, 09.09.2026) ─
 * «Im PDF werden manche Spaltentitel winzig, andere riesig — so nicht. Wenn
 *  es sein muss, untereinander; die Tabelle darf wachsen.»
 *
 * ALLE Titel haben dieselbe Schrift (`HEAD_FS`, 5.6 pt); wer
 * nicht in seine Spalte passt, bekommt eine zweite Zeile, und der Kopf wird so
 * hoch wie sein laengster Titel — alle haengen an der UNTERKANTE. Nur ein
 * einzelnes Wort, das selbst allein nicht passt, wird noch verkleinert —
 * hoechstens um 1 pt (`headerSizeFor`) und fuer alle gleich. Die Zeilen packt
 * `splitCaption` selbst, weil die Sperrung mitgemessen werden muss.
 */
type HeadCell = { lines: string[]; x: number; align: 'left' | 'right' };

/** Zeilen eines Titels bei einer Schriftgroesse — und ob dabei ein Wort nicht passte. */
function splitCaption(doc: jsPDF, label: string, width: number, size: number): { lines: string[]; chopped: boolean } {
    const lines: string[] = [];
    let line = '';
    let chopped = false;
    const fits = (text: string) => captionWidth(doc, text, size) <= width;
    for (const word of label.split(/\s+/).filter(Boolean)) {
        const joined = line ? `${line} ${word}` : word;
        if (fits(joined)) { line = joined; continue; }
        const pieces = captionPieces(word);
        if (pieces.length === 1) {
            if (!fits(word)) chopped = true;
            if (line) lines.push(line);
            line = word;
            continue;
        }
        /* Ein zusammengesetztes Wort bricht an seiner Fuge («PRODUKTTYP-» /
           «NUMMER»); was in eine Zeile passt, bleibt ohne Trennstrich zusammen. */
        if (line) lines.push(line);
        /* Ein echter Bindestrich («Bestell-Nr.») bleibt stehen, auch wenn beide
           Glieder in eine Zeile passen; nur eine gedachte Fuge (Grundwort,
           weiches Trennzeichen) verschwindet dann. */
        const glue = word.includes('-') ? '-' : '';
        let run = '';
        pieces.forEach((piece, index) => {
            const last = index === pieces.length - 1;
            const trial = run ? run + glue + piece : piece;
            if (fits(trial + (last ? '' : '-'))) { run = trial; return; }
            if (run) lines.push(`${run}-`);
            if (!fits(piece + (last ? '' : '-'))) chopped = true;
            run = piece;
        });
        line = run;
    }
    if (line) lines.push(line);
    return { lines, chopped };
}

/** Die kleinste Schrift, mit der der Titel ohne zu breites Wort in die Spalte geht. */
function headerSizeFor(doc: jsPDF, label: string, maxW: number, base: number): number {
    const width = Math.max(4, maxW);
    const floor = Math.max(5.4, base - 1.6);
    let size = base;
    while (size > floor && splitCaption(doc, label, width, size).chopped) size -= 0.2;
    return size;
}

function drawTableHeader(doc: jsPDF, y: number, layout: TableLayout, posCaption: string): number {
    /* DER KOPF DER OFFERTE: getöntes Band mit der weichen Navy-Kante, die Titel
       fett in Navy. Anders als dort kommen die Titel aus der Vorlage und können
       lang sein (8–9 Spalten): passt einer nicht, bekommt er eine zweite Zeile
       und das Band wächst mit — alle Titel stehen auf der Grundlinie der
       letzten Zeile. Rechtsbündige Titel stehen auf der Kante ihrer Zahlen. */
    type Spec = [string, number, number, 'left' | 'right'];
    const specs: Spec[] = layout.cells.map((cell): Spec => {
        const width = cell.width - layout.gap;
        return [cell.column.caption, cell.align === 'right' ? cell.x + width : cell.x, width, cell.align];
    });
    const base = layout.headFs;
    const rowSize = Math.min(base, ...specs.map(([label, , maxW]) => headerSizeFor(doc, label, maxW, base)));
    const cells: HeadCell[] = specs.map(([label, x, maxW, align]) =>
        ({ lines: splitCaption(doc, label, Math.max(4, maxW), rowSize).lines, x, align }));
    const lineCount = Math.max(1, ...cells.map((cell) => cell.lines.length));
    const headLh = rowSize * CAPTION_LH;
    const bandH = HEAD_H + (lineCount - 1) * headLh;
    drawOfferBand(doc, y, ML, CONTENT_W, bandH);
    const bottom = y + bandH - (HEAD_H / 2 - 1.3);

    doc.setFont(FONT, 'bold');
    doc.setFontSize(rowSize);
    doc.setTextColor(...COLOR_COLUMN_HEAD);
    doc.text(posCaption, C_POS_X, bottom);
    for (const cell of cells) {
        cell.lines.forEach((line, index) => {
            const ly = bottom - (cell.lines.length - 1 - index) * headLh;
            const lx = cell.align === 'right' ? cell.x - captionWidth(doc, line, rowSize) + CAPTION_SPACING : cell.x;
            doc.text(line, lx, ly);
        });
    }
    return y + bandH + HEAD_GAP;
}

/** Eine Haarlinie über die ganze Breite (zwischen den Zeilen). */
function drawRule(doc: jsPDF, y: number, tone: readonly [number, number, number]) {
    doc.setDrawColor(tone[0], tone[1], tone[2]);
    doc.setLineWidth(HAIRLINE_W);
    doc.line(ML, y, MR, y);
}

function fitFontSize(doc: jsPDF, text: string, maxW: number, base: number, min = 6.4): number {
    let size = base;
    doc.setFontSize(size);
    while (size > min && doc.getTextWidth(text) > maxW) {
        size -= 0.2;
        doc.setFontSize(size);
    }
    return size;
}

/**
 * Metni verilen genişliğe SIĞDIRIR: taşarsa sonundan kırpıp "…" ekler. Punto
 * küçültmek yerine kırpılır, çünkü toplam bloğundaki etiketler aynı puntoda
 * hizalı durmalıdır.
 */
function clampText(doc: jsPDF, text: string, maxW: number, size: number): string {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(size);
    const value = (text || '').trim();
    if (doc.getTextWidth(value) <= maxW) return value;
    let out = value;
    while (out.length > 1 && doc.getTextWidth(`${out}…`) > maxW) out = out.slice(0, -1);
    return `${out}…`;
}

function drawFittedRight(
    doc: jsPDF,
    text: string,
    rightX: number,
    maxW: number,
    baseY: number,
    style: 'normal' | 'bold',
    base: number
) {
    doc.setFont(FONT, style);
    fitFontSize(doc, text, maxW, base);
    doc.text(text, rightX, baseY, { align: 'right' });
    doc.setFontSize(base);
}

type OrderItem = PurchaseOrderRow['items'][number];
/** Eine Position, wie das Blatt sie zeichnet — mit dem Hinweis einer BOM-Revision. */
type PdfItem = OrderItem & { revisionNote?: string };

/**
 * Açıklama hücresi: ürün adı (tablonun TEK puntosunda) + seri no ikinci
 * satırda (soluk). Seri KOD ve indirimler kendi sütunlarında durur — nichts
 * wandert unter den Produktnamen (Vorgabe Samet, 09.09.2026).
 */
function buildRowLines(
    doc: jsPDF,
    item: PdfItem,
    L: OrderPdfStrings,
    layout: TableLayout,
): { title: string[]; meta: string[] } {
    const descW = layout.descEnd - layout.descX;
    doc.setFont(FONT, NAME_STYLE);
    doc.setFontSize(nameSizeOf(layout.fs));
    const title = doc.splitTextToSize((item.name || '').trim(), descW) as string[];
    /* Unter dem Namen steht nur die SERIENNUMMER einer von Hand erfassten
       Zeile; bringt sie ihre Beschriftung schon mit (Doppelpunkt), kommt kein
       zweites «Serien-Nr.:» davor. */
    const serial = (item.serialNumber || '').trim();
    let meta: string[] = [];
    if (serial) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(layout.fs);
        meta = doc.splitTextToSize(serial.includes(':') ? serial : `${L.serialShort}: ${serial}`, descW) as string[];
    }
    if (item.revisionNote) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(layout.fs);
        meta = [...meta, ...(doc.splitTextToSize(item.revisionNote, descW) as string[])];
    }
    return { title, meta };
}

/**
 * Die Zeilen einer Zelle: der Text bricht in seiner Spalte um. Ein Code ohne
 * Leerzeichen darf an seinen Trennzeichen brechen (`breakableCode`) — das ist
 * kein Wort, das man zerschneidet, sondern eine Kette, die man an ihren
 * Gliedern trennt.
 */
function cellLines(doc: jsPDF, text: string, maxW: number, size: number): string[] {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(size);
    const width = Math.max(4, maxW);
    /* Selbst gepackt, nicht `splitTextToSize`: das kennt nur das Leerzeichen
       als Umbruch und hackte eine Nummer an ihrem Nullbreiten-Trenner NICHT,
       sondern irgendwo («TM171ASCTB2 | 7»). Woerter trennt ein Leerzeichen,
       Glieder einer Nummer der Trenner — der im Druck verschwindet. */
    const lines: string[] = [];
    let line = '';
    for (const word of (text || '—').split(/\s+/).filter(Boolean)) {
        word.split('\u200b').filter(Boolean).forEach((part, index) => {
            const candidate = line + (index === 0 && line ? ' ' : '') + part;
            if (!line || doc.getTextWidth(candidate) <= width) { line = candidate; return; }
            lines.push(line);
            line = part;
        });
    }
    if (line) lines.push(line);
    // Ein Glied, das allein nicht passt, wird als letzter Ausweg zerteilt.
    return lines.flatMap((entry) => (doc.getTextWidth(entry) <= width ? [entry] : (doc.splitTextToSize(entry, width) as string[])));
}

/** Hoehe des Inhalts der Beschreibung von der Oberkante der ersten Zeile an (Name + Seriennummer) — wie `measureRow` der Offerte. */
function descContentH(title: string[], meta: string[], layout: TableLayout): number {
    return title.length * nameLhOf(layout.fs) + (meta.length ? ROW_BLOCK_GAP + meta.length * layout.lh : 0);
}

/**
 * Die Höhe einer Zeile wie in der Offerte (3 mm Innenabstand, mindestens 11 mm),
 * aber mit den Zellen der Vorlage: eine eigene Textspalte bricht in ihrer
 * Spalte um, Rabatte stehen ALT ALTA — die höchste Zelle bestimmt die Zeile.
 * Eine Zahl bricht nie um.
 */
function measureRow(doc: jsPDF, item: PdfItem, L: OrderPdfStrings, layout: TableLayout): number {
    const { title, meta } = buildRowLines(doc, item, L, layout);
    const cellLineCounts = layout.cells.map((cell) => {
        if (cell.column.kind === 'disc') return Math.max(1, discountLines(item).length);
        if (cell.column.kind !== 'extra' || cell.align === 'right') return 1;
        return cellLines(doc, extraValue(item, cell.column.key), cell.width - layout.gap, layout.fs).length;
    });
    const cellsH = (firstBaseOf(layout.fs) - ROW_PAD) + (Math.max(1, ...cellLineCounts) - 1) * layout.lh + 1.4;
    return Math.max(ROW_MIN_H * layout.fs / 9, Math.max(descContentH(title, meta, layout), cellsH) + ROW_PAD * 2);
}

function drawRow(
    doc: jsPDF,
    item: PdfItem,
    index: number,
    y: number,
    rowH: number,
    fmt: (v: number) => string,
    L: OrderPdfStrings,
    layout: TableLayout,
    totalVatRate: number | null = null,
): number {
    const { fs, lh } = layout;
    const { title, meta } = buildRowLines(doc, item, L, layout);
    const baseY = y + firstBaseOf(fs);

    // Zebra wie die Offerte: jede zweite Zeile ganz leicht getönt.
    if (index % 2 === 1) {
        doc.setFillColor(...TONES.ZEBRA);
        doc.rect(ML, y, CONTENT_W, rowH, 'F');
    }

    // Pos wie die Offerte: 8.2 pt, dunkel.
    doc.setFont(FONT, 'normal');
    doc.setFontSize(fs * 8.2 / 9);
    doc.setTextColor(...COLOR_POS);
    doc.text(String(index + 1), C_POS_X, baseY);
    doc.setFontSize(fs);

    for (const cell of layout.cells) {
        const width = cell.width - layout.gap;
        const right = cell.x + width;
        switch (cell.column.kind) {
            case 'desc': {
                let cy = baseY;
                doc.setFont(FONT, NAME_STYLE);
                doc.setFontSize(nameSizeOf(fs));
                doc.setTextColor(...COLOR_TEXT);
                for (const line of title) {
                    doc.text(line, cell.x, cy);
                    cy += nameLhOf(fs);
                }
                if (meta.length) {
                    cy += ROW_BLOCK_GAP - nameLhOf(fs) + lh;
                    doc.setFont(FONT, 'normal');
                    doc.setFontSize(fs);
                    doc.setTextColor(...COLOR_CAPTION);
                    for (const line of meta) {
                        doc.text(line, cell.x, cy);
                        cy += lh;
                    }
                }
                doc.setFontSize(fs);
                break;
            }
            case 'extra': {
                // Eigene Spalten wie der Fliesstext der Offerte; leer oder Null blass.
                const raw = extraRaw(item, cell.column.key);
                doc.setFont(FONT, 'normal');
                if (!raw || isZeroText(raw)) doc.setTextColor(...COLOR_MUTED);
                else doc.setTextColor(...COLOR_TEXT);
                if (cell.align === 'right') {
                    drawFittedRight(doc, raw || '—', right, width, baseY, 'normal', fs);
                    break;
                }
                cellLines(doc, extraValue(item, cell.column.key), width, fs)
                    .forEach((line, lineIdx) => doc.text(line, cell.x, baseY + lineIdx * lh));
                break;
            }
            case 'qty':
                doc.setTextColor(...COLOR_TEXT);
                drawFittedRight(doc, fmtQty(item.quantity || 0), right, width, baseY, 'normal', fs);
                break;
            case 'gross':
                doc.setTextColor(...((item.grossPrice || 0) > 0 ? COLOR_TEXT : COLOR_MUTED));
                drawFittedRight(doc, (item.grossPrice || 0) > 0 ? fmtUnitPrice(item.grossPrice) : '—', right, width, baseY, 'normal', fs);
                break;
            case 'net': {
                // Net fiyat sütununda TEDARİKÇİ LİSTESİNDEKİ fiyat görünür (varsa);
                // tedarikçi hesabında satır indirimleri de iner (19.09.2026).
                const shownNet = itemDisplayNetPrice(item);
                doc.setTextColor(...(shownNet > 0 ? COLOR_TEXT : COLOR_MUTED));
                drawFittedRight(doc, shownNet > 0 ? fmtUnitPrice(shownNet) : '—', right, width, baseY, 'normal', fs);
                break;
            }
            case 'disc': {
                const discounts = discountLines(item);
                doc.setTextColor(...(discounts.length ? COLOR_TEXT : COLOR_MUTED));
                (discounts.length ? discounts : ['—']).forEach((line, lineIdx) => {
                    drawFittedRight(doc, line, right, width, baseY + lineIdx * lh, 'normal', fs);
                });
                break;
            }
            case 'vat':
                // Der MwSt-Satz grau wie in der Offerte.
                doc.setTextColor(...COLOR_CAPTION);
                drawFittedRight(doc, fmtPercent(item.vatRate || 0), right, width, baseY, 'normal', fs);
                break;
            default: {
                const lineVat = totalVatRate === null
                    ? (item.lineVat || 0)
                    : (item.lineTotal || 0) * (totalVatRate / 100);
                const payableTotal = Math.round(((item.lineTotal || 0) + lineVat) * 100) / 100;
                // Der Betrag fett wie der Preis der Offerte.
                doc.setTextColor(...COLOR_TEXT);
                drawFittedRight(doc, fmt(payableTotal), right, width, baseY, 'bold', fs);
                break;
            }
        }
    }
    doc.setFont(FONT, 'normal');

    drawRule(doc, y + rowH, COLOR_HAIRLINE);
    return y + rowH;
}

// ─────────────────────────────────────────────────────────────────────────────
// ÄNDERUNGEN EINER REVISION — Pos · Artikel · Bisher · Neu · Änderung
// ─────────────────────────────────────────────────────────────────────────────

const CHG_X_ITEM = C_DESC;
const CHG_X_BEFORE_R = ML + 130;
const CHG_X_AFTER_R = ML + 154;
const CHG_X_KIND = ML + 160;
const CHG_ITEM_W = CHG_X_BEFORE_R - 24 - CHG_X_ITEM;
const CHG_FS = TABLE_STEPS[0].fs;

/** Wie eine Änderung aussieht: neu grün, entfallen rot, der Rest in Navy/Grau. */
const CHANGE_TONE: Record<RevisionChangeKind, readonly [number, number, number]> = {
    added: [31, 138, 59],
    removed: TONES.RED,
    increased: COLOR_NAVY,
    decreased: COLOR_NAVY,
    edited: COLOR_CAPTION,
};

/** Kopf der Änderungstabelle — das Band der Offerte; gibt die Oberkante der ersten Zeile zurück. */
function drawChangesHead(doc: jsPDF, top: number, L: OrderPdfStrings, upper: (text: string) => string): number {
    drawOfferBand(doc, top, ML, CONTENT_W, HEAD_H);
    const base = top + HEAD_H / 2 + 1.3;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(HEAD_FS);
    doc.setTextColor(...COLOR_COLUMN_HEAD);
    const head = (text: string, x: number, align: 'left' | 'right' = 'left') => {
        const label = upper(text);
        const lx = align === 'right' ? x - captionWidth(doc, label, HEAD_FS) : x;
        doc.text(label, lx, base);
    };
    head(L.colPos, C_POS_X);
    head(L.colDesc, CHG_X_ITEM);
    head(L.changeBefore, CHG_X_BEFORE_R, 'right');
    head(L.changeAfter, CHG_X_AFTER_R, 'right');
    head(L.changeKind, CHG_X_KIND);
    return top + HEAD_H + HEAD_GAP;
}

/**
 * Die Tabelle der Änderungen ab `top` (Kopf inklusive), mit Seitenumbruch;
 * gibt ihre Unterkante zurück. Unser ERP-Code steht auch hier nie.
 */
function drawChangesTable(
    doc: jsPDF,
    top: number,
    source: OrderRevisionChange[],
    L: OrderPdfStrings,
    upper: (text: string) => string,
): number {
    const lh = CHG_FS * LH_RATIO;
    const qty = (value: number, unit: string | null) => `${fmtQty(value)}${unit ? ` ${unit}` : ''}`;
    // Kopf und eine Zeile gehören zusammen — sonst beginnt die Tabelle auf der nächsten Seite.
    let start = top;
    if (start + 22 > CONTENT_BOTTOM) {
        doc.addPage();
        start = CONTENT_TOP_REST;
    }
    let y = drawChangesHead(doc, start, L, upper);
    const changes = [...source].sort((a, b) => a.index - b.index);
    changes.forEach((line, rowIndex) => {
        const kind = revisionKindOf(line);
        doc.setFont(FONT, 'normal');
        doc.setFontSize(CHG_FS);
        const nameLines = (doc.splitTextToSize(oneLine(line.name), CHG_ITEM_W) as string[]).slice(0, 3);
        const note = line.received > 1e-9 ? L.changeReceived.replace('{q}', qty(line.received, line.unitAfter || line.unitBefore)) : '';
        const h = Math.max(ROW_MIN_H, ROW_PAD * 2 + nameLines.length * lh + (note ? ROW_BLOCK_GAP + lh : 0));
        if (y + h > CONTENT_BOTTOM) {
            doc.addPage();
            y = drawChangesHead(doc, CONTENT_TOP_REST, L, upper);
        }
        if (rowIndex % 2 === 1) {
            doc.setFillColor(...TONES.ZEBRA);
            doc.rect(ML, y, CONTENT_W, h, 'F');
        }
        const base = y + firstBaseOf(CHG_FS);
        doc.setFont(FONT, 'normal');
        doc.setFontSize(CHG_FS * 8.2 / 9);
        doc.setTextColor(...COLOR_POS);
        doc.text(String(line.index + 1), C_POS_X, base);
        doc.setFontSize(CHG_FS);
        doc.setTextColor(...COLOR_TEXT);
        nameLines.forEach((text, index) => doc.text(text, CHG_X_ITEM, base + index * lh));
        if (note) {
            doc.setTextColor(...COLOR_MUTED);
            doc.text(note, CHG_X_ITEM, base + (nameLines.length - 1) * lh + ROW_BLOCK_GAP + lh);
        }
        doc.setTextColor(...COLOR_MUTED);
        doc.text(kind === 'added' ? '—' : qty(line.before, line.unitBefore), CHG_X_BEFORE_R, base, { align: 'right' });
        doc.setFont(FONT, 'bold');
        doc.setTextColor(...COLOR_TEXT);
        doc.text(kind === 'removed' ? '0' : qty(line.after, line.unitAfter), CHG_X_AFTER_R, base, { align: 'right' });
        doc.setTextColor(...CHANGE_TONE[kind]);
        doc.text(L.changeKinds[kind], CHG_X_KIND, base);
        doc.setFont(FONT, 'normal');
        y += h;
        drawRule(doc, y, COLOR_HAIRLINE);
    });
    return y;
}

/**
 * «Änderungen» am Schluss der revidierten Bestellung: Überschrift und Tabelle.
 * Passen Überschrift, Kopf und eine Zeile nicht mehr aufs Blatt, beginnt der
 * Abschnitt auf der nächsten Seite. Gibt die Unterkante zurück.
 */
function drawChangesSection(
    doc: jsPDF,
    top: number,
    changes: OrderRevisionChange[],
    L: OrderPdfStrings,
    upper: (text: string) => string,
): number {
    let y = top;
    if (y + 34 > CONTENT_BOTTOM) {
        doc.addPage();
        y = CONTENT_TOP_REST;
    }
    // Überschrift wie ein Kapitel der Offerte: 11.4 pt fett in Navy.
    doc.setFont(FONT, 'bold');
    doc.setFontSize(11.4);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(L.changesTitle, ML, y + 4);
    return drawChangesTable(doc, y + 7, changes, L, upper);
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPLAMLAR — eine Karte rechts unter der Tabelle, das Total fett in Navy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Die Zeilen der Summen (Brutto · Rabatt · Netto · Zusatzkosten einzeln · MwSt)
 * und das Total — die Rechnung ist unverändert, nur das Blatt ist das der
 * Offerte (`drawOfferTotals`). Das Total ist auf zwei Stellen gerundet.
 */
function totalsRows(
    doc: jsPDF,
    order: PurchaseOrderRow,
    fmt: (v: number) => string,
    L: OrderPdfStrings,
    hasGrossRow: boolean,
    hasVatRow: boolean,
    fees: Array<{ name: string; amount: number }>,
): { rows: Array<[string, string]>; grand: [string, string] } {
    const rows: Array<[string, string]> = [];
    if (hasGrossRow) {
        rows.push([L.gross, fmt(order.totalGross)]);
        rows.push([L.discount, `− ${fmt(Math.max(0, order.totalGross - order.totalNet))}`]);
    }
    const feesTotal = Math.round(fees.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0) * 100) / 100;
    if (hasVatRow || fees.length) rows.push([L.netSubtotal, fmt(order.totalNet)]);
    for (const fee of fees) rows.push([clampText(doc, fee.name, 50, 9), fmt(Number(fee.amount) || 0)]);
    if (hasVatRow) {
        const rate = order.vatMode === 'TOTAL' ? (order.orderVatRate || 0) : 0;
        rows.push([rate > 0 ? `${L.vat} ${fmtPercent(rate)}` : L.vat, fmt(order.totalVat || 0)]);
    }
    const grandTotal = Math.round((order.totalNet + feesTotal + (hasVatRow ? (order.totalVat || 0) : 0)) * 100) / 100;
    return { rows, grand: [L.grandTotal, fmt(grandTotal)] };
}

// ─────────────────────────────────────────────────────────────────────────────

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
