import { useTranslation } from 'react-i18next';

import { ChevronDown, ChevronUp } from '@/components/icons/antIconCompat';
import { PopupActions, PopupDialog } from '@/components/ui-shared/PopupKit';

import {
    MAX_OVERVIEW_TILES,
    MIN_OVERVIEW_TILES,
    OVERVIEW_TILE_KEYS,
    type OverviewTileKey,
    type OverviewTileSpec,
} from './overviewTiles';

/**
 * «Karten anpassen» — the sheet behind the Anpassen button of the overview.
 * A Mac sheet (PopupDialog wears the window skin, [[apple-modal-skin]]):
 * three groups of rows, a checkbox in front of each, and the chosen rows
 * carry their position with a pair of arrows. Changes apply at once — the
 * tiles behind the scrim rearrange while one picks — «Fertig» only closes.
 */
export const OverviewTilesDialog = ({ open, onClose, specs, tiles, onChange, onReset, isDefault }: {
    open: boolean;
    onClose: () => void;
    specs: Record<OverviewTileKey, OverviewTileSpec>;
    tiles: OverviewTileKey[];
    onChange: (next: OverviewTileKey[]) => void;
    onReset: () => void;
    isDefault: boolean;
}) => {
    const { t } = useTranslation();
    const full = tiles.length >= MAX_OVERVIEW_TILES;

    const toggle = (key: OverviewTileKey) => {
        if (tiles.includes(key)) {
            if (tiles.length <= MIN_OVERVIEW_TILES) return;
            onChange(tiles.filter((item) => item !== key));
        } else if (!full) {
            onChange([...tiles, key]);
        }
    };
    const move = (key: OverviewTileKey, delta: -1 | 1) => {
        const index = tiles.indexOf(key);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= tiles.length) return;
        const next = [...tiles];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    const groups: Array<{ key: OverviewTileSpec['group']; label: string }> = [
        { key: 'counts', label: t('dash.customize.groupCounts', { defaultValue: 'Bestände' }) },
        { key: 'money', label: t('dash.customize.groupMoney', { defaultValue: 'Beträge' }) },
        { key: 'rates', label: t('dash.customize.groupRates', { defaultValue: 'Quoten' }) },
    ];

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            width={520}
            title={t('dash.customize.title', { defaultValue: 'Karten anpassen' })}
            subtitle={t('dash.customize.subtitle', { defaultValue: 'Bis zu {{max}} Karten, in der Reihenfolge, in der sie stehen sollen.', max: MAX_OVERVIEW_TILES })}
            bodyClassName="ofi-home-pick"
            footer={(
                <PopupActions
                    start={(
                        <span className={`ofi-home-pick__count ${full ? 'is-full' : ''}`}>
                            {t('dash.customize.count', { defaultValue: '{{count}} von {{max}} gewählt', count: tiles.length, max: MAX_OVERVIEW_TILES })}
                        </span>
                    )}
                >
                    <button type="button" className="ofi-cal-btn" onClick={onReset} disabled={isDefault}>
                        {t('dash.customize.reset', { defaultValue: 'Standard' })}
                    </button>
                    <button type="button" className="ofi-cal-btn is-primary" onClick={onClose}>
                        {t('common.done', { defaultValue: 'Fertig' })}
                    </button>
                </PopupActions>
            )}
        >
            {groups.map((group) => {
                const rows = OVERVIEW_TILE_KEYS.map((key) => specs[key]).filter((spec) => spec.group === group.key);
                if (rows.length === 0) return null;
                return (
                    <section key={group.key} className="ofi-home-pick__group">
                        <h3 className="ofi-home-pick__caption">{group.label}</h3>
                        <ul className="ofi-home-pick__list">
                            {rows.map((spec) => {
                                const index = tiles.indexOf(spec.key);
                                const on = index >= 0;
                                const blocked = !on && full;
                                const last = on && tiles.length <= MIN_OVERVIEW_TILES;
                                return (
                                    <li key={spec.key} className={`ofi-home-pick__row ${on ? 'is-on' : ''} ${blocked ? 'is-blocked' : ''}`}>
                                        <button
                                            type="button"
                                            role="checkbox"
                                            aria-checked={on}
                                            disabled={blocked || last}
                                            className="ofi-home-pick__toggle"
                                            onClick={() => toggle(spec.key)}
                                        >
                                            <span className={`ofi-cal-check ${on ? 'is-on' : ''}`}>
                                                {on && <span className="ofi-cal-check__mark" />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="ofi-home-pick__label">{spec.label}</span>
                                                <span className="ofi-home-pick__hint">{spec.hint}</span>
                                            </span>
                                            <span className="ofi-home-pick__value">{spec.value}</span>
                                        </button>
                                        {on && (
                                            <span className="ofi-home-pick__order">
                                                <span className="ofi-home-pick__pos">{index + 1}</span>
                                                <button
                                                    type="button"
                                                    className="ofi-home-pick__move"
                                                    aria-label={t('dash.customize.moveUp', { defaultValue: 'Nach oben' })}
                                                    disabled={index === 0}
                                                    onClick={() => move(spec.key, -1)}
                                                >
                                                    <ChevronUp size={13} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="ofi-home-pick__move"
                                                    aria-label={t('dash.customize.moveDown', { defaultValue: 'Nach unten' })}
                                                    disabled={index === tiles.length - 1}
                                                    onClick={() => move(spec.key, 1)}
                                                >
                                                    <ChevronDown size={13} />
                                                </button>
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}
        </PopupDialog>
    );
};
