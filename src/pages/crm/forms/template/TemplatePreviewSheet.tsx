import { useState } from 'react';
import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { BottomSheet } from '@/pages/inventory/components/BottomSheet';
import type { FormFieldDef, FormValues } from '@/lib/formFields';
import { FormRenderer } from '../components/FormRenderer';
import { BTN_SECONDARY } from '../ui';

/**
 * Vorschau des Vorlagen-Editors im Untenfenster — bedienbar, damit sich eine
 * Bedingung sofort ausprobieren lässt ("Kernbohrung nötig?" ankreuzen → die
 * abhängigen Felder erscheinen). Die eingetippten Werte gehören der Vorschau
 * und werden nirgends gespeichert; beim Schliessen sind sie weg.
 *
 * Felder ohne Beschriftung bleiben aussen vor — sie sind noch im Bau.
 */
export const TemplatePreviewSheet = ({
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
        <BottomSheet
            open
            title={templateName || t('forms.builder.preview')}
            subtitle={t('forms.builder.previewHint')}
            onClose={onClose}
            width={820}
            height={800}
            zIndex={120}
            headerActions={(
                <button type="button" className={BTN_SECONDARY} onClick={() => setValues({})}>
                    <X size={13} />{t('forms.builder.resetPreview')}
                </button>
            )}
        >
            <div className="p-5">
                <FormRenderer
                    fields={ready}
                    values={values}
                    onChange={(fieldId, value) => setValues((current) => ({ ...current, [fieldId]: value }))}
                    emptyText={t('forms.builder.previewEmpty')}
                />
            </div>
        </BottomSheet>
    );
};
