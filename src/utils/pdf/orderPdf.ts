/**
 * ── SATIN ALMA SİPARİŞİ PDF ŞABLONU ─────────────────────────────────────────
 * Tedarikçiye giden sipariş belgesi (Bestellung). Twin von `priceRequestPdf.ts`
 * — Masse und Toene gemeinsam ändern.
 *
 * DAS BLATT NACH DER REFERENZ (Vorgabe Samet, 11.09.2026: «fiyat teklifi talebi
 * ve sipariş de bu tasarımda olsun — sadece daha temiz; karttaki veriler ve
 * tenant adresleri olduğu gibi kalsın»):
 *  - Briefkopf: Logo, Welle, Kontaktzeile in feinem Grau.
 *  - Links die hellgraue, abgerundete KARTE: Bestellung / Besteller / Datum /
 *    Ihre Angebots-Nr. / Projekt / EMPFÄNGER / Lieferant — Empfänger in der
 *    Karte, nicht im Adressblock; kein Status (Entscheide vom 02.08.2026).
 *    Rechts der Absender DES MANDANTEN klein und grau (`companySenderLine`:
 *    `usePdfSettings()` legt Name und eigene Adresse des aktiven Mandanten
 *    über die Firmendaten), darunter der Lieferant mit seiner Adresse.
 *  - Titel «Bestellung BE-2026-004» und das volle Anschreiben (AB +
 *    Liefertermin, AGB, Gruss — 2026-08-21). Bleibt darunter genug Platz,
 *    beginnt die Tabelle gleich dort, sonst auf der nächsten Seite.
 *  - Tabelle offen: Titel in kleinen grauen Grossbuchstaben, nur Haarlinien.
 *    Spalten: Pos, Beschreibung (Serien-Nr. darunter), eigene Spalten, Menge,
 *    Einzelpreis, Nettopreis, Rabatt (bis drei ÜBEREINANDER), MwSt, Betrag —
 *    Einzelpreis / Rabatt / MwSt nur, wenn die Bestellung sie hat und die
 *    Vorlage sie nicht ausblendet.
 *  - Summen als Karte in derselben Sprache wie die Angabenkarte: Brutto,
 *    Rabatt, Netto, Zusatzkosten (einzeln mit Namen), MwSt, GESAMT.
 *  - Im Fuss der Absender und «Bestellung BE-… · Seite n von m».
 */
import { jsPDF } from 'jspdf';
import { companySenderLine, drawAddressBlockLines, drawFittedSingleLine } from './addressBlock';
import type { PdfCompanySettings } from '../../store/pdfSettingsStore';
import type { PurchaseOrderRow } from '../../types/inventory';
import { resolveSupplierPdfColumns, type SupplierPdfColumn } from './supplierPdfColumns';
import { itemDisplayNetPrice } from '../../pages/inventory/utils/orderPricing';

import liberationBoldUrl from '../../assets/fonts/LiberationSans-Bold.ttf?url';
import liberationRegularUrl from '../../assets/fonts/LiberationSans-Regular.ttf?url';
import offitecLogoUrl from '../../assets/images/offitec.png?url';
import headerWaveUrl from '../../assets/images/header-wave.svg?url';
import { localizePurchaseCode } from '@/utils/purchaseCode';

export type OrderPdfLang = 'tr' | 'de' | 'en';

interface OrderPdfStrings {
    docTitle: string;
    orderNumber: string;
    orderDate: string;
    orderedBy: string;
    quoteNumber: string;
    project: string;
    supplier: string;
    greeting: string;
    intro: string;
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
        project: 'Proje',
        supplier: 'Tedarikçi',
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
    },
    de: {
        // BELGE ALMANCADA "BESTELLUNG"DUR (kullanıcı isteği 2026-08-03; arada
        // denenen "Auftrag" geri alındı): başlık satırı "Bestellung BE-2026-001"
        // olarak basılır. Diğer dillerde belge adı kendi dilindedir
        // (Sipariş / Purchase Order).
        docTitle: 'Bestellung',
        orderNumber: 'Bestellung',
        orderDate: 'Bestelldatum',
        orderedBy: 'Besteller',
        quoteNumber: 'Ihre Angebots-Nr.',
        project: 'Projekt',
        supplier: 'Lieferant',
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
    },
    en: {
        docTitle: 'Purchase Order',
        orderNumber: 'Order no.',
        orderDate: 'Order Date',
        orderedBy: 'Ordered by',
        quoteNumber: 'Your Quote No.',
        project: 'Project',
        supplier: 'Supplier',
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
    },
};

// ── Sayfa geometrisi (A4, mm) — priceRequestPdf ile birebir ──────────────────
/* Die Raender sind seit dem 09.09.2026 zwei Millimeter schmaler (Vorgabe
   Samet: «margini azaltin, ama sigmali ve duezguen durmali»): 12 statt 14 mm
   links, 198 statt 196 mm rechts — vier Millimeter mehr fuer die Tabelle,
   ohne dass ein Drucker etwas abschneidet. */
const ML = 12;
const MR = 198;
const CONTENT_W = MR - ML;
const PT_MM = 25.4 / 72;

/* Briefkopf nach der Referenz (11.09.2026): Logo und Welle etwas kleiner, die
   Kontaktzeile hoeher — die Karte beginnt gleich darunter. */
const LOGO_X = ML;
const LOGO_Y = 8.2;
const LOGO_H = 11.6;
const LOGO_MAX_W = 50;

/** Oberkante der Karte (Seite 1) und des Tabellenkopfs (Folgeseiten). */
const CONTENT_TOP_FIRST = 31.4;
const CONTENT_TOP_REST = 36;
/** Unterste Zeilenkante — der Fuss liegt tiefer (Linie bei 288 mm). */
const CONTENT_BOTTOM = 278;
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

