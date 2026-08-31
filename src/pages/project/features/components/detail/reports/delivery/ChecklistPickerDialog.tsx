import { useMemo, useState } from 'react';

import { Check, Plus, SearchLg as Search } from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupDialog, PopupEmpty } from '@/components/ui-shared/PopupKit';
import type { ChecklistTemplateDto } from '@/lib/api/project';
import { t } from '@/i18n/translate';

/**
 * "Checkliste hinzufügen" — das Popup ÜBER der Checkliste (Benutzerwunsch:
 * kein zweiter Abschnitt mit einer Listen-Liste mehr im Rapport selbst).
 *
 * Es zeigt die gespeicherten Listen (Entwürfe eingeschlossen) mit Suchfeld;
 * ein Klick fügt die Liste dem Rapport hinzu und schliesst das Popup. Bereits
 * hinzugefügte Listen bleiben sichtbar, sind aber als solche markiert.
 */
export const ChecklistPickerDialog = ({
    open,
    templates,
    addedNames,
    onPick,
    onCreateNew,
    onClose,
}: {
    open: boolean;
    templates: ChecklistTemplateDto[];
    addedNames: Set<string>;
    onPick: (template: ChecklistTemplateDto) => void;
    /** Öffnet den leeren Listen-Editor (neue Liste von Hand). */
    onCreateNew: () => void;
    onClose: () => void;
}) => {
    const [query, setQuery] = useState('');

    const rows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return templates.filter((tpl) => !needle || tpl.name.toLowerCase().includes(needle));
    }, [templates, query]);

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            title={t('projects.delivery.addChecklist')}
            subtitle={t('projects.delivery.pickChecklistHint')}
            width={560}
            footer={(
                <PopupActions start={(
                    <PopupButton icon={<Plus size={15} />} onClick={onCreateNew}>
                        {t('projects.delivery.newChecklist')}
                    </PopupButton>
                )}>
                    <PopupButton onClick={onClose}>{t('common.close')}</PopupButton>
                </PopupActions>
            )}
        >
            <label className="ofi-tp-search">
                <Search size={16} />
                <input
                    autoFocus
                    className="ofi-cal-input"
                    value={query}
                    placeholder={t('projects.delivery.searchChecklist')}
                    onChange={(event) => setQuery(event.target.value)}
                />
            </label>

            <div className="ofi-tp-list ofi-tp-list--scroll mt-3">
                {rows.length === 0 && <PopupEmpty>{t('projects.delivery.noChecklists')}</PopupEmpty>}
                {rows.map((tpl) => {
                    const added = addedNames.has(tpl.name);
                    return (
                        <button
                            key={tpl.id}
                            type="button"
                            className={`ofi-tp-row is-clickable ${added ? 'is-selected' : ''}`}
                            onClick={() => { onPick(tpl); onClose(); }}
                        >
                            <span className="ofi-tp-icon">{added ? <Check size={15} /> : <Plus size={15} />}</span>
                            <span className="ofi-tp-row__main">
                                <span className="ofi-tp-row__title">{tpl.name}</span>
                                <span className="ofi-tp-row__meta">
                                    {t('settings.checklist.itemsCount', { count: Array.isArray(tpl.items) ? tpl.items.length : 0 })}
                                    {tpl.isActive === false ? ` · ${t('settings.checklist.draft')}` : ''}
                                    {added ? ` · ${t('projects.delivery.alreadyAdded')}` : ''}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </PopupDialog>
    );
};

export default ChecklistPickerDialog;
