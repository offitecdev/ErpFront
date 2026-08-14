import { useEffect, useMemo, useRef, useState } from 'react';

import { XClose } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { fetchStaffDirectory } from '@/lib/api/directory';
import { tenderApi } from '@/lib/api/tender';

import { AnchoredPopup } from '../common/AnchoredPopup';
import { QUOTE_CONTROL_CLASS } from '../../utils/quoteField.constants';

type Suggestion = {
    email: string;
    name: string;
    /** Woher der Vorschlag kommt — als graue Zeile unter dem Namen. */
    hint: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * CC-Feld des Offert-Mailbereichs: getippt wird gesucht, nicht geschrieben —
 * während der Eingabe erscheinen der Kunde, seine Kontaktpersonen und die
 * Mitarbeitenden als Vorschläge, ein Klick (oder Enter) macht daraus einen Chip.
 * Eine vollständig getippte Adresse lässt sich ebenso mit Enter übernehmen, für
 * Empfänger, die in keiner Liste stehen.
 *
 * Die Liste gehört der OFFERTE (`Tender.ccEmails`), nicht dem Mailfenster: jede
 * Kundenmail dieser Offerte — die Offertmail und die automatische
 * Auftragsbestätigung beim Erstellen des Auftrags — geht in Kopie an sie.
 */
export const TenderCcField = ({ tenderId, value, onChange, disabled }: {
    tenderId: string;
    value: string[];
    onChange: (emails: string[]) => void;
    disabled?: boolean;
}) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [pool, setPool] = useState<Suggestion[]>([]);
    const [fieldEl, setFieldEl] = useState<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    // Der Vorschlagstopf wird EINMAL geladen, beim ersten Fokus — nicht beim
    // Öffnen des Mailfensters: wer nur den Betreff ändert, holt keine Listen.
    const loadedRef = useRef(false);

    const loadPool = () => {
        if (loadedRef.current) return;
        loadedRef.current = true;
        void Promise.all([
            tenderApi.getMailRecipients(tenderId).catch(() => null),
            fetchStaffDirectory().catch(() => []),
        ]).then(([recipients, staff]) => {
            const rows: Suggestion[] = [];
            if (recipients?.customer) {
                rows.push({
                    email: recipients.customer.email,
                    name: recipients.customer.name,
                    hint: t('calendar.picker.customer'),
                });
            }
            (recipients?.contacts ?? []).forEach((contact) => {
                rows.push({
                    email: contact.email,
                    name: contact.name,
                    hint: [contact.title, t('crm.customers.colContact')].filter(Boolean).join(' · '),
                });
            });
            staff.forEach((person) => {
                if (!person.email) return;
                rows.push({
                    email: person.email,
                    name: `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || person.email,
                    hint: person.roleName || person.title || t('calendar.picker.staff'),
                });
            });
            // Eine Adresse kann in mehreren Quellen stehen; die erste gewinnt
            // (Kunde vor Kontakt vor Personal).
            const seen = new Set<string>();
            setPool(rows.filter((row) => {
                const key = row.email.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }));
        });
    };

    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);

    const picked = useMemo(() => new Set(value.map((email) => email.toLowerCase())), [value]);
    const needle = query.trim().toLowerCase();
    const matches = useMemo(() => pool
        .filter((row) => !picked.has(row.email.toLowerCase()))
        .filter((row) => !needle
            || row.email.toLowerCase().includes(needle)
            || row.name.toLowerCase().includes(needle))
        .slice(0, 8), [pool, picked, needle]);

    const typedIsEmail = EMAIL_RE.test(query.trim());
    const typedIsNew = typedIsEmail && !picked.has(query.trim().toLowerCase());

    const add = (email: string) => {
        const clean = email.trim();
        if (!clean || picked.has(clean.toLowerCase())) return;
        // Zehn Adressen sind auch die Grenze auf dem Server.
        if (value.length >= 10) return;
        onChange([...value, clean]);
        setQuery('');
        inputRef.current?.focus();
    };

    const remove = (email: string) => onChange(value.filter((item) => item !== email));

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (matches.length > 0) add(matches[0]!.email);
            else if (typedIsNew) add(query);
            return;
        }
        if (event.key === 'Backspace' && !query && value.length > 0) {
            // Leeres Feld + Rücktaste = letzten Empfänger wieder wegnehmen.
            remove(value[value.length - 1]!);
            return;
        }
        if (event.key === 'Escape') setOpen(false);
    };

    return (
        <div className="flex flex-col gap-1.5">
            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {value.map((email) => (
                        <span
                            key={email}
                            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1.5 text-[11.5px] font-medium text-slate-600"
                        >
                            {email}
                            {!disabled && (
                                <button
                                    type="button"
                                    aria-label={t('common.delete')}
                                    onClick={() => remove(email)}
                                    className="flex size-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                                >
                                    <XClose size={10} />
                                </button>
                            )}
                        </span>
                    ))}
                </div>
            )}

            <div ref={setFieldEl} className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    disabled={disabled}
                    placeholder={t('tenders.cc_placeholder')}
                    onFocus={() => { loadPool(); setOpen(true); }}
                    onClick={() => setOpen(true)}
                    onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
                    onKeyDown={onKeyDown}
                    // Der Klick auf einen Vorschlag läuft über onPointerDown und
                    // kommt damit vor diesem verzögerten Schliessen an.
                    onBlur={() => window.setTimeout(() => setOpen(false), 120)}
                    className={QUOTE_CONTROL_CLASS}
                />
            </div>

            {open && fieldEl && !disabled && (matches.length > 0 || typedIsNew || query.length > 0) && (
                <AnchoredPopup anchorEl={fieldEl} onClose={() => setOpen(false)} estimatedHeight={260}>
                    <ul className="max-h-64 overflow-y-auto py-0.5">
                        {matches.map((row) => (
                            // `group` + `group-hover:!text-white` auf den ZEILEN:
                            // die Slate-Farbklassen sind in index.css als
                            // !important neu deklariert, eine Farbe auf dem
                            // Elternteil erreicht sie nie — nur die
                            // Hover-Variante am Kind selbst gewinnt.
                            <li
                                key={row.email}
                                onPointerDown={(event) => {
                                    if (event.button !== 0) return;
                                    event.preventDefault();
                                    add(row.email);
                                }}
                                className="ofi-option-row group cursor-pointer px-2.5 py-1.5 transition-colors hover:bg-[#1f2654]"
                            >
                                <div className="truncate text-[13px] text-slate-800 group-hover:!text-white">{row.name}</div>
                                <div className="truncate text-[11.5px] text-slate-500 group-hover:!text-white/70">
                                    {[row.email, row.hint].filter(Boolean).join(' · ')}
                                </div>
                            </li>
                        ))}
                        {typedIsNew && (
                            <li
                                onPointerDown={(event) => {
                                    if (event.button !== 0) return;
                                    event.preventDefault();
                                    add(query);
                                }}
                                className="ofi-option-row group cursor-pointer border-t border-slate-100 px-2.5 py-1.5 transition-colors hover:bg-[#1f2654]"
                            >
                                <span className="text-[13px] text-slate-800 group-hover:!text-white">
                                    {t('calendar.picker.addEmail')}: {query.trim()}
                                </span>
                            </li>
                        )}
                        {matches.length === 0 && !typedIsNew && (
                            <li className="px-2.5 py-2 text-[12.5px] text-slate-400">{t('calendar.picker.noPeople')}</li>
                        )}
                    </ul>
                </AnchoredPopup>
            )}
        </div>
    );
};
