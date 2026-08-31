import { useEffect, useMemo, useState } from 'react';
import { LuListChecks } from 'react-icons/lu';
import { ChevronRight } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { CenterModal } from '@/pages/calendar/components/shells';
import { SearchBox } from '@/components/ui-shared/TableKit';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { formsApi, type FormTemplateDto } from '@/lib/api/forms';

/**
 * Vorlage wählen — Fenster mit Suchfeld und Trefferliste (Muster der
 * Kundenauswahl). Nur AKTIVE Vorlagen; ein Klick auf die Zeile übernimmt.
 */
const ROW_CLASS = 'ofi-option-row group flex w-full cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition-colors last:border-b-0 dark:border-white/10';

export const TemplatePickerModal = ({
    open,
    onClose,
    onSelect,
    z = 150,
}: {
    open: boolean;
    onClose: () => void;
    onSelect: (template: FormTemplateDto) => void;
    z?: number;
}) => {
    // null = noch nicht geladen (Ladeanzeige). Bei jedem Öffnen frisch: der
    // Zustand wird BEIM RENDERN zurückgesetzt (Prop-Wechsel), der Effekt lädt nur.
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
        <CenterModal open={open} onClose={onClose} title={t('forms.picker.title')} subtitle={t('forms.picker.subtitle')} width={640} z={z} compact>
            <div className="p-4">
                <SearchBox value={search} onChange={setSearch} placeholder={t('forms.picker.search')} autoFocus className="mb-3" />
                <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
                    {loading ? (
                        <div className="p-6"><InlineLoading /></div>
                    ) : filtered.length === 0 ? (
                        <div className="px-4 py-10 text-center text-[13px] text-slate-400">{t('forms.picker.empty')}</div>
                    ) : filtered.map((template) => (
                        <button key={template.id} type="button" className={ROW_CLASS} onClick={() => { onSelect(template); onClose(); }}>
                            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#eef2fb] text-[#1f2654] group-hover:bg-white/15 group-hover:!text-white dark:bg-white/10 dark:text-white">
                                <LuListChecks size={16} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold text-slate-800 group-hover:!text-white dark:text-white">{template.name}</span>
                                <span className="block truncate text-[11.5px] text-slate-400 group-hover:!text-white/80">
                                    {[template.category, t('forms.templates.fieldCount', { count: template.fieldCount ?? template.fields?.length ?? 0 })].filter(Boolean).join(' · ')}
                                </span>
                            </span>
                            <ChevronRight size={15} className="shrink-0 text-slate-300 group-hover:!text-white" />
                        </button>
                    ))}
                </div>
            </div>
        </CenterModal>
    );
};