/* Die Tabelle nach der Referenz (11.09.2026): OFFEN — kein Rahmen, kein
   getoenter Kopf, keine senkrechten Linien. Pos ohne Titel 1.9 mm vom Rand,
   4.2 mm Luft zwischen zwei Spalten, der Betrag endet 1.9 mm vor dem rechten
   Rand. */
const C_POS_X = ML + 1.9;
const C_DESC = ML + 7.9;
const C_PRICE_R = MR - 1.9;
/* Der Produktname steht in NORMALER Schrift (Vorgabe Samet, 11.09.2026: «die
   Namen sind viel zu fett und nehmen zu viel Platz») — er hebt sich durch
   den dunkleren Ton von den eigenen Spalten ab, nicht durch Fett. */
const NAME_STYLE = 'normal' as const;

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
const DESC_FLOOR_W = 60;

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
}

/** Luft zwischen zwei Spalten (Referenz: 2.1 mm Innenabstand auf jeder Seite). */
const GAP = 4.2;

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
    doc.setFont(FONT, 'normal');
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
    fs: number,
    valueStyle: 'normal' | 'bold' = 'normal',
): MeasuredColumn => {
    const headSize = HEAD_FS;
    const headMin = widestCaptionWord(doc, header, headSize);
    const headFull = captionWidth(doc, header, headSize);
    const valueMin = Math.max(0, ...values.map((value) => widestWord(doc, value, valueStyle, fs)));
    const valueFull = Math.max(0, ...values.map((value) => fullWidth(doc, value, valueStyle, fs)));
    /* Eine Zahl ist EIN Wort: «CHF 9.514,96» darf nicht an seinem Leerzeichen
       gemessen werden, sonst bekommt die Betragsspalte nur Platz fuer die
       Ziffern. Rechtsbuendige Spalten sind Zahlen. */
    const valueNeed = align === 'right' ? valueFull : valueMin;
    // Drei Prozent Luft: `splitTextToSize` misst einen Hauch strenger als
    // `getTextWidth` und hackte sonst den letzten Buchstaben ab.
    const min = Math.max(headMin, valueNeed) * 1.03 + GAP;
    return {
        kind,
        min,
        full: Math.max(min, Math.max(headFull, valueFull) * 1.03 + GAP),
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
const buildTableLayout = (
    doc: jsPDF,
    order: PurchaseOrderRow,
    columns: SupplierPdfColumn[],
    fmt: (value: number) => string,
): TableLayout => {
    const items = order.items ?? [];
    const names = items.map((item) => (item.name || '').trim());
    const totalVatRate = order.vatMode === 'TOTAL' ? (order.orderVatRate || 0) : null;
    const desc = columns.find((column) => column.kind === 'desc');
    const others = columns.filter((column) => column.kind !== 'desc');
    // Der Betrag endet an `C_PRICE_R` — sein eigener Abstand faellt dort weg.
    const room = C_PRICE_R + GAP - C_DESC;
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
    const measureAll = (fs: number): MeasuredColumn[] =>
        others.map((column, index) => measureColumn(doc, column.key, column.caption, valuesOf(column, aligns[index]), aligns[index], fs));
    const descMinFor = (fs: number): number => Math.max(
        DESC_MIN_W,
        widestCaptionWord(doc, desc?.caption ?? '', HEAD_FS) * 1.03 + GAP,
        ...names.map((name) => widestWord(doc, name, NAME_STYLE, fs) * 1.03 + GAP),
    );
    const minSumOf = (measured: MeasuredColumn[]) => measured.reduce((sum, column) => sum + column.min, 0);

    /* ── Die Schrift: die groesste Stufe, bei der jede Spalte ihr Mindestmass
       bekommt. Sie gilt fuer die GANZE Tabelle — Titel, Namen, Werte. ─────── */
    let fs = TABLE_SIZES[TABLE_SIZES.length - 1];
    for (const size of TABLE_SIZES) {
        if (minSumOf(measureAll(size)) + descMinFor(size) <= room) { fs = size; break; }
    }
    const measured = measureAll(fs);
    const descMin = descMinFor(fs);
    const minSum = minSumOf(measured);

    let widths: number[];
    let descW: number;
    if (minSum + descMin > room) {
        /* Selbst die kleinste Stufe traegt die Mindestmasse nicht (sechs
           breite eigene Spalten neben einem langen Produktwort). Dann gibt
           ZUERST die Beschreibung nach — bis auf ihr hartes Minimum —, und erst
           danach die TEXTSPALTEN (eigene Angaben), anteilig. Die
           Zahlenspalten geben nie nach. */
        descW = Math.max(DESC_MIN_W, room - minSum);
        const deficit = Math.max(0, minSum + descW - room);
        const textMin = measured.reduce((sum, column) => sum + (column.align === 'left' ? column.min : 0), 0);
        const textScale = textMin > 0 ? Math.max(0.5, (textMin - deficit) / textMin) : 1;
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
        const descFull = Math.max(descMin, ...names.map((name) => fullWidth(doc, name, NAME_STYLE, fs) * 1.03 + GAP));
        const floorGrow = Math.min(spare, Math.max(0, Math.min(DESC_FLOOR_W, descFull) - descMin));
        spare -= floorGrow;
        spare = growToward(widths, measured.map((column) => column.full), spare);
        descW = descMin + floorGrow + spare;
    }

    /* ── Von links nach rechts aufstellen — in der Reihenfolge der Vorlage ── */
    const cells: LayoutCell[] = [];
    let x = C_DESC;
    let descX = C_DESC;
    let descEnd = C_DESC + descW - GAP;
    let position = 0;
    for (const column of columns) {
        if (column.kind === 'desc') {
            descX = x;
            descEnd = x + descW - GAP;
            cells.push({ column, x, width: descW, align: 'left' });
            x += descW;
            continue;
        }
        const width = widths[position];
        cells.push({ column, x, width, align: aligns[position] });
        x += width;
        position += 1;
    }
    return { cells, descX, descEnd, fs, lh: fs * LH_RATIO };
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
const TABLE_SIZES = [8, 7.4, 6.8];
/** Spaltentitel: immer 5.6 pt. */
const HEAD_FS = 5.6;
const PX_MM = 25.4 / 96;
/** Sperrung der Spaltentitel je Zeichen: 0.35 px. */
const CAPTION_SPACING = 0.35 * PX_MM;
/** Zeilenabstand zweizeiliger Titel in mm je pt (5.6 pt → 2.4 mm). */
const CAPTION_LH = 0.425;
/** Zeilenabstand in mm je pt Schrift (8 pt → 4.1 mm, Faktor 1.45). */
const LH_RATIO = 0.51;
/** Ober- und Unterlaenge in mm je pt — setzen erste Grundlinie und Zeilenhoehe. */
const CAP_RATIO = 0.254;
const DESCENT_RATIO = 0.078;
const ROW_PAD_T = 3.9;
const ROW_PAD_B = 3.75;
const MIN_ROW_START = 14;
/** Tabellenkopf: vom oberen Rand bis zur Oberlaenge, von der letzten Titelzeile bis zur Linie. */
const HEAD_PAD_T = 1.6;
const HEAD_PAD_B = 3;
/** Luecke zwischen Produktname und Seriennummer darunter. */
const META_GAP = 0.8;
/** Die Pos-Nummer steht eine Spur kleiner als die Tabelle. */
const POS_RATIO = 0.925;
const HAIRLINE_W = 0.26;

const FS_LETTER = 8.4;
const LETTER_LHF = 1.45;
const FS_FOOTER = 5.25;

/* Die Karte oben links (Referenz): hellgrau, abgerundet, 83.6 mm breit — die
   Summenkarte unten rechts hat dieselben Masse. */
const CARD_W = 83.6;
const CARD_RADIUS = 3;
const CARD_PAD = 2.4;
const CARD_ROW_H = 7.4;
const CARD_BASELINE = 4.37;
const CARD_INSET = 4.1;
const CARD_LABEL_FS = 7.6;
const CARD_VALUE_FS = 8.2;
const CARD_VALUE_LH = 3.6;
/** Linke Kante des Absender- und Lieferantenblocks rechts. */
const ADDR_X = ML + 94;

const COLOR_NAVY = [22, 32, 92] as const;
const COLOR_TEXT = [29, 29, 31] as const;
const COLOR_TEXT_2 = [72, 72, 74] as const;
const COLOR_CAPTION = [110, 110, 115] as const;
const COLOR_MUTED = [142, 142, 147] as const;
/** Spaltentitel: #8E8E92. */
const COLOR_COLUMN_HEAD = [142, 142, 146] as const;
const COLOR_POS = [161, 161, 166] as const;
const COLOR_SENDER = [154, 154, 160] as const;
const COLOR_HAIRLINE = [239, 239, 242] as const;
const COLOR_RULE = [210, 210, 215] as const;
const COLOR_DIVIDER = [229, 229, 234] as const;
const COLOR_CARD_FILL = [245, 245, 247] as const;
const COLOR_CARD_EDGE = [235, 235, 239] as const;
const COLOR_CARD_LINE = [231, 231, 236] as const;

const CONTACT_PHONE = '+41 56 556 24 68';
const CONTACT_EMAIL = 'info@offitec.ch';
const CONTACT_WEB = 'www.offitec.ch';

// ── Fontlar / logo / dalga (teklif şablonundaki yükleyicilerle aynı) ─────────
/* Liberation Sans (SIL OFL, die Lizenz liegt neben den Dateien) — Vorgabe
   Samet, 11.09.2026. Dieselben Laufweiten wie Arial: keine Spalte verschiebt sich. */
const FONT = 'LiberationSans';
let fontFiles: { regular: string; bold: string } | null = null;

const bufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
};

async function registerFonts(doc: jsPDF) {
    if (!fontFiles) {
        const [regular, bold] = await Promise.all([
            fetch(liberationRegularUrl).then((r) => r.arrayBuffer()),
            fetch(liberationBoldUrl).then((r) => r.arrayBuffer()),
        ]);
        fontFiles = { regular: bufferToBase64(regular), bold: bufferToBase64(bold) };
    }
    doc.addFileToVFS('LiberationSans-Regular.ttf', fontFiles.regular);
    doc.addFileToVFS('LiberationSans-Bold.ttf', fontFiles.bold);
    doc.addFont('LiberationSans-Regular.ttf', FONT, 'normal');
    doc.addFont('LiberationSans-Bold.ttf', FONT, 'bold');
    doc.setFont(FONT, 'normal');
}

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

/* Die Welle der Referenz: dasselbe Bild auf 0.875 verkleinert, am rechten Rand. */
const WAVE_W = 127.8;
const WAVE_H = 24.6;
const WAVE_TOP = 3.2;
const WAVE_RASTER_DPI = 400;
const WAVE_VIEW = '0 0 1460 280';

let wavePngCache: { key: string; dataUrl: string } | null = null;

async function loadHeaderWave(wMm: number, hMm: number): Promise<string | null> {
    const key = `${wMm.toFixed(2)}x${hMm.toFixed(2)}`;
    if (wavePngCache?.key === key) return wavePngCache.dataUrl;
    try {
        const pxW = Math.round((wMm / 25.4) * WAVE_RASTER_DPI);
        const pxH = Math.round((hMm / 25.4) * WAVE_RASTER_DPI);
        const svgText = await fetch(headerWaveUrl).then((r) => r.text());
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

const fmtDateShort = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    // GG.AA.YY — "21.08.26" (kullanıcı isteği 2026-08-21: yy-mm-dd sıralaması
    // karşı tarafça anlaşılmıyordu; müşteri teklif PDF'i de GG.AA.YYYY kullanır).
    return `${dd}.${mm}.${yy}`;
};

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
    const order = { ...sourceOrder, referenceNumber: localizePurchaseCode(sourceOrder.referenceNumber, lang) };
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    // Der Titel ersetzt in der Vorschau (blob:-URL) die UUID als Dokumentname.
    doc.setProperties({ title: order.referenceNumber || 'Bestellung' });
    doc.viewerPreferences({ DisplayDocTitle: true });
    await registerFonts(doc);
    // Jede Zeile setzt ihre Sperrung selbst (0 Tc) — sonst erbte der Text nach
    // einem gesperrten Spaltentitel dessen Sperrung.
    doc.setCharSpace(0);
    const logo = await loadLogo(doc);
    const wave = await loadHeaderWave(WAVE_W, WAVE_H);
    const fmt = fmtMoneyForCurrency(order.currency || settings.currency);
    const L = I18N[lang];
    // Die Tabelle traegt ihre Titel in Grossbuchstaben (Referenz).
    const upper = (label: string) => label.toLocaleUpperCase(captionLocale(label, lang));

    // ── Seite 1: Karte, Adressen, Titel, Anschreiben ─────────────────────────
    const letterEnd = drawCoverPage(doc, order, settings, L);

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
            'net',
            ...(orderHasDiscount(order) && !hidden.has('discount') ? ['disc' as const] : []),
            ...(orderHasVat(order) ? ['vat' as const] : []),
            'price',
        ],
        hidden: new Set([...hidden, 'code']),
        maxExtras: PDF_MAX_EXTRA_COLUMNS,
    }).map((column) => ({ ...column, caption: upper(column.caption) }));
    const layout = buildTableLayout(doc, order, columns, fmt);
    // Bleibt unter dem Anschreiben genug Platz, beginnt die Tabelle dort;
    // das volle Standard-Anschreiben fuellt Seite 1, dann steht sie auf Seite 2.
    const st: TableState = { y: 0 };
    if (CONTENT_BOTTOM - letterEnd >= TABLE_START_MIN) {
        st.y = drawTableHeader(doc, letterEnd + TABLE_GAP, layout);
    } else {
        doc.addPage();
        st.y = drawTableHeader(doc, CONTENT_TOP_REST, layout);
    }

    order.items.forEach((item, index) => {
        const h = measureRow(doc, item, L, layout);
        if (st.y + h > CONTENT_BOTTOM || CONTENT_BOTTOM - st.y < MIN_ROW_START) {
            newTablePage(doc, st, layout);
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
            order.vatMode === 'TOTAL' ? (order.orderVatRate || 0) : null,
        );
    });
    closeTable(doc, st.y);

    // ── Toplamlar (en altta) ─────────────────────────────────────────────────
    const hasGrossRow = (order.totalGross || 0) > (order.totalNet || 0) + 0.005;
    const hasVatRow = (order.totalVat || 0) > 0.005;
    // Ek ücretler (nakliye, ambalaj…): her biri toplam bloğunda kendi satırını
    // alır, bu yüzden blok yüksekliğine de girer.
    const fees = (order.additionalFees ?? []).filter((fee) => (fee?.name || '').trim() || fee?.amount);
    const totalRows = (hasGrossRow ? 2 : 0) + (hasVatRow || fees.length ? 1 : 0) + fees.length + (hasVatRow ? 1 : 0);
    const totalsBlockHeight = 6 + totalsHeight(totalRows);
    let y = st.y;
    if (y + totalsBlockHeight > CONTENT_BOTTOM) {
        doc.addPage();
        y = CONTENT_TOP_REST;
    } else {
        y += 6;
    }
    drawTotals(doc, y, order, fmt, L, hasGrossRow, hasVatRow, fees);

    // ── Antet & alt bilgi dekorasyonu (tüm sayfalar) ─────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawPageHeader(doc, logo, wave, settings);
        drawPageFooter(doc, i, pageCount, L, order, settings);
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
// ANTET & ALT BİLGİ — priceRequestPdf ile birebir
// ─────────────────────────────────────────────────────────────────────────────

