import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore, type TenantOption } from './authStore';
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
// "Offitec GmbH, Ceres Tower - Hohenrainstrasse 24, 4133 Pratteln".
// `addressLine1` sokak/bina adı, `addressLine2` kapı numarasıdır; İsviçre QR
// faturası yapılandırılmış adres ("S") tipinde bu ayrımı bekler.
//
// `companyName` FİRMANIN HUKUKİ ADIDIR: gönderici satırının yanı sıra İsviçre
// QR faturasının alacaklı ("Zahlbar an") adı da budur ve banka hesabının
// sahibiyle birebir aynı yazılmalıdır — bu yüzden marka satırı ("Heating &
// Cooling") değil, ticaret sicilindeki ad yazılır.
//
// GEDRUCKT wird dieser Name allerdings nur als RÜCKFALL: sobald ein Mandant
// bekannt ist, ersetzt `usePdfSettings()`/`getPdfSettings()` ihn durch dessen
// `tenantName` (siehe Block am Dateiende).
/** Der bis v2 vorbelegte Dankestext — nur noch für die Migration relevant. */
const LEGACY_FOOTER_NOTE = 'Wir bedanken uns für Ihre Anfrage und freuen uns auf eine Zusammenarbeit.';
/** Der bis v3 vorbelegte Platzhalter-IBAN — ungültig, QR-Rechnungen scheiterten daran. */
const LEGACY_PLACEHOLDER_IBAN = 'CH00 0000 0000 0000 0000 0';
/** Bis v4 stand hier der falsch geschriebene Gebäudename ("Cores" statt "Ceres"). */
const LEGACY_ADDRESS_LINE1 = 'Cores Tower - Hohenrainstrasse';
/**
 * Firmennamen, die bis v5 als Vorgabe ausgeliefert wurden. Die Firma heisst seit
 * der Umfirmierung "Offitec GmbH"; wer noch einen dieser Namen gespeichert hat,
 * druckt sonst weiter den alten Namen auf Angebot, Auftrag und QR-Rechnung.
 * Verglichen wird ohne Gross-/Kleinschreibung und ohne Mehrfach-Leerzeichen —
 * ein selbst eingetragener Name bleibt unangetastet.
 */
const LEGACY_COMPANY_NAMES = ['OffiTec Group AG', 'OffiTec Heating & Cooling'];
const normalizeCompanyName = (value: string | null | undefined) =>
    String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

const DEFAULT_SETTINGS: PdfCompanySettings = {
    companyName: 'Offitec GmbH',
    addressLine1: 'Ceres Tower - Hohenrainstrasse',
    addressLine2: '24',
    postalCode: '4133',
    city: 'Pratteln',
    country: 'CH',
    // Gerçek firma IBAN'ı: eski 'CH00 …' yer tutucusu GEÇERSİZDİ ve QR fatura
    // bankacılık uygulamalarında taranmıyordu (PDF alt bilgisiyle aynı hesap).
    iban: 'CH50 8080 8005 5315 3585 1',
    bic: 'RAIFCH22XXX',
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
            //   v4: geçersiz 'CH00 …' yer tutucu IBAN'ı gerçek hesapla değiştirir
            //       (QR fatura ancak geçerli bir IBAN ile taranabilir).
            //   v5: bina adındaki yazım hatasını düzeltir ("Cores" → "Ceres" Tower).
            //   v6: firma unvanını "Offitec GmbH" yapar (eski "OffiTec Group AG"
            //       ve marka satırı "OffiTec Heating & Cooling" varsayılanları).
            // Adımlar yalnızca değer HÂLÂ eski varsayılana eşitse çalışır;
            // kendi metnini/adresini girmiş olan tenant'a dokunulmaz.
            version: 6,
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

                if (version < 4 && (s.iban || '').replace(/\s+/g, '') === LEGACY_PLACEHOLDER_IBAN.replace(/\s+/g, '')) {
                    s = { ...s, iban: DEFAULT_SETTINGS.iban, bic: s.bic || DEFAULT_SETTINGS.bic };
                }

                if (version < 5 && s.addressLine1 === LEGACY_ADDRESS_LINE1) {
                    s = { ...s, addressLine1: DEFAULT_SETTINGS.addressLine1 };
                }

                if (version < 6) {
                    const stored = normalizeCompanyName(s.companyName);
                    const wasDefault = LEGACY_COMPANY_NAMES.some(
                        (legacy) => normalizeCompanyName(legacy) === stored
                    );
                    // Leerer Name zählt als unberührt: sonst bliebe die
                    // Absenderzeile ohne Firma und die QR-Rechnung ohne Gläubiger.
                    if (wasDefault || !stored) {
                        s = { ...s, companyName: DEFAULT_SETTINGS.companyName };
                    }
                }

                return s === persisted.settings ? persisted : { ...persisted, settings: s };
            },
        }
    )
);

