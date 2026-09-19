import { Edit01, Lock01, RefreshCcw01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/**
 * ── WARUM DIESE OFFERTE GESPERRT IST (16.09.2026) ────────────────────────────
 *
 * Eine freigegebene oder beauftragte Offerte ändert niemand mehr direkt — der
 * Server lässt es nicht zu, und die Maske zeigt sie nur noch zum Lesen. Die
 * Karte sagt, welcher Weg stattdessen offensteht:
 *
 *   • im Auftrag     → Änderungen als Nachtrag (auch Minderungen);
 *   • nur freigegeben → eine neue Version;
 *   • ein Tippfehler → die Textkorrektur (nur die Leitung, mit Grund).
 *
 * Dazu, falls es ihn gibt, der Stand beim früheren Auftrag.
 */
export const TenderLockCard = ({
    ordered,
    canCorrect,
    showSnapshots,
    onCorrect,
    onOpenSnapshots,
}: {
    ordered: boolean;
    canCorrect: boolean;
    showSnapshots: boolean;
    onCorrect: () => void;
    onOpenSnapshots: () => void;
}) => (
    <section className="ofi-quote-card relative mb-2 overflow-hidden rounded-lg border border-[#e6e8eb] bg-[#fff] dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f2f2f5] text-slate-500 dark:bg-white/10 dark:text-white/70" aria-hidden>
                <Lock01 size={14} />
            </span>
            <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
                {ordered ? t('tenders.lock.titleOrdered') : t('tenders.lock.titleApproved')}
            </span>
            <span className="text-[12px] text-slate-500 dark:text-white/60">
                {ordered ? t('tenders.lock.hintOrdered') : t('tenders.lock.hintApproved')}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
                {showSnapshots && (
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-semibold text-[#0a7aff] transition-colors hover:bg-[#eef4ff] dark:text-white/90 dark:hover:bg-white/10"
                        onClick={onOpenSnapshots}
                    >
                        <RefreshCcw01 size={13} />
                        {t('tenders.snapshot.open')}
                    </button>
                )}
                {canCorrect && (
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-semibold text-[#0a7aff] transition-colors hover:bg-[#eef4ff] dark:text-white/90 dark:hover:bg-white/10"
                        onClick={onCorrect}
                    >
                        <Edit01 size={13} />
                        {t('tenders.correction.open')}
                    </button>
                )}
            </span>
        </div>
    </section>
);
