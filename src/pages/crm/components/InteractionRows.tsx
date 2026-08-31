import { Link } from 'react-router-dom';
import { LuArrowDownLeft, LuArrowUpRight } from 'react-icons/lu';
import { Trash01 as Trash } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { channelLabel, channelVariant, formatCrmDate, personName } from '../utils/crmFormat.utils';
import type { CrmInteractionRow } from '../types/crm.types';

/**
 * Die Zeilen des Interaktionsverlaufs — EINMAL gebaut, zweimal gezeigt: in
 * der modulweiten Liste (mit Kundenspalte) und im Reiter der Kundenakte (ohne
 * — dort ist der Kunde klar, es steht nur der Ansprechpartner). Beide sitzen
 * in einer Tabelle mit derselben Spaltenfolge:
 *
 *   Datum | Typ | Kunde·Ansprechpartner (bzw. Ansprechpartner) | Notiz | Mitarbeiter | (löschen)
 *
 * Der Typ steht als Chip in jeder Zeile — Telefonat, E-Mail, Besprechung,
 * Notiz, Besuch — egal aus welcher Quelle die Zeile stammt. Eine als
 * "Wichtig" markierte Notiz der Kundenakte trägt zusätzlich einen kleinen
 * Marker; verschickte Angebots-/Auftragsmails zeigen ihren Anlass.
 */
export const InteractionRows = ({
    rows,
    showCustomer,
    onDelete,
}: {
    rows: CrmInteractionRow[];
    showCustomer: boolean;
    onDelete: (row: CrmInteractionRow) => void;
}) => (
    <>
        {rows.map((entry) => {
            const contactName = personName(entry.contact);
            const mailHint = entry.rawType === 'OFFER_MAIL_SENT'
                ? t('crm.comm.hintOfferMail')
                : entry.rawType === 'ORDER_MAIL_SENT' ? t('crm.comm.hintOrderMail') : null;
            return (
                <tr key={entry.key} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="whitespace-nowrap text-[12.5px] text-slate-600 dark:text-white/70">
                        {formatCrmDate(entry.occurredAt)}
                    </td>
                    <td>
                        <div className="flex flex-col items-start gap-1">
                            <StatusChip variant={channelVariant(entry.type)}>{channelLabel(entry.type)}</StatusChip>
                            {mailHint && <span className="text-[10.5px] text-slate-400">{mailHint}</span>}
                        </div>
                    </td>
                    <td>
                        {showCustomer ? (
                            <>
                                <div className="truncate font-semibold text-slate-900 dark:text-white">{entry.customer.companyName}</div>
                                {contactName && (
                                    <div className="mt-0.5 truncate text-[11.5px] text-slate-400">{contactName}</div>
                                )}
                            </>
                        ) : (
                            <span className="truncate text-[12.5px] text-slate-700 dark:text-white/80">
                                {contactName || <span className="text-slate-300 dark:text-white/30">—</span>}
                            </span>
                        )}
                    </td>
                    <td className="text-[12.5px] text-slate-700 dark:text-white/80">
                        {/* Mail-Zeilen (Outlook/ERP): Richtung + Betreff fett, darunter die Vorschau;
                            der Betreff führt ins Postfach. */}
                        {entry.source === 'MAIL' && entry.mail && (
                            <div className="mb-0.5 flex items-center gap-1.5">
                                {entry.mail.direction === 'OUT'
                                    ? <LuArrowUpRight size={12} className="shrink-0 text-slate-400" aria-label={t('mail.interaction.out')} />
                                    : <LuArrowDownLeft size={12} className="shrink-0 text-slate-400" aria-label={t('mail.interaction.in')} />}
                                <Link to="/crm/mail" className="truncate font-semibold text-slate-900 hover:underline dark:text-white" title={t('mail.interaction.open')}>
                                    {entry.mail.subject || t('mail.page.noSubject')}
                                </Link>
                                {entry.mail.entityLabel && (
                                    <span className="shrink-0 rounded bg-sky-50 px-1.5 py-px text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{entry.mail.entityLabel}</span>
                                )}
                                {entry.mail.from && entry.mail.direction === 'IN' && (
                                    <span className="truncate text-[11px] text-slate-400">{entry.mail.from}</span>
                                )}
                            </div>
                        )}
                        {/* Zeilenumbrüche der Notiz bleiben stehen, gekürzt auf drei Zeilen. */}
                        <span className={`whitespace-pre-line break-words ${entry.source === 'MAIL' ? 'line-clamp-2 text-slate-500 dark:text-white/60' : 'line-clamp-3'}`}>
                            {entry.isHighlight && (
                                <span className="mr-1.5 inline-block rounded bg-amber-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                    {t('crm.comm.important')}
                                </span>
                            )}
                            {entry.note}
                        </span>
                    </td>
                    <td className="truncate text-[12.5px] text-slate-500 dark:text-white/60">
                        {personName(entry.createdBy) || <span className="text-slate-300 dark:text-white/30">—</span>}
                    </td>
                    <td className="text-center">
                        <button
                            type="button"
                            onClick={() => onDelete(entry)}
                            aria-label={t('common.delete')}
                            className="rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                        >
                            <Trash size={13} />
                        </button>
                    </td>
                </tr>
            );
        })}
    </>
);