/**
 * ── FIRMENNAME AUF DEM PDF = NAME DES AKTIVEN MANDANTEN ─────────────────────
 *
 * Die Absenderzeile lautet immer
 *
 *     <Mandant>, Ceres Tower - Hohenrainstrasse 24, 4133 Pratteln
 *
 * Adresse, IBAN und Bank stehen weiterhin in den PDF-Einstellungen (ein Haus,
 * ein Konto), aber der NAME kommt aus der Firmenauswahl oben rechts: wer den
 * Mandanten wechselt, druckt ab dem nächsten Dokument den Namen dieses
 * Mandanten — auf Angebot, Auftrag, Rapport und als Gläubiger ("Zahlbar an")
 * der QR-Rechnung. Nur so trägt jede Gesellschaft der Firmengruppe ihren
 * eigenen Namen auf ihren eigenen Belegen.
 *
 * `settings.companyName` bleibt der Rückfall: solange das Profil noch nicht
 * geladen ist (Mandantenliste leer) oder kein Mandant gewählt wurde, wird der
 * gespeicherte Name gedruckt statt einer leeren Zeile.
 *
 * KEIN PDF-Erzeuger liest `usePdfSettingsStore` direkt — Komponenten nehmen
 * `usePdfSettings()`, alles ausserhalb von React `getPdfSettings()`. Einzige
 * Ausnahme ist die Einstellungsseite selbst, die die gespeicherte Fassung
 * bearbeitet.
 */
const tenantNameOf = (tenants: TenantOption[], tenantId: string | null | undefined): string => {
    if (!tenantId) return '';
    return String(tenants.find((tenant) => tenant.id === tenantId)?.tenantName || '').trim();
};

const applyTenantCompanyName = (
    settings: PdfCompanySettings,
    tenantName: string,
): PdfCompanySettings =>
    tenantName && tenantName !== settings.companyName
        ? { ...settings, companyName: tenantName }
        : settings;

/** Name des aktiven Mandanten; leer, wenn (noch) keiner bekannt ist. */
export const activeTenantCompanyName = (): string => {
    const { tenants, selectedTenantId, user } = useAuthStore.getState();
    return tenantNameOf(tenants, selectedTenantId || user?.tenantId);
};

/**
 * PDF-Einstellungen für React-Komponenten — identisch zum Speicher, nur mit dem
 * Mandantennamen als Firmenname. Das Ergebnis ist memoisiert, damit es als
 * Abhängigkeit (z. B. in `useMemo`/`useCallback`) stabil bleibt.
 */
export function usePdfSettings(): PdfCompanySettings {
    const settings = usePdfSettingsStore((state) => state.settings);
    const tenants = useAuthStore((state) => state.tenants);
    const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
    const homeTenantId = useAuthStore((state) => state.user?.tenantId);
    const tenantName = tenantNameOf(tenants, selectedTenantId || homeTenantId);
    return useMemo(() => applyTenantCompanyName(settings, tenantName), [settings, tenantName]);
}

/** Dasselbe ausserhalb von React (PDF-Erzeuger, Ereignishandler). */
export const getPdfSettings = (): PdfCompanySettings =>
    applyTenantCompanyName(usePdfSettingsStore.getState().settings, activeTenantCompanyName());
