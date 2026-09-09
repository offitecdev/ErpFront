/**
 * ── NACHTRAGS-PDF (Zusatzauftrag, NT-…) ──────────────────────────────────────
 * Der EIGENE Beleg eines Zusatzauftrags — bis 05.09.2026 hatte er keinen: der
 * Hauptauftrag druckte seine Auftragsbestätigung, die Nachträge standen nur
 * als Zeilen in Listen. Vorgabe Samet: «Aufträge und Zusatzaufträge brauchen
 * getrennte PDFs, der Nachtrag mit seinem NT-Code, in Deutsch, Türkisch und
 * Englisch, erreichbar vom Auftrag wie vom Projekt.»
 *
 * Er reitet auf derselben Vorlage wie Angebot, Auftragsbestätigung und
 * Rechnung (`tenderPdfModern`): gleiches Gesicht, gleiche Infokarte, gleiche
 * Tabelle und Summen — nur die IDENTITÄT ist die des Nachtrags (NT-Nummer,
 * Hauptauftrag, Projekt, Datum) und die Positionen sind seine eigenen Sätze:
 * Material/Produkte, freie Zeilen und Mehrarbeit aus Rapporten.
 *
 * Gebaut wird aus der Id allein (`/addon-orders/:id/document`), damit jede
 * Fläche — Auftragsansicht, Projekt, Nachtragsliste, Rapport-Fenster — exakt
 * dasselbe Dokument erzeugt.
 *
 * ── Beträge ──
 * Der Betrag eines Nachtrags (`SalesOrder.totalAmount`) ist die Summe seiner
 * Sätze und wird von der Rechnung als BRUTTO behandelt (die Teilrechnung
 * rechnet die MWST aus ihm heraus, `invoicePdf.buildPartialPositions`). Der
 * Beleg rechnet darum genauso: der erfasste Preis ist brutto.
 *
 * ⚠ Die BETRAGSSPALTE der Offertentabelle ist BRUTTO, die Einzelpreisspalte
 * netto, und der Summenblock trennt Netto / MWST / Total — dieselbe Lesart wie
 * bei Offerte und Direktrechnung (siehe `invoicePdf.buildDirectPositions`).
 * Wer hier auf Netto umstellt, lässt denselben Auftrag auf zwei Belegen
 * verschieden aussehen.
 *
 * ── Alte Nachträge ──
 * Ein vor dem 07.08.2026 entstandener Nachtrag trägt seine Sätze nicht selbst;
 * sie werden über das Zeitfenster REKONSTRUIERT und können vom eingefrorenen
 * `totalAmount` abweichen (eine Zeile wurde später geändert). Verrechnet wird
 * der gespeicherte Betrag — er ist darum auch das GESAMT des Belegs, und die
 * Differenz erscheint als eigene Zeile «Anpassung», damit die Spalte aufgeht.
 */
import { addonOrdersApi, type AddonOrderDocumentDto } from '@/lib/api/addonOrders';
import { parsePaymentStages } from '@/lib/paymentSchedule';
import type { PdfCompanySettings } from '@/store/pdfSettingsStore';
import { toCurrencyCode } from '@/utils/currency';
import {
    buildTenderPdfBytes,
    pdfStringsFor,
    type PdfLang,
    type TenderPdfData,
    type TenderPdfProgress,
} from './tenderPdfModern';

export interface AddonOrderPdfDocument {
    orderNumber: string;
    fileName: string;
    bytes: Uint8Array;
    blob: Blob;
}

