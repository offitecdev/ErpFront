import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Check, ChevronDown, ChevronLeft, ChevronRight, SearchLg, X } from '@/components/icons/antIconCompat';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';

/**
 * ── DIE BEDIENTEILE DER BUCHHALTUNG (22.09.2026) ────────────────────────────
 *
 * Vorgabe Samet: «direkt iOS/Mac SwiftUI olmalı, ayrıca dropdownlarda aynı
 * olmalı — Apple Mac style». Die Buchhaltung benutzt darum NICHT die
 * app-weiten Listenfelder (40px, marineblauer 2px-Rand, `<select>` des
 * Systems), sondern drei eigene Stücke im Kleid der Mac-Seiten:
 *
 *   AccSearch   das Suchfeld der Finder-Leiste — graue Mulde, Lupe, ⌫
 *   AccSelect   der «Pop-up Button»: Knopf mit ⌄, Menü mit Häkchen
 *   AccPager    die Fusszeile «1–20 von 68» mit ‹ › und den Seitenzahlen
 *
 * Das Menü hängt am portalierten `AnchoredPicker` — es steht also AUSSERHALB
 * von `.acc`. Seine Regeln stehen darum ungeschachtelt in accounting.css
 * (siehe dort «Menü des Pop-up Buttons»).
 */

export type AccOption = { value: string; label: string };

/* ── Suchfeld ──────────────────────────────────────────────────────────── */
export const AccSearch = ({
    value,
    onChange,
    placeholder,
    ariaLabel,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    ariaLabel?: string;
}) => (
    <div className="acc-search" data-filled={value ? 'true' : 'false'}>
        <SearchLg size={13} className="acc-search__glass" aria-hidden />
        <input
            className="acc-search__input"
            type="search"
            value={value}
            placeholder={placeholder}
            aria-label={ariaLabel || placeholder}
            onChange={(event) => onChange(event.target.value)}
        />
        {value !== '' && (
            <button
                type="button"
                className="acc-search__clear ofi-btn-plain ofi-nosize"
                aria-label={t('accounting.clearSearch')}
                onClick={() => onChange('')}
            >
                <X size={11} />
            </button>
        )}
    </div>
);

/* ── Pop-up Button (das Apple-Gegenstück zum <select>) ─────────────────── */
export const AccSelect = ({
    value,
    options,
    onChange,
    ariaLabel,
    align = 'start',
}: {
    value: string;
    options: AccOption[];
    onChange: (value: string) => void;
    ariaLabel: string;
    /** `end` = das Menü sitzt rechts am Knopf (Fusszeile). */
    align?: 'start' | 'end';
}) => {
    const anchor = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const current = options.find((option) => option.value === value) ?? options[0];

    // Pfeiltasten öffnen das Menü — wie ein Pop-up Button auf dem Mac.
    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
        }
    };

    return (
        <>
            <button
                ref={anchor}
                type="button"
                className={`acc-select ofi-btn-plain ofi-nosize ${open ? 'is-open' : ''}`}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
                onClick={() => setOpen((state) => !state)}
                onKeyDown={onKeyDown}
            >
                <span className="acc-select__label">{current?.label ?? ''}</span>
                <ChevronDown size={12} className="acc-select__chev" aria-hidden />
            </button>
            {open && (
                <AnchoredPicker
                    anchorEl={anchor.current}
                    onClose={() => setOpen(false)}
                    width={align === 'end' ? 200 : 232}
                    maxHeight={320}
                    exactWidth={align === 'end'}
                    ariaLabel={ariaLabel}
                    panelClassName="acc-menu"
                >
                    <div className="acc-menu__list" role="listbox" aria-label={ariaLabel}>
                        {options.map((option) => {
                            const on = option.value === value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="option"
                                    aria-selected={on}
                                    className={`acc-menu__row ofi-option-row ofi-btn-plain ofi-nosize ${on ? 'is-on' : ''}`}
                                    onClick={() => { onChange(option.value); setOpen(false); }}
                                >
                                    <span className="acc-menu__check">{on && <Check size={12} strokeWidth={2.6} />}</span>
                                    <span className="acc-menu__label">{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </AnchoredPicker>
            )}
        </>
    );
};

/**
 * Die Seitenzahlen: erste, letzte, die aktuelle mit ihren Nachbarn — der Rest
 * ist ein «…». So bleibt die Leiste bei 200 Seiten so breit wie bei 5.
 */
const pageWindow = (page: number, pages: number): Array<number | 'gap'> => {
    if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
    const near = [page - 1, page, page + 1].filter((value) => value > 1 && value < pages);
    const list: Array<number | 'gap'> = [1];
    if (near[0] !== undefined && near[0] > 2) list.push('gap');
    list.push(...near);
    if ((near[near.length - 1] ?? 1) < pages - 1) list.push('gap');
    list.push(pages);
    return list;
};

/* ── Fusszeile der Tafel ───────────────────────────────────────────────── */
export const AccPager = ({
    page,
    pageSize,
    total,
    onPage,
    onPageSize,
    sizes = [20, 50, 100],
}: {
    page: number;
    pageSize: number;
    total: number;
    onPage: (page: number) => void;
    onPageSize?: (size: number) => void;
    sizes?: number[];
}) => {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);
    const steps = useMemo(() => pageWindow(page, pages), [page, pages]);

    // Eine Seite, die es nicht mehr gibt (Suche verengt die Liste), fällt auf
    // die letzte zurück — sonst stünde man vor einer leeren Tafel.
    useEffect(() => {
        if (page > pages) onPage(pages);
    }, [page, pages, onPage]);

    return (
        <div className="acc-pager">
            <span className="acc-pager__range">{t('accounting.pageRange', { from, to, total })}</span>
            <div className="acc-pager__steps">
                <button
                    type="button"
                    className="acc-pager__arrow ofi-btn-plain ofi-nosize"
                    aria-label={t('common.previous')}
                    disabled={page <= 1}
                    onClick={() => onPage(page - 1)}
                >
                    <ChevronLeft size={14} />
                </button>
                {steps.map((entry, index) => (entry === 'gap' ? (
                    <span key={`gap-${index}`} className="acc-pager__gap">…</span>
                ) : (
                    <button
                        key={entry}
                        type="button"
                        className={`acc-pager__page ofi-btn-plain ofi-nosize ${entry === page ? 'is-on' : ''}`}
                        aria-current={entry === page ? 'page' : undefined}
                        onClick={() => onPage(entry)}
                    >
                        {entry}
                    </button>
                )))}
                <button
                    type="button"
                    className="acc-pager__arrow ofi-btn-plain ofi-nosize"
                    aria-label={t('common.next')}
                    disabled={page >= pages}
                    onClick={() => onPage(page + 1)}
                >
                    <ChevronRight size={14} />
                </button>
            </div>
            {onPageSize ? (
                <AccSelect
                    value={String(pageSize)}
                    options={sizes.map((size) => ({ value: String(size), label: t('accounting.perPage', { n: size }) }))}
                    onChange={(next) => onPageSize(Number(next))}
                    ariaLabel={t('accounting.perPageLabel')}
                    align="end"
                />
            ) : <span />}
        </div>
    );
};
