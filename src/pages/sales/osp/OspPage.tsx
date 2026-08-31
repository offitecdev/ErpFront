import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
    AlertTriangle,
    ArrowRight,
    RefreshCcw01,
    Settings01,
    Trash01,
} from '@/components/icons/antIconCompat';
import { OspPdfIcon } from '@/components/icons/OspMark';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { Pager, SearchBox, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { ospApi, type OspDocumentDto, type OspListResponse, type OspStatus } from '@/lib/api/osp';
import { useStaffDirectory } from '@/pages/crm/hooks/useStaffDirectory';
import { PdfPreviewSheet } from '@/components/pdf/PdfPreviewSheet';
import { buildOspDescription, specsToDescriptionValues } from './ospDescription';

/**
 * ── OSP-SEITE (/sales/osp) ───────────────────────────────────────────────────
 * Die Offertanfragen der Offitec Selection Platform, 15 je Seite.
 *
 * Aufräumen 05.09.2026 (Benutzerwunsch "das sieht unordentlich aus"): aus zwölf
 * schmalen Spalten wurden SIEBEN lesbare — jede Angabe steht weiterhin da, aber
 * gruppiert nach der Frage, die sie beantwortet (Anfrage / Wer / Was / Wann /
 * Zuständig / Stand / Offerte). Die Tabelle bekommt KEINE Mindestbreite mehr:
 * die automatische Spaltenaufteilung (lib/autoColumnResize) füllt genau die
 * Karte, statt sie zu überlaufen und den Knopf rechts abzuschneiden.
 *
 * Zuständigkeit (19.09.2026): EINE Person — die Verkäuferin/der Verkäufer, die
 * die Offerte macht. Das zweite Feld für die Projektleitung ist weg; an die OSP
 * gemeldet wird ohnehin nur die Verkäufer-E-Mail.
 *
 * Der STAND wird nicht gewählt, er folgt: ohne Zuständige "Gelistet", mit
 * "Verkäufer zugewiesen" (drüben `under review`), nach dem Versand der
 * Angebotsmail "Gesendet" (drüben `offer has been sent`).
 */

const PAGE_SIZE = 15;

/** Die Reihenfolge gilt nur für den Filter; der Zeilenstatus ist automatisch. */
const STATUS_ORDER: OspStatus[] = ['LISTED', 'IN_OFFER', 'SENT', 'APPROVED', 'WITHDRAWN'];

const statusLabel = (status: OspStatus): string => t(`osp.status_${status}`);

const categoryLabel = (category: string | null): string => {
    const slug = (category || '').toLowerCase().trim();
    if (slug.includes('chill')) return t('osp.category_chiller');
    if (slug.includes('heat')) return t('osp.category_heatPump');
    if (slug.includes('dry')) return t('osp.category_dryCooler');
    return category || '—';
};

const categoryClass = (category: string | null): string => {
    const slug = (category || '').toLowerCase().trim();
    if (slug.includes('chill')) return 'is-chiller';
    if (slug.includes('heat')) return 'is-heatpump';
    if (slug.includes('dry')) return 'is-drycooler';
    return '';
};

const unitTypeLabel = (unitType: string | null): string => {
    const slug = (unitType || '').toLowerCase().trim();
    if (slug === 'air to water') return t('osp.type_airToWater');
    if (slug === 'water to water') return t('osp.type_waterToWater');
    return unitType || '';
};

/** OSP-Kontotyp: "user" | "admin" — sonst wird nichts angezeigt. */
const userTypeLabel = (userType: string | null): string => {
    const slug = (userType || '').toLowerCase().trim();
    if (slug === 'user') return t('osp.userType_user');
    if (slug === 'admin') return t('osp.userType_admin');
    return userType || '';
};

const fmtDate = (value: string | null): string => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fmtTime = (value: string | null): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
};

