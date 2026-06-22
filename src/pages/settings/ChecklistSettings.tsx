import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { File02 as FileText, Plus, Save01 as Save, Trash01 as Trash } from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Textarea } from '../../components/ui-shared/Field';
import { Checkbox } from '../../components/ui-shared/Checkbox';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { checklistApi, type ChecklistTemplateDto } from '../../lib/api/project';

import { t } from '@/i18n/translate';

const NEW_ID = '__new__';
const newId = () => Math.random().toString(36).slice(2, 10);

type Step = { id: string; label: string; measurement: boolean };
type Category = { id: string; name: string; steps: Step[] };
type Draft = { id: string | null; name: string; description: string; isActive: boolean; categories: Category[] };

const emptyCategory = (): Category => ({ id: newId(), name: '', steps: [{ id: newId(), label: '', measurement: true }] });

const emptyDraft = (): Draft => ({ id: null, name: '', description: '', isActive: true, categories: [emptyCategory()] });

// Group the flat stored items by their category into editable category sections.
const toDraft = (tpl: ChecklistTemplateDto): Draft => {
    const groups: Category[] = [];
    for (const it of Array.isArray(tpl.items) ? tpl.items : []) {
        const name = it.category || '';
        let group = groups.find((g) => g.name === name);
        if (!group) { group = { id: newId(), name, steps: [] }; groups.push(group); }
        group.steps.push({ id: it.id || newId(), label: it.label || '', measurement: Boolean(it.measurement) });
    }
    return {
        id: tpl.id,
        name: tpl.name,
        description: tpl.description || '',
        isActive: tpl.isActive,
        categories: groups.length ? groups : [emptyCategory()],
    };
};

