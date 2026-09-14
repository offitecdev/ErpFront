import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { LuPlus } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { ChecklistItem } from '@/types/tasksModule';
import { useChecklistEnv } from './checklistEnv';
import { newItemId, queueItemSave } from './pendingItems';

/**
 * «Madde ekle»: am Ende jeder Liste und — nach Enter in einem Punkt — als
 * Entwurfszeile direkt darunter (`afterItemId`). Der Server verlangt Text für
 * einen neuen Punkt; darum entsteht er erst mit dem ersten Enter, nicht leer.
 */
export const NewItemInput = ({
    checklistId,
    afterItemId,
    autoFocus = false,
    inline = false,
    onAdded,
    onCancel,
}: {
    checklistId: string;
    afterItemId: string | null;
    autoFocus?: boolean;
    inline?: boolean;
    onAdded?: (item: ChecklistItem) => void;
    onCancel?: () => void;
}) => {
    const env = useChecklistEnv();
    const [value, setValue] = useState('');
    const inputRef = useRef<HTMLInputElement | null>(null);

    /* SOFORT (13.09.2026): der Punkt steht im selben Tastendruck in der Liste,
       das Feld ist gleich wieder leer und bereit für den nächsten. Gespeichert
       wird dahinter (pendingItems); scheitert es, verschwindet der Punkt wieder
       und sein Text kommt ins Feld zurück. */
    const submit = () => {
        const text = value.trim();
        if (!text) return;
        const item: ChecklistItem = {
            id: newItemId(),
            checklistId,
            text,
            position: 0,
            done: false,
            doneAt: null,
            doneById: null,
            assigneeId: null,
            dueAt: null,
            reminderAt: null,
            flagged: false,
            createdById: env.actorId,
            createdAt: new Date().toISOString(),
        };
        env.insertItem(checklistId, item, afterItemId);
        setValue('');
        onAdded?.(item);
        inputRef.current?.focus();

        void queueItemSave(checklistId, item.id, async () => {
            try {
                const result = await tasksApi.addItem(checklistId, { id: item.id, text, afterItemId });
                env.setProgress(result.progress);
                if (result.task) env.setTaskAssignees(result.task.assigneeIds);
                return true;
            } catch (error) {
                env.removeItem(checklistId, item.id);
                setValue((current) => current || text);
                toast.error(tasksErrorMessage(error));
                return false;
            }
        });
    };

    return (
        <div className={`ofi-gv-checklist-new ${inline ? 'is-inline' : ''}`}>
            <LuPlus size={14} aria-hidden />
            <input
                ref={inputRef}
                autoFocus={autoFocus}
                value={value}
                maxLength={500}
                placeholder={t('tasksModule.checklist.addItem')}
                aria-label={t('tasksModule.checklist.addItem')}
                className="ofi-gv-checklist-new__input"
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        if (value.trim()) submit();
                        else onCancel?.();
                    } else if (event.key === 'Escape') {
                        setValue('');
                        onCancel?.();
                    }
                }}
                onBlur={() => { if (inline && !value.trim()) onCancel?.(); }}
            />
        </div>
    );
};
