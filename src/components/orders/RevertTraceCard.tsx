import dayjs from 'dayjs';

import { ArrowRight, Calendar, RefreshCcw01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { WaitingTenderDto } from '@/types/project';
import type { TenderListItem } from '@/types/tender';

/**
 * ── DIE SPUR EINES ZURÜCKGESETZTEN AUFTRAGS (16.09.2026) ─────────────────────
 *
 * Vorgabe Samet: «siparişi taslağa alınca sipariş numarası kayboluyor ve ben
 * hangi teklif olduğunu unutuyorum». Geht ein Auftrag zurück in den Entwurf,
 * verschwindet er samt AB-Nummer — die beiden Karten hier halten fest, was
 * es war, und führen jeweils auf die andere Seite:
 *
 *   • an der OFFERTE: welche AB-Nummer sie trug, wann/von wem zurückgesetzt,
 *     welches Projekt auf sie wartet und wie viele Termine dort warten;
 *   • am PROJEKT: welche Offerte(n) auf einen neuen Auftrag warten.
 *
 * Ruhig wie die OSP-Herkunftskarte: eine Haarlinie, eine Zeile, der Weg
 * rechts. Keine Farbe ausser dem Symbol — es ist ein Hinweis, kein Fehler.
 */

const fmtDate = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY') : '');

const shellClass = 'ofi-quote-card relative mb-2 overflow-hidden rounded-lg border border-[#e6e8eb] bg-[#fff] dark:border-white/10 dark:bg-white/[0.03]';
const rowClass = 'flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5';
const iconClass = 'flex size-7 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[#0a7aff] dark:bg-white/10 dark:text-white/85';
const titleClass = 'text-[13px] font-semibold text-slate-900 dark:text-white';
const metaClass = 'text-[12px] text-slate-500 dark:text-white/60';
const linkClass = 'ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-semibold text-[#0a7aff] transition-colors hover:bg-[#eef4ff] dark:text-white/90 dark:hover:bg-white/10';

const ParkedNote = ({ count }: { count: number }) => (count > 0 ? (
    <span className={`inline-flex items-center gap-1 ${metaClass}`}>
        <Calendar size={12} />
        {t('orders.revertTrace.parked', { count })}
    </span>
) : null);

/** An der Offerte: «Auftrag AB-… wurde zurückgesetzt» + das wartende Projekt. */
export const TenderRevertTraceCard = ({
    tender,
    onOpenProject,
    onOpenSnapshots,
}: {
    tender: TenderListItem;
    onOpenProject: (projectId: string) => void;
    /** Stand beim früheren Auftrag (Schnappschuss) öffnen. */
    onOpenSnapshots?: () => void;
}) => {
    // Wieder erteilt oder nie zurückgesetzt: nichts zu zeigen.
    if (!tender.revertedAt || tender.salesOrder) return null;
    const project = tender.revertedProject || null;
    const projectLabel = project ? (project.projectNumber || project.projectName || '') : '';
    const meta = [fmtDate(tender.revertedAt), tender.revertedBy].filter(Boolean).join(' · ');

    return (
        <section className={shellClass} aria-live="polite">
            <div className={rowClass}>
                <span className={iconClass} aria-hidden><RefreshCcw01 size={14} /></span>
                <span className={titleClass}>
                    {tender.revertedOrderNumber
                        ? t('orders.revertTrace.tenderTitle', { orderNumber: tender.revertedOrderNumber })
                        : t('orders.revertTrace.tenderTitleNoNumber')}
                </span>
                {meta && <span className={metaClass}>{meta}</span>}
                {project && (
                    <>
                        <span className={metaClass}>{t('orders.revertTrace.projectWaiting', { project: projectLabel })}</span>
                        <ParkedNote count={tender.parkedAppointmentCount ?? 0} />
                    </>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-1">
                    {onOpenSnapshots && (
                        <button type="button" className={linkClass.replace('ml-auto ', '')} onClick={onOpenSnapshots}>
                            {t('tenders.snapshot.open')}
                        </button>
                    )}
                    {project && (
                        <button type="button" className={linkClass.replace('ml-auto ', '')} onClick={() => onOpenProject(project.id)}>
                            {t('orders.revertTrace.openProject')}
                            <ArrowRight size={13} />
                        </button>
                    )}
                </span>
            </div>
        </section>
    );
};

/** Am Projekt: jede Offerte, die auf einen neuen Auftrag wartet. */
export const ProjectWaitingTendersCard = ({
    tenders,
    onOpenTender,
}: {
    tenders: WaitingTenderDto[] | undefined;
    onOpenTender: (tenderId: string) => void;
}) => {
    if (!tenders?.length) return null;
    return (
        <section className={shellClass} aria-live="polite">
            {tenders.map((tender, index) => {
                const meta = [
                    tender.revertedOrderNumber ? t('orders.revertTrace.formerOrder', { orderNumber: tender.revertedOrderNumber }) : '',
                    fmtDate(tender.revertedAt),
                    tender.revertedBy,
                ].filter(Boolean).join(' · ');
                return (
                    <div
                        key={tender.id}
                        className={`${rowClass} ${index > 0 ? 'border-t border-[#eef0f2] dark:border-white/10' : ''}`}
                    >
                        <span className={iconClass} aria-hidden><RefreshCcw01 size={14} /></span>
                        <span className={titleClass}>
                            {t('orders.revertTrace.projectTitle', { tenderNumber: tender.tenderNumber })}
                        </span>
                        {meta && <span className={metaClass}>{meta}</span>}
                        <ParkedNote count={tender.parkedAppointmentCount} />
                        <button type="button" className={linkClass} onClick={() => onOpenTender(tender.id)}>
                            {t('orders.revertTrace.openTender')}
                            <ArrowRight size={13} />
                        </button>
                    </div>
                );
            })}
        </section>
    );
};
