import { Fragment, memo, useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { LuCircleCheck, LuEllipsis, LuEraser, LuTrash2 } from 'react-icons/lu';

import { DangerConfirmDialog } from '@/components/ui-shared/DangerConfirmDialog';
import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { Checklist } from '@/types/tasksModule';
import { PopoverMenu, type MenuEntry } from '../detail/PopoverMenu';
import { placeCaret } from '../editor/editorDom';
import { ProgressBar } from '../shared/TaskMarks';
import { TaskIconButton } from '../shared/TaskButton';
import { useChecklistEnv } from './checklistEnv';
import { ChecklistItemRow } from './ChecklistItemRow';
import { NewItemInput } from './NewItemInput';

/**
 * Eine Checkliste (Görevly `cl-group`): Titel zum Überschreiben, Stand
 * «erledigt/gesamt» mit Balken, ⋯ (Tümünü işaretle · Tamamlananları temizle ·
 * Listeyi sil), darunter die Punkte und «Madde ekle».
 */
export const ChecklistGroup = memo(({ checklist, autoFocusNew = false }: { checklist: Checklist; autoFocusNew?: boolean }) => {
    const env = useChecklistEnv();
    const groupRef = useRef<HTMLDivElement | null>(null);
    const titleRef = useRef<HTMLDivElement | null>(null);
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [draftAfter, setDraftAfter] = useState<string | null>(null);

    // Kein Vorgabetitel (Samet 13.09.2026): leer bleibt leer, «Başlık» steht nur blass als Platzhalter.
    const titlePlaceholder = t('tasksModule.checklist.titlePlaceholder');
    const done = checklist.items.filter((item) => item.done).length;
    const total = checklist.items.length;

    useLayoutEffect(() => {
        const element = titleRef.current;
        if (element && document.activeElement !== element) element.textContent = checklist.title;
    }, [checklist.title, env.editable]);

    const rename = async () => {
        const element = titleRef.current;
        if (!element) return;
        const next = (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
        element.textContent = next;
        if (next === checklist.title) return;
        const previous = checklist.title;
        env.renameChecklistLocal(checklist.id, next);
        try {
            await tasksApi.renameChecklist(checklist.id, next);
        } catch (error) {
            env.renameChecklistLocal(checklist.id, previous);
            toast.error(tasksErrorMessage(error));
        }
    };

    const onTitleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.currentTarget.textContent = checklist.title;
            event.currentTarget.blur();
        }
    };

    const bulk = async (action: 'checkAll' | 'clearDone') => {
        try {
            const result = action === 'checkAll' ? await tasksApi.checkAll(checklist.id) : await tasksApi.clearDone(checklist.id);
            env.replaceChecklist(result.checklist);
            env.setProgress(result.progress);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        }
    };

    const focusItem = useCallback((itemId: string) => {
        const element = groupRef.current?.querySelector<HTMLElement>(`[data-item-text="${CSS.escape(itemId)}"]`);
        if (element) placeCaret(element, 'end');
    }, []);

    const openDraft = useCallback((itemId: string) => setDraftAfter(itemId), []);

    const entries: MenuEntry[] = [
        { key: 'check-all', label: t('tasksModule.checklist.checkAll'), icon: <LuCircleCheck size={15} />, disabled: done === total, onSelect: () => void bulk('checkAll') },
        { key: 'clear-done', label: t('tasksModule.checklist.clearDone'), icon: <LuEraser size={15} />, disabled: done === 0, onSelect: () => void bulk('clearDone') },
        { kind: 'separator', key: 'sep' },
        { key: 'delete', label: t('tasksModule.checklist.deleteList'), icon: <LuTrash2 size={15} />, danger: true, onSelect: () => setConfirmDelete(true) },
    ];

    return (
        <div ref={groupRef} className="ofi-gv-checklist">
            <div className="ofi-gv-checklist__head">
                {env.editable ? (
                    <div
                        ref={titleRef}
                        className="ofi-gv-checklist__title is-editable"
                        contentEditable
                        suppressContentEditableWarning
                        role="textbox"
                        aria-label={t('tasksModule.checklist.titleLabel')}
                        data-placeholder={titlePlaceholder}
                        spellCheck
                        onBlur={() => void rename()}
                        onKeyDown={onTitleKeyDown}
                        onPaste={(event) => {
                            event.preventDefault();
                            document.execCommand('insertText', false, event.clipboardData.getData('text/plain').replace(/\s+/g, ' '));
                        }}
                    />
                ) : (
                    <div className="ofi-gv-checklist__title" data-placeholder={titlePlaceholder}>{checklist.title}</div>
                )}
                <span className="ofi-gv-checklist__count">{t('tasksModule.checklist.progress', { done, total })}</span>
                <ProgressBar done={done} total={total} className="ofi-gv-checklist__bar" />
                {env.editable && (
                    <TaskIconButton
                        small
                        label={t('tasksModule.checklist.listMenu')}
                        active={Boolean(menuAnchor)}
                        onClick={(event) => setMenuAnchor(menuAnchor ? null : event.currentTarget)}
                    >
                        <LuEllipsis size={14} />
                    </TaskIconButton>
                )}
            </div>

            <div className="ofi-gv-checklist__items">
                {checklist.items.map((item, index) => (
                    <Fragment key={item.id}>
                        <ChecklistItemRow
                            item={item}
                            checklistId={checklist.id}
                            previousId={checklist.items[index - 1]?.id ?? null}
                            nextId={checklist.items[index + 1]?.id ?? null}
                            onEnter={openDraft}
                            onFocusItem={focusItem}
                        />
                        {env.editable && draftAfter === item.id && (
                            <NewItemInput
                                checklistId={checklist.id}
                                afterItemId={item.id}
                                autoFocus
                                inline
                                onAdded={(added) => setDraftAfter(added.id)}
                                onCancel={() => setDraftAfter((current) => (current === item.id ? null : current))}
                            />
                        )}
                    </Fragment>
                ))}
                {!checklist.items.length && !env.editable && (
                    <div className="ofi-gv-checklist__empty">{t('tasksModule.checklist.empty')}</div>
                )}
            </div>

            {env.editable && <NewItemInput checklistId={checklist.id} afterItemId={null} autoFocus={autoFocusNew} />}

            <PopoverMenu
                anchorEl={menuAnchor}
                onClose={() => setMenuAnchor(null)}
                entries={entries}
                width={230}
                label={t('tasksModule.checklist.listMenu')}
            />
            <DangerConfirmDialog
                open={confirmDelete}
                title={t('tasksModule.checklist.deleteListTitle')}
                message={t('tasksModule.checklist.deleteListMessage', { title: checklist.title })}
                confirmLabel={t('tasksModule.checklist.deleteList')}
                requirePassword={false}
                busy={deleting}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => {
                    setDeleting(true);
                    void env.deleteChecklist(checklist.id).then((ok) => {
                        setDeleting(false);
                        if (ok) setConfirmDelete(false);
                    });
                }}
            />
        </div>
    );
});

ChecklistGroup.displayName = 'ChecklistGroup';