type ContactIcon = 'phone' | 'mail' | 'web';

/** Breite der Kontaktsymbole (mm) — feine graue Umrisse wie in der Referenz. */
const CONTACT_ICON_W: Record<ContactIcon, number> = { phone: 1.25, mail: 2.4, web: 2.3 };

function drawContactIcon(doc: jsPDF, kind: ContactIcon, x: number, midY: number) {
    doc.setDrawColor(...COLOR_MUTED);
    doc.setLineWidth(0.2);
    if (kind === 'phone') {
        const w = CONTACT_ICON_W.phone;
        const h = 2.5;
        const top = midY - h / 2;
        doc.roundedRect(x, top, w, h, 0.3, 0.3, 'S');
        doc.line(x + w / 2 - 0.15, top + h - 0.45, x + w / 2 + 0.15, top + h - 0.45);
    } else if (kind === 'mail') {
        const w = CONTACT_ICON_W.mail;
        const h = 1.75;
        const top = midY - h / 2;
        doc.roundedRect(x, top, w, h, 0.25, 0.25, 'S');
        doc.line(x + 0.15, top + 0.25, x + w / 2, top + h * 0.57);
        doc.line(x + w - 0.15, top + 0.25, x + w / 2, top + h * 0.57);
    } else {
        const r = CONTACT_ICON_W.web / 2;
        doc.circle(x + r, midY, r, 'S');
        doc.ellipse(x + r, midY, r * 0.44, r, 'S');
        doc.line(x, midY, x + 2 * r, midY);
    }
}