export const ChecklistSettings = () => {
    const [templates, setTemplates] = useState<ChecklistTemplateDto[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = async (focusId?: string) => {
        setLoading(true);
        try {
            const rows = await checklistApi.list();
            setTemplates(rows);
            if (focusId) {
                const found = rows.find((r) => r.id === focusId);
                if (found) { setSelectedId(found.id); setDraft(toDraft(found)); }
            }
        } catch {
            toast.error(t('settings.checklist.loadError'));
            setTemplates([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startNew = () => { setSelectedId(NEW_ID); setDraft(emptyDraft()); };
    const selectTemplate = (tpl: ChecklistTemplateDto) => { setSelectedId(tpl.id); setDraft(toDraft(tpl)); };

    // ── category / step mutations ───────────────────────────────────────────
    const patchCategory = (cid: string, patch: Partial<Category>) =>
        setDraft((d) => (d ? { ...d, categories: d.categories.map((c) => (c.id === cid ? { ...c, ...patch } : c)) } : d));
    const addCategory = () => setDraft((d) => (d ? { ...d, categories: [...d.categories, emptyCategory()] } : d));
    const removeCategory = (cid: string) => setDraft((d) => (d ? { ...d, categories: d.categories.filter((c) => c.id !== cid) } : d));
    const addStep = (cid: string) =>
        setDraft((d) => (d ? { ...d, categories: d.categories.map((c) => (c.id === cid ? { ...c, steps: [...c.steps, { id: newId(), label: '', measurement: true }] } : c)) } : d));
    const patchStep = (cid: string, sid: string, patch: Partial<Step>) =>
        setDraft((d) => (d ? { ...d, categories: d.categories.map((c) => (c.id === cid ? { ...c, steps: c.steps.map((s) => (s.id === sid ? { ...s, ...patch } : s)) } : c)) } : d));
    const removeStep = (cid: string, sid: string) =>
        setDraft((d) => (d ? { ...d, categories: d.categories.map((c) => (c.id === cid ? { ...c, steps: c.steps.filter((s) => s.id !== sid) } : c)) } : d));

    const save = async () => {
        if (!draft) return;
        if (!draft.name.trim()) return toast.error(t('settings.checklist.nameRequired'));
        // Flatten category sections back into the stored item shape.
        const items = draft.categories.flatMap((c) =>
            c.steps.filter((s) => s.label.trim()).map((s) => ({ id: s.id, category: c.name.trim(), label: s.label.trim(), measurement: s.measurement })),
        );
        setSaving(true);
        try {
            const payload = { name: draft.name.trim(), description: draft.description.trim() || null, items, isActive: draft.isActive };
            const result = draft.id ? await checklistApi.update(draft.id, payload) : await checklistApi.create(payload);
            toast.success(t('settings.checklist.saved'));
            await load(result.id);
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('settings.checklist.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!draft?.id) { setSelectedId(null); setDraft(null); return; }
        if (!confirm(t('settings.checklist.deleteConfirm'))) return;
        setSaving(true);
        try {
            await checklistApi.remove(draft.id);
            toast.success(t('settings.checklist.deleted'));
            setSelectedId(null); setDraft(null);
            await load();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('settings.checklist.deleteError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb={t('settings.checklist.breadcrumb')}
                title={t('settings.checklist.title')}
                description={t('settings.checklist.description')}
                actions={<Button variant="primary" icon={<Plus size={14} />} onClick={startNew}>{t('settings.checklist.newList')}</Button>}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Left: list */}
                <div className="lg:col-span-4">
                    <Card title={t('settings.checklist.title')} icon={<FileText size={13} />} noPadding>
                        {loading ? (
                            <div className="m-4 h-64 animate-pulse rounded bg-slate-100" />
                        ) : templates.length === 0 && selectedId !== NEW_ID ? (
                            <EmptyState icon={<FileText size={28} />} title={t('settings.checklist.noLists')} description={t('settings.checklist.noListsHint')} />
                        ) : (
                            <div className="max-h-[680px] divide-y divide-slate-100 overflow-y-auto">
                                {selectedId === NEW_ID && (
                                    <div className="flex items-center justify-between gap-2 bg-blue-50/50 px-4 py-3">
                                        <span className="text-[12.5px] font-semibold text-blue-800">{t('settings.checklist.newList')}</span>
                                    </div>
                                )}
                                {templates.map((tpl) => {
                                    const active = tpl.id === selectedId;
                                    return (
                                        <button key={tpl.id} type="button" onClick={() => selectTemplate(tpl)} className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors ${active ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                                            <div className="min-w-0">
                                                <div className="truncate text-[13px] font-semibold text-slate-900">{tpl.name}</div>
                                                <div className="mt-0.5 text-[11.5px] text-slate-500">{t('settings.checklist.itemsCount', { count: Array.isArray(tpl.items) ? tpl.items.length : 0 })}</div>
                                            </div>
                                            {tpl.isActive ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">{t('settings.checklist.active')}</span> : null}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Right: editor */}
                <div className="lg:col-span-8">
                    {!draft ? (
                        <Card><EmptyState icon={<FileText size={28} />} title={t('settings.checklist.title')} description={t('settings.checklist.selectList')} /></Card>
                    ) : (
                        <Card
                            title={draft.id ? draft.name || t('settings.checklist.title') : t('settings.checklist.newList')}
                            icon={<FileText size={13} />}
                            actions={
                                <div className="flex items-center gap-1.5">
                                    <Button variant="ghost" size="sm" icon={<Trash size={13} />} disabled={saving} onClick={remove} />
                                    <Button variant="primary" size="sm" icon={<Save size={13} />} loading={saving} onClick={save}>{t('settings.checklist.save')}</Button>
                                </div>
                            }
                        >
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-3">
                                    <Field label={t('settings.checklist.listName')} required>
                                        <Input value={draft.name} placeholder={t('settings.checklist.listNamePlaceholder')} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                                    </Field>
                                    <Field label={t('settings.checklist.listDescription')}>
                                        <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                                    </Field>
                                </div>

                                <Checkbox label={t('settings.checklist.active')} size="sm" isSelected={draft.isActive} onChange={(checked) => setDraft({ ...draft, isActive: checked })} className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset" />

                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11.5px] text-amber-700">{t('settings.checklist.onePerOrderHint')}</div>

                                {/* Category sections */}
                                <div className="space-y-3">
                                    {draft.categories.map((cat) => (
                                        <div key={cat.id} className="overflow-hidden rounded-lg border border-slate-200">
                                            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('settings.checklist.category')}</span>
                                                <Input value={cat.name} placeholder={t('settings.checklist.categoryPlaceholder')} onChange={(e) => patchCategory(cat.id, { name: e.target.value })} className="h-8 flex-1" />
                                                <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} disabled={draft.categories.length === 1} onClick={() => removeCategory(cat.id)} />
                                            </div>

                                            <div className="hidden grid-cols-[1fr_auto_auto] gap-2 px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
                                                <span>{t('settings.checklist.controlStep')}</span>
                                                <span className="text-center">{t('settings.checklist.measurement')}</span>
                                                <span />
                                            </div>
                                            <div className="space-y-2 p-3">
                                                {cat.steps.map((step) => (
                                                    <div key={step.id} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1fr_auto_auto]">
                                                        <Input value={step.label} placeholder={t('settings.checklist.controlStepPlaceholder')} onChange={(e) => patchStep(cat.id, step.id, { label: e.target.value })} className="h-8 min-w-0" />
                                                        <label title={t('settings.checklist.measurementHint')} className="flex items-center justify-center gap-1.5 text-[11.5px] text-slate-600 md:justify-self-center md:px-3">
                                                            <input type="checkbox" checked={step.measurement} onChange={(e) => patchStep(cat.id, step.id, { measurement: e.target.checked })} />
                                                            <span className="md:hidden">{t('settings.checklist.measurement')}</span>
                                                        </label>
                                                        <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} onClick={() => removeStep(cat.id, step.id)} />
                                                    </div>
                                                ))}
                                                <Button type="button" variant="secondary" size="sm" icon={<Plus size={12} />} onClick={() => addStep(cat.id)}>{t('settings.checklist.addStep')}</Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <Button type="button" variant="secondary" icon={<Plus size={13} />} onClick={addCategory}>{t('settings.checklist.addCategory')}</Button>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChecklistSettings;
