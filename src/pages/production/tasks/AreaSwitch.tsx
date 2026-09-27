import { useRef, type KeyboardEvent } from 'react';
import { Cog, Zap } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { AreaShares, TaskArea } from '@/types/productionTasks';

import { areaLabelKey, formatPercent, TASK_AREAS } from './taskModel';

/** Das Zeichen des Bereichs: Zahnrad für die Mekanik, Blitz für die Elektrik. */
export const AreaIcon = ({ area, size = 14 }: { area: TaskArea; size?: number }) =>
    area === 'ELECTRICAL'
        ? <Zap size={size} strokeWidth={2} aria-hidden />
        : <Cog size={size} strokeWidth={2} aria-hidden />;

/**
 * ── MEKANİK | ELEKTRİK (26.09.2026, Vorgabe Samet) ─────────────────────────
 *
 * «Üretimde Mekanik ve Elektrik diye seçim olmalı … üretim bölümlere
 *  ayrılıyor.» Ein macOS-Segmentschalter: flache graue Rinne, der gewählte
 * Bereich als weisses Segment. Neben dem Namen auf Wunsch der Anteil an der
 * Gesamtfertigstellung (Chiller: %60 / %40) und ein oranger Punkt, wenn die
 * Gewichte des Bereichs noch nicht aufgehen. Pfeiltasten wechseln.
 */
export const AreaSwitch = ({
    value,
    onChange,
    shares,
    warnings,
    ariaControls,
}: {
    value: TaskArea;
    onChange: (area: TaskArea) => void;
    shares?: AreaShares | null;
    warnings?: Partial<Record<TaskArea, boolean>>;
    ariaControls?: string;
}) => {
    const listRef = useRef<HTMLDivElement>(null);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const index = TASK_AREAS.indexOf(value);
        const next = TASK_AREAS[(index + (event.key === 'ArrowRight' ? 1 : TASK_AREAS.length - 1)) % TASK_AREAS.length];
        onChange(next);
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
            {TASK_AREAS.map((area) => {
                const selected = value === area;
                const label = t(areaLabelKey(area));
                return (
                    <button
                        key={area}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-controls={ariaControls}
                        tabIndex={selected ? 0 : -1}
                        className="ofi-ptk-seg__btn ofi-nosize"
                        title={shares ? t('productionTasks.area.shareHint', { area: label, share: formatPercent(shares[area]) }) : label}
                        onClick={() => onChange(area)}
                    >
                        <AreaIcon area={area} size={14} />
                        <span>{label}</span>
                        {shares && <span className="ofi-ptk-seg__share">{formatPercent(shares[area])}</span>}
                        {warnings?.[area] && <span className="ofi-ptk-seg__warn" aria-label={t('productionTasks.check.areaOpen')} />}
                    </button>
                );
            })}
        </div>
    );
};
