import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { AlertTriangle, RefreshCcw01 } from '@/components/icons/antIconCompat';
import { OspMark, OspPdfIcon } from '@/components/icons/OspMark';
import { PdfPreviewSheet } from '@/components/pdf/PdfPreviewSheet';
import { t } from '@/i18n/translate';
import { ospApi, type OspDocumentDto } from '@/lib/api/osp';

/**
 * ── HERKUNFT AUS DER OSP (19.09.2026) ────────────────────────────────────────
 *
 * Eine Offerte, die aus einer Anfrage der Offitec Selection Platform entstanden
 * ist, trägt sie hier sichtbar: Zeichen, Belegreferenz, Stand — und das
 * DATENBLATT, aus dem offeriert wird, als Kachel "OSP PDF".
 *
 * Der Grund für die Karte ist aber die WARNUNG. Die anfragende Person darf
 * ihre Einheit drüben weiterrechnen, nachdem sie die Anfrage gestellt hat; tut
 * sie das und fragt erneut an, kommt dieselbe Anfrage neu gerechnet zurück
 * (§1a). Das Datenblatt, aus dem hier offeriert wurde, gilt dann NICHT MEHR —
 * und niemand merkt es, wenn es nicht an der Offerte selbst steht. Genau
 * deshalb steht es hier und nicht bloss in der OSP-Liste.
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

export const OspOriginCard = ({ tenderId }: { tenderId: string }) => {
    const [doc, setDoc] = useState<OspDocumentDto | null>(null);
    const [busy, setBusy] = useState(false);

    /* Das Datenblatt in der gemeinsamen PDF-Vorschau — dasselbe Fenster wie
       bei Offerte und Rapport. */
    const [sheetOpen, setSheetOpen] = useState(false);
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

    const openDatasheet = useCallback(async () => {
        if (!doc) return;
        setSheetOpen(true);
        if (sheetBlob) return;
        setSheetLoading(true);
        try {
            let row = doc;
            // Liegt das PDF noch nicht bei uns, einmal nachholen — das ist der
            // Normalfall für Zeilen, die vor dem Datenblatt-Feld entstanden.
            if (!row.datasheetFile) {
                row = await ospApi.refetchDatasheet(doc.id);
                setDoc(row);
                if (!row.datasheetFile) {
                    toast.error(row.datasheetError || t('osp.datasheetFailed'));
                    setSheetOpen(false);
                    return;
                }
            }
            setSheetBlob(await ospApi.datasheet(row.id));
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('osp.datasheetFailed'));
            setSheetOpen(false);
        } finally {
            setSheetLoading(false);
        }
    }, [doc, sheetBlob]);

    const acknowledgeRevision = async () => {
        if (!doc) return;
        setBusy(true);
        try {
            setDoc(await ospApi.markRevisionSeen(doc.id));
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('osp.saveError'));
        } finally {
            setBusy(false);
        }
    };

    if (!doc) return null;

    const revisionOpen = hasOpenRevision(doc);
    const withdrawn = doc.status === 'WITHDRAWN';

    return (
        <section
            data-ui-card
            className="ofi-quote-card relative z-10 mb-2 overflow-hidden rounded-lg border border-[#e6e8eb] bg-white"
        >
            {/* EINE Zeile (Vorgabe 19.09.2026): Zeichen, Herkunft, Referenz,
                Stand, Zuständige, Einheit, Firma — und rechts das Datenblatt.
                Kein Umbruch: wird es eng, rollt die Zeile in der Karte, statt
                sich zu stapeln. Die Warnungen darunter erscheinen NUR, wenn es
                etwas zu warnen gibt. */}
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
                {doc.model && (
                    <span className="shrink-0 whitespace-nowrap text-[12px] text-slate-600">
                        <span className="text-slate-400">{t('osp.colUnit')}: </span>
                        {doc.model}
                    </span>
                )}
                {doc.company && (
                    <span className="min-w-0 truncate text-[12px] text-slate-600" title={doc.company}>
                        <span className="text-slate-400">{t('osp.colRequester')}: </span>
                        {doc.company}
                    </span>
                )}
                {/* Das Datenblatt der Einheit — die Datei, aus der offeriert
                    wird. "OSP PDF", weil sie von drüben stammt und nicht aus
                    unserem Anhang. */}
                {(doc.datasheetUrl || doc.datasheetFile) && (
                    <button
                        type="button"
                        className="ofi-osp-sheetbtn ml-auto shrink-0"
                        title={t('osp.datasheetOpen')}
                        onClick={() => void openDatasheet()}
                    >
                        <OspPdfIcon size={26} />
                        {t('osp.datasheetTile')}
                    </button>
                )}
            </div>

            {/* Neu gerechnet (§1a): die Einheit drüben hat sich geändert, das
                Datenblatt hier ist überholt. */}
            {revisionOpen && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-800">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                        {t('osp.origin.revisedWarning', { date: fmtDateTime(doc.revisedAt) })}
                    </span>
                    <button
                        type="button"
                        className="ofi-osp-toolbtn"
                        disabled={busy}
                        onClick={() => void openDatasheet()}
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
                open={sheetOpen}
                title={t('osp.datasheetTile')}
                subtitle={[doc.reference, doc.model].filter(Boolean).join(' · ')}
                blob={sheetBlob}
                loading={sheetLoading}
                loadingLabel={t('osp.datasheetLoading')}
                emptyText={t('osp.datasheetNone')}
                downloadLabel={t('osp.datasheet')}
                onClose={() => setSheetOpen(false)}
                onDownload={() => {
                    if (!sheetBlob) return;
                    const url = URL.createObjectURL(sheetBlob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = `Datenblatt-${doc.reference}.pdf`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                }}
            />
        </section>
    );
};

export default OspOriginCard;
