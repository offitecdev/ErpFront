import { Fragment, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { Check } from '@/components/icons/antIconCompat';
import { parseCalendarQuickText } from '../calendarQuickText';
import { pushRecentCustomer, type CustomerLite } from '../calendarShared';
import { useQuickCustomerSuggestions } from './QuickCustomerSuggestions';

type Token = { start: number; end: number; type: 'customer' | 'date' | 'time' };
type Choice = { id: string; label: string; detail: string; type: Token['type']; customer?: CustomerLite; replacement?: string };
const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
const clock = (minutes: number) => `${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Locate only the name fragment, leaving the rest of the sentence untouched.
const customerRange = (value: string, name: string, partial = false): Token | null => {
    const exact = fold(value).indexOf(fold(name));
    if (exact >= 0) return { start: exact, end: exact + name.length, type: 'customer' };
    if (!partial) return null;
    const words = fold(name).match(/[\p{L}\p{N}]+/gu) ?? [];
    const matches = [...value.matchAll(/[\p{L}\p{N}]+/gu)];
    let best: Token | null = null;
    let runStart = -1;
    let runEnd = -1;
    for (const match of matches) {
        const word = fold(match[0]);
        if (word.length < 2 || !words.some((part) => part === word || (word.length >= 3 && part.startsWith(word)))) {
            runStart = -1;
            continue;
        }
        const start = match.index;
        if (runStart < 0 || !/^\s*$/.test(value.slice(runEnd, start))) runStart = start;
        runEnd = start + match[0].length;
        if (!best || runEnd - runStart > best.end - best.start) best = { start: runStart, end: runEnd, type: 'customer' };
    }
    return best;
};

export function QuickSentenceInput({ value, onChange, customer, onCustomer, placeholder, label, compact = false, autoFocus = false }: {
    value: string;
    onChange: (value: string) => void;
    customer: CustomerLite | null;
    onCustomer?: (customer: CustomerLite) => void;
    placeholder: string;
    label: string;
    compact?: boolean;
    autoFocus?: boolean;
}) {
    const { t } = useTranslation();
    const input = useRef<HTMLTextAreaElement>(null);
    const mirror = useRef<HTMLDivElement>(null);
    const listId = useId();
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<Token['type'] | 'all'>('all');
    const [active, setActive] = useState(0);
    const parsed = useMemo(() => parseCalendarQuickText(value, dayjs()), [value]);
    const suggestions = useQuickCustomerSuggestions(parsed.title, open && Boolean(onCustomer) && (mode === 'all' || mode === 'customer'));
    const selectedName = customer ? customerRange(value, customer.companyName) : null;
    const tokens: Token[] = [...parsed.spans, ...(selectedName ? [selectedName] : [])]
        .sort((a, b) => a.start - b.start)
        .filter((token, index, all) => index === 0 || token.start >= all[index - 1].end);
    const choices: Choice[] = [];
    if ((mode === 'all' || mode === 'customer') && onCustomer) {
        const rows = [...(customer && mode === 'customer' ? [customer] : []), ...suggestions.rows];
        const seen = new Set<string>();
        for (const row of rows) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            choices.push({ id: `customer-${row.id}`, label: row.companyName,
                detail: [t('calendar.picker.customer'), row.city, row.mainEmail || row.mainPhone].filter(Boolean).join(' · '), type: 'customer', customer: row });
        }
    }
    if ((mode === 'all' || mode === 'time') && parsed.foundTime) {
        // The first entry confirms the recognised range; adjacent entries let
        // the user adjust it without leaving the sentence.
        const start = parsed.startMinutes!;
        const end = parsed.endMinutes!;
        for (const delta of (mode === 'time' ? [0, -30, 30] : [0])) {
            if (start + delta < 0 || start + delta >= 1440 || end + delta < 0) continue;
            const range = `${clock(start + delta)}–${clock(end + delta)}`;
            choices.push({ id: `time-${delta}`, label: range, detail: t('calendar.wizard.stepTime'), type: 'time', replacement: range });
        }
    }
    if ((mode === 'all' || mode === 'date') && parsed.date) {
        choices.push({ id: 'date', label: parsed.date.format('DD.MM.YYYY'), detail: t('calendar.wizard.date'), type: 'date', replacement: parsed.date.format('DD.MM.YYYY') });
    }
    const index = Math.min(active, Math.max(0, choices.length - 1));
    const showList = open && (choices.length > 0 || suggestions.loading || suggestions.failed);

    useLayoutEffect(() => {
        const element = input.current;
        if (!element) return;
        element.style.height = '0px';
        element.style.height = `${Math.max(compact ? 48 : 94, Math.min(240, element.scrollHeight))}px`;
        if (mirror.current) mirror.current.scrollTop = element.scrollTop;
    }, [value, compact]);

    const choose = (choice: Choice) => {
        let next = value;
        if (choice.customer) {
            const range = (customer && customerRange(value, customer.companyName)) || customerRange(value, choice.customer.companyName, true);
            next = range
                ? value.slice(0, range.start) + choice.customer.companyName + value.slice(range.end)
                : `${value.trimEnd()} ${choice.customer.companyName}`.trimStart();
            pushRecentCustomer(choice.customer);
            onCustomer?.(choice.customer);
        } else {
            const spans = parsed.spans.filter((span) => span.type === choice.type);
            for (let i = spans.length - 1; i >= 0; i--) {
                next = next.slice(0, spans[i].start) + (i === 0 ? choice.replacement : '') + next.slice(spans[i].end);
            }
        }
        onChange(next);
        setOpen(false);
        requestAnimationFrame(() => {
            input.current?.focus({ preventScroll: true });
            input.current?.setSelectionRange(next.length, next.length);
            setOpen(false);
        });
    };

    let offset = 0;
    const highlighted = tokens.map((token) => {
        const before = value.slice(offset, token.start);
        offset = token.end;
        return <Fragment key={`${token.type}-${token.start}`}>{before}<mark>{value.slice(token.start, token.end)}</mark></Fragment>;
    });

    return <div className={`ofi-cal-sentence${compact ? ' is-compact' : ''}`}>
        <div ref={mirror} className="ofi-cal-sentence__mirror" aria-hidden="true">
            {highlighted}{value.slice(offset)}{'\u200b'}
        </div>
        <textarea ref={input} value={value} autoFocus={autoFocus} rows={2}
            className="ofi-cal-sentence__input" placeholder={placeholder} aria-label={label}
            role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={showList}
            aria-controls={showList ? listId : undefined}
            aria-activedescendant={showList && choices[index] ? `${listId}-${choices[index].id}` : undefined}
            onFocus={() => { setOpen(true); setMode('all'); }}
            onClick={(event) => {
                const caret = event.currentTarget.selectionStart;
                const token = tokens.find((item) => caret >= item.start && caret <= item.end);
                setMode(token?.type ?? 'all'); setActive(0); setOpen(true);
            }}
            onChange={(event) => { onChange(event.target.value); setMode('all'); setActive(0); setOpen(true); }}
            onScroll={(event) => { if (mirror.current) mirror.current.scrollTop = event.currentTarget.scrollTop; }}
            onBlur={(event) => {
                if (!(event.relatedTarget instanceof Element) || !event.relatedTarget.closest('.ofi-cal-sentence-menu')) setOpen(false);
            }}
            onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
                if (event.key === 'Tab') { setOpen(false); return; }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    if (!choices.length) return;
                    event.preventDefault();
                    setOpen(true);
                    setActive((index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length);
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (showList && choices[index]) choose(choices[index]);
                    else setOpen(false);
                }
            }}
        />
        <AnchoredPicker anchorEl={showList ? input.current : null} onClose={() => setOpen(false)}
            width={320} maxHeight={260} panelClassName="ofi-cal-sentence-menu">
            <div id={listId} role="listbox" aria-label={label} className="ofi-cal-sentence-menu__list">
                {choices.map((choice, rowIndex) => <div key={choice.id} id={`${listId}-${choice.id}`} role="option"
                    aria-selected={index === rowIndex} className="ofi-cal-sentence-menu__option"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(rowIndex)} onClick={() => choose(choice)}>
                    <span><strong>{choice.label}</strong><small>{choice.detail}</small></span>
                    {(choice.customer?.id === customer?.id && choice.type === 'customer') && <Check size={14} />}
                </div>)}
                {suggestions.loading && <div role="status" className="ofi-cal-sentence-menu__status">{t('common.loading')}</div>}
                {suggestions.failed && <div role="status" className="ofi-cal-sentence-menu__status">{t('calendar.picker.searchCustomer')}</div>}
            </div>
        </AnchoredPicker>
    </div>;
}
