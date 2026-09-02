import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { AlertTriangle, RefreshCcw01 } from '@/components/icons/antIconCompat';
import { OspMark, OspPdfIcon } from '@/components/icons/OspMark';
import { PdfPreviewSheet } from '@/components/pdf/PdfPreviewSheet';
import { t } from '@/i18n/translate';
import { ospApi, type OspDocumentDto, type OspUnitDto } from '@/lib/api/osp';
import { changeSummary } from '@/pages/sales/osp/ospChanges';

/**
 * ── HERKUNFT AUS DER OSP (19.09.2026) ────────────────────────────────────────
 *
 * Eine Offerte, die aus einer Anfrage der Offitec Selection Platform entstanden
 * ist, trägt sie hier sichtbar: Zeichen, Projektnummer, Stand — und die
 * DATENBLÄTTER, aus denen offeriert wird, je Einheit eine Kachel "OSP PDF".
 *
 * Der Grund für die Karte ist aber die WARNUNG. Die anfragende Person darf ihr
 * Projekt drüben weiterbearbeiten, nachdem sie es angefragt hat, und es gibt
 * ZWEI Wege, auf denen unser Datenblatt dadurch ungültig wird:
 *
 *  • Sie fragt ERNEUT an (§1a) — dann kommt dieselbe Anfrage geändert zurück,
 *    und `changes` sagt, was sich bewegt hat.
 *  • Sie rechnet bloss weiter (§1c) — niemand fragt etwas, aber die OSP rendert
 *    das Datenblatt neu und LÖSCHT die alte Datei. Auch das steht hier, denn
 *    sonst offeriert jemand aus einem Blatt, das es drüben nicht mehr gibt.
 *
 * Die Warnung verschwindet, wenn jemand sie zur Kenntnis nimmt; `revisedAt`
 * bleibt als Verlauf stehen. Kommt die nächste Überarbeitung, lebt sie auf.
 *
 * Ohne OSP-Zeile zeichnet die Karte NICHTS — jede Offerte fragt einmal nach,
 * die allermeisten bekommen `null` und bleiben, wie sie waren.
 */

