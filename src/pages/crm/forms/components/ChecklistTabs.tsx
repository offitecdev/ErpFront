import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuLayoutTemplate, LuListChecks } from 'react-icons/lu';
import { t } from '@/i18n/translate';
import { CHECKLIST_PATHS, type ChecklistTabKey } from '../routes';
import '@/styles/modules/checklists.css';

/**
 * Der Reiterstreifen des Checklisten-Bereichs — seit dem 02.09.2026 ein
 * SEGMENTWÄHLER im Apple-Kleid (graue Schiene, das Gewählte als weisse
 * Pille) statt der Karteireiter der übrigen CRM-Seiten. Das ist Absicht und
 * die Vorgabe: dieser Bereich soll modern aussehen; der Wähler ist dasselbe
 * Bauteil, das auch in den Checklisten selbst eine Auswahl trägt
 * (`.ofi-chk-seg`, index.css «CHECKLISTEN IM APPLE-KLEID»).
 *
 * Der Bereich hat genau ZWEI Seiten: die ausgefüllten Checklisten
 * (/crm/forms) und die Vorlagen (/crm/forms/templates). Der Vorlagen-Editor
 * ist eine Unterseite der Vorlagen und zeigt darum denselben Abschnitt aktiv.
 *
 * `onLeave` darf einen Wechsel abfangen (der Editor fragt bei ungesicherten
 * Änderungen nach): `false` bricht die Navigation ab.
 */
type TabIcon = ComponentType<{ size?: number; className?: string }>;

interface ChecklistTab {
    key: ChecklistTabKey;
    labelKey: string;
    Icon: TabIcon;
}

const TABS: readonly ChecklistTab[] = [
    { key: 'checklists', labelKey: 'forms.tabs.checklists', Icon: LuListChecks },
    { key: 'templates', labelKey: 'forms.tabs.templates', Icon: LuLayoutTemplate },
];

export const ChecklistTabs = ({
    active,
    onLeave,
}: {
    active: ChecklistTabKey;
    onLeave?: (path: string) => boolean;
}) => {
    const navigate = useNavigate();

    const go = (key: ChecklistTabKey) => {
        if (key === active) return;
        const path = CHECKLIST_PATHS[key];
        if (onLeave && !onLeave(path)) return;
        navigate(path);
    };

    return (
        <nav aria-label={t('forms.tabs.aria')} className="ofi-chk">
            <div className="ofi-chk-seg ofi-chk-seg--tabs" role="tablist">
                {TABS.map(({ key, labelKey, Icon }) => {
                    const isActive = key === active;
                    return (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => go(key)}
                            className={`ofi-chk-seg__item ${isActive ? 'is-on' : ''}`}
                        >
                            <Icon size={14} />
                            <span>{t(labelKey)}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};
