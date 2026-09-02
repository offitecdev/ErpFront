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
import {
    ospApi,
    type OspDocumentDto,
    type OspListResponse,
    type OspStatus,
    type OspUnitDto,
} from '@/lib/api/osp';
import { useStaffDirectory } from '@/pages/crm/hooks/useStaffDirectory';
import { PdfPreviewSheet } from '@/components/pdf/PdfPreviewSheet';
import { buildOspDescription, specsToDescriptionValues } from './ospDescription';
import { changeSummary } from './ospChanges';
import { OspFeedTable } from './OspFeedTable';

/**
 * ── OSP-SEITE (/sales/osp) ───────────────────────────────────────────────────
 * Die Offertanfragen der Offitec Selection Platform, 15 je Seite.
 *
 * EINE ANFRAGE IST EIN PROJEKT (vierte Vertragsfassung, 20.09.2026). Wer drüben
 * "Get Offer" drückt, fragt sein ganzes Projekt an — mit allen Einheiten darin,
 * ohne Auswahl. Eine Zeile ist deshalb ein PROJEKT, die angefragten Einheiten
 * stehen darin untereinander, und "Offerte erstellen" macht daraus EINE Offerte
 * mit einer Position je Einheit.
 *
 * Daneben steht ein zweiter Reiter: der Aktivitätsstrom (§1c). Er zeigt, was
 * drüben gerechnet wird — und ist AUSDRÜCKLICH keine Anfrage. Er gehört
 * deshalb nicht in diese Liste, aus der der Verkauf arbeitet, sondern neben
 * sie.
 *
 * Zuständigkeit (19.09.2026): EINE Person — die Verkäuferin/der Verkäufer, die
 * die Offerte macht. An die OSP gemeldet wird ohnehin nur ihre E-Mail.
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

const unitsOf = (doc: OspDocumentDto): OspUnitDto[] => doc.units ?? [];

/** Der Name, unter dem eine Einheit auf der Seite und in der Offerte steht. */
const unitTitle = (unit: OspUnitDto): string => (
    unit.unitModel || unit.unitName || t('osp.unitFallback', { id: unit.ospDocumentId })
);

/** Die Kopfzahl der Einheit — Heiz- oder Kühlleistung, wie das Datenblatt sie führt. */
const unitPower = (unit: OspUnitDto): string => {
    const specs = unit.datasheetSpecs;
    if (!specs?.power) return '';
    const label = specs.powerIsCooling ? t('osp.import.coolingPower') : t('osp.import.heatingPower');
    return `${label} ${specs.power}`;
};

