import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Plus, Trash01 as Trash } from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupDialog, PopupField } from '@/components/ui-shared/PopupKit';
import { checklistApi, type ChecklistTemplateDto } from '@/lib/api/project';
import { t } from '@/i18n/translate';

const newId = () => Math.random().toString(36).slice(2, 10);

type Check = { id: string; label: string; measurement: boolean };

/**
 * Checklisten-VORLAGE anlegen / bearbeiten — neu gebaut 19.08.2026 auf dem
 * App-Popup-Kit (Vorgabe: "moderner, sauberer, einfacher"). Der alte
 * AntD-`Modal` mit Tabellenkopf ist weg; die Liste liest sich jetzt wie im
 * Rapport-Editor:
 *
 *   Name  →  nummerierte Kontrollpunkte  →  EIN "+" unten.
 *
 * Die Beschreibungs-Option steht DIREKT UNTER dem Punkt, nicht als Spalte am
 * Kopf. Kategorien gibt es weiterhin nicht (Vorgabe 03.08.2026): eine Vorlage
 * ist Name + flache Punkte.
 */
export const ChecklistTemplateModal = ({
    open,
    template,
    onClose,
    onSaved,
}: {
    open: boolean;
    /** null = neue Liste. */
    template: ChecklistTemplateDto | null;
    onClose: () => void;
    onSaved: (saved: ChecklistTemplateDto) => void;
}) => {
    const [name, setName] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [checks, setChecks] = useState<Check[]>([]);
    const [saving, setSaving] = useState(false);
    const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
    const [focusIndex, setFocusIndex] = useState<number | null>(null);

    useEffect(() => {
        if (!open) return;
        setName(template?.name || '');
        setIsActive(template ? template.isActive !== false : true);
        // Eski şablonlardaki kategoriler bilinçli olarak düzleştirilir.
        const items = Array.isArray(template?.items) ? template!.items : [];
        setChecks(items.length
            ? items.map((it) => ({ id: it.id || newId(), label: it.label || '', measurement: Boolean(it.measurement) }))
            : [{ id: newId(), label: '', measurement: true }]);
        setFocusIndex(null);
    }, [open, template]);

    useEffect(() => {
        if (focusIndex === null) return;
        inputRefs.current[focusIndex]?.focus();
        setFocusIndex(null);
    }, [focusIndex, checks.length]);

    const patch = (id: string, next: Partial<Check>) => setChecks((rows) => rows.map((row) => (row.id === id ? { ...row, ...next } : row)));
    const insertAfter = (index: number) => {
        setChecks((rows) => [...rows.slice(0, index + 1), { id: newId(), label: '', measurement: true }, ...rows.slice(index + 1)]);
        setFocusIndex(index + 1);
    };
    const remove = (id: string) => setChecks((rows) => (rows.length > 1 ? rows.filter((row) => row.id !== id) : rows));

    const save = async () => {
        if (!name.trim()) return toast.error(t('settings.checklist.nameRequired'));
        const items = checks
            .filter((check) => check.label.trim())
            .map((check) => ({ id: check.id, category: '', label: check.label.trim(), measurement: check.measurement }));
        if (items.length === 0) return toast.error(t('projects.delivery.needCheck'));
        setSaving(true);
        try {
            const payload = { name: name.trim(), description: null, items, isActive };
            const saved = template
                ? await checklistApi.update(template.id, payload)
                : await checklistApi.create(payload);
            toast.success(t('settings.checklist.saved'));
            onSaved(saved);
            onClose();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('settings.checklist.saveError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            title={template ? (template.name || t('settings.checklist.title')) : t('settings.checklist.newList')}
            subtitle={t('projects.delivery.editChecklistHint')}
            width={620}
            footer={(
                <PopupActions start={(
                    <label className="ofi-tp-checkrow">
                        <input type="checkbox" checked={!isActive} onChange={(event) => setIsActive(!event.target.checked)} />
                        {t('settings.checklist.saveAsDraft')}
                    </label>
                )}>
                    <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={saving} onClick={() => void save()}>
                        {t('settings.checklist.save')}
                    </PopupButton>
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
                                    // Enter = kesintisiz yeni madde: altına satır açıp odaklanır.
                                    if (event.key !== 'Enter') return;
                                    event.preventDefault();
                                    insertAfter(index);
                                }}
                            />
                            {/* Die Beschreibungs-Option steht DIREKT UNTER dem Punkt. */}
                            <label className="ofi-dlv-editrow__opt" title={t('settings.checklist.measurementHint')}>
                                <input
                                    type="checkbox"
                                    checked={check.measurement}
                                    onChange={(event) => patch(check.id, { measurement: event.target.checked })}
                                />
                                {t('projects.delivery.withDescription')}
                            </label>
                        </div>
                        <button
                            type="button"
                            className="ofi-dlv-iconbtn is-danger"
                            title={t('common.delete')}
                            aria-label={t('common.delete')}
                            disabled={checks.length === 1}
                            onClick={() => remove(check.id)}
                        >
                            <Trash size={18} />
                        </button>
                    </div>
                ))}

                {/* Der EINE "+"-Knopf, immer unten. */}
                <button type="button" className="ofi-dlv-add is-inline" onClick={() => insertAfter(checks.length - 1)}>
                    <Plus size={16} />
                    {t('settings.checklist.addStep')}
                </button>
            </div>
        </PopupDialog>
    );
};