function drawHeaderWave(doc: jsPDF, wave: string | null) {
    if (!wave) return;
    try {
        doc.addImage(wave, 'PNG', MR - WAVE_W, WAVE_TOP, WAVE_W, WAVE_H, 'offitec-header-wave', 'FAST');
    } catch { /* şerit çizilemezse antet logo + iletişim satırı olarak kalır */ }
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
        doc.setFontSize(13);
        doc.setTextColor(...COLOR_NAVY);
        doc.text(s.companyName, ML, 16.5);
    }

    drawHeaderWave(doc, wave);

    // Kontaktzeile: 7 pt grau, rechtsbuendig; die Symbole mittig auf der Zeile.
    const baseline = 26.5;
    const midY = 25.85;
    const ICON_GAP = 2;
    const ITEM_GAP = 7.3;
    const items: Array<{ icon: ContactIcon; text: string }> = [
        { icon: 'phone', text: CONTACT_PHONE },
        { icon: 'mail', text: CONTACT_EMAIL },
        { icon: 'web', text: CONTACT_WEB },
    ];

    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    const widths = items.map((it) => CONTACT_ICON_W[it.icon] + ICON_GAP + doc.getTextWidth(it.text));
    const totalW = widths.reduce((a, b) => a + b, 0) + ITEM_GAP * (items.length - 1);

    let x = MR - totalW;
    items.forEach((it, i) => {
        drawContactIcon(doc, it.icon, x, midY);
        doc.setFont(FONT, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...COLOR_CAPTION);
        doc.text(it.text, x + CONTACT_ICON_W[it.icon] + ICON_GAP, baseline);
        x += (widths[i] ?? 0) + ITEM_GAP;
    });
}

