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

// Firma adresi: PDF'te TEK satır gönderici olarak basılır —
// "OffiTec Heating & Cooling, Cores Tower - Hohenrainstrasse 24, 4133 Pratteln".
// `addressLine1` sokak/bina adı, `addressLine2` kapı numarasıdır; İsviçre QR
// faturası yapılandırılmış adres ("S") tipinde bu ayrımı bekler.
/** Der bis v2 vorbelegte Dankestext — nur noch für die Migration relevant. */
const LEGACY_FOOTER_NOTE = 'Wir bedanken uns für Ihre Anfrage und freuen uns auf eine Zusammenarbeit.';

const DEFAULT_SETTINGS: PdfCompanySettings = {
    companyName: 'OffiTec Heating & Cooling',
    addressLine1: 'Cores Tower - Hohenrainstrasse',
    addressLine2: '24',
    postalCode: '4133',
    city: 'Pratteln',
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
    // Leer: der frühere Dankestext wird nicht mehr gedruckt. Wer eine eigene
    // Fussnote einträgt, bekommt sie weiterhin auf dem Deckblatt.
    footerNote: '',
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
            // Ayarlar localStorage'da kalıcıdır: varsayılanı değiştirmek daha önce
            // uygulamayı açmış kullanıcıyı ETKİLEMEZ — bu yüzden her varsayılan
            // değişikliği bir sürüm artışı + KORUMALI bir taşıma gerektirir.
            //   v2: ESKİ varsayılan adresi (Schübelbach) yeni adrese taşır.
            //   v3: ESKİ varsayılan teşekkür notunu siler.
            // Her iki adım da yalnızca değer HÂLÂ eski varsayılana eşitse çalışır;
            // kendi metnini/adresini girmiş olan tenant'a dokunulmaz.
            version: 3,
            migrate: (persisted: any, version: number) => {
                if (!persisted?.settings) return persisted;
                let s = persisted.settings as PdfCompanySettings;

                if (version < 2) {
                    const untouched = s.companyName === 'OffiTec Group AG'
                        && s.addressLine1 === 'Industriestrasse'
                        && s.city === 'Schübelbach';
                    if (untouched) {
                        s = {
                            ...s,
                            companyName: DEFAULT_SETTINGS.companyName,
                            addressLine1: DEFAULT_SETTINGS.addressLine1,
                            addressLine2: DEFAULT_SETTINGS.addressLine2,
                            postalCode: DEFAULT_SETTINGS.postalCode,
                            city: DEFAULT_SETTINGS.city,
                        };
                    }
                }

                if (version < 3 && s.footerNote === LEGACY_FOOTER_NOTE) {
                    s = { ...s, footerNote: '' };
                }

                return s === persisted.settings ? persisted : { ...persisted, settings: s };
            },
        }
    )
);