export interface AddonOrderPdfOptions {
    /** Belegsprache — der Nachtrag ist in allen drei Sprachen der Vorlage zu haben. */
    lang?: PdfLang;
    onProgress?: (p: TenderPdfProgress) => void;
    /** Dateiname ohne Endung; leer = die NT-Nummer. */
    fileBaseName?: string;
    /** Bereits geladener Beleg — spart den zweiten Abruf, wenn der Aufrufer ihn schon hat. */
    document?: AddonOrderDocumentDto;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** TT.MM.JJJJ — dieselbe Schreibweise, die die Vorlage überall druckt. */
const shortDate = (iso?: string | null): string => {
    if (!iso) return '';
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (day) return `${day[3]}.${day[2]}.${day[1]}`;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
};

/**
 * Spesenarten der Rapporte in den drei Belegsprachen. Eine Zeile aus dem Feld
 * trägt den Namen, den der Monteur in SEINER Oberflächensprache gewählt hat
 * (oder freien Text); der Beleg soll ihn in der Sprache des Dokuments nennen.
 * Unbekannter Text wird unverändert gedruckt.
 */
type ExpenseKind = 'transport' | 'equipmentRental' | 'externalServices' | 'subcontractor' | 'other';
const EXPENSE_KIND_BY_TEXT: Record<string, ExpenseKind> = {
    nakliye: 'transport', transport: 'transport',
    'ekipman kiralama': 'equipmentRental', 'gerätemiete': 'equipmentRental', 'gerätevermietung': 'equipmentRental', 'equipment rental': 'equipmentRental',
    'dış hizmetler': 'externalServices', 'dis hizmetler': 'externalServices', 'externe dienstleistungen': 'externalServices', 'external services': 'externalServices',
    taşeron: 'subcontractor', taseron: 'subcontractor', subunternehmer: 'subcontractor', subcontractor: 'subcontractor',
    diğer: 'other', diger: 'other', sonstige: 'other', other: 'other',
};
const EXPENSE_KIND_LABEL: Record<PdfLang, Record<ExpenseKind, string>> = {
    de: { transport: 'Transport', equipmentRental: 'Gerätevermietung', externalServices: 'Externe Dienstleistungen', subcontractor: 'Subunternehmer', other: 'Sonstige' },
    en: { transport: 'Transport', equipmentRental: 'Equipment rental', externalServices: 'External services', subcontractor: 'Subcontractor', other: 'Other' },
    tr: { transport: 'Nakliye', equipmentRental: 'Ekipman kiralama', externalServices: 'Dış hizmetler', subcontractor: 'Taşeron', other: 'Diğer' },
};

/** Ausgleichszeile eines alten Nachtrags (siehe Kopfkommentar). */
const ADJUSTMENT_LABEL: Record<PdfLang, string> = {
    de: 'Anpassung',
    en: 'Adjustment',
    tr: 'Düzeltme',
};
const expenseLabel = (value: string, lang: PdfLang): string => {
    const kind = EXPENSE_KIND_BY_TEXT[(value || '').trim().toLowerCase()];
    return kind ? EXPENSE_KIND_LABEL[lang][kind] : (value || '').trim();
};

/** Ein Text ohne Auszeichnung wird zu Absätzen — die Vorlage druckt den Einleitungstext als Rich-Text. */
const asRichParagraphs = (text: string): string => {
    if (/<([a-z][a-z0-9]*)\b[^>]*>/i.test(text)) return text;
    const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return text.split(/\r?\n/).map((line) => `<p>${escape(line)}</p>`).join('');
};

export async function buildAddonOrderPdf(
    addonId: string,
    settings: PdfCompanySettings,
    options: AddonOrderPdfOptions = {},
): Promise<AddonOrderPdfDocument> {
    const lang: PdfLang = options.lang ?? 'de';
    const L = pdfStringsFor(lang);
    const vatRate = Number(settings.vatRate) || 8.1;
    const factor = 1 + vatRate / 100;
    const net = (gross: number) => round2(gross / factor);

    const doc = options.document ?? await addonOrdersApi.document(addonId);
    const orderDate = doc.orderDate || doc.createdAt;
    const parentNumber = doc.parentSalesOrder?.orderNumber || '';

    // ── Positionen: Material/Produkte → freie Zeilen → Mehrarbeit ───────────
    // Einzelpreis NETTO, Betrag BRUTTO — die Spalten der Offertentabelle.
    const positions: TenderPdfData['positions'] = [];
    let grossSum = 0;
    let netSum = 0;
    let index = 0;
    const push = (row: {
        title: string;
        detail?: string | null;
        quantity: number;
        unit: string;
        unitPriceGross: number;
        lineGross: number;
    }) => {
        index += 1;
        grossSum = round2(grossSum + row.lineGross);
        netSum = round2(netSum + net(row.lineGross));
        positions.push({
            shortDescription: `${index} ${row.title}`,
            longDescription: row.detail?.trim() || null,
            // 'PRODUCT' wird NIE zum Kapitel (`NEVER_CHAPTER_ROW_TYPES`) — auch
            // eine Zeile zum Preis 0 behält ihre Zahlenspalten.
            rowType: 'PRODUCT',
            isTopLevel: true,
            hierarchyLevel: 1,
            quantity: row.quantity,
            unit: row.unit,
            unitPrice: net(row.unitPriceGross),
            taxRate: vatRate,
            lineTotal: row.lineGross,
        });
    };

    for (const line of doc.lines.materials) {
        const quantity = Number(line.quantity) || 0;
        const unitPrice = Number(line.unitPrice) || 0;
        const codeLine = line.article?.articleCode ? `${line.article.articleCode}` : '';
        push({
            title: line.article?.name || '',
            detail: [codeLine, line.description || ''].filter(Boolean).join('\n'),
            quantity,
            unit: line.article?.unit || 'Stk.',
            unitPriceGross: unitPrice,
            lineGross: round2(quantity * unitPrice),
        });
    }
    for (const line of doc.lines.expenses) {
        const amount = Number(line.amount) || 0;
        push({
            title: expenseLabel(line.expenseType, lang),
            detail: line.description || null,
            quantity: 1,
            unit: L.unitFlat,
            unitPriceGross: amount,
            lineGross: round2(amount),
        });
    }
    for (const line of doc.lines.overtime) {
        const hours = round2((Number(line.overtimeMinutes) || 0) / 60);
        const rate = Number(line.overtimeHourlyRate) || 0;
        const cost = Number(line.overtimeCost) || 0;
        const who = line.employee ? `${line.employee.firstName || ''} ${line.employee.lastName || ''}`.trim() : '';
        push({
            title: `${L.addonOvertime} ${shortDate(line.workDate)}`.trim(),
            detail: [who, (line.operationsDone || '').trim()].filter(Boolean).join('\n'),
            quantity: hours,
            unit: L.unitHours,
            unitPriceGross: rate,
            lineGross: round2(cost),
        });
    }

    /* GESAMT = der VERRECHNETE Betrag des Nachtrags. Weicht die rekonstruierte
       Zeilensumme davon ab (alter Nachtrag, siehe Kopfkommentar), schliesst
       eine Ausgleichszeile die Lücke — sonst zeigte der Beleg eine andere
       Endsumme als die Rechnung, die ihm folgt. */
    const grossTotal = round2(Number(doc.totalAmount) || grossSum);
    const difference = round2(grossTotal - grossSum);
    if (Math.abs(difference) > 0.005) {
        push({
            title: ADJUSTMENT_LABEL[lang],
            quantity: 1,
            unit: L.unitFlat,
            unitPriceGross: difference,
            lineGross: difference,
        });
    }
    const netTotal = netSum;
    const vatTotal = round2(grossTotal - netTotal);

    const salesperson = doc.createdBy
        ? `${doc.createdBy.firstName || ''} ${doc.createdBy.lastName || ''}`.trim()
        : '';
    const noColon = (label: string) => label.replace(/\s*:\s*$/, '');
    const intro = doc.confirmationNote && doc.confirmationNote.trim()
        ? asRichParagraphs(doc.confirmationNote)
        : asRichParagraphs(L.addonIntro.replace('{{order}}', parentNumber));

    const data: TenderPdfData = {
        tenderNumber: doc.orderNumber,
        version: doc.revisionNumber || 1,
        createdAt: orderDate,
        customerName: doc.customer?.companyName || '',
        // Rechnungsadresse der Offerte des Hauptauftrags, sonst die Kundenadresse.
        customerAddress: doc.tender?.billingAddress || doc.customer?.address || null,
        createdByName: salesperson || doc.tender?.salespersonName || null,
        commission: doc.tender?.commissionNumber || null,
        positions,
        grandTotal: grossTotal,
        totals: { netTotal, vatTotal, grossTotal },
        coverLetter: intro,
        // Zahlungsplan des Nachtrags — dieselbe Tabelle am Belegende wie bei
        // Offerte und Rechnung; ohne Plan wird der Block übersprungen.
        paymentStages: parsePaymentStages(doc.paymentStages),
        lang,
        docTitle: L.addonTitle,
        infoRows: [
            { label: noColon(L.addonNumber), value: doc.orderNumber, emphasize: true },
            { label: noColon(L.addonParentOrder), value: parentNumber },
            { label: noColon(L.kommission), value: doc.tender?.commissionNumber || '' },
            { label: noColon(L.addonProject), value: doc.project?.projectNumber || doc.project?.projectName || '' },
            { label: noColon(L.docDate), value: shortDate(orderDate) },
            { label: noColon(L.seller), value: salesperson || doc.tender?.salespersonName || '' },
        ],
        // Kurzer Beleg: die Tabelle beginnt auf Seite 1 unter dem Einleitungssatz.
        startTableOnFirstPage: true,
    };

    const bytes = await buildTenderPdfBytes(
        data,
        { ...settings, currency: toCurrencyCode(doc.tender?.currency) },
        options.onProgress,
    );

    return {
        orderNumber: doc.orderNumber,
        fileName: `${options.fileBaseName || doc.orderNumber}.pdf`,
        bytes,
        blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
    };
}

/** Speichert ein bereits erzeugtes Dokument — ohne es neu zu rendern. */
export function saveAddonOrderPdf(doc: AddonOrderPdfDocument): void {
    const url = URL.createObjectURL(doc.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
