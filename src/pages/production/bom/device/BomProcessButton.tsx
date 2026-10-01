import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Minus } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { Bom, BomSummary } from '@/types/productionBom';

import { bomProcess } from './bomProcess';

/**
 * Ein kleiner Fortschrittsring (wie die Ringe der Apple Watch, nur ruhig):
 * grauer Grund, blauer Bogen, fertig = grün mit Haken.
 */
export const ProgressRing = ({
    value,
    size = 16,
    stroke = 2.4,
    tone,
    className,
}: {
    value: number;
    size?: number;
    stroke?: number;
    tone?: 'accent' | 'success' | 'muted';
    className?: string;
}) => {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    const done = clamped >= 1 - 1e-9;
    const radius = (size - stroke) / 2;
    const length = 2 * Math.PI * radius;
    const shown = tone ?? (done ? 'success' : 'accent');
    return (
        <span className={`ofi-bom-ring is-${shown}${className ? ` ${className}` : ''}`} style={{ width: size, height: size }} aria-hidden>
            <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
                <circle className="ofi-bom-ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
                <circle
                    className="ofi-bom-ring__arc"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={stroke}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${length} ${length}`}
                    strokeDashoffset={length * (1 - clamped)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </svg>
            {done && size >= 16 && <Check className="ofi-bom-ring__check" />}
        </span>
    );
};

const POP_WIDTH = 300;
const EDGE = 8;

/**
 * ── DER WEG DER BOM ALS KNOPF (27.09.2026 abends, Vorgabe Samet) ─────────────
 *
 * «Bu ilerleme çubukları çok kötü, çok yer kaplıyor — daha basit adım olsun ya
 *  da progress butonu olsun yukarıda, glass seviye, daire daire açılsın, daha
 *  temiz görünsün.» Oben in der Leiste der BOM ein gläserner Knopf: Ring +
 * «Şu an: …». Ein Klick öffnet ein Glasfenster, in dem die Stationen als
 * Kreise nacheinander aufgehen — erledigt (blauer Haken), dran (Ring),
 * offen (Nummer), übersprungen (Strich). Keine Lieferanten, keine Preise.
 */
export const BomProcessButton = ({ bom, subs = [] }: { bom: Bom; subs?: BomSummary[] }) => {
    const process = bomProcess(bom, subs);
    const container = bom.kind === 'MAIN' && bom.lines.length === 0;
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<CSSProperties>({ top: -9999, left: -9999 });

    const place = useCallback(() => {
        const anchor = buttonRef.current;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        const width = Math.min(POP_WIDTH, window.innerWidth - EDGE * 2);
        const left = Math.min(Math.max(EDGE, rect.left), window.innerWidth - width - EDGE);
        const height = popRef.current?.offsetHeight ?? 0;
        const below = rect.bottom + 8;
        const top = height && below + height > window.innerHeight - EDGE ? Math.max(EDGE, rect.top - 8 - height) : below;
        setStyle({ top, left, width });
    }, []);

    useLayoutEffect(() => {
        if (open) place();
    }, [open, place]);

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (popRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setOpen(false);
            buttonRef.current?.focus();
        };
        window.addEventListener('mousedown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('mousedown', onDown, true);
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open, place]);

    const allDone = !process.current;
    const doneCount = process.steps.filter((step) => step.state === 'done').length;
    const activeCount = process.steps.filter((step) => step.state !== 'skipped' && !(step.optional && step.state !== 'done')).length;
    const currentLabel = process.current ? t(`productionBom.process.step.${process.current.key}`) : t('productionBom.process.allDone');
    // Die Nummern der Stationen zählen übersprungene nicht mit.
    const numbers = process.steps.reduce<number[]>((list, step) => [...list, (list[list.length - 1] ?? 0) + (step.state === 'skipped' ? 0 : 1)], []);

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className={`ofi-bom-procbtn ofi-nosize${open ? ' is-open' : ''}${allDone ? ' is-done' : ''}`}
                aria-expanded={open}
                aria-haspopup="dialog"
                title={t('productionBom.process.open')}
                onClick={() => setOpen((value) => !value)}
            >
                <ProgressRing value={process.progress} size={18} stroke={2.6} tone={allDone ? 'success' : 'accent'} />
                <span className="ofi-bom-procbtn__label">{currentLabel}</span>
                <span className="ofi-bom-procbtn__count">{doneCount}/{activeCount}</span>
                <ChevronDown className="ofi-bom-procbtn__chev" aria-hidden />
            </button>
            {open && createPortal(
                <div
                    ref={popRef}
                    role="dialog"
                    aria-label={t('productionBom.process.title')}
                    className="ofi-bom-pop ofi-bom-procpop"
                    style={style}
                >
                    <header className="ofi-bom-procpop__head">
                        <ProgressRing value={process.progress} size={34} stroke={3.4} tone={allDone ? 'success' : 'accent'} />
                        <span className="ofi-bom-procpop__title">
                            <b>{t(container ? 'productionBom.process.titleMain' : 'productionBom.process.title')}</b>
                            <small>
                                {allDone
                                    ? t('productionBom.process.allDone')
                                    : [
                                        t('productionBom.process.now', { step: currentLabel }),
                                        process.remaining > 0 ? t('productionBom.process.remaining', { count: process.remaining }) : t('productionBom.process.lastStep'),
                                    ].join(' · ')}
                            </small>
                        </span>
                        <span className="ofi-bom-procpop__percent">{Math.round(process.progress * 100)}%</span>
                    </header>
                    <ol className="ofi-bom-procpop__steps">
                        {process.steps.map((step, index) => {
                            const detail = step.total !== null && step.total > 0 ? `${step.done ?? 0}/${step.total}` : null;
                            return (
                                <li
                                    key={step.key}
                                    className={`ofi-bom-procpop__step is-${step.state}${step.optional ? ' is-optional' : ''}`}
                                    style={{ '--i': index } as CSSProperties}
                                    aria-current={step.state === 'current' ? 'step' : undefined}
                                >
                                    <span className="ofi-bom-procpop__dot" aria-hidden>
                                        {step.state === 'done' ? <Check /> : step.state === 'skipped' ? <Minus /> : numbers[index]}
                                    </span>
                                    <span className="ofi-bom-procpop__text">
                                        <b>{t(`productionBom.process.step.${step.key}`)}</b>
                                        {step.state === 'current' && <small>{t(`productionBom.process.hint.${step.key}`)}</small>}
                                    </span>
                                    <span className="ofi-bom-procpop__detail">
                                        {step.state === 'skipped'
                                            ? t('productionBom.process.skipped')
                                            : detail ?? (step.optional && step.state !== 'done' ? t('productionBom.process.optional') : '')}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </div>,
                document.body,
            )}
        </>
    );
};
