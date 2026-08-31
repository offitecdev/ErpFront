import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { FileDownload02, Plus, RefreshCcw01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { personnelApi } from '@/lib/api/personnel';
import { hasPageRules, pageLevelForKey } from '@/lib/pageAccess';
import { useAuthStore } from '@/store/authStore';
import { DateField } from '@/components/ui-shared/DateField';
import '@/styles/personnel.css';

import type { LeaveQuery, LeaveRequestRow } from '../types/personnel';
import { useLanguageTick, useLeaveCounts } from '../hooks/usePersonnel';
import { isRequestType, REQUEST_TYPES, requestTypeOf, type RequestType } from '../utils/personnel';
import { LeaveList } from '../components/LeaveList';
import { GhostButton, PersonnelTopTabs, PrimaryButton } from '../components/primitives';
import { NewRequestPopup } from './NewRequestPopup';

/**
 * ── ANTRÄGE — EINE SEITE (26.08.2026, Vorgabe Samet) ─────────────────────────
 *
 *   «Es soll nicht dreimal „Anträge" im Menü stehen. EIN Menüpunkt, und darin
 *    Reiter: Meine Anträge, Eingehende Anträge, Alle Anträge.»
 *
 * NACHGEZOGEN (Vorgabe): «Meine Anträge» steht JEDER Person offen; «Eingehende»
 * und «Alle» sind Sache der Verwaltung und der Projektleitung — wer weder
 * entscheidet (leaves.approve) noch die Übersicht führt (leaves.read), sieht
 * nur den eigenen Reiter. Eine Person, die als freigebende gewählt wurde, ohne
 * eine dieser Rollen zu tragen, behält ihr Postfach: der Zähler öffnet es.
 *
 * DIE FILTER SIND AUF DEN ZEITRAUM GESCHRUMPFT (Vorgabe: «die Filterung ist zu
 * ausladend — ein einfacher Zeitraumfilter genügt»). Art-, Stand- und
 * Namensfilter sind weg; Von/Bis läuft weiterhin auf dem SERVER, denn die
 * Liste ist bei 300 Zeilen gekappt und ein Browserfilter verlöre alles
 * dahinter.
 *
 * DAS FORMULAR IST EIN FENSTER, keine vierte Fläche: einen Antrag zu stellen
 * ist eine Handlung, kein Ort.
 */

type TabKey = 'mine' | 'incoming' | 'all';

const isTab = (value: string | null): value is TabKey =>
    value === 'mine' || value === 'incoming' || value === 'all';

export const RequestsPage = () => {
    useLanguageTick();
    const [params, setParams] = useSearchParams();
    const permissions = useAuthStore((state) => state.permissions);
    const pageAccess = useAuthStore((state) => state.pageAccess);
    const canDecide = permissions.includes('leaves.approve');
    const canSeeAll = permissions.includes('leaves.read');

    /* SEIT DEM 27.08.2026 sind die drei Reiter in der ROLLENTABELLE einzeln
       wählbar (personnel.requestsIncoming / personnel.requestsAll). Eine Rolle
       aus der Zeit davor trägt die Schlüssel noch nicht — dann entscheiden wie
       bisher die Rechte, die sie ohnehin hat. */
    const rules = hasPageRules(pageAccess);
    const incomingGranted = rules && pageLevelForKey(pageAccess, 'personnel.requestsIncoming') > 0;
    const allGranted = rules && pageLevelForKey(pageAccess, 'personnel.requestsAll') > 0;

    const counts = useLeaveCounts();
    const rawTab = params.get('tab');
    /* Das Postfach zeigt sich, wem die Rolle es gibt — und jeder Person, auf
       die tatsächlich etwas wartet oder die per Meldung hierher kam. */
    const showIncoming = incomingGranted || canDecide || counts.counts.incoming > 0 || rawTab === 'incoming';
    const showAll = allGranted || canSeeAll;
    const tabAllowed = (key: TabKey) =>
        key === 'mine' || (key === 'incoming' ? showIncoming : showAll);
    const tab: TabKey = isTab(rawTab) && tabAllowed(rawTab) ? rawTab : 'mine';
    /* Der Antrag, auf den eine Meldung zeigt. Er wird hervorgehoben statt
       gefiltert: wer aus der Meldung kommt, will ihn IM ZUSAMMENHANG sehen. */
    const focusId = params.get('focus') || '';

    /* ── DIE ART DES ANTRAGS AUS DER ADRESSE (10.09.2026, Vorgabe Samet) ──────
       «Dieser Bereich enthält keine allgemeinen Anträge, sondern die
        bestimmten — ein Klick auf ‹Urlaub› öffnet die Urlaubs-Antragsseite
        direkt.»
       Die Kapseln im Apps-Feld zeigen deshalb auf `?type=VACATION` usw.: die
       Liste steht dann schon auf dieser Art, und «Neuer Antrag» legt genau
       diese an. Ein unbekannter Wert wird still ignoriert. */
    const typeParam = params.get('type');
    const activeType = isRequestType(typeParam) ? typeParam : null;
    const setType = (next: RequestType | null) => {
        const search = new URLSearchParams(params);
        if (next) search.set('type', next);
        else search.delete('type');
        setParams(search, { replace: true });
    };

    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const [rows, setRows] = useState<LeaveRequestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [tick, setTick] = useState(0);
    /* `?compose=1` kommt aus dem Anträge-Zeichen im Kopf («Neuer Antrag»): die
       Seite geht auf UND das Formular gleich mit. Der Merker wird sofort aus
       der Adresse genommen — sonst ginge das Fenster bei jedem Zurück wieder
       auf. */
    const [composing, setComposing] = useState(() => params.get('compose') === '1');
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        if (params.get('compose') !== '1') return;
        const next = new URLSearchParams(params);
        next.delete('compose');
        setParams(next, { replace: true });
    }, [params, setParams]);

    const reload = useCallback(() => setTick((value) => value + 1), []);

    const query = useMemo<LeaveQuery>(() => ({ scope: tab, from, to }), [tab, from, to]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        personnelApi.listLeaves(query)
            .then((value) => { if (!cancelled) setRows(value); })
            .catch(() => {
                if (cancelled) return;
                setRows([]);
                setFailed(true);
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [query, tick]);

    const setTab = (next: string) => {
        const search = new URLSearchParams(params);
        search.set('tab', next);
        // Die Hervorhebung gehört zu EINEM Reiter; beim Wechsel fällt sie weg.
        search.delete('focus');
        setParams(search, { replace: true });
    };

    const clearFilters = () => {
        setFrom('');
        setTo('');
        setType(null);
    };

    const filtersActive = Boolean(from || to || activeType);

    const afterChange = () => {
        reload();
        counts.reload();
    };

    const exportPdf = async () => {
        setExporting(true);
        try {
            // Der Erzeuger wird erst hier geladen: jsPDF und die Schriften
            // wiegen mehr als die ganze Seite und dürfen sie nicht aufhalten.
            const { exportRequestsPdf } = await import('@/utils/pdf/personnelRequestsPdf');
            await exportRequestsPdf(shownRows, {
                title: t(`personnel.requests.tab.${tab}`),
                from,
                to,
            });
        } catch {
            toast.error(t('personnel.pdf.failed'));
        } finally {
            setExporting(false);
        }
    };

    const tabs = [
        { key: 'mine', label: t('personnel.requests.tab.mine'), badge: counts.counts.mine || undefined },
        ...(showIncoming
            ? [{ key: 'incoming', label: t('personnel.requests.tab.incoming'), badge: counts.counts.incoming || undefined }]
            : []),
        ...(showAll ? [{ key: 'all', label: t('personnel.requests.tab.all') }] : []),
    ];

    /* Die Art filtert ÖRTLICH: der Server kennt sie nicht als Abfrage, und die
       Liste ist ohnehin schon geladen. `requestTypeOf` ist dieselbe Regel, mit
       der die Zeile ihr Etikett bekommt — damit stimmt die Auswahl mit dem
       überein, was in der Zeile steht.

       OHNE useMemo: ein Filter über ein paar Dutzend Zeilen kostet nichts, und
       der React-Compiler übernimmt das Merken ohnehin selbst — von Hand
       gesetzt konnte er es hier nicht erhalten und stieg für die ganze Seite
       aus der Optimierung aus. */
    const shownRows = activeType
        ? rows.filter((row) => requestTypeOf(row.kind, row.leaveType) === activeType)
        : rows;

    const emptyText = failed
        ? t('personnel.requests.loadFailed')
        : filtersActive
            ? t('personnel.requests.emptyFiltered')
            : t(`personnel.requests.empty.${tab}`);

    return (
        <div className="ofi-req flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('personnel.requests.title')}
                action={(
                    <div className="flex flex-wrap items-center gap-2">
                        <GhostButton
                            icon={<FileDownload02 size={14} />}
                            onClick={() => void exportPdf()}
                            disabled={exporting || shownRows.length === 0}
                        >
                            {t('personnel.filter.generatePdf')}
                        </GhostButton>
                        <PrimaryButton icon={<Plus size={14} />} onClick={() => setComposing(true)}>
                            {t('personnel.requests.new')}
                        </PrimaryButton>
                    </div>
                )}
            />

            <PersonnelTopTabs activeKey={tab} onChange={setTab} items={tabs} />

            {/* ── DER FILTER: NUR DER ZEITRAUM ────────────────────────────────
                Eine Zeile, zwei Daten. Gezählt wird ein Antrag, sobald er den
                Zeitraum BERÜHRT (der Server rechnet so) — ein Urlaub über den
                Monatswechsel steht in beiden Monaten. */}
            <section className="ofi-req-filters is-slim" aria-label={t('common.filter')}>
                {/* DIE ARTEN als Kapseln: sie sind die Auswahl, mit der man aus
                    dem Apps-Feld hier ankommt, und sollen darum sichtbar sein —
                    sonst wüsste niemand, warum die Liste kurz ist. */}
                <div className="ofi-crm-chips" style={{ marginBottom: 10 }}>
                    <button
                        type="button"
                        className={`ofi-crm-chip${activeType === null ? ' is-on' : ''}`}
                        onClick={() => setType(null)}
                    >
                        {t('personnel.requests.allTypes')}
                    </button>
                    {REQUEST_TYPES.map((type) => (
                        <button
                            key={type}
                            type="button"
                            className={`ofi-crm-chip${activeType === type ? ' is-on' : ''}`}
                            onClick={() => setType(type)}
                        >
                            {t(`personnel.requestType.${type}`)}
                        </button>
                    ))}
                </div>
                <div className="ofi-req-filterline">
                    <label className="ofi-req-filter">
                        <span>{t('personnel.filter.startDate')}</span>
                        <DateField
                            value={from}
                            onChange={setFrom}
                            ariaLabel={t('personnel.filter.startDate')}
                            clearable
                            buttonClassName="ofi-cal-input ofi-pf-input"
                        />
                    </label>

                    <label className="ofi-req-filter">
                        <span>{t('personnel.filter.endDate')}</span>
                        <DateField
                            value={to}
                            onChange={setTo}
                            min={from || undefined}
                            ariaLabel={t('personnel.filter.endDate')}
                            clearable
                            buttonClassName="ofi-cal-input ofi-pf-input"
                        />
                    </label>

                    <GhostButton
                        icon={<RefreshCcw01 size={13} />}
                        onClick={clearFilters}
                        disabled={!filtersActive}
                        className="self-end"
                    >
                        {t('common.reset')}
                    </GhostButton>

                    <p className="ofi-req-count ml-auto self-end">
                        {t('personnel.requests.count', { count: shownRows.length })}
                    </p>
                </div>
            </section>

            <LeaveList
                rows={shownRows}
                loading={loading}
                emptyText={emptyText}
                focusId={focusId}
                // Entschieden wird NUR im Postfach. In «Alle Anträge» steht die
                // Verwaltung als Zuschauer: ihr dort Knöpfe zu zeigen, die der
                // Server gleich abweist, wäre ein leeres Versprechen.
                decidable={tab === 'incoming'}
                onChanged={afterChange}
                showRequester={tab !== 'mine'}
            />

            <NewRequestPopup
                open={composing}
                onClose={() => setComposing(false)}
                onCreated={afterChange}
            />
        </div>
    );
};
