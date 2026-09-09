import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '@/i18n/translate';
import { tenderApi } from '@/lib/api/tender';
import type { TenderTextTemplateDto } from '@/types/tender';

/**
 * ── TEXTBAUSTEINE, EINMAL GESCHRIEBEN ────────────────────────────────────────
 * Die Vorlagen des Einleitungstextes gehören dem MANDANTEN, nicht der Offerte:
 * dieselbe Liste, dieselben Knöpfe, egal aus welchem Fenster sie geöffnet wird.
 * Darum liegt der ganze Zustand hier und nicht mehr in der Offertenmaske — seit
 * dem Verkaufs-PDF (Vorgabe Samet: «im Verkauf soll dasselbe kommen wie in den
 * Angebotsdetails, mit dem Vorlagen-Bereich für das Anschreiben») hat er ZWEI
 * Aufrufer:
 *
 *   • pages/sales/detail/components/pdf/TenderPdfContentPanel — der PDF-Reiter
 *     der Offerte,
 *   • components/orders/OrderConfirmationButton — das Verkaufs-PDF des
 *     Auftrags, im Projektmodul wie in der Auftragsansicht.
 *
 * Das Fenster selbst (popups/TextTemplatesPopup) bleibt reine Anzeige; dieser
 * Haken füllt es.
 */

export type TenderTextTemplatesController = {
    /** Ist das Vorlagenfenster offen? */
    open: boolean;
    /** Liste = auswählen/verwalten, Formular = eine Vorlage schreiben. */
    view: 'list' | 'form';
    setView: (view: 'list' | 'form') => void;
    templates: TenderTextTemplateDto[] | null;
    loading: boolean;
    busy: boolean;
    editingTemplate: TenderTextTemplateDto | null;
    formTitle: string;
    setFormTitle: (value: string) => void;
    formContent: string;
    setFormContent: (value: string) => void;
    /** Öffnet das Fenster und lädt die Liste einmalig nach. */
    openPicker: () => void;
    close: () => void;
    startNew: () => void;
    startEdit: (template: TenderTextTemplateDto) => void;
    save: () => void;
    apply: (template: TenderTextTemplateDto) => void;
    remove: (template: TenderTextTemplateDto) => void;
    makeDefault: (template: TenderTextTemplateDto) => void;
    /** Liste holen (aus dem Zwischenspeicher, sonst vom Server). */
    load: () => Promise<TenderTextTemplateDto[]>;
    /** Der Inhalt der Standardvorlage — für die Vorbelegung eines leeren Feldes. */
    loadDefaultContent: () => Promise<string | null>;
};

/** Leer heisst: nur Auszeichnung, kein sichtbarer Text. */
const hasText = (value: string | null | undefined) => Boolean(value && value.replace(/<[^>]*>/g, '').trim());

