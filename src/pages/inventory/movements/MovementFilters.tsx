import { useRef, useState } from 'react';

import { t } from '@/i18n/translate';
import type { MovementOrigin } from '@/types/inventory';
import { PickerPanel, PickerRow, TokenField } from '@/pages/warehouse/components/pickerParts';
import type { QuickRange } from '../hooks/useMovementsList';
import { DIRECTION_LABEL, ORIGIN_LABEL, type MovementDirection, type MovementFilterValue } from './movementLabels';

/**
 * ── DIE ZWEI GLÄSERNEN FILTER DER LAGERBEWEGUNGEN (29.09.2026) ─────────────
 *
 * Vorgabe Samet: «çok filtre var, filtreleri çok azalt, sadece gerekli
 * olanları … depoda kullandığımız çoklu seçim gibi glass bir seçim olsun».
 * Statt zwei Segmentreihen (Typ, Herkunft), zwei Kalenderfeldern, fünf
 * Schnellwahl-Knöpfen und einer Spaltenwahl stehen neben der Suche nur noch
 * ZWEI Token-Felder des Depo (`pickerParts`): «Hareket» (Richtung und
 * Herkunft, mehrfach) und «Dönem» (einfach).
 */

const ORIGINS = Object.keys(ORIGIN_LABEL) as MovementOrigin[];

/** «Hareket»: Richtung und Herkunft in EINER Auswahl, zwei Abschnitte. */
export const MovementTypeFilter = ({ value, onChange }: {
    value: MovementFilterValue;
    onChange: (next: MovementFilterValue) => void;
}) => {
    const fieldRef = useRef<HTMLDivElement>(null);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const close = () => setAnchor(null);

    const tokens = [
        ...value.directions.map((direction) => ({ key: `d:${direction}`, label: t(DIRECTION_LABEL[direction]) })),
        ...value.origins.map((origin) => ({ key: `o:${origin}`, label: t(ORIGIN_LABEL[origin]) })),
    ];
    const remove = (key: string) => onChange({
        directions: value.directions.filter((direction) => `d:${direction}` !== key),
        origins: value.origins.filter((origin) => `o:${origin}` !== key),
    });
    const toggleDirection = (direction: MovementDirection) => onChange({
        ...value,
        directions: value.directions.includes(direction)
            ? value.directions.filter((entry) => entry !== direction)
            : [...value.directions, direction],
    });
    const toggleOrigin = (origin: MovementOrigin) => onChange({
        ...value,
        origins: value.origins.includes(origin)
            ? value.origins.filter((entry) => entry !== origin)
            : [...value.origins, origin],
    });

    return (
        <>
            <TokenField
                ref={fieldRef}
                open={Boolean(anchor)}
                size="toolbar"
                label={t('inv.movements.filterLabel')}
                placeholder={t('inv.movements.allTypes')}
                tokens={tokens}
                maxVisible={3}
                onOpen={() => setAnchor(fieldRef.current)}
                onRemove={remove}
                ariaLabel={t('inv.movements.filterLabel')}
            />
            <PickerPanel
                anchorEl={anchor}
                onClose={close}
                width={280}
                ariaLabel={t('inv.movements.filterLabel')}
                footer={(
                    <div className="ofi-mac-selection__footer">
                        <button
                            type="button"
                            disabled={!tokens.length}
                            onClick={() => onChange({ directions: [], origins: [] })}
                        >
                            {t('inv.movements.reset')}
                        </button>
                        <button type="button" onClick={close}>{t('common.done')}</button>
                    </div>
                )}
            >
                <div className="ofi-wh-picker__section" role="group" aria-label={t('inv.movements.directionLabel')}>
                    <div className="ofi-wh-picker__caption">{t('inv.movements.directionLabel')}</div>
                    {(['IN', 'OUT'] as MovementDirection[]).map((direction) => (
                        <PickerRow
                            key={direction}
                            selected={value.directions.includes(direction)}
                            onSelect={() => toggleDirection(direction)}
                            main={(
                                <span className="ofi-smv-pickdir">
                                    <i className={`ofi-smv-dot is-${direction === 'IN' ? 'in' : 'out'}`} aria-hidden />
                                    {t(DIRECTION_LABEL[direction])}
                                </span>
                            )}
                        />
                    ))}
                </div>
                <div className="ofi-wh-picker__section" role="group" aria-label={t('inv.movements.originLabel')}>
                    <div className="ofi-wh-picker__caption">{t('inv.movements.originLabel')}</div>
                    {ORIGINS.map((origin) => (
                        <PickerRow
                            key={origin}
                            selected={value.origins.includes(origin)}
                            onSelect={() => toggleOrigin(origin)}
                            main={t(ORIGIN_LABEL[origin])}
                        />
                    ))}
                </div>
            </PickerPanel>
        </>
    );
};

/** Der Zeitraum: eine Schnellwahl oder «Özel aralık» (dann stehen zwei Kalenderfelder daneben). */
export type PeriodKey = QuickRange | 'custom';

const PERIODS: Array<{ key: PeriodKey; labelKey: string }> = [
    { key: 'all', labelKey: 'inv.movements.quickAll' },
    { key: 'today', labelKey: 'inv.movements.quickToday' },
    { key: 'week', labelKey: 'inv.movements.quickWeek' },
    { key: 'month', labelKey: 'inv.movements.quickMonth' },
    { key: 'lastMonth', labelKey: 'inv.movements.quickLastMonth' },
    { key: 'year', labelKey: 'inv.movements.quickYear' },
    { key: 'custom', labelKey: 'inv.movements.customRange' },
];

export const PeriodFilter = ({ value, onChange }: {
    value: PeriodKey;
    onChange: (next: PeriodKey) => void;
}) => {
    const fieldRef = useRef<HTMLDivElement>(null);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const chosen = PERIODS.find((period) => period.key === value);
    const tokens = value !== 'all' && chosen ? [{ key: value, label: t(chosen.labelKey) }] : [];

    return (
        <>
            <TokenField
                ref={fieldRef}
                open={Boolean(anchor)}
                size="toolbar"
                single
                label={t('inv.movements.rangeLabel')}
                placeholder={t('inv.movements.quickAll')}
                tokens={tokens}
                onOpen={() => setAnchor(fieldRef.current)}
                onRemove={() => onChange('all')}
                ariaLabel={t('inv.movements.rangeLabel')}
            />
            <PickerPanel
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                width={240}
                ariaLabel={t('inv.movements.rangeLabel')}
            >
                {PERIODS.map((period) => (
                    <PickerRow
                        key={period.key}
                        selected={value === period.key}
                        onSelect={() => { onChange(period.key); setAnchor(null); }}
                        main={t(period.labelKey)}
                    />
                ))}
            </PickerPanel>
        </>
    );
};
