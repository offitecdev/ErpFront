import { Mail01, Send01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

const FIELD_CLASS =
    'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#07145c]/40 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:border-[#d48f16]/50';

/* Mail step shared by the appointment wizard and the meeting composer: an
   editable to/subject/body with the CC list shown as chips. Sending itself is
   the parent's job (it owns settings + the ccEmails source of truth). */
export const MailComposePanel = ({ to, onToChange, cc, onEditCc, subject, onSubjectChange, body, onBodyChange, onSend, onSkip, sending, error, sent }: {
    to: string;
    onToChange: (next: string) => void;
    cc: string[];
    onEditCc: () => void;
    subject: string;
    onSubjectChange: (next: string) => void;
    body: string;
    onBodyChange: (next: string) => void;
    onSend: () => void;
    onSkip: () => void;
    sending: boolean;
    error?: string | null;
    sent?: boolean;
}) => (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-[13px] font-bold text-slate-800 dark:text-white">
            <Mail01 size={15} className="text-[#07145c] dark:text-[#d48f16]" />
            {t('calendar.mail.title')}
        </div>

        <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.mail.to')}</span>
            <input value={to} onChange={(event) => onToChange(event.target.value)} className={FIELD_CLASS} placeholder="mail@firma.com" />
        </label>

        <div>
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.mail.cc')}</span>
            <div className="flex flex-wrap items-center gap-1.5">
                {cc.map((email) => (
                    <span key={email} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11.5px] font-medium text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70">
                        {email}
                    </span>
                ))}
                <button
                    type="button"
                    onClick={onEditCc}
                    className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-[11.5px] font-semibold text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700 dark:border-white/20 dark:text-white/50 dark:hover:text-white"
                >
                    {cc.length ? t('calendar.mail.editCc') : t('calendar.mail.addCc')}
                </button>
            </div>
        </div>

        <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.mail.subject')}</span>
            <input value={subject} onChange={(event) => onSubjectChange(event.target.value)} className={FIELD_CLASS} />
        </label>

        <label className="flex min-h-0 flex-1 flex-col">
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.mail.body')}</span>
            <textarea
                value={body}
                onChange={(event) => onBodyChange(event.target.value)}
                className="min-h-[160px] w-full flex-1 resize-none rounded-md border border-slate-200 bg-white p-3 text-[13px] leading-relaxed text-slate-800 outline-none transition-colors focus:border-[#07145c]/40 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:border-[#d48f16]/50"
            />
        </label>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300">{error}</div>}
        {sent && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">{t('calendar.mail.sent')}</div>}

        <div className="flex items-center justify-end gap-2 pt-1">
            <button
                type="button"
                onClick={onSkip}
                className="h-9 rounded-md border border-slate-200 px-4 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
            >
                {sent ? t('common.close') : t('calendar.mail.skip')}
            </button>
            <button
                type="button"
                onClick={onSend}
                disabled={sending || !to.trim() || !subject.trim()}
                className="flex h-9 items-center gap-1.5 rounded-md bg-[#07145c] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0b1a6e] dark:bg-[#d48f16] dark:text-[#151616] dark:hover:bg-[#f2bb5c] disabled:cursor-not-allowed disabled:opacity-50"
            >
                <Send01 size={14} />
                {sending ? t('calendar.mail.sending') : t('calendar.mail.send')}
            </button>
        </div>
    </div>
);
