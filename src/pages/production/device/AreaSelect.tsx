import { t } from '@/i18n/translate';
import type { TaskArea, TaskSection } from '@/types/productionTasks';

import { AreaIcon } from '../tasks/AreaSwitch';
import { areaTone, formatPercent, sectionLabel } from '../tasks/taskModel';

/**
 * ── DER WEG ALS AUFKLAPPMENÜ (27.09.2026, Vorgabe Samet) ────────────────────
 *
 * «Mekanik ve elektrikte şu kısımda dropdown, tek seçim, mac os olması lazım
 *  — ikisinden biri; ek satır yapma.»
 *
 * Ein kleiner Mac-Knopf in der einen Kopfzeile der Geräteseite. Es ist ein
 * gewöhnliches <select>: in der Produktion öffnet es das gemeinsame
 * macOS-Menü (components/ui-shared/GlobalMacSelectMenu — Häkchen, blaue
 * Zeile), wie jedes Aufklappmenü des Moduls. Links im Knopf das Zeichen des
 * gewählten Weges, im Menü der Anteil an der Gesamtfertigstellung. Seit dem
 * 28.09.2026 stehen darin die Bereiche der geladenen Vorlage.
 */
export const AreaSelect = ({
    sections,
    value,
    onChange,
    showShares,
}: {
    sections: readonly TaskSection[];
    value: TaskArea;
    onChange: (area: TaskArea) => void;
    showShares: boolean;
}) => (
    <span className={`ofi-pdev-area ${areaTone(value)}`}>
        <span className="ofi-pdev-area__icon" aria-hidden>
            <AreaIcon area={value} size={12} />
        </span>
        <select
            className="ofi-pdev-area__select"
            value={value}
            aria-label={t('productionTasks.area.title')}
            title={t('productionTasks.area.title')}
            onChange={(event) => onChange(event.target.value)}
        >
            {sections.map((section) => (
                <option key={section.key} value={section.key}>
                    {showShares ? `${sectionLabel(section)} · ${formatPercent(section.share)}` : sectionLabel(section)}
                </option>
            ))}
        </select>
    </span>
);
