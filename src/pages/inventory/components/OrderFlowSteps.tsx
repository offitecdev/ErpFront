import { Check, Lock01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { ORDER_STAGES, ORDER_STAGE_META, type OrderStage } from '../utils/orderStatus';

/**
 * ── DAS SCHRITTBAND DER LIEFERANTENBESTELLUNG (08.09.2026) ───────────────────
 *
 * Drei Stufen, der Reihe nach: Preisanfrage → Auftrag → Wareneingang. Es steht
 * auf JEDER Seite des Vorgangs — auf der Auftragsseite, in der Maske und im
 * Wareneingang — und sagt überall dasselbe, damit man nie raten muss, wo man
 * ist.
 *
 * Es ist AUSKUNFT, kein Menü: erledigte Stufen tragen einen Haken, die
 * laufende ihre Farbe, die kommenden ein Schloss. Gegangen wird über die
 * Handlungsleiste darunter — eine Stufe nach der anderen, denn eine Stufe muss
 * fertig sein, bevor die nächste beginnt (Vorgabe Samet).
 *
 * ── NUR NOCH DIE ÜBERSCHRIFTEN (Vorgabe Samet, 09.09.2026) ──────────────────
 * «Wir brauchen hier drei Stück — nur die Überschriften — mittig zwischen der
 * Preisanfrage und ‹E-Mail noch nicht gesendet›.» Die drei Erklärsätze sind
 * darum fort: sie standen dreimal untereinander und sagten bei zwei von drei
 * Stufen etwas über eine Zeit, die gerade nicht gilt. Was die LAUFENDE Stufe
 * gerade tut, steht als Titel am Zeiger (`activeLine`) und ohnehin im Kopf der
 * Seite.
 */
export const OrderFlowSteps = ({
    stageIndex,
    activeLine,
}: {
    stageIndex: number;
    /** Der genaue Zustand der laufenden Stufe — als Titel am Zeiger. */
    activeLine?: string;
}) => (
    <ol className="flex flex-wrap items-center gap-1.5">
        {ORDER_STAGES.map((entry: OrderStage, index) => {
            const done = index < stageIndex;
            const current = index === stageIndex;
            const locked = index > stageIndex;
            return (
                <li
                    key={entry}
                    aria-current={current ? 'step' : undefined}
                    title={current ? activeLine : undefined}
                    className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 ${
                        current
                            ? 'border-[#272f67] bg-[#272f67]/[0.05] dark:border-white/40 dark:bg-white/[0.07]'
                            : done
                                ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/[0.08]'
                                : 'border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.03]'
                    }`}
                >
                    <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        current
                            ? 'bg-[#272f67] text-white'
                            : done
                                ? 'bg-emerald-500 text-white'
                                : 'bg-slate-200 text-slate-500 dark:bg-white/15 dark:text-white/60'
                    }`}
                    >
                        {done ? <Check size={12} /> : locked ? <Lock01 size={11} /> : index + 1}
                    </span>
                    <span className={`whitespace-nowrap text-[12.5px] font-semibold ${
                        locked ? 'text-slate-400 dark:text-white/45' : 'text-slate-700 dark:text-white'
                    }`}
                    >
                        {t(ORDER_STAGE_META[entry].labelKey)}
                    </span>
                </li>
            );
        })}
    </ol>
);
