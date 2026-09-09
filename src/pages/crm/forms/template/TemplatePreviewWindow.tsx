import { useState } from 'react';
import { LuRotateCcw } from 'react-icons/lu';
import { t } from '@/i18n/translate';
import type { FormFieldDef, FormValues } from '@/lib/formFields';
import { FormRenderer } from '../components/FormRenderer';
import { ChecklistWindow } from '../components/ChecklistWindow';

/**
 * Vorschau des Vorlagen-Editors — im selben schwebenden Fenster wie eine
 * echte Checkliste (ChecklistWindow), damit die Vorlage so aussieht, wie sie
 * später ausgefüllt wird. Bedienbar: eine Bedingung lässt sich sofort
 * ausprobieren («Kernbohrung nötig?» einschalten → die abhängigen Felder
 * erscheinen). Die eingetippten Werte gehören der Vorschau und werden
 * nirgends gespeichert; beim Schliessen sind sie weg.
 *
 * Felder ohne Beschriftung bleiben aussen vor — sie sind noch im Bau.
 */
export const TemplatePreviewWindow = ({
    templateName,
    fields,
    onClose,
}: {
    templateName: string;
    fields: FormFieldDef[];
    onClose: () => void;
}) => {
    const [values, setValues] = useState<FormValues>({});
    const ready = fields.filter((field) => field.label.trim());

    return (
        <ChecklistWindow
            open
            title={templateName || t('forms.builder.preview')}
            subtitle={t('forms.builder.previewHint')}
            onClose={onClose}
            headerActions={(
                <button type="button" className="ofi-cal-btn" onClick={() => setValues({})}>
                    <LuRotateCcw size={14} />{t('forms.builder.resetPreview')}
                </button>
            )}
        >
            <div className="ofi-chk ofi-chk-stage">
                <FormRenderer
                    fields={ready}
                    values={values}
                    onChange={(fieldId, value) => setValues((current) => ({ ...current, [fieldId]: value }))}
                    emptyText={t('forms.builder.previewEmpty')}
                />
            </div>
        </ChecklistWindow>
    );
};
