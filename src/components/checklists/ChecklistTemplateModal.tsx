import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Plus, Save01 as Save, Trash01 as Trash } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Modal } from '@/components/ui-shared/Modal';
import { Field, Input } from '@/components/ui-shared/Field';
import { CELL_INPUT_CLASS } from '@/components/ui-shared/TableKit';
import { checklistApi, type ChecklistTemplateDto } from '@/lib/api/project';
import { t } from '@/i18n/translate';

const newId = () => Math.random().toString(36).slice(2, 10);

type Check = { id: string; label: string; measurement: boolean };

/**
 * Büyük kontrol-listesi düzenleme popup'ı — hem Ayarlar sayfası hem de teslim
 * raporu editörü buradan yeni liste oluşturur / düzenler. Kategori kavramı
 * KALDIRILDI (kullanıcı isteği): liste, yalnızca liste adı + düz kontrol
 * maddelerinden oluşan DAR bir tablodur; her satırın sonundaki "+" ve Enter
 * tuşu kesintisiz yeni madde ekler.
 */
export const ChecklistTemplateModal = ({
    open,
    template,
    onClose,
    onSaved,
}: {
    open: boolean;
    /** null = yeni liste oluşturma. */
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

    const patch = (id: string, p: Partial<Check>) => setChecks((rows) => rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
    const insertAfter = (index: number) => {
        setChecks((rows) => [...rows.slice(0, index + 1), { id: newId(), label: '', measurement: true }, ...rows.slice(index + 1)]);
        setFocusIndex(index + 1);
    };
    const remove = (id: string) => setChecks((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));

    const save = async () => {
        if (!name.trim()) return toast.error(t('settings.checklist.nameRequired'));
        const items = checks
            .filter((c) => c.label.trim())
            .map((c) => ({ id: c.id, category: '', label: c.label.trim(), measurement: c.measurement }));
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
        <Modal
            open={open}
            title={template ? (template.name || t('settings.checklist.title')) : t('settings.checklist.newList')}
            onClose={onClose}
            width="full"
            footer={(
                <>
                    <label className="mr-auto flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-white/70">
                        <input type="checkbox" checked={!isActive} onChange={(e) => setIsActive(!e.target.checked)} />
                        {t('settings.checklist.saveAsDraft')}
                    </label>
                    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button variant="primary" icon={<Save size={13} />} loading={saving} onClick={() => void save()}>
                        {t('settings.checklist.save')}
                    </Button>
                </>
            )}
        >
            <div className="space-y-4">
                <Field label={t('settings.checklist.listName')} required>
                    <Input value={name} placeholder={t('settings.checklist.listNamePlaceholder')} onChange={(e) => setName(e.target.value)} />
                </Field>

                {/* Dar madde tablosu: yalnızca madde metni + ölçüm alanı işareti. */}
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/15">
                    <table data-inv-table data-unstyled-table className="w-full">
                        <thead>
                            <tr>
                                <th className="w-10 text-left">#</th>
                                <th className="text-left">{t('settings.checklist.controlStep')}</th>
                                <th className="w-24 text-center">{t('settings.checklist.measurement')}</th>
                                <th className="w-20 text-right" />
                            </tr>
                        </thead>
                        <tbody>
                            {checks.map((check, index) => (
                                <tr key={check.id}>
                                    <td className="tabular-nums text-slate-400 dark:text-white/50">{index + 1}</td>
                                    <td>
                                        <input
                                            ref={(el) => { inputRefs.current[index] = el; }}
                                            className={CELL_INPUT_CLASS}
                                            value={check.label}
                                            placeholder={t('settings.checklist.controlStepPlaceholder')}
                                            onChange={(e) => patch(check.id, { label: e.target.value })}
                                            onKeyDown={(e) => {
                                                // Enter = kesintisiz yeni madde: altına satır açıp odaklanır.
                                                if (e.key === 'Enter') { e.preventDefault(); insertAfter(index); }
                                            }}
                                        />
                                    </td>
                                    <td className="text-center">
                                        <input
                                            type="checkbox"
                                            title={t('settings.checklist.measurementHint')}
                                            checked={check.measurement}
                                            onChange={(e) => patch(check.id, { measurement: e.target.checked })}
                                        />
                                    </td>
                                    <td>
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                title={t('common.delete')}
                                                aria-label={t('common.delete')}
                                                disabled={checks.length === 1}
                                                onClick={() => remove(check.id)}
                                                className="inline-flex size-6 items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:text-rose-600 disabled:opacity-30"
                                            >
                                                <Trash size={13} />
                                            </button>
                                            <button
                                                type="button"
                                                title={t('settings.checklist.addStep')}
                                                aria-label={t('settings.checklist.addStep')}
                                                onClick={() => insertAfter(index)}
                                                className="ofi-rs-iconbtn inline-flex size-6 items-center justify-center rounded-[2px] border transition-colors"
                                            >
                                                <Plus size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
};
