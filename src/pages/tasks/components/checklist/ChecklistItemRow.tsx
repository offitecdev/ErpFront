import { memo, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { LuBell, LuCheck, LuFlag } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage, type ChecklistItemInput } from '@/lib/api/tasksModule';
import type { ChecklistItem } from '@/types/tasksModule';
import { useNow } from '../../hooks/useNow';
import { personName, smartDate } from '../../utils/taskFormat';
import { useChecklistEnv } from './checklistEnv';
import { ChecklistItemTools } from './ChecklistItemTools';
import { whenItemSaved } from './pendingItems';

/**
 * Ein Punkt der Checkliste (Görevly `cl-item`): Haken, Text zum direkten
 * Überschreiben, rechts die Marken (Bayrak, Glocke, Termin, Person). Die
 * Werkzeuge erscheinen beim Überfahren über den Marken — ohne dass sich die
 * Zeile verschiebt. Änderungen gelten sofort (optimistisch) und werden bei
 * einem Fehler zurückgenommen.
 */
export const ChecklistItemRow = memo(({
    item,
    checklistId,
    previousId,
    nextId,
    onEnter,
    onFocusItem,
}: {
    item: ChecklistItem;
    checklistId: string;
    previousId: string | null;
    nextId: string | null;
    /** Enter im Text: Entwurfszeile unter diesem Punkt öffnen. */
    onEnter: (itemId: string) => void;
    onFocusItem: (itemId: string) => void;
}) => {
    const env = useChecklistEnv();
    const now = useNow(60_000);
    const textRef = useRef<HTMLDivElement | null>(null);
    const [toolsOpen, setToolsOpen] = useState(false);

    useLayoutEffect(() => {
        const element = textRef.current;
        if (element && document.activeElement !== element) element.textContent = item.text;
    }, [item.text, env.editable]);

    const patch = async (input: ChecklistItemInput, optimistic: Partial<ChecklistItem>): Promise<boolean> => {
        env.setItem(checklistId, { ...item, ...optimistic });
        try {
            if (!(await whenItemSaved(item.id))) return false;
            const result = await tasksApi.updateItem(item.id, input);
            env.setItem(checklistId, result.item);
            env.setProgress(result.progress);
            if (result.task) env.setTaskAssignees(result.task.assigneeIds);
            return true;
        } catch (error) {
            env.setItem(checklistId, item);
            toast.error(tasksErrorMessage(error));
            return false;
        }
    };

    const toggle = async () => {
        const done = !item.done;
        env.setItem(checklistId, {
            ...item,
            done,
            doneAt: done ? new Date().toISOString() : null,
            doneById: done ? env.actorId : null,
        });
        try {
            if (!(await whenItemSaved(item.id))) return;
            const result = await tasksApi.toggleItem(item.id, done);
            env.setItem(checklistId, result.item);
            env.setProgress(result.progress);
        } catch (error) {
            env.setItem(checklistId, item);
            toast.error(tasksErrorMessage(error));
        }
    };

    const remove = async () => {
        env.removeItem(checklistId, item.id);
        try {
            if (!(await whenItemSaved(item.id))) return;
            const result = await tasksApi.deleteItem(item.id);
            env.setProgress(result.progress);
        } catch (error) {
            env.insertItem(checklistId, item, previousId);
            toast.error(tasksErrorMessage(error));
        }
    };

    const move = async (direction: 'up' | 'down') => {
        try {
            if (!(await whenItemSaved(item.id))) return;
            const result = await tasksApi.moveItem(item.id, direction);
            env.replaceChecklist(result.checklist);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        }
    };

    const commitText = () => {
        const element = textRef.current;
        if (!element) return;
        const next = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (next === item.text) return;
        if (!next) {
            element.textContent = item.text;
            return;
        }
        void patch({ text: next.slice(0, 500) }, { text: next.slice(0, 500) });
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.nativeEvent.isComposing) return;
        const element = event.currentTarget;
        if (event.key === 'Enter') {
            event.preventDefault();
            commitText();
            onEnter(item.id);
        } else if (event.key === 'Backspace' && !(element.textContent ?? '')) {
            event.preventDefault();
            if (previousId) onFocusItem(previousId);
            void remove();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            element.textContent = item.text;
            element.blur();
        } else if (event.key === 'ArrowUp' && previousId) {
            event.preventDefault();
            onFocusItem(previousId);
        } else if (event.key === 'ArrowDown' && nextId) {
            event.preventDefault();
            onFocusItem(nextId);
        }
    };

    const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain').replace(/\s+/g, ' '));
    };

    const late = Boolean(item.dueAt && !item.done && Date.parse(item.dueAt) < now);

    return (
        <div className={`ofi-gv-checklist-item ${item.done ? 'is-done' : ''} ${toolsOpen ? 'is-tools' : ''}`}>
            <button
                type="button"
                role="checkbox"
                aria-checked={item.done}
                aria-label={item.done ? t('tasksModule.checklist.markUndone') : t('tasksModule.checklist.markDone')}
                className={`ofi-gv-check ofi-btn-plain ${item.done ? 'is-done' : ''}`}
                disabled={!env.editable}
                onClick={() => void toggle()}
            >
                {item.done ? <LuCheck size={11} strokeWidth={3} /> : null}
            </button>

            {env.editable ? (
                <div
                    ref={textRef}
                    data-item-text={item.id}
                    className="ofi-gv-checklist-item__text"
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-label={t('tasksModule.checklist.itemText')}
                    spellCheck
                    onBlur={commitText}
                    onKeyDown={onKeyDown}
                    onPaste={onPaste}
                />
            ) : (
                <div className="ofi-gv-checklist-item__text">{item.text}</div>
            )}

            <span className="ofi-gv-checklist-item__badges">
                {item.flagged && <LuFlag size={13} className="ofi-gv-flag" aria-label={t('tasksModule.checklist.flagged')} />}
                {item.reminderAt && !item.done && (
                    <span className="ofi-gv-meta" title={smartDate(item.reminderAt, true, now)}>
                        <LuBell size={13} aria-label={t('tasksModule.checklist.reminder')} />
                    </span>
                )}
                {item.dueAt && <span className={`ofi-gv-due ${late ? 'is-late' : ''}`}>{smartDate(item.dueAt, false, now)}</span>}
                {item.assigneeId && (
                    <span className="ofi-gv-person-name">{personName(env.people, item.assigneeId)}</span>
                )}
            </span>

            {env.editable && (
                <ChecklistItemTools
                    item={item}
                    isFirst={!previousId}
                    isLast={!nextId}
                    onOpenChange={setToolsOpen}
                    onPatch={patch}
                    onMove={(direction) => void move(direction)}
                    onDelete={() => void remove()}
                />
            )}
        </div>
    );
});

ChecklistItemRow.displayName = 'ChecklistItemRow';
