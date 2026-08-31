import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { t } from '@/i18n/translate';
import { formsApi, type FormTemplateDto } from '@/lib/api/forms';
import type { FormFieldDef } from '@/lib/formFields';
import { apiErrorMessage } from '../ui';
import {
    draftFromTemplate,
    draftSignature,
    draftToInput,
    emptyDraft,
    issueMessage,
    validateDraft,
    type TemplateDraft,
} from './templateModel';

/**
 * Zustand des Vorlagen-Editors: laden, ändern, speichern — mehr nicht. Die
 * Seite bleibt dadurch reines Zeichnen, und die Feldarbeit liegt in den reinen
 * Funktionen aus templateModel.
 *
 * "Geändert?" ist ein Vergleich mit dem zuletzt gespeicherten Stand
 * (`baseline`), nicht ein Merker, den jede Änderung setzen müsste — nach dem
 * Speichern stimmt er von selbst wieder.
 */
export interface TemplateEditor {
    loading: boolean;
    saving: boolean;
    dirty: boolean;
    draft: TemplateDraft;
    update: (patch: Partial<TemplateDraft>) => void;
    setFields: (fields: FormFieldDef[]) => void;
    /** Speichert und gibt die gespeicherte Vorlage zurück (null = Fehler). */
    save: () => Promise<FormTemplateDto | null>;
}

export const useTemplateEditor = (templateId?: string): TemplateEditor => {
    const isNew = !templateId || templateId === 'new';
    const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
    const [baseline, setBaseline] = useState(() => (isNew ? draftSignature(emptyDraft()) : ''));
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isNew) return;
        let cancelled = false;
        formsApi.getTemplate(templateId!)
            .then((template) => {
                if (cancelled) return;
                const loaded = draftFromTemplate(template);
                setDraft(loaded);
                setBaseline(draftSignature(loaded));
            })
            .catch((error) => { if (!cancelled) toast.error(apiErrorMessage(error, t('forms.errors.load'))); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [templateId, isNew]);

    const dirty = useMemo(() => draftSignature(draft) !== baseline, [draft, baseline]);

    const update = useCallback((patch: Partial<TemplateDraft>) => {
        setDraft((current) => ({ ...current, ...patch }));
    }, []);

    const setFields = useCallback((fields: FormFieldDef[]) => {
        setDraft((current) => ({ ...current, fields }));
    }, []);

    const save = useCallback(async (): Promise<FormTemplateDto | null> => {
        const issues = validateDraft(draft);
        if (issues.length > 0) {
            toast.error(issueMessage(issues[0]));
            return null;
        }
        setSaving(true);
        try {
            const input = draftToInput(draft);
            const saved = isNew
                ? await formsApi.createTemplate(input)
                : await formsApi.updateTemplate(templateId!, input);
            const stored = draftFromTemplate(saved);
            setDraft(stored);
            setBaseline(draftSignature(stored));
            toast.success(t('forms.builder.saved'));
            return saved;
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.save')));
            return null;
        } finally {
            setSaving(false);
        }
    }, [draft, isNew, templateId]);

    return { loading, saving, dirty, draft, update, setFields, save };
};
