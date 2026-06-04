

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
