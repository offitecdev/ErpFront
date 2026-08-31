import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LuGitBranch } from 'react-icons/lu';
import { Eye, Plus, Save01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { blankField, type FormFieldDef, type FormFieldType } from '@/lib/formFields';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { LoadingPanel } from '@/components/ui-shared/Loader';
import { Switch } from '@/components/ui-shared/Switch';
import { ChecklistTabs } from './components/ChecklistTabs';
import { CHECKLIST_PATHS, templateEditorPath } from './routes';
import { CHECKPOINT_TYPE } from './template/fieldTypes';
import { FieldSidePanel } from './template/FieldSidePanel';
import { TemplateFieldsTable } from './template/TemplateFieldsTable';
import { TemplatePreviewSheet } from './template/TemplatePreviewSheet';
import { useTemplateEditor } from './template/useTemplateEditor';
import {
    addField,
    conditionSources,
    copyField,
    countInputFields,
    dropField,
    moveField,
    patchField,
    replaceField,
    sampleConditionGroup,
} from './template/templateModel';
import { BTN_PRIMARY, BTN_SECONDARY, CARD_CLASS, INPUT_CLASS, LABEL_CLASS, TEXTAREA_CLASS } from './ui';

/**
 * Vorlagen-Editor der Checklisten: oben die Stammdaten, darunter die Felder
 * als TABELLE. Ein Feld wird in der SEITENSPALTE daneben erfasst (erst Typ
 * wählen, dann die nötigen Angaben) — kein Fenster über der Seite: die
 * Tabelle bleibt sichtbar, die Spalte erscheint nur, solange sie gebraucht
 * wird, und ein Klick auf eine andere Zeile schaltet sie um.
 *
 * Die Arbeit an der Feldliste steckt in `template/templateModel` (reine
 * Funktionen), der Zustand in `template/useTemplateEditor` — diese Seite
 * verbindet nur beides mit dem Bild.
 */
interface FieldDialog {
    mode: 'create' | 'edit';
    /** Nur beim Ändern: der Platz in der Liste (bestimmt die Bezugsfelder). */
    index?: number;
    /** null = Typ noch offen (die Seitenspalte zeigt zuerst das Raster). */
    field: FormFieldDef | null;
}

export const FormTemplateBuilderPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isNew = !id || id === 'new';

    const { loading, saving, dirty, draft, update, setFields, save } = useTemplateEditor(id);
    const [dialog, setDialog] = useState<FieldDialog | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [leaveTo, setLeaveTo] = useState<string | null>(null);

    /** Ohne Typ = die Seitenspalte fragt zuerst danach. */
    const openNew = (type?: FormFieldType) => setDialog({ mode: 'create', field: type ? blankField(type) : null });

    /** Bezugsfelder: beim Ändern alle Felder OBERHALB, beim Anlegen alle (es kommt ans Ende). */
    const dialogSources = dialog?.mode === 'edit' && dialog.index !== undefined
        ? conditionSources(draft.fields, dialog.index)
        : draft.fields.filter((field) => field.type !== 'SECTION');

    const submitField = (field: FormFieldDef, addAnother: boolean) => {
        if (dialog?.mode === 'create') {
            setFields(addField(draft.fields, field));
            // "Übernehmen & weiteres": gleich das nächste Feld desselben Typs.
            if (addAnother) { setDialog({ mode: 'create', field: blankField(field.type) }); return; }
        } else {
            setFields(replaceField(draft.fields, field));
        }
        setDialog(null);
    };

    const insertSample = () => setFields([...draft.fields, ...sampleConditionGroup()]);

    const persist = async () => {
        const saved = await save();
        if (saved && isNew) navigate(templateEditorPath(saved.id), { replace: true });
    };

    /** Ein Reiterwechsel mit ungesicherten Änderungen fragt erst nach. */
    const guardLeave = (path: string): boolean => {
        if (!dirty) return true;
        setLeaveTo(path);
        return false;
    };

    if (loading) return <LoadingPanel rows={6} />;

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={isNew ? t('forms.builder.newTitle') : draft.name || t('forms.builder.editTitle')}
                action={(
                    <div className="flex items-center gap-2">
                        <button type="button" className={BTN_SECONDARY} onClick={() => setPreviewOpen(true)}>
                            <Eye size={14} />{t('forms.builder.preview')}
                        </button>
                        <button type="button" className={BTN_PRIMARY} disabled={saving || !dirty} onClick={() => void persist()}>
                            <Save01 size={14} />{t('common.save')}
                        </button>
                    </div>
                )}
            />

            <ChecklistTabs active="templates" onLeave={guardLeave} />

            {/* Stammdaten der Vorlage */}
            <section className={CARD_CLASS}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_200px]">
                    <div>
                        <label className={LABEL_CLASS}>{t('forms.builder.name')} <span className="text-red-500">*</span></label>
                        <input
                            value={draft.name}
                            onChange={(event) => update({ name: event.target.value })}
                            placeholder={t('forms.builder.namePlaceholder')}
                            className={`${INPUT_CLASS} mt-1`}
                        />
                    </div>
                    <div>
                        <label className={LABEL_CLASS}>{t('forms.builder.category')}</label>
                        <input
                            value={draft.category}
                            onChange={(event) => update({ category: event.target.value })}
                            placeholder={t('forms.builder.categoryPlaceholder')}
                            className={`${INPUT_CLASS} mt-1`}
                        />
                    </div>
                </div>
                <div className="mt-3">
                    <label className={LABEL_CLASS}>{t('forms.builder.description')}</label>
                    <textarea
                        value={draft.description}
                        onChange={(event) => update({ description: event.target.value })}
                        rows={2}
                        placeholder={t('forms.builder.descriptionPlaceholder')}
                        className={`${TEXTAREA_CLASS} mt-1`}
                    />
                </div>
                <div className="mt-3 flex items-center gap-3">
                    <Switch checked={draft.isActive} onChange={(next) => update({ isActive: next })} label={t('forms.templates.active')} />
                    <span className="text-[12.5px] text-slate-600 dark:text-white/70">
                        {draft.isActive ? t('forms.builder.activeHint') : t('forms.builder.inactiveHint')}
                    </span>
                </div>
            </section>

            {/* Felder der Checkliste — Tabelle links, Erfassung in der Spalte daneben */}
            <div className={`grid grid-cols-1 gap-4 ${dialog ? 'lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start' : ''}`}>
                <SectionCard
                    title={(
                        <span className="inline-flex items-center gap-2">
                            {t('forms.builder.fields')} ({draft.fields.length})
                            <span className="text-[12px] font-normal text-slate-500 dark:text-white/60">
                                {t('forms.templates.fieldCount', { count: countInputFields(draft.fields) })}
                                {dirty && <span className="ml-2 font-semibold text-amber-600">· {t('forms.fill.unsaved')}</span>}
                            </span>
                        </span>
                    )}
                >
                    {draft.fields.length === 0 ? (
                        <div className="px-4 py-10 text-center">
                            <p className="m-0 text-[13px] text-slate-400">{t('forms.builder.noFields')}</p>
                            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                                <button type="button" className={BTN_PRIMARY} onClick={() => openNew()}>
                                    <Plus size={14} />{t('forms.builder.addField')}
                                </button>
                                <button type="button" className={BTN_SECONDARY} onClick={insertSample}>
                                    <LuGitBranch size={14} />{t('forms.builder.insertSample')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <TemplateFieldsTable
                            fields={draft.fields}
                            onEdit={(index) => setDialog({ mode: 'edit', index, field: draft.fields[index] })}
                            onToggleRequired={(field, required) => setFields(patchField(draft.fields, field.id, { required }))}
                            onMove={(index, delta) => setFields(moveField(draft.fields, index, delta))}
                            onCopy={(index) => setFields(copyField(draft.fields, index))}
                            onRemove={(field) => setFields(dropField(draft.fields, field.id))}
                            onAdd={() => openNew()}
                            onAddCheckpoint={() => openNew(CHECKPOINT_TYPE)}
                        />
                    )}
                </SectionCard>

                {dialog && (
                    <FieldSidePanel
                        key={`${dialog.mode}:${dialog.field?.id ?? 'new'}`}
                        mode={dialog.mode}
                        field={dialog.field}
                        sources={dialogSources}
                        onSubmit={submitField}
                        onClose={() => setDialog(null)}
                    />
                )}
            </div>

            {previewOpen && (
                <TemplatePreviewSheet
                    templateName={draft.name}
                    fields={draft.fields}
                    onClose={() => setPreviewOpen(false)}
                />
            )}

            <ConfirmDialog
                open={Boolean(leaveTo)}
                title={t('forms.builder.discardTitle')}
                message={t('forms.builder.discardMessage')}
                tone="danger"
                confirmLabel={t('forms.builder.discardConfirm')}
                onConfirm={() => {
                    const target = leaveTo ?? CHECKLIST_PATHS.templates;
                    setLeaveTo(null);
                    navigate(target);
                }}
                onCancel={() => setLeaveTo(null)}
            />
        </div>
    );
};

export default FormTemplateBuilderPage;
