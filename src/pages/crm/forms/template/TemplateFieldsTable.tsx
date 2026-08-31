import { LuGitBranch, LuSquareCheck } from 'react-icons/lu';
import { ArrowDown, ArrowUp, Copy01, Edit01, Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { fieldTypeLabel, type FormFieldDef } from '@/lib/formFields';
import { BTN_ICON, BTN_ICON_DANGER } from '../ui';
import { FIELD_ICONS } from './fieldTypes';
import { describeCondition } from './templateModel';

/**
 * Die Felder einer Vorlage als TABELLE — eine Zeile je Feld statt einer Karte,
 * damit auch eine lange Checkliste auf einen Blick lesbar bleibt: Nr. |
 * Beschriftung | Feldtyp | Pflicht | Bedingung | Aktionen.
 *
 * Alles Weitere (Platzhalter, Hilfetext, Auswahlmöglichkeiten, Bedingung)
 * steht in der Seitenspalte daneben; ein Klick auf die Zeile öffnet sie. Nur
 * das Pflicht-Häkchen sitzt direkt in der Zeile — es wird beim Durchgehen
 * einer Vorlage am häufigsten umgestellt.
 *
 * Die LETZTE Zeile ist das Plus: "Prüfpunkt" legt sofort einen an, "Feld
 * hinzufügen" öffnet die Seitenspalte mit der Typauswahl.
 */
export const TemplateFieldsTable = ({
    fields,
    onEdit,
    onToggleRequired,
    onMove,
    onCopy,
    onRemove,
    onAdd,
    onAddCheckpoint,
}: {
    fields: FormFieldDef[];
    onEdit: (index: number) => void;
    onToggleRequired: (field: FormFieldDef, required: boolean) => void;
    onMove: (index: number, delta: number) => void;
    onCopy: (index: number) => void;
    onRemove: (field: FormFieldDef) => void;
    onAdd: () => void;
    onAddCheckpoint: () => void;
}) => (
    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
        <colgroup>
            <col style={{ width: 44 }} />
            <col />
            <col style={{ width: 170 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 230 }} />
            <col style={{ width: 170 }} />
        </colgroup>
        <thead>
            <tr>
                <th className="text-right">#</th>
                <th className="text-left">{t('forms.builder.label')}</th>
                <th className="text-left">{t('forms.builder.type')}</th>
                <th className="text-center">{t('forms.builder.required')}</th>
                <th className="text-left">{t('forms.builder.colCondition')}</th>
                <th className="text-right">{t('forms.panel.colActions')}</th>
            </tr>
        </thead>
        <tbody>
            {fields.map((field, index) => {
                const isSection = field.type === 'SECTION';
                const conditionText = describeCondition(fields, field);
                const Icon = FIELD_ICONS[field.type];
                return (
                    <tr
                        key={field.id}
                        className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${isSection ? 'bg-[#eef2fb]/60 dark:bg-amber-500/5' : ''}`}
                        onClick={() => onEdit(index)}
                    >
                        <td className="text-right font-mono text-[11.5px] text-slate-400">{index + 1}</td>
                        <td>
                            <span className={`flex min-w-0 items-center gap-1.5 ${conditionText ? 'pl-4' : ''}`}>
                                {conditionText && <LuGitBranch size={11} className="shrink-0 text-[#1f2654] dark:text-amber-400" />}
                                <span className={`truncate ${isSection ? 'text-[13px] font-bold text-[#1f2654] dark:text-amber-300' : 'font-semibold text-slate-900 dark:text-white'}`}>
                                    {field.label || <span className="font-normal text-slate-300">{t('forms.builder.unnamedField')}</span>}
                                </span>
                            </span>
                            {field.help && <span className="block truncate text-[11.5px] text-slate-400">{field.help}</span>}
                        </td>
                        <td>
                            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-600 dark:text-white/70">
                                <Icon size={14} className="shrink-0 text-[#1f2654] dark:text-amber-400" />
                                <span className="truncate">{fieldTypeLabel(field.type)}</span>
                            </span>
                        </td>
                        <td className="text-center" onClick={(event) => event.stopPropagation()}>
                            {isSection ? (
                                <span className="text-slate-300">—</span>
                            ) : (
                                <input
                                    type="checkbox"
                                    checked={Boolean(field.required)}
                                    onChange={(event) => onToggleRequired(field, event.target.checked)}
                                    aria-label={t('forms.builder.required')}
                                    className="size-4 accent-[#1f2654]"
                                />
                            )}
                        </td>
                        <td className="truncate text-[12px] text-slate-600 dark:text-white/70">
                            {conditionText || <span className="text-slate-300">—</span>}
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                                <button type="button" className={BTN_ICON} onClick={() => onEdit(index)} title={t('common.edit')}><Edit01 size={13} /></button>
                                <button type="button" className={BTN_ICON} disabled={index === 0} onClick={() => onMove(index, -1)} title={t('forms.builder.moveUp')}><ArrowUp size={13} /></button>
                                <button type="button" className={BTN_ICON} disabled={index === fields.length - 1} onClick={() => onMove(index, 1)} title={t('forms.builder.moveDown')}><ArrowDown size={13} /></button>
                                <button type="button" className={BTN_ICON} onClick={() => onCopy(index)} title={t('forms.builder.duplicateField')}><Copy01 size={13} /></button>
                                <button type="button" className={BTN_ICON_DANGER} onClick={() => onRemove(field)} title={t('common.delete')}><Trash01 size={13} /></button>
                            </div>
                        </td>
                    </tr>
                );
            })}

            {/* Plus-Zeile: neue Felder entstehen IN der Tabelle, nicht darüber. */}
            <tr>
                <td colSpan={6} className="!p-0">
                    <div className="flex flex-wrap items-center gap-1">
                        <button
                            type="button"
                            onClick={onAdd}
                            className="inline-flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-semibold text-[#1f2654] transition-colors hover:bg-[#eef2fb] dark:text-amber-300 dark:hover:bg-white/5"
                        >
                            <Plus size={14} />{t('forms.builder.addField')}
                        </button>
                        <button
                            type="button"
                            onClick={onAddCheckpoint}
                            className="inline-flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#1f2654] dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
                        >
                            <LuSquareCheck size={14} />{t('forms.builder.addCheckpoint')}
                        </button>
                    </div>
                </td>
            </tr>
        </tbody>
    </table>
);
