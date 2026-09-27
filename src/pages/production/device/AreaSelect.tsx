import { t } from '@/i18n/translate';
import type { AreaShares, TaskArea } from '@/types/productionTasks';

import { AreaIcon } from '../tasks/AreaSwitch';
import { areaLabelKey, formatPercent, TASK_AREAS } from '../tasks/taskModel';

/**
 * ── MEKANİK / ELEKTRİK ALS AUFKLAPPMENÜ (27.09.2026, Vorgabe Samet) ─────────
 *
 * «Mekanik ve elektrikte şu kısımda dropdown, tek seçim, mac os olması lazım
 *  — ikisinden biri; ek satır yapma.»
 *
 * Ein kleiner Mac-Knopf in der einen Kopfzeile der Geräteseite. Es ist ein
 * gewöhnliches <select>: in der Produktion öffnet es das gemeinsame
 * macOS-Menü (components/ui-shared/GlobalMacSelectMenu — Häkchen, blaue
 * Zeile), wie jedes Aufklappmenü des Moduls. Links im Knopf das Zeichen des
 * gewählten Weges, im Menü der Anteil an der Gesamtfertigstellung.
 */
export const AreaSelect = ({
    value,
    onChange,
    shares,
}: {
    value: TaskArea;
    onChange: (area: TaskArea) => void;
    shares?: AreaShares | null;
}) => (
    <span className={`ofi-pdev-area is-${value === 'ELECTRICAL' ? 'electrical' : 'mechanical'}`}>
        <span className="ofi-pdev-area__icon" aria-hidden>
            <AreaIcon area={value} size={12} />
        </span>
        <select
            className="ofi-pdev-area__select"
            value={value}
            aria-label={t('productionTasks.area.title')}
            title={t('productionTasks.area.title')}
            onChange={(event) => onChange(event.target.value === 'ELECTRICAL' ? 'ELECTRICAL' : 'MECHANICAL')}
        >
            {TASK_AREAS.map((area) => (
                <option key={area} value={area}>
                    {shares ? `${t(areaLabelKey(area))} · ${formatPercent(shares[area])}` : t(areaLabelKey(area))}
                </option>
            ))}
        </select>
    </span>
);