/**
 * Der Fuss nach der Referenz: eine Haarlinie, links der Absender DES MANDANTEN
 * (Name · Adresse — die fest eingetragene Schweizer Bankverbindung ist weg,
 * sie stimmte fuer den tuerkischen Mandanten nie), rechts Dokument und Seite.
 */
function drawPageFooter(
    doc: jsPDF,
    page: number,
    total: number,
    L: OrderPdfStrings,
    order: PurchaseOrderRow,
    s: PdfCompanySettings,
) {
    doc.setFillColor(...COLOR_DIVIDER);
    doc.rect(ML, 288.13, CONTENT_W, 0.27, 'F');
    const textY = 291.85;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_FOOTER);
    doc.setTextColor(...COLOR_MUTED);
    const right = `${L.docTitle} ${order.referenceNumber}  ·  ${L.pageWord} ${page} ${L.pageOf} ${total}`;
    doc.text(right, MR, textY, { align: 'right' });
    const rightW = doc.getTextWidth(right);
    drawFittedSingleLine(doc, companySenderLine(s, '  ·  '), ML, textY, CONTENT_W - rightW - 8, FS_FOOTER, 4.4);
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 1 — Karte (links), Absender & Lieferant (rechts), Titel, Anschreiben
// ─────────────────────────────────────────────────────────────────────────────

type CardRow = [label: string, value: string, emphasize: boolean];

/**
 * Die Angabenkarte (Referenz): hellgrau, abgerundet; Beschriftung grau links,
 * Wert rechts, alle Werte in EINER Groesse — ein zu langer Wert bricht um,
 * statt kleiner zu werden. Gibt die Unterkante zurueck.
 */
function drawInfoCard(doc: jsPDF, x: number, top: number, rows: CardRow[]): number {
    const measured = rows.map(([label, value, emphasize]) => {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(CARD_LABEL_FS);
        const labelW = doc.getTextWidth(label);
        doc.setFont(FONT, emphasize ? 'bold' : 'normal');
        doc.setFontSize(CARD_VALUE_FS);
        const lines = doc.splitTextToSize(value, CARD_W - CARD_INSET * 2 - labelW - 4) as string[];
        return { label, lines, emphasize, h: CARD_ROW_H + (lines.length - 1) * CARD_VALUE_LH };
    });
    const height = CARD_PAD * 2 + measured.reduce((sum, row) => sum + row.h, 0);
    doc.setFillColor(...COLOR_CARD_FILL);
    doc.setDrawColor(...COLOR_CARD_EDGE);
    doc.setLineWidth(HAIRLINE_W);
    doc.roundedRect(x, top, CARD_W, height, CARD_RADIUS, CARD_RADIUS, 'FD');

    let y = top + CARD_PAD;
    measured.forEach((row, index) => {
        const base = y + CARD_BASELINE;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(CARD_LABEL_FS);
        doc.setTextColor(...COLOR_CAPTION);
        doc.text(row.label, x + CARD_INSET, base);
        doc.setFont(FONT, row.emphasize ? 'bold' : 'normal');
        doc.setFontSize(CARD_VALUE_FS);
        if (row.emphasize) doc.setTextColor(...COLOR_NAVY);
        else doc.setTextColor(...COLOR_TEXT);
        row.lines.forEach((line, lineIdx) => doc.text(line, x + CARD_W - CARD_INSET, base + lineIdx * CARD_VALUE_LH, { align: 'right' }));
        y += row.h;
        if (index < measured.length - 1) {
            doc.setFillColor(...COLOR_CARD_LINE);
            doc.rect(x + CARD_INSET, y - HAIRLINE_W / 2, CARD_W - CARD_INSET * 2, HAIRLINE_W, 'F');
        }
    });
    return top + height;
}

/**
 * Rechts oben: der Absender — der AKTIVE MANDANT mit Name und Adresse (hat er
 * eine eigene, legt `usePdfSettings()` sie ueber die Firmendaten) — klein und
 * grau; er darf in eine zweite Zeile umbrechen, erst eine dritte macht ihn
 * kleiner. Darunter eine Haarlinie und der Lieferant mit seiner Adresse
 * (Strasse / PLZ Ort, jede Zeile fuer sich). Gibt die Unterkante zurueck.
 */
