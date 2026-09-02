import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { SearchLg, X } from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupCaption, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { ospApi, type OspDocumentDto } from '@/lib/api/osp';
import { buildOspDescription } from './ospDescription';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import { apiClient } from '@/lib/axios';
import { useAuthStore } from '@/store/authStore';

/**
 * ── OFFERTE AUS OSP ERZEUGEN (Import-Fenster, 04.09.2026) ────────────────────
 * ⚠ SEIT 27.08.2026 NICHT MEHR EINGEBUNDEN: "Offerte erstellen" auf /sales/osp
 * erzeugt die Offerte DIREKT (siehe OspPage.createOffer) — ohne Fenster und
 * ohne Vorschau (Benutzerwunsch). Das Fenster bleibt hier, falls die geführte
 * Erfassung je zurückkommen soll; die Beschreibungs-Schablone lebt in
 * ospDescription.ts und wird von beiden Wegen geteilt.
 *
 * ⚠ Und seit der VIERTEN Vertragsfassung (20.09.2026) ist eine Anfrage ein
 * PROJEKT mit mehreren Einheiten (`OspDocumentDto.units`). Dieses Fenster kennt
 * noch die eine Einheit von früher; wer es wiederbelebt, muss es auf EINE
 * POSITION JE EINHEIT umstellen — genau das tut `OspPage.createOffer` heute.
 *
 * Aus einem OSP-Beleg wird direkt eine Offerte:
 *
 *  • KUNDE — entweder ein bestehender CRM-Kunde ODER von Hand (vorausgefüllt
 *    aus der anfragenden OSP-Person: Name, E-Mail, Land/Ort/Strasse/PLZ).
 *    Von Hand heisst: NIRGENDS registriert — Name und Adresse stehen nur an
 *    dieser einen Offerte.
 *
 *  • POSITION — Titel = Modell; die Beschreibung folgt der festen
 *    Datenblatt-Schablone (Leistungsdaten / Technologie / Technische
 *    Highlights). Bei Kategorie "chiller" heisst die erste Zeile
 *    "Kühlleistung", sonst "Heizleistung". Alles Übrige des Datenblatts
 *    bleibt draussen — nur diese Angaben werden übernommen.
 *
 *    Die Werte kommen seit 07.09.2026 aus dem ECHTEN Datenblatt-PDF der OSP:
 *    der Webhook nennt die Datei, wir holen und lesen sie, und die gefundenen
 *    Angaben stehen hier schon drin. Gelesen wird nur, was dasteht — erfunden
 *    wird nichts, und jedes Feld bleibt überschreibbar.
 *
 *  ⚠ Es entsteht NIE ein Artikel und NIE Bestand — reine Textposition.
 */

interface CrmCustomerRow {
    id: string;
    companyName: string;
    mainEmail: string;
    address: string;
    postalCode: string;
    city: string;
    country: string;
}

const text = (value: unknown): string => (value == null ? '' : String(value));

const asCustomerRows = (payload: unknown): CrmCustomerRow[] => {
    const rows = Array.isArray(payload) ? payload : (payload as { items?: unknown })?.items;
    return Array.isArray(rows)
        ? (rows as Array<Record<string, unknown>>)
            .filter((row) => row && row.id)
            .map((row) => ({
                id: String(row.id),
                companyName: text(row.companyName),
                mainEmail: text(row.mainEmail),
                address: text(row.address),
                postalCode: text(row.postalCode),
                city: text(row.city),
                country: text(row.country),
            }))
        : [];
};


