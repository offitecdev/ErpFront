import { useRef, type KeyboardEvent } from 'react';
import { Cog, Layers, Zap } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { TaskArea, TaskSection } from '@/types/productionTasks';

import { areaTone, formatPercent, sectionLabel } from './taskModel';

/**
 * Das Zeichen des Bereichs: Zahnrad für die Mekanik, Blitz für die Elektrik,
 * Ebenen für einen eigenen Bereich einer Vorlage.
 */
export const AreaIcon = ({ area, size = 14 }: { area: TaskArea; size?: number }) => {
    if (area === 'ELECTRICAL') return <Zap size={size} strokeWidth={2} aria-hidden />;
    if (area === 'MECHANICAL') return <Cog size={size} strokeWidth={2} aria-hidden />;
    return <Layers size={size} strokeWidth={2} aria-hidden />;
};

/**
 * ── DIE BEREICHE ALS SEGMENTSCHALTER (26.09.2026, Vorgabe Samet) ────────────
 *
 * «Üretimde Mekanik ve Elektrik diye seçim olmalı … üretim bölümlere
 *  ayrılıyor.» Ein macOS-Segmentschalter: flache graue Rinne, der gewählte
 * Bereich als weisses Segment. Seit dem 28.09.2026 mit den Bereichen der
 * Vorlage, so viele es sind (passen sie nicht, läuft die Rinne seitlich).
 * Neben dem Namen auf Wunsch der Anteil an der Gesamtfertigstellung und ein
 * oranger Punkt, wenn die Gewichte des Bereichs noch nicht aufgehen.
 * Pfeiltasten wechseln.
 */
export const AreaSwitch = ({
    sections,
    value,
    onChange,
    showShares,
    warnings,
    ariaControls,
}: {
    sections: readonly TaskSection[];
    value: TaskArea;
    onChange: (area: TaskArea) => void;
    showShares?: boolean;
    warnings?: Partial<Record<TaskArea, boolean>>;
    ariaControls?: string;
}) => {
    const listRef = useRef<HTMLDivElement>(null);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const index = sections.findIndex((section) => section.key === value);
        const next = sections[(index + (event.key === 'ArrowRight' ? 1 : sections.length - 1)) % sections.length];
        if (!next) return;
        onChange(next.key);
        window.requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
    };

    return (
        <div
            ref={listRef}
            className="ofi-ptk-seg"
            role="tablist"
            aria-label={t('productionTasks.area.title')}
            onKeyDown={onKeyDown}
        >
            {sections.map((section) => {
                const selected = value === section.key;
                const label = sectionLabel(section);
                return (
                    <button
                        key={section.key}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-controls={ariaControls}
                        tabIndex={selected ? 0 : -1}
                        className={`ofi-ptk-seg__btn ${areaTone(section.key)} ofi-nosize`}
                        title={showShares ? t('productionTasks.area.shareHint', { area: label, share: formatPercent(section.share) }) : label}
                        onClick={() => onChange(section.key)}
                    >
                        <AreaIcon area={section.key} size={14} />
                        <span className="ofi-ptk-seg__label">{label}</span>
                        {showShares && <span className="ofi-ptk-seg__share">{formatPercent(section.share)}</span>}
                        {warnings?.[section.key] && <span className="ofi-ptk-seg__warn" aria-label={t('productionTasks.check.areaOpen')} />}
                    </button>
                );
            })}
        </div>
    );
};