const fmtDateTime = (value: string | null): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${
        date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Steht die Überarbeitung noch offen? (Neuer als das, was gesehen wurde.) */
const hasOpenRevision = (doc: OspDocumentDto): boolean => {
    if (!doc.revisedAt) return false;
    if (!doc.revisionSeenAt) return true;
    return new Date(doc.revisedAt).getTime() > new Date(doc.revisionSeenAt).getTime();
};

/** Hat der Aktivitätsstrom (§1c) seither ein Datenblatt neu rendern lassen? */
const hasOpenFeedRevision = (doc: OspDocumentDto): boolean => {
    if (!doc.feedRevisedAt) return false;
    if (!doc.revisionSeenAt) return true;
    return new Date(doc.feedRevisedAt).getTime() > new Date(doc.revisionSeenAt).getTime();
};

const unitTitle = (unit: OspUnitDto): string => (
    unit.unitModel || unit.unitName || t('osp.unitFallback', { id: unit.ospDocumentId })
);

export const OspOriginCard = ({ tenderId }: { tenderId: string }) => {
    const [doc, setDoc] = useState<OspDocumentDto | null>(null);
    const [busy, setBusy] = useState(false);

    /* Das Datenblatt EINER Einheit in der gemeinsamen PDF-Vorschau — dasselbe
       Fenster wie bei Offerte und Rapport. */
    const [sheetUnit, setSheetUnit] = useState<OspUnitDto | null>(null);
    const [sheetBlob, setSheetBlob] = useState<Blob | null>(null);
    const [sheetLoading, setSheetLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        // Die Herkunft ist eine Nebenangabe: scheitert die Abfrage, bleibt die
        // Offerte, wie sie ist — keine Meldung, keine leere Karte.
        void ospApi.byTender(tenderId)
            .then((row) => { if (!cancelled) setDoc(row); })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, [tenderId]);

    const openDatasheet = useCallback(async (unit: OspUnitDto) => {
        setSheetUnit(unit);
        setSheetBlob(null);
        setSheetLoading(true);
        try {
            let row = unit;
            // Liegt das PDF noch nicht bei uns, einmal nachholen — der
            // Normalfall, wenn die OSP es zwischenzeitlich neu gerendert hat.
            if (!row.datasheetFile) {
                row = await ospApi.refetchDatasheet(unit.id);
                setDoc((current) => (current
                    ? { ...current, units: (current.units || []).map((entry) => (entry.id === row.id ? row : entry)) }
                    : current));
                setSheetUnit(row);
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
    }, []);

    const acknowledgeRevision = async () => {
        if (!doc) return;
        setBusy(true);
        try {
            const updated = await ospApi.markRevisionSeen(doc.id);
            setDoc({ ...updated, units: updated.units ?? doc.units });
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('osp.saveError'));
        } finally {
            setBusy(false);
        }
    };

    if (!doc) return null;

    const units = doc.units ?? [];
    const revisionOpen = hasOpenRevision(doc);
    const feedRevisionOpen = !revisionOpen && hasOpenFeedRevision(doc);
    const withdrawn = doc.status === 'WITHDRAWN';
    const projectChanges = changeSummary(doc.changes);

    return (
        <section
            data-ui-card
            className="ofi-quote-card relative z-10 mb-2 overflow-hidden rounded-lg border border-[#e6e8eb] bg-white"
        >
            {/* EINE Zeile (Vorgabe 19.09.2026): Zeichen, Herkunft, Projektnummer,
                Stand, Zuständige, Einheiten, Firma — und rechts die
                Datenblätter. Kein Umbruch: wird es eng, rollt die Zeile in der
                Karte, statt sich zu stapeln. Die Warnungen darunter erscheinen
                NUR, wenn es etwas zu warnen gibt. */}
            <div className="ofi-osp-origin flex items-center gap-x-3 overflow-x-auto px-4 py-2 [scrollbar-width:thin]">
                <OspMark size={24} variant="tile" className="shrink-0" />
                <span className="shrink-0 text-[13px] font-semibold tracking-[0.01em] text-[#1f2654]">
                    {t('osp.origin.title')}
                </span>
                <span className="shrink-0 font-mono text-[12.5px] font-semibold text-slate-600">{doc.reference}</span>
                <span className={`ofi-osp-status is-${doc.status.toLowerCase()} shrink-0`}>
                    <span className="ofi-osp-status__label">{t(`osp.status_${doc.status}`)}</span>
                </span>
                {doc.salespersonName && (
                    <span className="shrink-0 whitespace-nowrap text-[12px] text-slate-600">
                        <span className="text-slate-400">{t('osp.roleSales')}: </span>
                        {doc.salespersonName}
                    </span>
                )}
                {units.length > 0 && (
                    <span className="shrink-0 whitespace-nowrap text-[12px] text-slate-600">
                        <span className="text-slate-400">{t('osp.colUnits')}: </span>
                        {units.map(unitTitle).join(', ')}
                    </span>
                )}
                {doc.company && (
                    <span className="min-w-0 truncate text-[12px] text-slate-600" title={doc.company}>
                        <span className="text-slate-400">{t('osp.colRequester')}: </span>
                        {doc.company}
                    </span>
                )}
                {/* Die Datenblätter der Einheiten — die Dateien, aus denen
                    offeriert wird. "OSP PDF", weil sie von drüben stammen und
                    nicht aus unserem Anhang. Eine Kachel je Einheit: ein
                    Projekt kann mehrere haben. */}
                {units.length > 0 && (
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        {units.filter((unit) => unit.pdfUrl || unit.datasheetFile).map((unit) => (
                            <button
                                key={unit.id}
                                type="button"
                                className="ofi-osp-sheetbtn shrink-0"
                                title={`${t('osp.datasheetOpen')} — ${unitTitle(unit)}`}
                                onClick={() => void openDatasheet(unit)}
                            >
                                <OspPdfIcon size={26} />
                                {units.length > 1 ? unitTitle(unit) : t('osp.datasheetTile')}
                            </button>
                        ))}
                    </span>
                )}
            </div>

            {/* Geändert und erneut angefragt (§1a): das Datenblatt hier ist
                überholt — und `changes` sagt, woran es liegt. */}
            {revisionOpen && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-800">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                        {t('osp.origin.revisedWarning', { date: fmtDateTime(doc.revisedAt) })}
                        {projectChanges && (
                            <span className="ml-1 font-semibold">{projectChanges}</span>
                        )}
                    </span>
                    <button
                        type="button"
                        className="ofi-osp-toolbtn"
                        disabled={busy || !units.length}
                        onClick={() => { const unit = units[0]; if (unit) void openDatasheet(unit); }}
                    >
                        <RefreshCcw01 size={13} />
                        {t('osp.origin.reviewDatasheet')}
                    </button>
                    <button
                        type="button"
                        className="ofi-osp-toolbtn"
                        disabled={busy}
                        onClick={() => void acknowledgeRevision()}
                    >
                        {t('osp.origin.acknowledge')}
                    </button>
                </div>
            )}

            {/* Nur weitergerechnet (§1c): niemand hat neu angefragt, aber die
                OSP hat das Datenblatt neu gerendert und die alte Datei
                gelöscht. Kein Auftrag — eine Warnung. */}
            {feedRevisionOpen && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-amber-100 bg-amber-50/70 px-4 py-2.5 text-[12.5px] text-amber-800">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                        {t('osp.origin.feedRevisedWarning', { date: fmtDateTime(doc.feedRevisedAt) })}
                    </span>
                    <button
                        type="button"
                        className="ofi-osp-toolbtn"
                        disabled={busy}
                        onClick={() => void acknowledgeRevision()}
                    >
                        {t('osp.origin.acknowledge')}
                    </button>
                </div>
            )}

            {/* Zurückgezogen (§1b): die anfragende Person will die Offerte
                nicht mehr. Gelöscht wird hier nichts — es soll nur niemand
                weiterarbeiten, ohne es zu wissen. */}
            {withdrawn && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rose-100 bg-rose-50 px-4 py-2.5 text-[12.5px] text-rose-800">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                        {t('osp.origin.withdrawnWarning', { date: fmtDateTime(doc.withdrawnAt) })}
                    </span>
                </div>
            )}


            <PdfPreviewSheet
                open={Boolean(sheetUnit)}
                title={t('osp.datasheetTile')}
                subtitle={sheetUnit ? [doc.reference, unitTitle(sheetUnit)].filter(Boolean).join(' · ') : ''}
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
                    anchor.download = `Datenblatt-${doc.reference}-${sheetUnit.ospDocumentId}.pdf`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                }}
            />
        </section>
    );
};

export default OspOriginCard;
