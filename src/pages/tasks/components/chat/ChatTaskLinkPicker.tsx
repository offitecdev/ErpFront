import { useEffect, useMemo, useState } from 'react';
import { LuCheck } from 'react-icons/lu';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';
import type { ChatRoomTask } from '@/types/tasksModule';
import { useChatTaskSearch } from '../../hooks/useChatTaskSearch';
import { statusTone } from '../../utils/taskFormat';

/**
 * «Görev bağla» (Leitung): hängt am Knopf, sucht über `tasksApi.search`.
 * Verknüpfte Aufgaben stehen oben und tragen den Haken; ein Klick verknüpft
 * bzw. löst — das Fenster bleibt offen.
 */
export const ChatTaskLinkPicker = ({
    anchorEl,
    onClose,
    linked,
    busy,
    onToggle,
}: {
    anchorEl: HTMLElement | null;
    onClose: () => void;
    linked: ChatRoomTask[];
    busy: boolean;
    onToggle: (taskId: string, link: boolean) => void;
}) => {
    const [query, setQuery] = useState('');
    const open = Boolean(anchorEl);
    const { hits, loading } = useChatTaskSearch(query, open);

    useEffect(() => { if (!open) setQuery(''); }, [open]);

    const rows = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        const linkedIds = new Set(linked.map((task) => task.id));
        const linkedRows = linked
            .filter((task) => !needle || task.title.toLocaleLowerCase().includes(needle))
            .map((task) => ({ id: task.id, title: task.title, status: task.status, linked: true }));
        const hitRows = hits
            .filter((hit) => !linkedIds.has(hit.id))
            .map((hit) => ({ id: hit.id, title: hit.title, status: hit.status, linked: false }));
        return [...linkedRows, ...hitRows];
    }, [linked, hits, query]);

    return (
        <AnchoredPicker anchorEl={anchorEl} onClose={onClose} width={320} maxHeight={380} panelClassName="ofi-gv-picker">
            <div className="ofi-gv-picker__search">
                <input
                    autoFocus
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('tasksModule.chat.link.search')}
                    aria-label={t('tasksModule.chat.link.search')}
                    className="ofi-cal-input w-full"
                />
            </div>
            <div className="ofi-gv-picker__list" role="listbox" aria-multiselectable>
                {!rows.length && (
                    <div className="ofi-gv-picker__hint px-2 py-3">
                        {loading ? t('common.loading') : t('tasksModule.chat.link.empty')}
                    </div>
                )}
                {rows.map((row) => (
                    <button
                        key={row.id}
                        type="button"
                        role="option"
                        aria-selected={row.linked}
                        disabled={busy}
                        className={`ofi-option-row ofi-gv-picker__row ${row.linked ? 'is-active' : ''}`}
                        onClick={() => onToggle(row.id, !row.linked)}
                    >
                        <i className={`ofi-gv-chat-dot is-${statusTone(row.status)}`} aria-hidden />
                        <span className="ofi-gv-picker__name" title={row.title}>{row.title}</span>
                        {row.linked && <LuCheck size={14} aria-hidden />}
                    </button>
                ))}
            </div>
        </AnchoredPicker>
    );
};
