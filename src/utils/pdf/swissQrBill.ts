

export interface QrBillPaymentInfo {
    iban: string;                 // CH/LI IBAN (QR-IBAN for QRR, regular IBAN for SCOR/NON)
    creditorName: string;
    creditorAddressLine1: string; // street name or full address line 1
    creditorAddressLine2: string; // building/house number or full address line 2
    creditorPostalCode: string;
    creditorCity: string;
    creditorCountry: string;      // 2-letter ISO country
    amount: number;               // CHF/EUR
    currency: 'CHF' | 'EUR';
    debtorName?: string;
    debtorAddressLine1?: string;
    debtorAddressLine2?: string;
    debtorPostalCode?: string;
    debtorCity?: string;
    debtorCountry?: string;
    referenceType?: 'QRR' | 'SCOR' | 'NON';
    reference?: string;           // QR Reference (numeric, 27 chars) or Creditor Reference
    unstructuredMessage?: string; // free-text info
    billInformation?: string;     // structured bill info (S1/...)
}

export function buildQrBillPayload(p: QrBillPaymentInfo): string {
    const lines: string[] = [];
    lines.push('SPC');                 // QR Type
    lines.push('0200');                // Version
    lines.push('1');                   // Coding Type (UTF-8)

    lines.push(p.iban.replace(/\s+/g, '').toUpperCase());

    // Creditor (structured address type "S")
    lines.push('S');
    lines.push(truncate(p.creditorName, 70));
    lines.push(truncate(p.creditorAddressLine1, 70));
    lines.push(truncate(p.creditorAddressLine2, 16)); // building no.
    lines.push(truncate(p.creditorPostalCode, 16));
    lines.push(truncate(p.creditorCity, 35));
    lines.push((p.creditorCountry || 'CH').toUpperCase());

    // Ultimate Creditor (Always empty for v0200)
    lines.push('');
    lines.push('');
    lines.push('');
    lines.push('');
    lines.push('');
    lines.push('');
    lines.push('');

    // Payment Amount Information
    lines.push(p.amount > 0 ? p.amount.toFixed(2) : '');
    lines.push((p.currency || 'CHF').toUpperCase());

    // Ultimate Debtor (the one paying)
    if (p.debtorName) {
        lines.push('S');
        lines.push(truncate(p.debtorName, 70));
        lines.push(truncate(p.debtorAddressLine1 || '', 70));
        lines.push(truncate(p.debtorAddressLine2 || '', 16));
        lines.push(truncate(p.debtorPostalCode || '', 16));
        lines.push(truncate(p.debtorCity || '', 35));
        lines.push((p.debtorCountry || 'CH').toUpperCase());
    } else {
        lines.push('', '', '', '', '', '', '');
    }

    // Payment Reference
    const refType = p.referenceType || 'NON';
    lines.push(refType);
    lines.push((p.reference || '').replace(/\s+/g, ''));

    // Additional Information
    lines.push(truncate(p.unstructuredMessage || '', 140));
    lines.push('EPD');                 // End Payment Data trailer
    if (p.billInformation) {
        lines.push(truncate(p.billInformation, 140));
    }

    return lines.join('\n');
}

