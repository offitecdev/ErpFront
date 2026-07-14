import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CurrencyCode } from '../utils/currency';

export interface PdfCompanySettings {
    companyName: string;
    addressLine1: string;
    addressLine2: string;
    postalCode: string;
    city: string;
    country: string;
    iban: string;
    bic?: string;
    bankName?: string;
    phone?: string;
    email?: string;
    website?: string;
    taxId?: string;
    vatRate: number;
    // Offer currencies (CHF/EUR/USD/GBP/TRY). Note: the Swiss QR-bill is only
    // legally valid for CHF/EUR — other codes render but aren't payable via QR.
    currency: CurrencyCode;
    paymentTerms: string;
    footerNote: string;
    /** base64 PNG/JPG to be used as page background (letterhead) - fallback */
    letterheadBackground?: string | null;
    /** base64 PDF used as page background. Takes precedence over the image. */
    letterheadBackgroundPdf?: string | null;
    /** Whether to use the bundled default letterhead PDF when no upload is set */
    useBundledLetterhead?: boolean;
    /** Logo as base64 (top-left in PDF if no background is set) */
    logoBase64?: string | null;
}

const DEFAULT_SETTINGS: PdfCompanySettings = {
    companyName: 'OffiTec Group AG',
    addressLine1: 'Industriestrasse',
    addressLine2: '7',
    postalCode: '8862',
    city: 'Schübelbach',
    country: 'CH',
    iban: 'CH00 0000 0000 0000 0000 0',
    bic: '',
    bankName: '',
    phone: '+41 55 000 00 00',
    email: 'info@offitec.ch',
    website: 'www.offitec.ch',
    taxId: '',
    vatRate: 8.1,
    currency: 'CHF',
    paymentTerms: 'Zahlbar innert 30 Tagen netto.',
    footerNote: 'Wir bedanken uns für Ihre Anfrage und freuen uns auf eine Zusammenarbeit.',
    letterheadBackground: null,
    letterheadBackgroundPdf: null,
    useBundledLetterhead: true,
    logoBase64: null,
};

interface PdfSettingsState {
    settings: PdfCompanySettings;
    setSettings: (patch: Partial<PdfCompanySettings>) => void;
    resetSettings: () => void;
}

export const usePdfSettingsStore = create<PdfSettingsState>()(
    persist(
        (set) => ({
            settings: DEFAULT_SETTINGS,
            setSettings: (patch) =>
                set((state) => ({ settings: { ...state.settings, ...patch } })),
            resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
        }),
        {
            name: 'offitec.pdfSettings',
        }
    )
);