export const OspPage = () => {
    const navigate = useNavigate();
    const { staff } = useStaffDirectory();

    /* Zwei Reiter, und der Unterschied ist kein Anzeigedetail: links stehen
       ANFRAGEN, die jemand gestellt hat, rechts ein STROM, den niemand
       beantwortet. Sie dürfen nicht in einer Liste landen. */
    const [tab, setTab] = useState<'requests' | 'feed'>('requests');

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

    /* Das Datenblatt EINER EINHEIT — das ECHTE PDF der OSP, aus unserer
       Ablage. Es wird in der gemeinsamen PDF-Vorschau gezeigt, wie jedes
       andere Dokument im Programm auch. */
    const [sheetUnit, setSheetUnit] = useState<{ doc: OspDocumentDto; unit: OspUnitDto } | null>(null);
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

    /** Eine EINZELNE Einheit an ihrer Anfrage ersetzen (nach dem Holen). */
    const replaceUnit = (docId: string, unit: OspUnitDto) => {
        setData((current) => current
            ? {
                ...current,
                items: current.items.map((item) => (item.id === docId
                    ? { ...item, units: unitsOf(item).map((row) => (row.id === unit.id ? unit : row)) }
                    : item)),
            }
            : current);
    };

    const patchRow = async (
        doc: OspDocumentDto,
        patch: { salespersonId?: string | null },
    ) => {
        setBusyId(doc.id);
        try {
            const updated = await ospApi.updateDocument(doc.id, patch);
            // Die Antwort der Zuweisung trägt die Einheiten nicht — sie ändern
            // sich dabei auch nicht, also bleiben die vorhandenen stehen.
            replaceRow({ ...updated, units: updated.units ?? unitsOf(doc) });
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('osp.saveError'));
        } finally {
            setBusyId(null);
        }
    };

    /* Das Datenblatt einer Einheit öffnen. Liegt es noch nicht bei uns, wird es
       zuerst geholt — der Normalfall, wenn der Aktivitätsstrom (§1c) gerade
       eine neue Adresse gebracht hat und die alte drüben gelöscht wurde. */
    const openDatasheet = async (doc: OspDocumentDto, unit: OspUnitDto) => {
        setSheetUnit({ doc, unit });
        setSheetBlob(null);
        setSheetLoading(true);
        try {
            let row = unit;
            if (!row.datasheetFile) {
                row = await ospApi.refetchDatasheet(unit.id);
                replaceUnit(doc.id, row);
                setSheetUnit({ doc, unit: row });
                if (!row.datasheetFile) {
                    toast.error(row.datasheetError || t('osp.datasheetFailed'));
                    setSheetUnit(null);
                    return;
                }
            }
            setSheetBlob(await ospApi.datasheet(row.id));
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('osp.datasheetFailed'));
            setSheetUnit(null);
        } finally {
            setSheetLoading(false);
        }
    };

    /* ── Offerte DIREKT erzeugen (Benutzerwunsch 27.08.2026) ──────────────────
       Kein Import-Fenster: der Knopf erstellt die Offerte sofort — mit der
       Kundschaft aus der Anfrage (frei, NIE als CRM-Kunde) und EINER
       TEXTPOSITION JE ANGEFRAGTER EINHEIT, deren Beschreibung der festen
       Datenblatt-Schablone folgt (ospDescription.ts — Blöcke mit
       Aufzählungspunkten + Schlusssatz). Preise, Namen und alles Übrige werden
       danach an der Offerte selbst gepflegt; dorthin springt die Seite direkt.

       Der Kundenname ist IMMER die Firma, nie die anfragende Person (Vorgabe
       05.09.2026) — kennt die OSP keine Firma, entsteht die Offerte ohne
       Kundennamen und er wird an der Offerte frei eingetippt. */
    const createOffer = async (doc: OspDocumentDto) => {
        setBusyId(doc.id);
        setCreatingOfferId(doc.id);
        try {
            let units = unitsOf(doc);
            /* Fehlen die Datenblatt-Angaben einer Einheit noch, einmal
               nachholen — scheitert es, entsteht die Offerte trotzdem, nur mit
               leerer Beschreibung für diese eine Position. */
            const pending = units.filter((unit) => (
                !(unit.datasheetSpecs && Object.keys(unit.datasheetSpecs).length) && unit.pdfUrl
            ));
            if (pending.length) {
                const fetched = await Promise.all(pending.map((unit) => (
                    ospApi.refetchDatasheet(unit.id).catch(() => null)
                )));
                const byId = new Map(fetched.filter(Boolean).map((unit) => [unit!.id, unit!]));
                units = units.map((unit) => byId.get(unit.id) || unit);
                replaceRow({ ...doc, units });
            }

            const positions = units.map((unit) => {
                const { html } = buildOspDescription(specsToDescriptionValues(unit.datasheetSpecs, doc.category));
                return {
                    // Titel = Modell der Einheit; der Preis ("nur die Gebühren")
                    // wird an der Offerte eingetragen.
                    title: unitTitle(unit),
                    descriptionHtml: html,
                    quantity: 1,
                    unit: 'Stk',
                    unitPrice: 0,
                };
            });
            /* Eine Anfrage ohne Einheiten gibt es eigentlich nicht (§1 lässt nur
               Belege ohne gerendertes Datenblatt weg). Kommt sie doch, entsteht
               trotzdem eine Offerte — mit dem Projekt als einziger Zeile. */
            if (!positions.length) {
                positions.push({
                    title: (doc.projectName || doc.reference).trim(),
                    descriptionHtml: null,
                    quantity: 1,
                    unit: 'Stk',
                    unitPrice: 0,
                });
            }
            // Ohne Datenblatt-Angaben entsteht die Offerte trotzdem — aber der
            // Grund für die leere Beschreibung wird GESAGT, statt verschwiegen:
            // entweder nannte der Webhook keine PDF-Adresse, oder das Holen
            // scheiterte (dann steht der Fehler auch an der Einheit).
            if (positions.every((row) => !row.descriptionHtml)) {
                toast.warning(units.find((unit) => unit.datasheetError)?.datasheetError || t('osp.import.noDatasheetInfo'));
            }

            const requesterName = [doc.requesterFirstName, doc.requesterLastName].filter(Boolean).join(' ').trim();
            // Der Kontotyp steht nicht mehr im Vertrag; kommt er trotzdem mit,
            // gilt weiterhin, dass ein Verwaltungskonto auf die anfragende
            // Person zurückfallen darf. Ohne ihn bleibt es bei der Vorgabe:
            // der Name ist die FIRMA, nie die Person (05.09.2026).
            const isOspAdmin = (doc.userType || '').trim().toLowerCase() === 'admin';
            const result = await ospApi.importDocument(doc.id, {
                customerId: null,
                // Adresse gilt nur für diese Offerte — der Kundenstamm bleibt
                // unberührt (es wird nirgends ein CRM-Kunde angelegt). Auf die
                // Offerte gehört die RECHNUNGSadresse; die Projektadresse ist
                // der Einbauort und tritt nur ein, wenn die OSP keine nennt.
                manualCustomer: {
                    name: isOspAdmin ? (doc.company || requesterName) : (doc.company || ''),
                    email: doc.requesterEmail || '',
                    country: doc.country || '',
                    city: doc.city || '',
                    address: doc.billingAddress || doc.address || '',
                    postalCode: doc.postalCode || '',
                },
                positions,
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
        units: t('osp.colUnits'),
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

    /* Die angefragten Einheiten: eine Zeile je Stück, jede mit ihrem eigenen
       Datenblatt. Es ist dieselbe Aufteilung, die die Offerte bekommt — eine
       Position je Einheit. */
    const unitList = (doc: OspDocumentDto) => {
        const units = unitsOf(doc);
        if (!units.length) return <span className="ofi-osp-sub">—</span>;
        return (
            <div className="ofi-osp-units">
                {units.map((unit) => {
                    const power = unitPower(unit);
                    // §1a: was an DIESER Einheit passierte. Eine leere Liste
                    // heisst "durch eine Projektänderung neu gerendert".
                    const changed = doc.revisedAt ? changeSummary(unit.changes, true) : null;
                    return (
                        <div key={unit.id} className="ofi-osp-unit">
                            {(unit.pdfUrl || unit.datasheetFile) ? (
                                <button
                                    type="button"
                                    className="ofi-osp-sheetbtn"
                                    title={t('osp.datasheetTile')}
                                    aria-label={`${t('osp.datasheetOpen')} — ${unitTitle(unit)}`}
                                    onClick={() => void openDatasheet(doc, unit)}
                                >
                                    <OspPdfIcon size={28} />
                                </button>
                            ) : (
                                <span className="ofi-osp-unit__nosheet" aria-hidden="true" />
                            )}
                            <span className="ofi-osp-unit__text">
                                <span className="ofi-osp-model">{unitTitle(unit)}</span>
                                {power && <span className="ofi-osp-sub">{power}</span>}
                                {changed && (
                                    <span className="ofi-osp-sub is-revised">
                                        <RefreshCcw01 size={11} />
                                        {changed}
                                    </span>
                                )}
                            </span>
                            {/* Warum kein Datenblatt da ist, steht als Dreieck an
                                der Einheit — der Satz hängt im Titel. */}
                            {unit.datasheetError && (
                                <span
                                    className="ofi-osp-sheeterr"
                                    title={`${t('osp.datasheetFailed')} — ${unit.datasheetError}`}
                                    aria-label={t('osp.datasheetFailed')}
                                >
                                    <AlertTriangle size={12} />
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="ofi-osp-page ofi-rise flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('osp.title')}
                action={(
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="ofi-osp-toolbtn"
                            disabled={syncing || forbidden || tab !== 'requests'}
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

            {/* Anfragen ODER Aktivität — nie beides in einer Liste: das eine hat
                jemand bestellt, das andere rechnet jemand bloss. */}
            <div className="ofi-osp-tabs" role="tablist">
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'requests'}
                    className={`ofi-osp-tab ${tab === 'requests' ? 'is-on' : ''}`}
                    onClick={() => setTab('requests')}
                >
                    {t('osp.tabRequests')}
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'feed'}
                    className={`ofi-osp-tab ${tab === 'feed' ? 'is-on' : ''}`}
                    onClick={() => setTab('feed')}
                >
                    {t('osp.tabFeed')}
                </button>
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
            ) : tab === 'feed' ? (
                <OspFeedTable />
            ) : (
                <>
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

                    <SectionCard title={`${t('osp.title')} (${total})`}>
                        <table data-inv-table data-list-table data-unstyled-table className="ofi-osp-table w-full">
                            <thead>
                                <tr>
                                    <th>{colLabel.request}</th>
                                    <th>{colLabel.requester}</th>
                                    <th>{colLabel.units}</th>
                                    <th>{colLabel.createdAt}</th>
                                    <th>{colLabel.people}</th>
                                    <th className="ofi-osp-statushead">{colLabel.status}</th>
                                    <th className="ofi-osp-actionhead">{colLabel.offer}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(loading || items.length === 0) && (
                                    <TableStateRow
                                        colSpan={7}
                                        loading={loading}
                                        emptyText={hasFilters ? t('osp.emptyFiltered') : t('osp.empty')}
                                    />
                                )}
                                {!loading && items.map((doc) => {
                                    const busy = busyId === doc.id;
                                    const requester = [doc.requesterFirstName, doc.requesterLastName].filter(Boolean).join(' ');
                                    const place = [doc.postalCode, doc.city].filter(Boolean).join(' ');
                                    const origin = [place, doc.country].filter(Boolean).join(' · ');
                                    // §1a: was am PROJEKT bewegt wurde — genau das,
                                    // was die anfragende Person drüben auch sah.
                                    const projectChanges = changeSummary(doc.changes);
                                    return (
                                        <tr key={doc.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                            {/* Anfrage: Projektnummer oben, Projektname darunter. */}
                                            <td data-label={colLabel.request}>
                                                <div className="ofi-osp-stack">
                                                    <span className="ofi-osp-ref">{doc.projectNumber}</span>
                                                    <span className="ofi-osp-sub">{doc.projectName || '—'}</span>
                                                    {doc.category && (
                                                        <span className={`ofi-osp-chip ${categoryClass(doc.category)}`}>
                                                            {categoryLabel(doc.category)}
                                                        </span>
                                                    )}
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
                                            {/* Was angefragt wurde: JEDE Einheit des Projekts,
                                                mit ihrem eigenen Datenblatt. */}
                                            <td data-label={colLabel.units} className="ofi-osp-unitcell">
                                                {unitList(doc)}
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
                                                    {/* Überarbeitet (§1a): dieselbe Anfrage kam geändert
                                                        noch einmal — mit dem, was sich bewegt hat. */}
                                                    {doc.revisedAt && doc.status !== 'WITHDRAWN' && (
                                                        <span className="ofi-osp-sub is-revised" title={projectChanges || undefined}>
                                                            <RefreshCcw01 size={11} />
                                                            {t('osp.revisedOn', { date: fmtDate(doc.revisedAt) })}
                                                        </span>
                                                    )}
                                                    {projectChanges && doc.status !== 'WITHDRAWN' && (
                                                        <span className="ofi-osp-sub">{projectChanges}</span>
                                                    )}
                                                    {/* §1c: drüben neu gerendert, ohne dass jemand neu
                                                        angefragt hätte — das Datenblatt ist überholt. */}
                                                    {doc.feedRevisedAt && doc.status !== 'WITHDRAWN' && (
                                                        <span className="ofi-osp-sub is-revised" title={doc.feedRevisedSource || undefined}>
                                                            {t('osp.feedRevisedOn', { date: fmtDate(doc.feedRevisedAt) })}
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
                </>
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
                open={Boolean(sheetUnit)}
                title={t('osp.datasheet')}
                subtitle={sheetUnit
                    ? [sheetUnit.doc.reference, unitTitle(sheetUnit.unit)].filter(Boolean).join(' · ')
                    : ''}
                blob={sheetBlob}
                loading={sheetLoading}
                loadingLabel={t('osp.datasheetLoading')}
                emptyText={t('osp.datasheetNone')}
                downloadLabel={t('osp.datasheet')}
                onClose={() => { setSheetUnit(null); setSheetBlob(null); }}
                onDownload={() => {
                    if (!sheetBlob || !sheetUnit) return;
                    const url = URL.createObjectURL(sheetBlob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = `Datenblatt-${sheetUnit.doc.reference}-${sheetUnit.unit.ospDocumentId}.pdf`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                }}
            />
        </div>
    );
};