function truncate(s: string, maxLen: number): string {
    if (!s) return '';
    return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/**
 * Format an IBAN for human display (groups of 4 chars).
 */
export function formatIban(iban: string): string {
    return iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Format a QR reference (27 chars) for display in groups of 5.
 */
export function formatReference(ref: string): string {
    if (!ref) return '';
    return ref.replace(/\s+/g, '').replace(/(.{5})/g, '$1 ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// QR-IBAN + QR-Referenz (QRR)
//
// Die Bank vergibt neben dem Kontokorrent-IBAN einen eigenen QR-IBAN
// ("nur für Erstellung QR-Rechnungen", IID 30000–31999). Beide zeigen auf
// DASSELBE Konto, dürfen aber nicht beliebig getauscht werden:
//
//   • QR-IBAN  → Referenztyp MUSS `QRR` sein (27-stellige QR-Referenz).
//   • Normaler IBAN → `SCOR` (Creditor Reference) oder `NON`, NIE `QRR`.
//
// Eine QR-Rechnung, die das verletzt, wird von den Banking-Apps beim Scannen
// abgewiesen — deshalb entscheidet `isQrIban()` über den Referenztyp, und die
// Referenz wird aus der Belegnummer erzeugt (`buildQrReference`), damit jeder
// Zahlungseingang wieder der Rechnung zugeordnet werden kann.
// ─────────────────────────────────────────────────────────────────────────────

/** True, wenn der IBAN ein QR-IBAN ist (Institutsnummer 30000–31999). */
export function isQrIban(iban: string | null | undefined): boolean {
    const clean = String(iban || '').replace(/\s+/g, '').toUpperCase();
    if (!/^CH\d{19}$/.test(clean) && !/^LI\d{19}$/.test(clean)) return false;
    const iid = Number(clean.slice(4, 9));
    return iid >= 30000 && iid <= 31999;
}

/** Prüfziffer nach «Modulo 10, rekursiv» (ESR/QR-Referenz). */
const M10_ROWS = [
    [0, 9, 4, 6, 8, 2, 7, 1, 3, 5],
    [9, 4, 6, 8, 2, 7, 1, 3, 5, 0],
    [4, 6, 8, 2, 7, 1, 3, 5, 0, 9],
    [6, 8, 2, 7, 1, 3, 5, 0, 9, 4],
    [8, 2, 7, 1, 3, 5, 0, 9, 4, 6],
    [2, 7, 1, 3, 5, 0, 9, 4, 6, 8],
    [7, 1, 3, 5, 0, 9, 4, 6, 8, 2],
    [1, 3, 5, 0, 9, 4, 6, 8, 2, 7],
    [3, 5, 0, 9, 4, 6, 8, 2, 7, 1],
    [5, 0, 9, 4, 6, 8, 2, 7, 1, 3],
];

export function qrReferenceCheckDigit(digits26: string): number {
    let carry = 0;
    for (const ch of digits26) {
        const d = Number(ch);
        carry = M10_ROWS[carry][Number.isFinite(d) ? d : 0];
    }
    return (10 - carry) % 10;
}

/**
 * Erzeugt die 27-stellige QR-Referenz aus einer Belegnummer.
 *
 * Buchstaben des Präfixes werden mitkodiert (A=01 … Z=26), damit
 * "RE-2026-00123" und "AN-2026-00123" NICHT dieselbe Referenz bekommen —
 * sonst liesse sich ein Zahlungseingang nicht eindeutig zuordnen.
 */
export function buildQrReference(source: string | null | undefined): string {
    const text = String(source || '');
    const letters = (text.match(/[A-Za-z]/g) || [])
        .slice(0, 3)
        .map((c) => String(c.toUpperCase().charCodeAt(0) - 64).padStart(2, '0'))
        .join('');
    const digits = (text.match(/\d/g) || []).join('');
    const raw = `${letters}${digits}`.slice(-26).padStart(26, '0');
    return `${raw}${qrReferenceCheckDigit(raw)}`;
}

/**
 * Wählt Konto + Referenz für den QR-Teil.
 *
 * Ist ein QR-IBAN hinterlegt, zahlt der Kunde darauf mit QR-Referenz;
 * sonst bleibt es beim Kontokorrent-IBAN mit SCOR/NON wie bisher.
 */
export function resolveQrCreditorAccount(
    iban: string,
    qrIban: string | null | undefined,
    documentNumber: string,
    fallbackReference?: string | null,
): { iban: string; referenceType: 'QRR' | 'SCOR' | 'NON'; reference: string } {
    if (isQrIban(qrIban)) {
        return {
            iban: String(qrIban).replace(/\s+/g, '').toUpperCase(),
            referenceType: 'QRR',
            reference: buildQrReference(documentNumber),
        };
    }
    return {
        iban,
        referenceType: fallbackReference ? 'SCOR' : 'NON',
        reference: fallbackReference || '',
    };
}

/**
 * Anzeige der 27-stelligen QR-Referenz: Fünferblöcke VON RECHTS, der erste
 * Block bleibt also zweistellig ("12 34567 89012 …") — so verlangt es die
 * Gestaltungsrichtlinie, und so liest der Kunde sie auch auf dem Kontoauszug.
 */
export function formatQrReference(ref: string): string {
    const clean = String(ref || '').replace(/\s+/g, '');
    if (!clean) return '';
    const head = clean.length % 5;
    const blocks: string[] = [];
    if (head) blocks.push(clean.slice(0, head));
    for (let i = head; i < clean.length; i += 5) blocks.push(clean.slice(i, i + 5));
    return blocks.join(' ');
}


/**
 * Gläubiger des QR-Teils = KONTOINHABER, nicht der Absender des Belegs.
 *
 * Die Bank gleicht "Zahlbar an" mit dem Konto ab. Das Konto läuft auf die
 * Offitec Group AG; würde hier der Name der gewählten Gesellschaft stehen
 * (Offitec GmbH, Offitec Isıtma ve Soğutma A.Ş. …), stünden Name und Konto
 * im Widerspruch und die Zahlung käme zurück. Briefkopf und Absenderzeile
 * bleiben davon unberührt — die tragen weiterhin den Mandanten.
 *
 * Ohne gepflegten Kontoinhaber fällt alles auf die Firmenangaben zurück, damit
 * eine unvollständig eingerichtete Installation trotzdem eine QR-Rechnung
 * drucken kann.
 */
export function resolveQrCreditor(s: {
    companyName: string;
    addressLine1: string;
    addressLine2: string;
    postalCode: string;
    city: string;
    country: string;
    qrCreditorName?: string;
    qrCreditorAddressLine1?: string;
    qrCreditorAddressLine2?: string;
    qrCreditorPostalCode?: string;
    qrCreditorCity?: string;
    qrCreditorCountry?: string;
}): {
    name: string;
    addressLine1: string;
    addressLine2: string;
    postalCode: string;
    city: string;
    country: string;
} {
    const name = (s.qrCreditorName || '').trim();
    if (!name) {
        return {
            name: s.companyName,
            addressLine1: s.addressLine1,
            addressLine2: s.addressLine2,
            postalCode: s.postalCode,
            city: s.city,
            country: s.country,
        };
    }
    // Der Kontoinhaber bringt seine EIGENE Adresse mit: sonst erbte der QR-Teil
    // die des gewählten Mandanten (z. B. İzmir) und nännte zu einem Schweizer
    // Konto eine türkische Anschrift.
    return {
        name,
        addressLine1: (s.qrCreditorAddressLine1 || '').trim() || s.addressLine1,
        addressLine2: (s.qrCreditorAddressLine2 || '').trim() || s.addressLine2,
        postalCode: (s.qrCreditorPostalCode || '').trim() || s.postalCode,
        city: (s.qrCreditorCity || '').trim() || s.city,
        country: (s.qrCreditorCountry || '').trim() || s.country,
    };
}
