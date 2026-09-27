import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { t } from '@/i18n/translate';

import { entryTitle, type NavDirection, type NavStackHandle } from './navStackState';

/**
 * Die Werkzeugleiste einer Ansicht: ‹ vorige Ansicht | › — Titel — Aktionen.
 * Der Pfeil ist das Blau der Systemsteuerung; ohne Weg zurück ist er grau.
 */
export const NavBar = ({
    nav,
    title,
    subtitle,
    badge,
    actions,
    backTitle,
}: {
    nav: Pick<NavStackHandle<unknown>, 'back' | 'forward' | 'canBack' | 'canForward' | 'previous'>;
    title: ReactNode;
    subtitle?: ReactNode;
    badge?: ReactNode;
    actions?: ReactNode;
    /** Der Name der vorigen Ansicht, wenn er erst aus den Daten kommt. */
    backTitle?: string;
}) => {
    const backLabel = backTitle || (nav.previous ? entryTitle(nav.previous) : '') || t('productionBom.common.back');
    /* Die Leiste klebt beim Rollen oben; der Tabellenkopf der Ansicht klebt an
       ihrer Unterkante. Wie hoch sie gerade ist (auf schmalen Schirmen bricht
       sie um), schreibt sie als `--bom-bar-h` an ihre Ansicht. */
    const barRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const bar = barRef.current;
        const view = bar?.parentElement;
        if (!bar || !view) return undefined;
        const write = () => view.style.setProperty('--bom-bar-h', `${bar.offsetHeight}px`);
        write();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(write);
        observer.observe(bar);
        return () => observer.disconnect();
    }, []);
    return (
        <div ref={barRef} className="ofi-bom-nav__bar">
            <div className="ofi-bom-nav__arrows" role="group" aria-label={t('productionBom.common.back')}>
                <button
                    type="button"
                    className="ofi-bom-nav__back ofi-nosize"
                    onClick={nav.back}
                    disabled={!nav.canBack}
                    title={`${backLabel} (⌘[)`}
                    aria-label={`${t('productionBom.common.back')}: ${backLabel}`}
                >
                    <ChevronLeft aria-hidden />
                    {nav.canBack && <span>{backLabel}</span>}
                </button>
                <button
                    type="button"
                    className="ofi-bom-nav__fwd ofi-nosize"
                    onClick={nav.forward}
                    disabled={!nav.canForward}
                    title={`${t('productionBom.common.forward')} (⌘])`}
                    aria-label={t('productionBom.common.forward')}
                >
                    <ChevronRight aria-hidden />
                </button>
            </div>
            <div className="ofi-bom-nav__title">
                <h2>{title}</h2>
                {badge}
                {subtitle && <small>{subtitle}</small>}
            </div>
            {actions && <div className="ofi-bom-nav__actions">{actions}</div>}
        </div>
    );
};

/**
 * Die Fläche der aktuellen Ansicht. Sie bekommt bei jedem Wechsel einen neuen
 * Schlüssel — dadurch spielt die Einschub-Bewegung (rechts beim Öffnen,
 * links beim Zurückgehen) jedes Mal von vorn.
 */
export const NavView = ({ entryKey, direction, children }: { entryKey: string; direction: NavDirection; children: ReactNode }) => {
    const className = useMemo(
        () => `ofi-bom-nav__view${direction === 'push' ? ' is-push' : direction === 'pop' ? ' is-pop' : ''}`,
        [direction],
    );
    return (
        <div key={entryKey} className={className}>
            {children}
        </div>
    );
};

/**
 * «İleri» als Zeile: eine Station, in die man hineingeht (Bestellungen,
 * Dokumente …) — mit Zahl und Chevron, wie die Zeilen der Systemeinstellungen.
 */
export const NavLinkRow = ({
    icon,
    label,
    detail,
    count,
    tone,
    disabled,
    onClick,
}: {
    icon?: ReactNode;
    label: ReactNode;
    detail?: ReactNode;
    count?: number | null;
    tone?: 'accent' | 'warn' | 'ok';
    disabled?: boolean;
    onClick: () => void;
}) => (
    <button
        type="button"
        className={`ofi-bom-linkrow ofi-nosize${tone ? ` is-${tone}` : ''}`}
        onClick={onClick}
        disabled={disabled}
    >
        {icon && <span className="ofi-bom-linkrow__icon">{icon}</span>}
        <span className="ofi-bom-linkrow__text">
            <b>{label}</b>
            {detail && <small>{detail}</small>}
        </span>
        {count !== undefined && count !== null && <i className="ofi-bom-linkrow__count">{count}</i>}
        <ChevronRight className="ofi-bom-linkrow__chev" aria-hidden />
    </button>
);
