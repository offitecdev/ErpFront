import { ChevronDown } from '@/components/icons/antIconCompat';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { t } from '@/i18n/translate';
import type { ProductionItem, ProductionProject, ProductionSelection } from '@/types/production';
import '@/styles/modules/production.css';

/**
 * ── DIE ZUORDNUNG IM LAGER (19.09.2026) ─────────────────────────────────────
 * Wo die Produktion läuft, trägt jede Preisanfrage, Bestellung und jeder
 * Wareneingang EIN Projekt; Geräte und Leistungen sind freiwillig
 * (20.09.2026). Hier die zwei Teile, die Bestellmaske, Bestellseite und
 * Wareneingang gemeinsam haben: der Knopf mit der Zuordnung und die
 * Gerätewahl je Zeile.
 */

/** Was eine Lagerseite von ihrer Zuordnung weiss. */
export interface PurchaseProduction {
    selection: ProductionSelection;
    project: ProductionProject | null;
    items: ProductionItem[];
}

/** «PR-2026-10008 · Wärmepumpe Nord» — so trägt die Bestellung ihr Projekt. */
export const projectLabelOf = (project: Pick<ProductionProject, 'projectNumber' | 'projectName'>): string =>
    project.projectName && project.projectName !== project.projectNumber
        ? `${project.projectNumber} · ${project.projectName}`
        : project.projectNumber;

export const ProductionAssignButton = ({
    production,
    onClick,
    disabled = false,
}: {
    production: PurchaseProduction | null;
    onClick: () => void;
    disabled?: boolean;
}) => {
    const count = production?.selection.productionItemIds.length ?? 0;
    const label = production?.project
        ? [production.project.projectNumber, count ? t('production.picker.deviceCount', { count }) : ''].filter(Boolean).join(' · ')
        : t('production.assign.choose');
    return (
        <button
            type="button"
            className={`ofi-prod-assign ${production ? '' : 'is-unset'}`.trim()}
            onClick={onClick}
            disabled={disabled}
            title={production?.project ? projectLabelOf(production.project) : t('production.assign.hint')}
        >
            <i aria-hidden />
            <span>{label}</span>
            <ChevronDown aria-hidden />
        </button>
    );
};

/**
 * Die Gerätewahl einer Tabellenzeile. Die erste Zeile der Liste ist «zum
 * Projekt»: ohne Etikett zählt die Zeile beim Projekt selbst (Vorgabe Samet,
 * 20.09.2026) — sie ist auch die Voreinstellung.
 */
export const DeviceCellSelect = ({
    items,
    value,
    onChange,
    disabled = false,
}: {
    items: ProductionItem[];
    value: string | null | undefined;
    onChange: (itemId: string) => void;
    disabled?: boolean;
}) => (
    <SelectMenu
        value={value ?? ''}
        options={[
            { value: '', label: t('production.assign.toProject') },
            ...items.map((item) => ({
                value: item.id,
                label: item.name,
                ...(item.positionNumber ? { hint: item.positionNumber } : {}),
            })),
        ]}
        onChange={onChange}
        disabled={disabled}
        placeholder={t('production.assign.toProject')}
        ariaLabel={t('production.columns.device')}
        buttonClassName={`ofi-prod-cellselect ${value ? '' : 'is-empty'}`.trim()}
        listWidth={300}
    />
);

/**
 * Über der Gerätespalte: ein Gerät für die angekreuzten Zeilen — oder, ist
 * nichts angekreuzt, für alle Zeilen ohne Gerät.
 */
export const DeviceBulkSelect = ({
    items,
    onPick,
    selectedCount,
}: {
    items: ProductionItem[];
    onPick: (itemId: string) => void;
    selectedCount: number;
}) => (
    <SelectMenu
        value=""
        options={[
            ...items.map((item) => ({ value: item.id, label: item.name })),
            { value: '', label: t('production.assign.toProject') },
        ]}
        onChange={onPick}
        placeholder={selectedCount
            ? t('production.assign.bulkSelected', { count: selectedCount })
            : t('production.assign.bulkEmpty')}
        ariaLabel={t('production.columns.device')}
        buttonClassName="ofi-prod-bulkselect"
        listWidth={300}
    />
);