function drawSenderAndSupplier(doc: jsPDF, order: PurchaseOrderRow, s: PdfCompanySettings): number {
    const top = CONTENT_TOP_FIRST;
    const addrW = MR - ADDR_X;
    const sender = companySenderLine(s, ' · ');
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...COLOR_SENDER);
    let size = 6.3;
    let senderLines: string[];
    do {
        doc.setFontSize(size);
        senderLines = doc.splitTextToSize(sender, addrW) as string[];
        size = Math.round((size - 0.2) * 10) / 10;
    } while (senderLines.length > 2 && size >= 5.2);
    senderLines.slice(0, 2).forEach((line, index) => doc.text(line, ADDR_X, top + 2.5 + index * 2.9));
    doc.setFillColor(...COLOR_DIVIDER);
    doc.rect(ADDR_X, top + 8.07, addrW, 0.27, 'F');

    let y = top + 15.45;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXT);
    const nameLines = doc.splitTextToSize(order.supplierName || '', addrW) as string[];
    nameLines.forEach((line, index) => doc.text(line, ADDR_X, y + index * 4.4));
    y += (Math.max(1, nameLines.length) - 1) * 4.4;
    // Alıcı adı kartta; sağ blokta e-posta yok (2026-08-02 kararları geçerli).
    if (order.supplierAddress) {
        doc.setFont(FONT, 'normal');
        doc.setTextColor(...COLOR_TEXT_2);
        y = drawAddressBlockLines(doc, order.supplierAddress, ADDR_X, y + 5.3, addrW, 8.4, 4.24) - 4.24;
    }
    return y + 1.5;
}

/** Der Titel: Dokument fett in Navy, die Nummer normal daneben. */
function drawDocTitle(doc: jsPDF, title: string, number: string, y: number) {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(title, ML, y);
    const numberX = ML + doc.getTextWidth(`${title} `);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...COLOR_TEXT);
    doc.text(number, numberX, y);
}

/** Seite 1 bis zum Anschreiben; gibt die Grundlinie seiner letzten Zeile zurueck. */
function drawCoverPage(doc: jsPDF, order: PurchaseOrderRow, s: PdfCompanySettings, L: OrderPdfStrings): number {
    const rows = ([
        [L.orderNumber, order.referenceNumber, true],
        [L.orderedBy, oneLine(order.orderedByName || ''), false],
        [L.orderDate, fmtDateShort(order.createdAt), false],
        [L.quoteNumber, oneLine(order.quoteNumber || ''), false],
        [L.project, oneLine(order.projectName || ''), false],
        [L.recipient, oneLine(order.recipientName || ''), false],
        [L.supplier, oneLine(order.supplierName), false],
    ] as CardRow[]).filter(([, value]) => value.trim().length > 0);
    const cardBottom = drawInfoCard(doc, ML, CONTENT_TOP_FIRST, rows);
    const addrBottom = drawSenderAndSupplier(doc, order, s);

    const titleY = Math.max(cardBottom, addrBottom) + 12;
    drawDocTitle(doc, L.docTitle, order.referenceNumber, titleY);

    // ÖN YAZI (Anschreiben): siparişin kendi metni, yoksa standart metin — ikisi
    // de AYNI yoldan basılır (2026-08-21); arayüzdeki
    // `inv.orders.coverLetter.defaultText` yer tutucusuyla birlikte güncellenir.
    const y = titleY + 7.9;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_LETTER);
    doc.setTextColor(...COLOR_TEXT_2);
    const coverLetter = (order.coverLetter || '').trim() || `${L.greeting}\n\n${L.intro}`;
    // Sayfa taşmasın: kalan boşluğa sığan satır kadar basılır.
    const letterLh = FS_LETTER * PT_MM * LETTER_LHF;
    const maxLines = Math.max(4, Math.floor((COVER_LETTER_BOTTOM - y) / letterLh) + 1);
    const coverLines = coverLetter
        .split('\n')
        .flatMap((line) => (line.trim() ? (doc.splitTextToSize(line, CONTENT_W) as string[]) : ['']))
        .slice(0, maxLines);
    doc.text(coverLines, ML, y, { lineHeightFactor: LETTER_LHF });
    return y + (coverLines.length - 1) * letterLh;
}

// ─────────────────────────────────────────────────────────────────────────────
// TABELLE — Kopf, düz satırlar, Schlusslinie
// ─────────────────────────────────────────────────────────────────────────────

interface TableState { y: number }