export const useTenderTextTemplates = ({ currentText, onApply, onError }: {
    /** Der Text, mit dem «+» ein neues Textbaustein-Formular vorbelegt. */
    currentText: string;
    /** Eine gewählte Vorlage landet hier — der Aufrufer schreibt sie in sein Feld. */
    onApply: (content: string) => void;
    onError: (message: string) => void;
}): TenderTextTemplatesController => {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState<'list' | 'form'>('list');
    const [templates, setTemplates] = useState<TenderTextTemplateDto[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<TenderTextTemplateDto | null>(null);
    const [formTitle, setFormTitle] = useState('');
    const [formContent, setFormContent] = useState('');

    /* Über Refs, damit die Rückrufe stabil bleiben: das Fenster bekommt sie als
       Requisiten und soll nicht bei jedem Tastendruck im Editor neu rendern.
       Nachgeführt wird erst nach dem Rendern — gelesen werden sie ohnehin nur
       aus einem Klick heraus. */
    const currentTextRef = useRef(currentText);
    const onApplyRef = useRef(onApply);
    const onErrorRef = useRef(onError);
    useEffect(() => {
        currentTextRef.current = currentText;
        onApplyRef.current = onApply;
        onErrorRef.current = onError;
    }, [currentText, onApply, onError]);

    /* Die geladene Liste liegt auch als Ref vor, damit `load()` und die
       Schreibvorgänge sie ohne Abhängigkeit vom Zustand lesen können. */
    const cacheRef = useRef<TenderTextTemplateDto[] | null>(null);
    const aliveRef = useRef(true);
    useEffect(() => {
        aliveRef.current = true;
        return () => { aliveRef.current = false; };
    }, []);

    const load = useCallback(async (): Promise<TenderTextTemplateDto[]> => {
        if (cacheRef.current) return cacheRef.current;
        setLoading(true);
        try {
            const list = await tenderApi.listTextTemplates();
            cacheRef.current = list;
            if (aliveRef.current) setTemplates(list);
            return list;
        } finally {
            if (aliveRef.current) setLoading(false);
        }
    }, []);

    const write = useCallback((next: TenderTextTemplateDto[]) => {
        cacheRef.current = next;
        setTemplates(next);
    }, []);

    const openPicker = useCallback(() => {
        setView('list');
        setOpen(true);
        void load().catch(() => onErrorRef.current(t('tenders.text_templates_load_error')));
    }, [load]);

    const close = useCallback(() => setOpen(false), []);

    /** «+» — leeres Formular, vorbelegt mit dem Text, der gerade im Feld steht. */
    const startNew = useCallback(() => {
        setEditingTemplate(null);
        setFormTitle('');
        setFormContent(currentTextRef.current ?? '');
        setView('form');
    }, []);

    const startEdit = useCallback((template: TenderTextTemplateDto) => {
        setEditingTemplate(template);
        setFormTitle(template.title);
        setFormContent(template.content ?? '');
        setView('form');
    }, []);

    const save = useCallback(() => {
        const title = formTitle.trim();
        if (!title) {
            onErrorRef.current(t('tenders.text_template_title_required'));
            return;
        }
        if (!hasText(formContent)) {
            onErrorRef.current(t('tenders.text_template_content_required'));
            return;
        }
        setBusy(true);
        void (async () => {
            try {
                if (editingTemplate) {
                    const updated = await tenderApi.updateTextTemplate(editingTemplate.id, { title, content: formContent });
                    write((cacheRef.current ?? []).map((item) => (item.id === updated.id ? updated : item)));
                } else {
                    const created = await tenderApi.createTextTemplate({ title, content: formContent });
                    write([created, ...(cacheRef.current ?? [])]);
                }
                if (aliveRef.current) setView('list');
            } catch {
                onErrorRef.current(t('tenders.text_template_save_error'));
            } finally {
                if (aliveRef.current) setBusy(false);
            }
        })();
    }, [editingTemplate, formContent, formTitle, write]);

    const apply = useCallback((template: TenderTextTemplateDto) => {
        onApplyRef.current(template.content ?? '');
        setOpen(false);
    }, []);

    const remove = useCallback((template: TenderTextTemplateDto) => {
        setBusy(true);
        void (async () => {
            try {
                await tenderApi.deleteTextTemplate(template.id);
                write((cacheRef.current ?? []).filter((item) => item.id !== template.id));
            } catch {
                onErrorRef.current(t('tenders.text_template_delete_error'));
            } finally {
                if (aliveRef.current) setBusy(false);
            }
        })();
    }, [write]);

    const makeDefault = useCallback((template: TenderTextTemplateDto) => {
        setBusy(true);
        void (async () => {
            try {
                await tenderApi.updateTextTemplate(template.id, { isDefault: true });
                write((cacheRef.current ?? []).map((item) => ({ ...item, isDefault: item.id === template.id })));
            } catch {
                onErrorRef.current(t('tenders.text_template_save_error'));
            } finally {
                if (aliveRef.current) setBusy(false);
            }
        })();
    }, [write]);

    /* Vorbelegung eines leeren Feldes. Stiller Fehlschlag: ohne Vorlagen bleibt
       das Feld leer und wird getippt. */
    const loadDefaultContent = useCallback(async (): Promise<string | null> => {
        try {
            const list = await load();
            const fallback = list.find((item) => item.isDefault) ?? null;
            return hasText(fallback?.content) ? String(fallback?.content) : null;
        } catch {
            return null;
        }
    }, [load]);

    return {
        open,
        view,
        setView,
        templates,
        loading,
        busy,
        editingTemplate,
        formTitle,
        setFormTitle,
        formContent,
        setFormContent,
        openPicker,
        close,
        startNew,
        startEdit,
        save,
        apply,
        remove,
        makeDefault,
        load,
        loadDefaultContent,
    };
};
