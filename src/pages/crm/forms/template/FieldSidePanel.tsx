import { useState } from 'react';
import { toast } from 'sonner';
import { LuGitBranch } from 'react-icons/lu';
import { ArrowLeft, Plus, Trash01, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import {
    blankField,
    fieldTypeLabel,
    newFieldId,
    NUMERIC_FIELD_TYPES,
    operatorNeedsValue,
    operatorsForField,
    type FormCondition,
    type FormConditionOperator,
    type FormFieldDef,
    type FormFieldType,
} from '@/lib/formFields';
import { BTN_ICON_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT_CLASS, LABEL_CLASS, SELECT_CLASS } from '../ui';
import { FIELD_GROUPS, FIELD_ICONS, fieldGroupLabel } from './fieldTypes';
import { fieldIssueMessage, retypeOne, validateField } from './templateModel';

/**
 * Feld erfassen / ändern — NEBEN der Tabelle, nicht darüber: eine eigene
 * Spalte, die mitscrollt (sticky). Kein abgedunkelter Hintergrund, keine
 * Sperre — die Liste bleibt sichtbar und bedienbar, ein Klick auf eine andere
 * Zeile schaltet das Feld hier um.
 *
 * Zwei Schritte: beim Anlegen erst der Feldtyp (Raster nach Gruppen), dann
 * die Angaben, die dieser Typ braucht. "Typ ändern" führt zurück zum Raster.
 * "Übernehmen & weiteres" legt gleich das nächste Feld desselben Typs an.
 */
export const FieldSidePanel = ({
    mode,
    field: initial,
    sources,
    onSubmit,
    onClose,
}: {
    mode: 'create' | 'edit';
    /** null = noch kein Typ gewählt (Schritt 1 beim Anlegen). */
    field: FormFieldDef | null;
    /** Felder OBERHALB (ohne Abschnitte) — mögliche Bezugsfelder der Bedingung. */
    sources: FormFieldDef[];
    onSubmit: (field: FormFieldDef, addAnother: boolean) => void;
    onClose: () => void;
}) => {
    const [field, setField] = useState<FormFieldDef | null>(initial);

    const patch = (next: Partial<FormFieldDef>) => setField((current) => (current ? { ...current, ...next } : current));
    const setCondition = (next: FormCondition | null) => patch({ visibleWhen: next });

    const pickType = (type: FormFieldType) =>
        setField((current) => (current ? retypeOne(current, type) : blankField(type)));

    const submit = (addAnother: boolean) => {
        if (!field) return;
        const issue = validateField(field);
        if (issue) { toast.error(fieldIssueMessage(issue)); return; }
        onSubmit({ ...field, label: field.label.trim() }, addAnother);
    };

    const Icon = field ? FIELD_ICONS[field.type] : null;

    return (
        <aside className="order-first lg:order-none lg:sticky lg:top-4 lg:self-start">
            <div className="flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-white/15 dark:bg-transparent dark:shadow-none">
                <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5">
                    <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-slate-800 dark:text-white">
                            {!field ? t('forms.builder.pickType') : mode === 'create' ? t('forms.builder.addField') : t('forms.builder.editField')}
                        </div>
                        {field && Icon && (
                            <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-white/55">
                                <Icon size={12} />{fieldTypeLabel(field.type)}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        aria-label={t('common.close')}
                        onClick={onClose}
                        className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                        <X size={15} />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {!field ? (
                        <TypeGrid onPick={pickType} />
                    ) : (
                        <FieldForm
                            field={field}
                            sources={sources}
                            onPatch={patch}
                            onSetCondition={setCondition}
                            onChangeType={() => setField(null)}
                        />
                    )}
                </div>

                {field && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-white/10">
                        <button type="button" className={BTN_PRIMARY} onClick={() => submit(false)}>{t('forms.builder.apply')}</button>
                        {mode === 'create' && (
                            <button type="button" className={BTN_SECONDARY} onClick={() => submit(true)}>
                                <Plus size={13} />{t('forms.builder.applyAndNext')}
                            </button>
                        )}
                        <button type="button" className={`${BTN_SECONDARY} ml-auto`} onClick={onClose}>{t('common.cancel')}</button>
                    </div>
                )}
            </div>
        </aside>
    );
};

// ── Schritt 1: Feldtyp ───────────────────────────────────────────────────────

const TypeGrid = ({ onPick }: { onPick: (type: FormFieldType) => void }) => (
    <div className="space-y-3">
        <p className="m-0 text-[12px] text-slate-500 dark:text-white/60">{t('forms.builder.pickTypeHint')}</p>
        {FIELD_GROUPS.map((group) => (
            <div key={group.key}>
                <div className={`${LABEL_CLASS} mb-1.5`}>{fieldGroupLabel(group.key)}</div>
                <div className="grid grid-cols-2 gap-1.5">
                    {group.types.map((type) => {
                        const Icon = FIELD_ICONS[type];
                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => onPick(type)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:border-[#1f2654] hover:bg-[#eef2fb] hover:text-[#1f2654] dark:border-white/15 dark:bg-transparent dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
                            >
                                <Icon size={14} className="shrink-0 text-[#1f2654] dark:text-amber-400" />
                                <span className="min-w-0 truncate">{fieldTypeLabel(type)}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        ))}
    </div>
);

// ── Schritt 2: die Angaben des Feldes ────────────────────────────────────────

const FieldForm = ({
    field,
    sources,
    onPatch,
    onSetCondition,
    onChangeType,
}: {
    field: FormFieldDef;
    sources: FormFieldDef[];
    onPatch: (patch: Partial<FormFieldDef>) => void;
    onSetCondition: (condition: FormCondition | null) => void;
    onChangeType: () => void;
}) => {
    const isSection = field.type === 'SECTION';
    const options = field.options || [];
    const condition = field.visibleWhen ?? null;
    const source = condition ? sources.find((candidate) => candidate.id === condition.fieldId) ?? null : null;

    const pickSource = (fieldId: string) => {
        if (!fieldId) { onSetCondition(null); return; }
        const target = sources.find((candidate) => candidate.id === fieldId);
        onSetCondition({ fieldId, operator: operatorsForField(target)[0] ?? 'NOT_EMPTY' });
    };

    return (
        <div className="space-y-3">
            <button type="button" className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 underline-offset-2 hover:text-[#1f2654] hover:underline dark:text-white/60 dark:hover:text-white" onClick={onChangeType}>
                <ArrowLeft size={12} />{t('forms.builder.changeType')}
            </button>

            <div>
                <label className={LABEL_CLASS}>
                    {isSection ? t('forms.builder.sectionTitle') : t('forms.builder.label')} <span className="text-red-500">*</span>
                </label>
                {/* Der Fokus steht sofort in der Beschriftung — dafür öffnet sich das Feld. */}
                <input
                    autoFocus
                    value={field.label}
                    onChange={(event) => onPatch({ label: event.target.value })}
                    placeholder={isSection ? t('forms.builder.sectionPlaceholder') : t('forms.builder.labelPlaceholder')}
                    className={`${INPUT_CLASS} mt-1`}
                />
            </div>

            {!isSection && (
                <label className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-700 dark:text-white/80">
                    <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        onChange={(event) => onPatch({ required: event.target.checked })}
                        className="size-4 accent-[#1f2654]"
                    />
                    {t('forms.builder.requiredHint')}
                </label>
            )}

            {!isSection && (
                <div>
                    <label className={LABEL_CLASS}>{t('forms.builder.placeholder')}</label>
                    <input value={field.placeholder || ''} onChange={(event) => onPatch({ placeholder: event.target.value })} className={`${INPUT_CLASS} mt-1 !h-9`} />
                </div>
            )}

            <div>
                <label className={LABEL_CLASS}>{t('forms.builder.help')}</label>
                <input value={field.help || ''} onChange={(event) => onPatch({ help: event.target.value })} placeholder={t('forms.builder.helpPlaceholder')} className={`${INPUT_CLASS} mt-1 !h-9`} />
            </div>

            {field.type === 'TEXT' && (
                <label className="flex items-center gap-2 text-[12.5px] text-slate-700 dark:text-white/80">
                    <input type="checkbox" checked={Boolean(field.multiline)} onChange={(event) => onPatch({ multiline: event.target.checked })} className="size-4 accent-[#1f2654]" />
                    {t('forms.builder.multiline')}
                </label>
            )}

            {NUMERIC_FIELD_TYPES.has(field.type) && (
                <div className="text-[12px] text-slate-500 dark:text-white/60">{t('forms.builder.numericHint')}</div>
            )}

            {field.type === 'SELECT' && (
                <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-white/15">
                    <span className={LABEL_CLASS}>{t('forms.builder.options')}</span>
                    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-white/15 dark:bg-white/5">
                        {(['dropdown', 'radio'] as const).map((display) => (
                            <button
                                key={display}
                                type="button"
                                onClick={() => onPatch({ display })}
                                className={`rounded px-2.5 py-1 text-[12px] font-semibold transition-colors ${(field.display || 'dropdown') === display
                                    ? 'bg-[#272f67] text-white'
                                    : 'text-slate-600 dark:text-white/70'}`}
                            >
                                {t(`forms.builder.display.${display}`)}
                            </button>
                        ))}
                    </div>
                    <div className="space-y-1.5">
                        {options.map((option, index) => (
                            <div key={option.id} className="flex items-center gap-1.5">
                                <span className="w-4 text-center font-mono text-[11px] text-slate-400">{index + 1}</span>
                                <input
                                    value={option.label}
                                    onChange={(event) => onPatch({ options: options.map((candidate) => (candidate.id === option.id ? { ...candidate, label: event.target.value } : candidate)) })}
                                    placeholder={t('forms.builder.optionPlaceholder')}
                                    className={`${INPUT_CLASS} !h-9 min-w-0 flex-1`}
                                />
                                <button
                                    type="button"
                                    className={BTN_ICON_DANGER}
                                    disabled={options.length <= 1}
                                    onClick={() => onPatch({ options: options.filter((candidate) => candidate.id !== option.id) })}
                                    title={t('common.delete')}
                                >
                                    <Trash01 size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button type="button" className={BTN_SECONDARY} onClick={() => onPatch({ options: [...options, { id: newFieldId(), label: '' }] })}>
                        <Plus size={13} />{t('forms.builder.addOption')}
                    </button>
                </div>
            )}

            {/* Bedingung — in der schmalen Spalte untereinander statt nebeneinander */}
            <div className="space-y-2 rounded-lg border border-dashed border-[#1f2654]/30 bg-[#eef2fb]/40 p-3 dark:border-amber-400/30 dark:bg-amber-500/5">
                <div className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#1f2654] dark:text-amber-300">
                    <LuGitBranch size={14} />{t('forms.builder.conditionTitle')}
                </div>
                {sources.length === 0 ? (
                    <div className="text-[12px] text-slate-500 dark:text-white/60">{t('forms.builder.conditionNoSource')}</div>
                ) : (
                    <>
                        <div className="text-[12px] text-slate-700 dark:text-white/80">{t('forms.builder.showOnlyWhen')}</div>
                        <select value={condition?.fieldId || ''} onChange={(event) => pickSource(event.target.value)} className={`${SELECT_CLASS} !h-9`}>
                            <option value="">{t('forms.builder.always')}</option>
                            {sources.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>{candidate.label || t('forms.builder.unnamedField')}</option>
                            ))}
                        </select>
                        {condition && source && (
                            <>
                                <select
                                    value={condition.operator}
                                    onChange={(event) => onSetCondition({ ...condition, operator: event.target.value as FormConditionOperator })}
                                    className={`${SELECT_CLASS} !h-9`}
                                >
                                    {operatorsForField(source).map((operator) => (
                                        <option key={operator} value={operator}>{t(`forms.operators.${operator}`)}</option>
                                    ))}
                                </select>
                                {operatorNeedsValue(condition.operator) && (
                                    source.type === 'SELECT' ? (
                                        <select value={condition.value || ''} onChange={(event) => onSetCondition({ ...condition, value: event.target.value })} className={`${SELECT_CLASS} !h-9`}>
                                            <option value="">—</option>
                                            {(source.options || []).map((option) => (
                                                <option key={option.id} value={option.id}>{option.label || t('forms.builder.unnamedOption')}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            value={condition.value || ''}
                                            onChange={(event) => onSetCondition({ ...condition, value: event.target.value })}
                                            placeholder={t('forms.builder.conditionValue')}
                                            className={`${INPUT_CLASS} !h-9`}
                                        />
                                    )
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