function newTablePage(doc: jsPDF, st: TableState, layout: TableLayout) {
    doc.addPage();
    st.y = drawTableHeader(doc, CONTENT_TOP_REST, layout);
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
        let run = '';
        pieces.forEach((piece, index) => {
            const last = index === pieces.length - 1;
            const trial = run + piece;
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
    const floor = Math.max(4.6, base - 1);
    let size = base;
    while (size > floor && splitCaption(doc, label, width, size).chopped) size -= 0.2;
    return size;
}

function drawTableHeader(doc: jsPDF, y: number, layout: TableLayout): number {
    // Die Pos-Spalte hat keinen Titel (Referenz). Rechtsbuendige Titel stehen
    // mit ihrer RECHTEN Kante auf der Kante ihrer Zahlen. Die Titel sind die
    // Namen der Vorlage, in ihrer Reihenfolge.
    type Spec = [string, number, number, 'left' | 'right'];
    const specs: Spec[] = layout.cells.map((cell): Spec => {
        const width = cell.width - GAP;
        return [cell.column.caption, cell.align === 'right' ? cell.x + width : cell.x, width, cell.align];
    });
    const base = HEAD_FS;
    const rowSize = Math.min(base, ...specs.map(([label, , maxW]) => headerSizeFor(doc, label, maxW, base)));
    const cells: HeadCell[] = specs.map(([label, x, maxW, align]) =>
        ({ lines: splitCaption(doc, label, Math.max(4, maxW), rowSize).lines, x, align }));
    const lineCount = Math.max(1, ...cells.map((cell) => cell.lines.length));
    const headLh = rowSize * CAPTION_LH;
    const bottom = y + HEAD_PAD_T + rowSize * CAP_RATIO + (lineCount - 1) * headLh;

    doc.setFont(FONT, 'normal');
    doc.setFontSize(rowSize);
    doc.setTextColor(...COLOR_COLUMN_HEAD);
    for (const cell of cells) {
        cell.lines.forEach((line, index) => {
            const ly = bottom - (cell.lines.length - 1 - index) * headLh;
            const lx = cell.align === 'right' ? cell.x - captionWidth(doc, line, rowSize) + CAPTION_SPACING : cell.x;
            doc.text(line, lx, ly, { charSpace: CAPTION_SPACING });
        });
    }
    const ruleY = bottom + HEAD_PAD_B;
    drawRule(doc, ruleY, COLOR_RULE);
    return ruleY;
}

/** Eine Linie ueber die ganze Breite: Haarlinie zwischen Zeilen, Linie unter Kopf und Tabelle. */
function drawRule(doc: jsPDF, y: number, tone: readonly [number, number, number]) {
    doc.setFillColor(tone[0], tone[1], tone[2]);
    doc.rect(ML, y - HAIRLINE_W / 2, CONTENT_W, HAIRLINE_W, 'F');
}

/** Das Ende der Tabelle: die letzte Haarlinie wird zur dunkleren Schlusslinie (Referenz). */
function closeTable(doc: jsPDF, bottom: number) {
    drawRule(doc, bottom, COLOR_RULE);
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

/**
 * Açıklama hücresi: ürün adı (tablonun TEK puntosunda) + seri no ikinci
 * satırda (soluk). Seri KOD ve indirimler kendi sütunlarında durur — nichts
 * wandert unter den Produktnamen (Vorgabe Samet, 09.09.2026).
 */
function buildRowLines(
    doc: jsPDF,
    item: OrderItem,
    L: OrderPdfStrings,
    layout: TableLayout,
): { title: string[]; meta: string[] } {
    const descW = layout.descEnd - layout.descX;
    doc.setFont(FONT, NAME_STYLE);
    doc.setFontSize(layout.fs);
    const title = doc.splitTextToSize((item.name || '').trim(), descW) as string[];
    /* Unter dem Namen steht nur die SERIENNUMMER einer von Hand erfassten
       Zeile; bringt sie ihre Beschriftung schon mit (Doppelpunkt), kommt kein
       zweites «Serien-Nr.:» davor. */
    const serial = (item.serialNumber || '').trim();
    let meta: string[] = [];
    if (serial) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(layout.fs * 0.92);
        meta = doc.splitTextToSize(serial.includes(':') ? serial : `${L.serialShort}: ${serial}`, descW) as string[];
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

/** Hoehe der Beschreibungszelle ab der ersten Grundlinie (Name + Seriennummer). */
function descBlockH(title: string[], meta: string[], layout: TableLayout): number {
    return (title.length - 1) * layout.lh + (meta.length ? META_GAP + meta.length * layout.lh * 0.92 : 0);
}

function measureRow(doc: jsPDF, item: OrderItem, L: OrderPdfStrings, layout: TableLayout): number {
    const { title, meta } = buildRowLines(doc, item, L, layout);
    // Die eigenen Textspalten brechen in ihrer Spalte um, die Rabatte stehen
    // ALT ALTA — die hoechste Zelle bestimmt die Zeile. Alle Zellen teilen
    // EINE Grundlinie; eine Zahl bricht nicht um. Birim satırı yok (2026-08-21).
    const cellLineCounts = layout.cells.map((cell) => {
        if (cell.column.kind === 'disc') return Math.max(1, discountLines(item).length);
        if (cell.column.kind !== 'extra' || cell.align === 'right') return 1;
        return cellLines(doc, extraValue(item, cell.column.key), cell.width - GAP, layout.fs).length;
    });
    const belowFirst = Math.max(descBlockH(title, meta, layout), (Math.max(1, ...cellLineCounts) - 1) * layout.lh);
    return ROW_PAD_T + ROW_PAD_B + layout.fs * (CAP_RATIO + DESCENT_RATIO) + belowFirst;
}

function drawRow(
    doc: jsPDF,
    item: OrderItem,
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
    const baseY = y + ROW_PAD_T + fs * CAP_RATIO;

    // Pos: schlichte Nummer, blass, eine Spur kleiner.
    doc.setFont(FONT, 'normal');
    doc.setFontSize(fs * POS_RATIO);
    doc.setTextColor(...COLOR_POS);
    doc.text(String(index + 1), C_POS_X, baseY);
    doc.setFontSize(fs);

    // Sayısal sütunlar: miktar, brüt, net, indirim(ler), KDV, tutar (İNDİRİMLİ
    // NET + satır KDV'si). Alle in derselben Schrift, nichts fett: Menge und
    // Betrag dunkel, die Preise eine Stufe weicher, «—» blass.
    const tone = (value: number) => {
        if (value > 0) doc.setTextColor(...COLOR_TEXT_2);
        else doc.setTextColor(...COLOR_MUTED);
    };

    for (const cell of layout.cells) {
        const width = cell.width - GAP;
        const right = cell.x + width;
        switch (cell.column.kind) {
            case 'desc': {
                let cy = baseY;
                doc.setFont(FONT, NAME_STYLE);
                doc.setTextColor(...COLOR_TEXT);
                for (const line of title) {
                    doc.text(line, cell.x, cy);
                    cy += lh;
                }
                if (meta.length) {
                    cy += META_GAP - lh + lh * 0.92;
                    doc.setFont(FONT, 'normal');
                    doc.setFontSize(fs * 0.92);
                    doc.setTextColor(...COLOR_CAPTION);
                    for (const line of meta) {
                        doc.text(line, cell.x, cy);
                        cy += lh * 0.92;
                    }
                    doc.setFontSize(fs);
                }
                break;
            }
            case 'extra': {
                // Eigene Spalten: eine Stufe weicher im Ton; eine leere Zelle oder
                // eine Null steht blass. Zahlen stehen rechtsbuendig und brechen nicht um.
                const raw = extraRaw(item, cell.column.key);
                if (!raw || isZeroText(raw)) doc.setTextColor(...COLOR_MUTED);
                else doc.setTextColor(...COLOR_TEXT_2);
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
                tone(item.grossPrice || 0);
                drawFittedRight(doc, (item.grossPrice || 0) > 0 ? fmtUnitPrice(item.grossPrice) : '—', right, width, baseY, 'normal', fs);
                break;
            case 'net': {
                // Net fiyat sütununda TEDARİKÇİ LİSTESİNDEKİ fiyat görünür (varsa);
                // tedarikçi hesabında satır indirimleri de iner (19.09.2026).
                const shownNet = itemDisplayNetPrice(item);
                tone(shownNet);
                drawFittedRight(doc, shownNet > 0 ? fmtUnitPrice(shownNet) : '—', right, width, baseY, 'normal', fs);
                break;
            }
            case 'disc': {
                const discounts = discountLines(item);
                tone(discounts.length);
                (discounts.length ? discounts : ['—']).forEach((line, lineIdx) => {
                    drawFittedRight(doc, line, right, width, baseY + lineIdx * lh, 'normal', fs);
                });
                break;
            }
            case 'vat':
                tone(item.vatRate || 0);
                drawFittedRight(doc, fmtPercent(item.vatRate || 0), right, width, baseY, 'normal', fs);
                break;
            default: {
                const lineVat = totalVatRate === null
                    ? (item.lineVat || 0)
                    : (item.lineTotal || 0) * (totalVatRate / 100);
                const payableTotal = Math.round(((item.lineTotal || 0) + lineVat) * 100) / 100;
                doc.setTextColor(...COLOR_TEXT);
                drawFittedRight(doc, fmt(payableTotal), right, width, baseY, 'normal', fs);
                break;
            }
        }
    }
    doc.setFont(FONT, 'normal');

    drawRule(doc, y + rowH, COLOR_HAIRLINE);
    return y + rowH;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPLAMLAR — eine Karte rechts unter der Tabelle, das Total fett in Navy
// ─────────────────────────────────────────────────────────────────────────────

/** Hoehe einer Summenzeile und des Totals (mm) — `buildOrderPdfBytes` rechnet damit. */
const TOTAL_ROW_H = CARD_ROW_H;
const GRAND_ROW_H = 9;
const FS_GRAND = 9.6;

/** Hoehe der Summenkarte bei `rowCount` Zeilen ueber dem Total. */
const totalsHeight = (rowCount: number): number => CARD_PAD * 2 + rowCount * TOTAL_ROW_H + GRAND_ROW_H;

function drawTotals(
    doc: jsPDF,
    y: number,
    order: PurchaseOrderRow,
    fmt: (v: number) => string,
    L: OrderPdfStrings,
    hasGrossRow: boolean,
    hasVatRow: boolean,
    fees: Array<{ name: string; amount: number }>
) {
    /* Die Summen als KARTE — dieselbe Sprache wie die Angabenkarte oben
       (Referenz, 11.09.2026): hellgrau, abgerundet, Beschriftung grau links,
       Betrag rechts, eingerueckte Haarlinien; das Total fett in Navy. Die
       Rechnung selbst ist unveraendert. */
    const x = MR - CARD_W;
    const rows: Array<[string, string]> = [];
    // Brüt/net farkı varsa indirim dökümünü göster.
    if (hasGrossRow) {
        rows.push([L.gross, fmt(order.totalGross)]);
        rows.push([L.discount, `− ${fmt(Math.max(0, order.totalGross - order.totalNet))}`]);
    }
    // KDV ya da ek ücret varsa net ara toplam; ek ücretler adıyla tek tek.
    const feesTotal = Math.round(fees.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0) * 100) / 100;
    if (hasVatRow || fees.length) {
        rows.push([L.netSubtotal, fmt(order.totalNet)]);
    }
    for (const fee of fees) {
        rows.push([clampText(doc, fee.name, CARD_W - CARD_INSET * 2 - 30, CARD_LABEL_FS), fmt(Number(fee.amount) || 0)]);
    }
    if (hasVatRow) {
        const rate = order.vatMode === 'TOTAL' ? (order.orderVatRate || 0) : 0;
        rows.push([rate > 0 ? `${L.vat} ${fmtPercent(rate)}` : L.vat, fmt(order.totalVat || 0)]);
    }
    // Genel toplam İKİ ONDALIĞA yuvarlanır (2026-08-02).
    const grandTotal = Math.round((order.totalNet + feesTotal + (hasVatRow ? (order.totalVat || 0) : 0)) * 100) / 100;

    doc.setFillColor(...COLOR_CARD_FILL);
    doc.setDrawColor(...COLOR_CARD_EDGE);
    doc.setLineWidth(HAIRLINE_W);
    doc.roundedRect(x, y, CARD_W, totalsHeight(rows.length), CARD_RADIUS, CARD_RADIUS, 'FD');

    let cy = y + CARD_PAD;
    for (const [label, value] of rows) {
        const base = cy + CARD_BASELINE;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(CARD_LABEL_FS);
        doc.setTextColor(...COLOR_CAPTION);
        doc.text(label, x + CARD_INSET, base);
        doc.setFontSize(CARD_VALUE_FS);
        doc.setTextColor(...COLOR_TEXT);
        doc.text(value, x + CARD_W - CARD_INSET, base, { align: 'right' });
        cy += TOTAL_ROW_H;
        doc.setFillColor(...COLOR_CARD_LINE);
        doc.rect(x + CARD_INSET, cy - HAIRLINE_W / 2, CARD_W - CARD_INSET * 2, HAIRLINE_W, 'F');
    }
    const base = cy + GRAND_ROW_H / 2 + 1.3;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_GRAND);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(L.grandTotal, x + CARD_INSET, base);
    doc.text(fmt(grandTotal), x + CARD_W - CARD_INSET, base, { align: 'right' });
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
