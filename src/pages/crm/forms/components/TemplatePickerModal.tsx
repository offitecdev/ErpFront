import { useEffect, useMemo, useState } from 'react';
import { LuChevronRight, LuLayoutTemplate, LuListChecks, LuSearch } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { PopupDialog, PopupEmpty } from '@/components/ui-shared/PopupKit';
import { formsApi, type FormTemplateDto } from '@/lib/api/forms';
import '@/styles/modules/checklists.css';

/**
 * Vorlage wählen — der erste Schritt einer neuen Checkliste. Seit dem
 * 02.09.2026 ein Fenster des App-Bausatzes (PopupDialog) im Apple-Kleid:
 * Suchfeld als Pille, darunter die Vorlagen als Zeilen einer weissen Gruppe
 * (Symbol im Kreis, Name, Felderzahl, Winkelchen). Nur AKTIVE Vorlagen; ein
 * Klick übernimmt und schliesst.
 */
export const TemplatePickerModal = ({
    open,
    onClose,
    onSelect,
    z = 750,
}: {
    open: boolean;
    onClose: () => void;
    onSelect: (template: FormTemplateDto) => void;
    z?: number;
}) => {
    // null = noch nicht geladen. Bei jedem Öffnen frisch — Zustand beim
    // RENDERN zurücksetzen (Prop-Wechsel), der Effekt lädt nur.
    const [templates, setTemplates] = useState<FormTemplateDto[] | null>(null);
    const [search, setSearch] = useState('');
    const [seenOpen, setSeenOpen] = useState(open);
    if (seenOpen !== open) {
        setSeenOpen(open);
        setSearch('');
        setTemplates(null);
    }

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        formsApi.listTemplates({ active: true })
            .then((rows) => { if (!cancelled) setTemplates(rows); })
            .catch(() => { if (!cancelled) setTemplates([]); });
        return () => { cancelled = true; };
    }, [open]);

    const loading = templates === null;
    const filtered = useMemo(() => {
        const rows = templates ?? [];
        const query = search.trim().toLowerCase();
        if (!query) return rows;
        return rows.filter((template) => `${template.name} ${template.category || ''} ${template.description || ''}`.toLowerCase().includes(query));
    }, [templates, search]);

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            title={t('forms.picker.title')}
            subtitle={t('forms.picker.subtitle')}
            icon={<LuLayoutTemplate size={18} />}
            width={560}
            z={z}
            bodyClassName="ofi-chk ofi-chk-dialog"
        >
            <div className="ofi-chk-searchbar">
                <LuSearch size={15} aria-hidden />
                <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('forms.picker.search')}
                    className="ofi-chk-searchbar__input"
                />
            </div>

            <div className="ofi-chk-card ofi-chk-list">
                {loading ? (
                    <PopupEmpty>{t('common.loading')}</PopupEmpty>
                ) : filtered.length === 0 ? (
                    <PopupEmpty>{t('forms.picker.empty')}</PopupEmpty>
                ) : filtered.map((template) => (
                    <button
                        key={template.id}
                        type="button"
                        className="ofi-option-row ofi-chk-pick"
                        onClick={() => { onSelect(template); onClose(); }}
                    >
                        <span className="ofi-chk-pick__icon"><LuListChecks size={16} /></span>
                        <span className="min-w-0 flex-1">
                            <span className="ofi-chk-pick__title">{template.name}</span>
                            <span className="ofi-chk-pick__meta">
                                {[template.category, t('forms.picker.fieldCount', { count: template.fieldCount ?? template.fields?.length ?? 0 })].filter(Boolean).join(' · ')}
                            </span>
                        </span>
                        <LuChevronRight size={15} className="ofi-chk-pick__caret" />
                    </button>
                ))}
            </div>
        </PopupDialog>
    );
};
