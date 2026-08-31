import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Plus, Trash01 as Trash } from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupDialog, PopupField } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';

import { newRowId, type ReportChecklist } from './checklistModel';

export type EditableCheck = {
    id: string;
    label: string;
    /** Beschreibungsfeld beim Ausfüllen anbieten. */
    measurementEnabled: boolean;
    /** Vorbelegter Beschreibungstext (bleibt beim Bearbeiten erhalten). */
    measurement: string;
};

/**
 * "Checkliste bearbeiten" — das zweite Popup des Übergabe-Rapports
 * (Benutzerwunsch). Es bearbeitet die Liste, wie sie IN DIESEM RAPPORT steht:
 * Name oben, darunter die Kontrollpunkte, und die BESCHREIBUNG steht direkt
 * UNTER dem jeweiligen Punkt — nicht in einer Spalte am Kopf.
 *
 * Enter öffnet den nächsten Punkt, der EINE "+"-Knopf sitzt unten und wandert
 * mit, wenn Punkte dazukommen. Gespeichert wird lokal; erst "Speichern" im
 * Rapport schreibt zum Server.
 */
export const ChecklistEditorDialog = ({
    open,
    checklist,
    takenNames,
    onClose,
    onSave,
}: {
    open: boolean;
    /** null = neue Liste von Hand. */
    checklist: ReportChecklist | null;
    /** Namen der übrigen Listen im Rapport — Doppelnamen würden verschmelzen. */
    takenNames: string[];
    onClose: () => void;
    /** `asTemplate` = zusätzlich als wiederverwendbare Vorlage ablegen. */
    onSave: (name: string, checks: EditableCheck[], asTemplate: boolean) => void;
}) => {
    const [name, setName] = useState('');
    const [asTemplate, setAsTemplate] = useState(false);
    const [checks, setChecks] = useState<EditableCheck[]>([]);
    const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
    const [focusIndex, setFocusIndex] = useState<number | null>(null);

    useEffect(() => {
        if (!open) return;
        setName(checklist?.name || '');
        setAsTemplate(false);
        setChecks((checklist?.items || []).map((item) => ({
            id: item.id,
            label: item.label,
            measurementEnabled: item.measurementEnabled !== false,
            measurement: item.measurement || '',
        })));
        setFocusIndex(null);
    }, [open, checklist]);

    useEffect(() => {
        if (focusIndex === null) return;
        inputRefs.current[focusIndex]?.focus();
        setFocusIndex(null);
    }, [focusIndex, checks.length]);

    const patch = (id: string, next: Partial<EditableCheck>) =>
        setChecks((rows) => rows.map((row) => (row.id === id ? { ...row, ...next } : row)));

    const insertAfter = (index: number) => {
        setChecks((rows) => [
            ...rows.slice(0, index + 1),
            { id: newRowId(), label: '', measurementEnabled: true, measurement: '' },
            ...rows.slice(index + 1),
        ]);
        setFocusIndex(index + 1);
    };

    const append = () => insertAfter(checks.length - 1);
    const remove = (id: string) => setChecks((rows) => rows.filter((row) => row.id !== id));

    const submit = () => {
        const trimmed = name.trim();
        if (!trimmed) return toast.error(t('settings.checklist.nameRequired'));
        if (takenNames.some((other) => other.toLowerCase() === trimmed.toLowerCase())) {
            return toast.error(t('projects.delivery.checklistNameTaken'));
        }
        const kept = checks.filter((row) => row.label.trim());
        if (kept.length === 0) return toast.error(t('projects.delivery.needCheck'));
        onSave(trimmed, kept.map((row) => ({ ...row, label: row.label.trim() })), asTemplate);
        onClose();
    };

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            title={checklist ? t('projects.delivery.editChecklist') : t('projects.delivery.newChecklist')}
            subtitle={t('projects.delivery.editChecklistHint')}
            width={620}
            footer={(
                <PopupActions start={(
                    <label className="ofi-tp-checkrow">
                        <input type="checkbox" checked={asTemplate} onChange={(event) => setAsTemplate(event.target.checked)} />
                        {t('projects.delivery.alsoSaveTemplate')}
                    </label>
                )}>
                    <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" onClick={submit}>{t('common.save')}</PopupButton>
                </PopupActions>
            )}
        >
            <PopupField label={t('settings.checklist.listName')} required>
                <input
                    className="ofi-cal-input w-full"
                    value={name}
                    placeholder={t('settings.checklist.listNamePlaceholder')}
                    onChange={(event) => setName(event.target.value)}
                />
            </PopupField>

            <div className="ofi-dlv-editlist">
                {checks.map((check, index) => (
                    <div key={check.id} className="ofi-dlv-editrow">
                        <span className="ofi-tp-ordinal">{index + 1}</span>
                        <div className="ofi-dlv-editrow__main">
                            <input
                                ref={(el) => { inputRefs.current[index] = el; }}
                                className="ofi-cal-input w-full"
                                value={check.label}
                                placeholder={t('settings.checklist.controlStepPlaceholder')}
                                onChange={(event) => patch(check.id, { label: event.target.value })}
                                onKeyDown={(event) => {
                                    if (event.key !== 'Enter') return;
                                    event.preventDefault();
                                    insertAfter(index);
                                }}
                            />
                            {/* Die Beschreibung steht DIREKT UNTER dem Punkt. */}
                            <label className="ofi-dlv-editrow__opt">
                                <input
                                    type="checkbox"
                                    checked={check.measurementEnabled}
                                    onChange={(event) => patch(check.id, { measurementEnabled: event.target.checked })}
                                />
                                {t('projects.delivery.withDescription')}
                            </label>
                            {check.measurementEnabled && (
                                <input
                                    className="ofi-cal-input w-full"
                                    value={check.measurement}
                                    placeholder={t('projects.delivery.measurementPlaceholder')}
                                    onChange={(event) => patch(check.id, { measurement: event.target.value })}
                                />
                            )}
                        </div>
                        <button
                            type="button"
                            className="ofi-dlv-iconbtn is-danger"
                            title={t('common.delete')}
                            aria-label={t('common.delete')}
                            onClick={() => remove(check.id)}
                        >
                            <Trash size={18} />
                        </button>
                    </div>
                ))}

                {/* Der EINE "+"-Knopf, immer unten. */}
                <button type="button" className="ofi-dlv-add is-inline" onClick={append}>
                    <Plus size={16} />
                    {t('settings.checklist.addStep')}
                </button>
            </div>
        </PopupDialog>
    );
};

export default ChecklistEditorDialog;
