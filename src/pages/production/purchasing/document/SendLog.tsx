import { CornerDownLeft, FileText, MailCheck, MailWarning } from 'lucide-react';

import { t } from '@/i18n/translate';
import { purchasingApi } from '@/lib/api/purchasing';
import type { DispatchState } from '@/types/purchasing';

import { openBlob } from '../../bom/device/bomFiles';
import { whenText } from '../purchasingModel';

const P = 'productionBom.purchasing.send';

/**
 * Die Spur eines Belegs (30.09.2026): die letzte Sendung (automatisch oder von
 * Hand, wann, an wen — ihr PDF lässt sich öffnen) und die letzte Antwort des
 * Lieferanten (mit seinem PDF). Mehr braucht der Kopf nicht.
 */
export const SendLog = ({ state }: { state: DispatchState | undefined }) => {
    const mail = state?.mails[0] ?? null;
    const reply = state?.replies.find((entry) => entry.status !== 'UNMATCHED') ?? null;
    if (!mail && !reply) return null;
    return (
        <span className="ofi-psend__log">
            {mail && (
                <span className={mail.status === 'FAILED' ? 'is-warn' : undefined} title={mail.error ?? mail.to.join(', ')}>
                    {mail.status === 'FAILED' ? <MailWarning aria-hidden /> : <MailCheck aria-hidden />}
                    {t(mail.status === 'FAILED' ? `${P}.logFailed` : mail.trigger === 'MANUAL' || mail.trigger === 'RESEND' ? `${P}.logManual` : `${P}.logAuto`, {
                        when: whenText(mail.at),
                        to: mail.to[0] ?? '',
                        by: mail.byName ?? '',
                    })}
                    {mail.hasFile && (
                        <button type="button" className="ofi-nosize" onClick={() => void openBlob(() => purchasingApi.file('mail', mail.id))}>
                            <FileText aria-hidden />
                            PDF
                        </button>
                    )}
                </span>
            )}
            {/* Jede Fassung, die hinausging (auch jede Revision), bleibt mit ihrem PDF am Beleg (30.09.2026). */}
            {(state?.mails ?? []).filter((entry) => entry.hasFile && entry.status !== 'FAILED').length > 1 && (
                <span className="ofi-psend__history">
                    {(state?.mails ?? []).filter((entry) => entry.hasFile && entry.status !== 'FAILED').slice(0, 8).map((entry) => (
                        <button key={entry.id} type="button" className="ofi-nosize" title={entry.to.join(', ')} onClick={() => void openBlob(() => purchasingApi.file('mail', entry.id))}>
                            <FileText aria-hidden />
                            {t(`${P}.historyEntry.${entry.kind}`, { when: whenText(entry.at) })}
                        </button>
                    ))}
                </span>
            )}
            {reply && (
                <span className={reply.status === 'ATTACHED' ? 'is-ok' : undefined}>
                    <CornerDownLeft aria-hidden />
                    {t(reply.status === 'NO_PDF' ? `${P}.replyNoPdf` : `${P}.reply`, {
                        when: whenText(reply.at),
                        from: reply.fromName || reply.fromEmail || '',
                    })}
                    {reply.hasFile && (
                        <button type="button" className="ofi-nosize" onClick={() => void openBlob(() => purchasingApi.file('reply', reply.id))}>
                            <FileText aria-hidden />
                            PDF
                        </button>
                    )}
                </span>
            )}
        </span>
    );
};