export const OspPage = () => {
    const navigate = useNavigate();
    const { staff } = useStaffDirectory();

    const [data, setData] = useState<OspListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<'' | OspStatus>('');
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [creatingOfferId, setCreatingOfferId] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    /* Löschen einer Anfrage (§4b): erst drüben zurückziehen, dann hier weg —
       darum eine Bestätigung mit dem Beleg, der es trifft. */
    const [deleteTarget, setDeleteTarget] = useState<OspDocumentDto | null>(null);
    const [deleting, setDeleting] = useState(false);

    /* Das Datenblatt der Einheit — das ECHTE PDF der OSP, aus unserer Ablage.
       Es wird in der gemeinsamen PDF-Vorschau gezeigt, wie jedes andere
       Dokument im Programm auch. */
    const [sheetDoc, setSheetDoc] = useState<OspDocumentDto | null>(null);
    const [sheetBlob, setSheetBlob] = useState<Blob | null>(null);
    const [sheetLoading, setSheetLoading] = useState(false);

    /* Suche entprellt zur Abfrage — jede neue Suche beginnt auf Seite 1. */
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const changeSearch = (next: string) => {
        setSearch(next);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => { setQuery(next.trim()); setPage(1); }, 300);
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await ospApi.listDocuments({ page, pageSize: PAGE_SIZE, status, q: query });
            setData(response);
            setForbidden(false);
        } catch (error: any) {
            if (error?.response?.status === 403) setForbidden(true);
            else toast.error(error?.response?.data?.error || t('osp.loadError'));
        } finally {
            setLoading(false);
        }
    }, [page, status, query]);

    useEffect(() => { void load(); }, [load]);

    const items = data?.items ?? [];

    const replaceRow = (row: OspDocumentDto) => {
        setData((current) => current
            ? { ...current, items: current.items.map((item) => (item.id === row.id ? row : item)) }
            : current);
    };

    const patchRow = async (
        doc: OspDocumentDto,
        patch: { salespersonId?: string | null },
    ) => {
        setBusyId(doc.id);
        try {
            const updated = await ospApi.updateDocument(doc.id, patch);
            replaceRow(updated);
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('osp.saveError'));
        } finally {
            setBusyId(null);
        }
    };

    /* Datenblatt öffnen. Liegt es noch nicht bei uns, wird es zuerst geholt —
       das ist der Normalfall für Zeilen, die vor dem Datenblatt-Feld kamen. */
    const openDatasheet = async (doc: OspDocumentDto) => {
        setSheetDoc(doc);
        setSheetBlob(null);
        setSheetLoading(true);
        try {
            let row = doc;
            if (!row.datasheetFile) {
                row = await ospApi.refetchDatasheet(doc.id);
                replaceRow(row);
                setSheetDoc(row);
                if (!row.datasheetFile) {
                    toast.error(row.datasheetError || t('osp.datasheetFailed'));
                    setSheetDoc(null);
                    return;
                }
            }
            setSheetBlob(await ospApi.datasheet(row.id));
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('osp.datasheetFailed'));
            setSheetDoc(null);
        } finally {
            setSheetLoading(false);
        }
    };

    /* ── Offerte DIREKT erzeugen (Benutzerwunsch 27.08.2026) ──────────────────
       Kein Import-Fenster mehr: der Knopf erstellt die Offerte sofort — mit
       der Kundschaft aus der Anfrage (frei, NIE als CRM-Kunde) und EINER
       Textposition, deren Beschreibung der festen Datenblatt-Schablone folgt
       (ospDescription.ts — Blöcke mit Aufzählungspunkten + Schlusssatz).
       Preis, Name und alles Übrige werden danach an der Offerte selbst
       gepflegt; dorthin springt die Seite direkt.

       Der Name ist IMMER die Firma, nie die anfragende Person (Vorgabe
       05.09.2026) — kennt die OSP keine Firma, entsteht die Offerte ohne
       Kundennamen und er wird an der Offerte frei eingetippt. */
    const createOffer = async (doc: OspDocumentDto) => {
        setBusyId(doc.id);
        setCreatingOfferId(doc.id);
        try {
            let row = doc;
            // Fehlen die Datenblatt-Angaben noch (Zeile von vor dem Datenblatt-
            // Feld), einmal nachholen — scheitert das, entsteht die Offerte
            // trotzdem, nur mit leerer Beschreibung.
            const hasSpecs = row.datasheetSpecs && Object.keys(row.datasheetSpecs).length > 0;
            if (!hasSpecs && (row.datasheetUrl || row.datasheetFile)) {
                try {
                    row = await ospApi.refetchDatasheet(doc.id);
                    replaceRow(row);
                } catch {
                    row = doc;
                }
            }
            const { html } = buildOspDescription(specsToDescriptionValues(row.datasheetSpecs, row.category));
            // Ohne Datenblatt-Angaben entsteht die Offerte trotzdem — aber der
            // Grund für die leere Beschreibung wird GESAGT, statt verschwiegen:
            // entweder nannte der Webhook keine PDF-Adresse, oder das Holen
            // scheiterte (dann steht der Fehler auch an der Zeile).
            if (!html) {
                toast.warning(row.datasheetError || t('osp.import.noDatasheetInfo'));
            }
            const requesterName = [row.requesterFirstName, row.requesterLastName].filter(Boolean).join(' ').trim();
            // Der Kontotyp steht nicht mehr im Vertrag; kommt er trotzdem mit,
            // gilt weiterhin, dass ein Verwaltungskonto auf die anfragende
            // Person zurückfallen darf. Ohne ihn bleibt es bei der Vorgabe:
            // der Name ist die FIRMA, nie die Person (05.09.2026).
            const isOspAdmin = (row.userType || '').trim().toLowerCase() === 'admin';
            const result = await ospApi.importDocument(row.id, {
                customerId: null,
                // Adresse gilt nur für diese Offerte — der Kundenstamm bleibt
                // unberührt (es wird nirgends ein CRM-Kunde angelegt). Auf die
                // Offerte gehört die RECHNUNGSadresse; die Projektadresse ist
                // der Einbauort und tritt nur ein, wenn die OSP keine nennt.
                manualCustomer: {
                    name: isOspAdmin ? (row.company || requesterName) : (row.company || ''),
                    email: row.requesterEmail || '',
                    country: row.country || '',
                    city: row.city || '',
                    address: row.billingAddress || row.address || '',
                    postalCode: row.postalCode || '',
                },
                // Titel = Modell; der Preis ("nur die Gebühren") wird an der
                // Offerte eingetragen. Verkauf/Projektleitung nimmt der Server
                // aus der Zeile bzw. der anlegenden Person.
                positions: [{
                    title: (row.model || row.projectName || row.reference).trim(),
                    descriptionHtml: html,
                    quantity: 1,
                    unit: 'Stk',
                    unitPrice: 0,
                }],
            });
            toast.success(t('osp.import.done', { number: result.tenderNumber }));
            navigate(`/sales/quotes/${result.tenderId}`);
        } catch (error: any) {
            // 409 = es besteht schon eine Offerte → dorthin springen.
            const existingTenderId = error?.response?.data?.tenderId;
            if (error?.response?.status === 409 && existingTenderId) {
                navigate(`/sales/quotes/${existingTenderId}`);
                return;
            }
            toast.error(error?.response?.data?.error || t('osp.import.failed'));
        } finally {
            setBusyId(null);
            setCreatingOfferId(null);
        }
    };

    /* Die Anfrage löschen. Der Server meldet zuerst den Rückzug an die OSP
       (§4b — die Methode DELETE IST die Meldung "gelöscht"; einen Status
       `deleted` gibt es nicht) und entfernt die Zeile erst danach. Bleibt die
       Bestätigung drüben aus, bleibt die Zeile stehen und sagt warum — die
       beiden Seiten sollen nie stillschweigend Verschiedenes wissen. */
    const deleteDocument = async () => {
        const doc = deleteTarget;
        if (!doc) return;
        setDeleting(true);
        try {
            await ospApi.deleteDocument(doc.id);
            toast.success(t('osp.delete.done', { reference: doc.reference }));
            setDeleteTarget(null);
            await load();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('osp.delete.failed'));
        } finally {
            setDeleting(false);
        }
    };

    /* Abgleich mit der OSP — holt die Stände drüben zurück. */
    const runSync = async () => {
        setSyncing(true);
        try {
            const result = await ospApi.sync();
            toast.success(t('osp.syncDone', { checked: result.checked, updated: result.updated }));
            await load();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('osp.syncError'));
        } finally {
            setSyncing(false);
        }
    };

    const totalPages = data?.totalPages ?? 1;
    const total = data?.total ?? 0;
    const pageSafe = Math.min(page, Math.max(1, totalPages));
    const hasFilters = Boolean(query || status);
    const counts = data?.counts;

    const colLabel = {
        request: t('osp.colRequest'),
        requester: t('osp.colRequester'),
        unit: t('osp.colUnit'),
        documents: t('osp.colDocuments'),
        createdAt: t('osp.colCreatedAt'),
        people: t('osp.colPeople'),
        status: t('osp.colStatus'),
        offer: t('osp.colOffer'),
    };

    /* Die eine Zuständigkeit: WER die Offerte macht. Die Wahl ist zugleich der
       Stand — wer hier jemanden einträgt, meldet der OSP "under review". */
    const salesSelect = (doc: OspDocumentDto) => (
        <label className="ofi-osp-person">
            <span className="ofi-osp-person__label">{t('osp.roleSales')}</span>
            <select
                className="ofi-osp-select"
                value={doc.salespersonId || ''}
                disabled={busyId === doc.id}
                onChange={(event) => void patchRow(doc, { salespersonId: event.target.value || null })}
            >
                <option value="">{t('osp.noPerson')}</option>
                {staff.map((row) => (
                    <option key={row.id} value={row.id}>{`${row.firstName} ${row.lastName}`.trim()}</option>
                ))}
            </select>
        </label>
    );

    return (
        <div className="ofi-osp-page ofi-rise flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('osp.title')}
                action={(
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="ofi-osp-toolbtn"
                            disabled={syncing || forbidden}
                            onClick={() => void runSync()}
                        >
                            <RefreshCcw01 size={14} className={syncing ? 'ofi-osp-spin' : undefined} />
                            {t('osp.syncBtn')}
                        </button>
                        <button
                            type="button"
                            className="ofi-osp-toolbtn"
                            title={t('osp.settingsBtn')}
                            aria-label={t('osp.settingsBtn')}
                            onClick={() => navigate('/settings/modules?module=sales&category=osp')}
                        >
                            <Settings01 size={14} />
                        </button>
                    </div>
                )}
            />

            <div className="flex flex-wrap items-center gap-2">
                <SearchBox
                    value={search}
                    onChange={changeSearch}
                    placeholder={t('osp.searchPlaceholder')}
                    className="w-full sm:w-72"
                />
                <select
                    value={status}
                    onChange={(event) => {
                        setStatus(event.target.value as '' | OspStatus);
                        setPage(1);
                    }}
                    aria-label={t('osp.filterLabel')}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 focus:border-[#1f2654] focus:outline-none sm:w-auto dark:border-white/20 dark:bg-transparent dark:text-white"
                >
                    <option value="">{t('osp.filterAll')}</option>
                    {STATUS_ORDER.map((key) => (
                        <option key={key} value={key}>
                            {counts ? `${statusLabel(key)} (${counts[key] ?? 0})` : statusLabel(key)}
                        </option>
                    ))}
                </select>
            </div>

            {forbidden ? (
                <SectionCard>
                    <div className="flex min-h-48 flex-col items-center justify-center gap-4 px-6 py-10 text-center text-[13px] text-slate-500 dark:text-white/60">
                        <p>{t('osp.notEnabled')}</p>
                        <button
                            type="button"
                            className="ofi-btn-brand inline-flex items-center gap-2 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1f2654]"
                            onClick={() => navigate('/settings/modules?module=sales&category=osp')}
                        >
                            <Settings01 size={14} />
                            {t('osp.settingsBtn')}
                        </button>
                    </div>
                </SectionCard>
            ) : (
                <SectionCard title={`${t('osp.title')} (${total})`}>
                    <table data-inv-table data-list-table data-unstyled-table className="ofi-osp-table w-full">
                        <thead>
                            <tr>
                                <th>{colLabel.request}</th>
                                <th>{colLabel.requester}</th>
                                <th>{colLabel.unit}</th>
                                <th className="ofi-osp-dochead">{colLabel.documents}</th>
                                <th>{colLabel.createdAt}</th>
                                <th>{colLabel.people}</th>
                                <th className="ofi-osp-statushead">{colLabel.status}</th>
                                <th className="ofi-osp-actionhead">{colLabel.offer}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || items.length === 0) && (
                                <TableStateRow
                                    colSpan={8}
                                    loading={loading}
                                    emptyText={hasFilters ? t('osp.emptyFiltered') : t('osp.empty')}
                                />
                            )}
                            {!loading && items.map((doc) => {
                                const busy = busyId === doc.id;
                                const requester = [doc.requesterFirstName, doc.requesterLastName].filter(Boolean).join(' ');
                                const place = [doc.postalCode, doc.city].filter(Boolean).join(' ');
                                const origin = [place, doc.country].filter(Boolean).join(' · ');
                                return (
                                    <tr key={doc.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                        {/* Anfrage: Referenz oben, Projektname darunter. */}
                                        <td data-label={colLabel.request}>
                                            <div className="ofi-osp-stack">
                                                <span className="ofi-osp-ref">{doc.projectNumber}</span>
                                                {doc.documentId && <span className="ofi-osp-docid">#{doc.documentId}</span>}
                                                <span className="ofi-osp-sub">{doc.projectName || '—'}</span>
                                            </div>
                                        </td>
                                        {/* Wer gefragt hat: Person, Konto, Herkunft. */}
                                        <td data-label={colLabel.requester}>
                                            <div className="ofi-osp-stack">
                                                <span className="ofi-osp-requester">{doc.company || requester || '—'}</span>
                                                {doc.company && requester && <span className="ofi-osp-sub">{requester}</span>}
                                                {doc.requesterEmail && <span className="ofi-osp-sub">{doc.requesterEmail}</span>}
                                                {/* Die Nummer, die FÜR DIESES PROJEKT gilt — nicht
                                                    zwingend die des OSP-Kontos (§1). */}
                                                {doc.phone && <span className="ofi-osp-sub">{doc.phone}</span>}
                                                <span className="ofi-osp-meta">
                                                    {doc.userType && (
                                                        <span className="ofi-osp-tag">{userTypeLabel(doc.userType)}</span>
                                                    )}
                                                    {origin && <span className="ofi-osp-sub is-inline">{origin}</span>}
                                                </span>
                                            </div>
                                        </td>
                                        {/* Was gefragt wurde: Kategorie, Modell, Bauart. */}
                                        <td data-label={colLabel.unit}>
                                            <div className="ofi-osp-stack">
                                                {doc.category && (
                                                    <span className={`ofi-osp-chip ${categoryClass(doc.category)}`}>
                                                        {categoryLabel(doc.category)}
                                                    </span>
                                                )}
                                                <span className="ofi-osp-model">{doc.model || '—'}</span>
                                                {unitTypeLabel(doc.unitType) && (
                                                    <span className="ofi-osp-sub">{unitTypeLabel(doc.unitType)}</span>
                                                )}
                                            </div>
                                        </td>
                                        {/* Dokumente: NUR das Datenblatt, und nur als Zeichen
                                            (Vorgabe 19.09.2026 — "die Spalte darf schmaler sein").
                                            Vorher stand hier der Dateiname der OSP: eine
                                            Kennnummer, die niemandem etwas sagt und der Spalte
                                            die halbe Tabelle wegnahm. Die Aufschrift "OSP PDF"
                                            steht im Titel, wo sie keinen Platz braucht.

                                            Geöffnet wird immer UNSERE abgelegte Kopie in der
                                            gemeinsamen PDF-Vorschau — die Adresse drüben läuft ab,
                                            die Kopie nicht. */}
                                        <td data-label={colLabel.documents} className="ofi-osp-doccell">
                                            {(doc.datasheetUrl || doc.datasheetFile) ? (
                                                <button
                                                    type="button"
                                                    className="ofi-osp-sheetbtn"
                                                    title={t('osp.datasheetTile')}
                                                    aria-label={t('osp.datasheetTile')}
                                                    onClick={() => void openDatasheet(doc)}
                                                >
                                                    <OspPdfIcon size={40} />
                                                </button>
                                            ) : (
                                                <span className="ofi-osp-sub">—</span>
                                            )}
                                            {/* Warum nichts da ist, steht am Zeichen — als
                                                Dreieck, nicht als Satz: der Satz wäre wieder so
                                                breit wie der Dateiname vorher. */}
                                            {doc.datasheetError && (
                                                <span
                                                    className="ofi-osp-sheeterr"
                                                    title={`${t('osp.datasheetFailed')} — ${doc.datasheetError}`}
                                                    aria-label={t('osp.datasheetFailed')}
                                                >
                                                    <AlertTriangle size={12} />
                                                </span>
                                            )}
                                        </td>
                                        <td data-label={colLabel.createdAt}>
                                            <div className="ofi-osp-stack">
                                                <span>{fmtDate(doc.ospCreatedAt || doc.createdAt)}</span>
                                                <span className="ofi-osp-sub">{fmtTime(doc.ospCreatedAt || doc.createdAt)}</span>
                                            </div>
                                        </td>
                                        {/* Zuständig: die eine Person, die die Offerte macht. */}
                                        <td data-label={colLabel.people} className="ofi-osp-peoplecell">
                                            <div className="ofi-osp-stack">
                                                {salesSelect(doc)}
                                            </div>
                                        </td>
                                        <td data-label={colLabel.status} className="ofi-osp-statuscell">
                                            <div className="ofi-osp-stack">
                                                <span
                                                    className={`ofi-osp-status is-${doc.status.toLowerCase()}`}
                                                    title={statusLabel(doc.status)}
                                                >
                                                    <span className="ofi-osp-status__label">{statusLabel(doc.status)}</span>
                                                </span>
                                                {/* Zurückgezogen (§1b): wer wann. Die Zeile behält alles —
                                                    sie sagt nur, dass niemand mehr daran arbeiten soll. */}
                                                {doc.status === 'WITHDRAWN' && doc.withdrawnAt && (
                                                    <span
                                                        className="ofi-osp-sub"
                                                        title={[doc.withdrawnByName, doc.withdrawnByEmail].filter(Boolean).join(' · ')}
                                                    >
                                                        {t('osp.withdrawnOn', { date: fmtDate(doc.withdrawnAt) })}
                                                    </span>
                                                )}
                                                {/* Überarbeitet (§1a): die Einheit kam neu gerechnet noch
                                                    einmal — das alte Datenblatt gilt nicht mehr. */}
                                                {doc.revisedAt && doc.status !== 'WITHDRAWN' && (
                                                    <span className="ofi-osp-sub is-revised" title={fmtDate(doc.revisedAt)}>
                                                        <RefreshCcw01 size={11} />
                                                        {t('osp.revisedOn', { date: fmtDate(doc.revisedAt) })}
                                                    </span>
                                                )}
                                                {/* Die fehlgeschlagene Meldung steht als eigene Zeile unter der
                                                    Pille — nie mehr quer über die Nachbarspalte. */}
                                                {doc.lastReportError && (
                                                    <span className="ofi-osp-sub is-error" title={doc.lastReportError}>
                                                        <AlertTriangle size={11} />
                                                        {t('osp.reportFailed')}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td data-label={colLabel.offer} className="ofi-osp-actioncell">
                                            <div className="ofi-osp-actions">
                                                {doc.tenderId ? (
                                                    <button
                                                        type="button"
                                                        className="ofi-osp-import-btn is-open"
                                                        title={t('osp.openOffer')}
                                                        onClick={() => navigate(`/sales/quotes/${doc.tenderId}`)}
                                                    >
                                                        {doc.tenderNumber || t('osp.openOffer')}
                                                        <ArrowRight size={13} />
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="ofi-osp-import-btn"
                                                        disabled={busy}
                                                        onClick={() => void createOffer(doc)}
                                                    >
                                                        {t('osp.import.create')}
                                                    </button>
                                                )}
                                                {/* Löschen: der Vertrag verlangt ihn für Zeilen aus
                                                    der OSP (§ "Delete action"). Er zieht die Anfrage
                                                    drüben zurück und nimmt die Zeile hier weg. */}
                                                <button
                                                    type="button"
                                                    className="ofi-osp-rowdel"
                                                    title={t('osp.delete.action')}
                                                    aria-label={t('osp.delete.action')}
                                                    disabled={busy}
                                                    onClick={() => setDeleteTarget(doc)}
                                                >
                                                    <Trash01 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <div className="border-t border-slate-200 dark:border-white/10">
                        <Pager
                            page={pageSafe}
                            totalPages={Math.max(1, totalPages)}
                            total={total}
                            pageSize={PAGE_SIZE}
                            onPage={setPage}
                        />
                    </div>
                </SectionCard>
            )}
            {/* Löschen bestätigen: es trifft die Anfrage, nicht die Offerte —
                das steht so im Fenster, damit niemand die Offerte vermisst. */}
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                tone="danger"
                busy={deleting}
                title={t('osp.delete.title')}
                message={(
                    <>
                        <div>{t('osp.delete.message', { reference: deleteTarget?.reference || '' })}</div>
                        {deleteTarget?.tenderNumber && (
                            <div className="mt-1.5">
                                {t('osp.delete.keepsOffer', { number: deleteTarget.tenderNumber })}
                            </div>
                        )}
                    </>
                )}
                confirmLabel={t('common.delete')}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() => void deleteDocument()}
            />
            {creatingOfferId && createPortal((
                <div className="ofi-osp-creating" role="dialog" aria-modal="true" aria-labelledby="ofi-osp-creating-title">
                    <div className="ofi-osp-creating__card" role="status" aria-live="polite">
                        <span className="ofi-osp-creating__spinner" aria-hidden="true">
                            <RefreshCcw01 size={22} />
                        </span>
                        <span id="ofi-osp-creating-title" className="ofi-osp-creating__title">
                            {t('tenders.tender_olusturuluyor')}
                        </span>
                    </div>
                </div>
            ), document.body)}
            {/* Das Datenblatt in der gemeinsamen PDF-Vorschau — dasselbe
                Fenster wie bei Offerte und Rapport. */}
            <PdfPreviewSheet
                open={Boolean(sheetDoc)}
                title={t('osp.datasheet')}
                subtitle={[sheetDoc?.reference, sheetDoc?.model].filter(Boolean).join(' · ')}
                blob={sheetBlob}
                loading={sheetLoading}
                loadingLabel={t('osp.datasheetLoading')}
                emptyText={t('osp.datasheetNone')}
                downloadLabel={t('osp.datasheet')}
                onClose={() => { setSheetDoc(null); setSheetBlob(null); }}
                onDownload={() => {
                    if (!sheetBlob || !sheetDoc) return;
                    const url = URL.createObjectURL(sheetBlob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = `Datenblatt-${sheetDoc.reference}.pdf`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                }}
            />
        </div>
    );
};