export const OspImportPopup = ({
    doc,
    staff,
    onClose,
    onDone,
}: {
    doc: OspDocumentDto;
    staff: StaffDirectoryRow[];
    onClose: () => void;
    onDone: (tenderId: string, tenderNumber: string) => void;
}) => {
    const currentUser = useAuthStore((s) => s.user);

    /* Kunde — der Name ist IMMER die Firma, nie die anfragende Person.
       Bei einem OSP-Konto vom Typ "user" steht hinter der Anfrage eine Person
       IN einer Firma: dann wird ihr Personenname bewusst NICHT als Kundenname
       vorgeschlagen (Vorgabe 05.09.2026). Kennt die OSP die Firma nicht, bleibt
       das Feld leer und wartet auf die freie Eingabe ("Firma"). Konten vom Typ
       "admin" SIND die Firma, dort trägt der Kontoname sie. */
    const requesterName = [doc.requesterFirstName, doc.requesterLastName].filter(Boolean).join(' ').trim();
    const isOspUser = (doc.userType || '').trim().toLowerCase() === 'user';
    const suggestedName = isOspUser ? (doc.company || '') : (doc.company || requesterName);
    const [customerSearch, setCustomerSearch] = useState(suggestedName);
    const [email, setEmail] = useState(doc.requesterEmail || '');
    const [country, setCountry] = useState(doc.country || '');
    const [city, setCity] = useState(doc.city || '');
    const [address, setAddress] = useState(doc.address || '');
    const [postalCode, setPostalCode] = useState(doc.postalCode || '');

    const [customerRows, setCustomerRows] = useState<CrmCustomerRow[]>([]);
    const [customer, setCustomer] = useState<CrmCustomerRow | null>(null);
    const [searching, setSearching] = useState(false);
    const [customerFocused, setCustomerFocused] = useState(false);

    /* Zuständigkeiten — beide direkt wählbar. Der Verkauf ist vorbelegt (Zeile,
       sonst die eigene Person); die Projektleitung bleibt leer, bis sie jemand
       setzt — sie wird nie stillschweigend vergeben. */
    const [salespersonId, setSalespersonId] = useState(doc.salespersonId || currentUser?.id || '');

    /* Datenblatt-Schablone — vorbelegt aus dem ECHTEN OSP-Datenblatt, sofern
       es geholt und gelesen werden konnte. Getippt wird nur noch, was im PDF
       nicht stand; jedes Feld bleibt frei überschreibbar. */
    const specs = doc.datasheetSpecs;
    const isChiller = specs?.powerIsCooling ?? (doc.category || '').toLowerCase().includes('chill');
    const [title, setTitle] = useState(doc.model || doc.projectName || '');
    const [power, setPower] = useState(specs?.power || '');
    // Eine Wärmepumpe nennt beide Leistungen und beide Wirkungsgrade, ein
    // Chiller nur die Kühlleistung und den EER (§1 des Vertrags).
    const [coolingPower, setCoolingPower] = useState(specs?.coolingPower || '');
    const [cop, setCop] = useState(specs?.cop || '');
    const [eer, setEer] = useState(specs?.eer || '');
    const [medium, setMedium] = useState(specs?.medium || 'Wasser');
    const [technology, setTechnology] = useState(specs?.technology || '');
    const [sound1m, setSound1m] = useState(specs?.sound1m || '');
    const [sound10m, setSound10m] = useState(specs?.sound10m || '');
    const [dimensions, setDimensions] = useState(specs?.dimensions || '');
    const [weight, setWeight] = useState(specs?.weight || '');

    /* Preis — "nur die Gebühren eintragen". */
    const [quantity, setQuantity] = useState('1');
    const [unit, setUnit] = useState('Stk');
    const [unitPrice, setUnitPrice] = useState('');

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const trimmed = customerSearch.trim();
        if (!customerFocused || customer || !trimmed) {
            setCustomerRows([]);
            setSearching(false);
            return;
        }
        let cancelled = false;
        setSearching(true);
        const timer = setTimeout(async () => {
            try {
                // Volle Kundenzeile (kein `fields: 'list'`): die Auswahl füllt
                // Adresse und E-Mail der Offerte gleich mit aus.
                const res = await apiClient.get('/customers', {
                    params: { page: 1, pageSize: 8, ...(trimmed ? { search: trimmed } : {}) },
                });
                if (!cancelled) setCustomerRows(asCustomerRows(res.data));
            } catch {
                if (!cancelled) setCustomerRows([]);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [customer, customerFocused, customerSearch]);

    /* Die fertige Beschreibung — genau die vorgegebene Schablone (geteilt mit
       dem Direktweg der Seite): jeder Block als Titel mit AUFZÄHLUNGSPUNKTEN
       darunter, Leerzeile dazwischen, und am Ende der feste Verweis aufs
       Datenblatt. Leere Zeilen entfallen. */
    const description = useMemo(() => buildOspDescription({
        isChiller,
        power,
        coolingPower,
        cop,
        eer,
        medium,
        technology,
        sound1m,
        sound10m,
        dimensions,
        weight,
    }), [isChiller, power, coolingPower, cop, eer, medium, technology, sound1m, sound10m, dimensions, weight]);
    const descriptionText = description.text;
    const descriptionHtml = description.html;

    const submit = async () => {
        const manualName = customerSearch.trim();
        if (!customer && !manualName) { toast.error(t('osp.import.nameRequired')); return; }
        if (!title.trim()) { toast.error(t('osp.import.titleRequired')); return; }
        setSaving(true);
        try {
            const result = await ospApi.importDocument(doc.id, {
                customerId: customer?.id || null,
                // Adres her durumda teklif-özel gönderilir. CRM müşterisi
                // seçilse bile müşteri kartı güncellenmez.
                manualCustomer: {
                    name: manualName || customer?.companyName || '',
                    email,
                    country,
                    city,
                    address,
                    postalCode,
                },
                positions: [{
                    title: title.trim(),
                    descriptionHtml,
                    quantity: Math.max(0, Number(quantity) || 1),
                    unit: unit.trim() || 'Stk',
                    unitPrice: Math.max(0, Number(unitPrice) || 0),
                }],
                salespersonId: salespersonId || null,
            });
            toast.success(t('osp.import.done', { number: result.tenderNumber }));
            onDone(result.tenderId, result.tenderNumber);
        } catch (error: any) {
            const existingTenderId = error?.response?.data?.tenderId;
            if (error?.response?.status === 409 && existingTenderId) {
                onDone(existingTenderId, '');
                return;
            }
            toast.error(error?.response?.data?.error || t('osp.import.failed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <PopupDialog
            open
            onClose={onClose}
            title={t('osp.import.title')}
            subtitle={`${doc.reference} · ${doc.projectName || doc.model || ''}`}
            width={760}
            closeOnBackdrop={false}
            bodyClassName="ofi-osp-import"
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose} disabled={saving}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={saving} onClick={() => void submit()}>
                        {t('osp.import.create')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            {/* ── Kunde ── */}
            <PopupCaption>{t('osp.import.customerSection')}</PopupCaption>
            <PopupNote>{t('osp.import.manualHint')}</PopupNote>
            <div className="ofi-osp-import__grid">
                <PopupField label={t('osp.import.customerCompany')} required className="ofi-osp-import__wide">
                    <div className="ofi-osp-import__customer-combo">
                        <SearchLg size={15} className="ofi-osp-import__search-icon" />
                        <input
                            className="ofi-cal-input"
                            placeholder={t('osp.import.searchOrType')}
                            value={customerSearch}
                            onFocus={() => setCustomerFocused(true)}
                            onBlur={() => setTimeout(() => setCustomerFocused(false), 120)}
                            onChange={(event) => {
                                setCustomerSearch(event.target.value);
                                setCustomer(null);
                            }}
                        />
                        {customer && (
                            <button
                                type="button"
                                className="ofi-osp-import__customer-clear"
                                aria-label={t('common.remove')}
                                onClick={() => {
                                    setCustomer(null);
                                    setCustomerSearch('');
                                }}
                            >
                                <X size={14} />
                            </button>
                        )}
                        {customerFocused && !customer && customerSearch.trim() && (
                            <div className="ofi-osp-import__results">
                                {searching && <span className="ofi-osp-import__muted">{t('common.loading')}</span>}
                                {!searching && customerRows.map((row) => (
                                    <button
                                        key={row.id}
                                        type="button"
                                        className="ofi-option-row ofi-osp-import__result"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => {
                                            setCustomer(row);
                                            setCustomerSearch(row.companyName);
                                            setCustomerFocused(false);
                                            // Die Karte des Kunden füllt die Felder — sie
                                            // bleiben frei änderbar und gelten dann NUR für
                                            // diese Offerte (der Stamm wird nie überschrieben).
                                            if (row.mainEmail) setEmail(row.mainEmail);
                                            if (row.address || row.postalCode || row.city || row.country) {
                                                setAddress(row.address);
                                                setPostalCode(row.postalCode);
                                                setCity(row.city);
                                                setCountry(row.country);
                                            }
                                        }}
                                    >
                                        {row.companyName}
                                    </button>
                                ))}
                                {/* Nichts gefunden ist kein Fehler: der getippte Name
                                    bleibt einfach als Firma dieser Offerte stehen. */}
                                {!searching && customerRows.length === 0 && (
                                    <span className="ofi-osp-import__muted">
                                        {t('osp.import.noCustomers')}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </PopupField>
                <PopupField label={t('osp.import.customerEmail')} className="ofi-osp-import__wide">
                    <input className="ofi-cal-input" value={email} onChange={(e) => setEmail(e.target.value)} />
                </PopupField>
                <PopupField label={t('osp.import.address')} className="ofi-osp-import__wide">
                    <input className="ofi-cal-input" value={address} onChange={(e) => setAddress(e.target.value)} />
                </PopupField>
                <PopupField label={t('osp.import.postalCode')}>
                    <input className="ofi-cal-input" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                </PopupField>
                <PopupField label={t('osp.import.city')}>
                    <input className="ofi-cal-input" value={city} onChange={(e) => setCity(e.target.value)} />
                </PopupField>
                <PopupField label={t('osp.import.country')}>
                    <input className="ofi-cal-input" value={country} onChange={(e) => setCountry(e.target.value)} />
                </PopupField>
            </div>

            {/* ── Zuständig: EINE Person, die Verkäuferin/der Verkäufer ── */}
            <div className="ofi-osp-import__grid">
                <PopupField label={t('osp.roleSales')}>
                    <select className="ofi-cal-input" value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}>
                        <option value="">{t('osp.import.me')}</option>
                        {staff.map((row) => (
                            <option key={row.id} value={row.id}>{`${row.firstName} ${row.lastName}`.trim()}</option>
                        ))}
                    </select>
                </PopupField>
            </div>

            {/* ── Position (Datenblatt-Schablone) ── */}
            <PopupCaption>{t('osp.import.positionSection')}</PopupCaption>
            {/* Steht nur da, wenn wirklich etwas aus dem PDF kam — ein Hinweis
                auf eine leere Vorbelegung wäre eine Unwahrheit. */}
            {specs && Object.keys(specs).length > 0 && (
                <PopupNote>{t('osp.import.fromDatasheet')}</PopupNote>
            )}
            <PopupField label={t('osp.import.positionTitle')} required>
                <input className="ofi-cal-input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </PopupField>

            <div className="ofi-osp-import__grid">
                <PopupField label={isChiller ? t('osp.import.coolingPower') : t('osp.import.heatingPower')}>
                    <input className="ofi-cal-input" placeholder="227.3 kW" value={power} onChange={(e) => setPower(e.target.value)} />
                </PopupField>
                {/* Nur an einer Wärmepumpe: die Kühlleistung steht NEBEN der
                    Heizleistung, statt dass eine der beiden wegfällt. */}
                {!isChiller && (
                    <PopupField label={t('osp.import.coolingPower')}>
                        <input
                            className="ofi-cal-input"
                            placeholder="118.4 kW"
                            value={coolingPower}
                            onChange={(e) => setCoolingPower(e.target.value)}
                        />
                    </PopupField>
                )}
                <PopupField label="COP">
                    <input className="ofi-cal-input" placeholder="3.82" value={cop} onChange={(e) => setCop(e.target.value)} />
                </PopupField>
                <PopupField label="EER">
                    <input className="ofi-cal-input" placeholder="2.8" value={eer} onChange={(e) => setEer(e.target.value)} />
                </PopupField>
                <PopupField label="Medium">
                    <input className="ofi-cal-input" placeholder="Wasser" value={medium} onChange={(e) => setMedium(e.target.value)} />
                </PopupField>
            </div>

            <PopupField label="Technology" hint={t('osp.import.technologyHint')}>
                <textarea
                    className="ofi-cal-input ofi-osp-import__textarea"
                    rows={3}
                    placeholder={'Verdampfer und Verflüssiger für Wasser/Wasser - PWT\nUmweltfreundliches Kältemittel R290\nIntelligente Steuerung via Schneider Electric'}
                    value={technology}
                    onChange={(e) => setTechnology(e.target.value)}
                />
            </PopupField>

            <div className="ofi-osp-import__grid">
                <PopupField label="Schalldruck bei 1 m">
                    <input className="ofi-cal-input" placeholder="75 dB(A) mit normalem Schallschutz" value={sound1m} onChange={(e) => setSound1m(e.target.value)} />
                </PopupField>
                <PopupField label="Schalldruck bei 10 m">
                    <input className="ofi-cal-input" placeholder="56 dB(A)" value={sound10m} onChange={(e) => setSound10m(e.target.value)} />
                </PopupField>
                <PopupField label="Abmessungen LxBxH">
                    <input className="ofi-cal-input" placeholder="ca. 2.07m x 0.90m x 1.95m" value={dimensions} onChange={(e) => setDimensions(e.target.value)} />
                </PopupField>
                <PopupField label="Betriebsgewicht">
                    <input className="ofi-cal-input" placeholder="ca. 1'403 kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
                </PopupField>
            </div>

            {descriptionText && (
                <div className="ofi-osp-import__preview">
                    <span className="ofi-osp-import__previewlabel">{t('osp.import.preview')}</span>
                    <pre>{descriptionText}</pre>
                </div>
            )}

            {/* ── Preis ── */}
            <PopupCaption>{t('osp.import.priceSection')}</PopupCaption>
            <div className="ofi-osp-import__grid">
                <PopupField label={t('osp.import.quantity')}>
                    <input className="ofi-cal-input" type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </PopupField>
                <PopupField label={t('osp.import.unit')}>
                    <input className="ofi-cal-input" value={unit} onChange={(e) => setUnit(e.target.value)} />
                </PopupField>
                <PopupField label={t('osp.import.unitPrice')} required>
                    <input className="ofi-cal-input" type="number" min="0" step="0.01" placeholder="0.00" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
                </PopupField>
            </div>

            <PopupNote tone="warning">{t('osp.import.noStockNote')}</PopupNote>
        </PopupDialog>
    );
};
