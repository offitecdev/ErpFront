import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import {
    primeBomTemplate,
    productionBomApi,
    productionBomErrorText,
    readBomSettings,
    readBomTemplate,
    readBomTemplates,
    refreshBomTemplates,
} from '@/lib/api/productionBom';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useUnsavedChangesGuard } from '@/pages/sales/detail/hooks/useUnsavedChangesGuard';
import type { BomCustomCategory, BomSettings, BomTemplate, BomTemplateSummary } from '@/types/productionBom';
import '@/styles/modules/warehouse.css';
import '@/styles/modules/productionBom.css';

import { BomCategoryDialog } from '../bomCategories';
import { bomCategoryOptions } from '../bomCategoryOptions';
import { BomSpinner, EmptyState, LoadingState } from '../bomUi';
import { BomTemplateEditor } from './BomTemplateEditor';
import { BomTemplateList } from './BomTemplateList';
import { draftDirty, draftFromTemplate, draftInput, emptyDraft, linesValid, type TemplateDraft } from './templateDraft';

const NEW = 'new';

/**
 * ── ÜRETİM · BOM ŞABLONLARI (27.09.2026, Vorgabe Samet) ─────────────────────
 *
 * «Şablon kısmı pop-up değil, direkt sayfa olarak olması gerekiyor … üretimdeki
 *  gibi küçülecek, cihaz üretimindeki gibi solda küçük menüler, üstte menü yok.»
 *
 * Der Rahmen der Geräteseite (schmale Leiste, keine Kopfleiste — MainLayout
 * `isDeviceFocusPath`). Links die Quellliste (Kategorie, Suche, nach Ana kart
 * gruppiert), rechts die gewählte Vorlage. Die Wahl steht in der Adresse
 * (`?t=` / `?t=new`); gespeichert wird ausdrücklich (Knopf oder ⌘S), wer
 * ungespeichert geht, wird gefragt.
 */
/** `tabs`: die grauen Reiter der Seite «Şablonlar» (28.09.2026) — sie stehen statt des Titels. */
export const BomTemplatesPage = ({ tabs }: { tabs?: ReactNode } = {}) => {
    useLanguageTick();
    const [params, setParams] = useSearchParams();
    const [list, setList] = useState<BomTemplateSummary[] | null>(null);
    const [canEdit, setCanEdit] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [listTick, setListTick] = useState(0);
    const [saved, setSaved] = useState<BomTemplate | null>(null);
    const [draft, setDraft] = useState<TemplateDraft | null>(null);
    const [revision, setRevision] = useState(0);
    const [templateError, setTemplateError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [switchTo, setSwitchTo] = useState<string | null>(null);
    const [seeding, setSeeding] = useState(false);
    // Die Kategorien (fest + eigene) und wer sie anlegen darf, aus den Einstellungen.
    const [settings, setSettings] = useState<BomSettings | null>(null);
    const [categoryDialog, setCategoryDialog] = useState<{ category: BomCustomCategory | null } | null>(null);

    const savedRef = useRef<BomTemplate | null>(null);
    const draftRef = useRef<TemplateDraft | null>(null);

    const rawWanted = params.get('t');
    const wanted = rawWanted === NEW && !canEdit && list ? null : rawWanted;
    const selectedId = wanted === NEW
        ? null
        : wanted && (list?.some((item) => item.id === wanted) || saved?.id === wanted) ? wanted : list?.[0]?.id ?? null;

    const resetDraft = useCallback((next: TemplateDraft | null) => {
        draftRef.current = next;
        setDraft(next);
        setRevision((value) => value + 1);
    }, []);
    const updateDraft = useCallback((next: TemplateDraft) => {
        draftRef.current = next;
        setDraft(next);
    }, []);

    useEffect(() => readBomTemplates(
        (value) => { setList(value.items); setCanEdit(value.canEdit); setListError(null); },
        (error) => setListError(productionBomErrorText(error, 'productionBom.err.loadFailed')),
    ), [listTick]);

    useEffect(() => readBomSettings((value) => setSettings(value), () => undefined), []);
    const categories = bomCategoryOptions(settings);

    const reloadList = useCallback(() => {
        void refreshBomTemplates()
            .then((value) => { setList(value.items); setCanEdit(value.canEdit); setListError(null); })
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        if (!selectedId) return undefined;
        return readBomTemplate(
            selectedId,
            (value) => {
                const previous = savedRef.current;
                savedRef.current = value;
                setSaved(value);
                setTemplateError(null);
                const current = draftRef.current;
                const keep = Boolean(current && current.id === value.id && previous && previous.id === value.id && draftDirty(current, previous));
                if (!keep) resetDraft(draftFromTemplate(value));
            },
            (error) => setTemplateError(productionBomErrorText(error, 'productionBom.err.loadFailed')),
        );
    }, [selectedId, resetDraft]);

    useEffect(() => {
        if (wanted !== NEW || !canEdit) return;
        if (draftRef.current && draftRef.current.id === null) return;
        savedRef.current = null;
        setSaved(null);
        resetDraft(emptyDraft());
    }, [wanted, canEdit, resetDraft]);

    const shownDraft = draft && (wanted === NEW ? draft.id === null : draft.id === selectedId) ? draft : null;
    const shownSaved = shownDraft?.id && saved?.id === shownDraft.id ? saved : null;
    const dirty = canEdit && draftDirty(shownDraft, shownSaved);
    const summary = list?.find((item) => item.id === shownDraft?.id) ?? null;
    const guard = useUnsavedChangesGuard(dirty && !saving && !deleting);

    const applySwitch = useCallback((target: string) => {
        if (target === NEW) {
            savedRef.current = null;
            setSaved(null);
            resetDraft(emptyDraft());
        } else if (draftRef.current?.id === null) {
            resetDraft(null);
        }
        setParams(target ? { t: target } : {}, { replace: true });
    }, [resetDraft, setParams]);

    const requestSwitch = (target: string) => {
        if (target === wanted || (target === selectedId && wanted !== NEW)) return;
        if (dirty) setSwitchTo(target);
        else applySwitch(target);
    };

    const save = useCallback(async (): Promise<boolean> => {
        const current = draftRef.current;
        if (!current || saving) return false;
        if (!current.name.trim()) {
            toast.error(t('productionBom.err.NAME_REQUIRED'));
            return false;
        }
        if (!linesValid(current.lines)) {
            toast.error(t('productionBom.err.LINE_INVALID', { row: current.lines.findIndex((line) => !(Number(line.quantityText.replace(',', '.')) > 0)) + 1 }));
            return false;
        }
        setSaving(true);
        try {
            const input = draftInput(current);
            const result = current.id
                ? await productionBomApi.saveTemplate(current.id, input)
                : await productionBomApi.createTemplate(input);
            void primeBomTemplate(result);
            savedRef.current = result;
            setSaved(result);
            resetDraft(draftFromTemplate(result));
            if (!current.id) setParams({ t: result.id }, { replace: true });
            reloadList();
            toast.success(t('productionBom.editor.saved'));
            return true;
        } catch (error) {
            toast.error(productionBomErrorText(error));
            return false;
        } finally {
            setSaving(false);
        }
    }, [saving, resetDraft, setParams, reloadList]);

    useEffect(() => {
        if (!canEdit) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
            event.preventDefault();
            if (dirty && !saving) void save();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [canEdit, dirty, saving, save]);

    const duplicate = () => {
        if (!shownDraft) return;
        const copy: TemplateDraft = {
            ...shownDraft,
            id: null,
            name: t('productionBom.editor.copyName', { name: shownDraft.name.trim() || t('productionBom.templates.untitled') }),
            lines: shownDraft.lines.map((line) => ({ ...line, key: `copy-${line.key}` })),
        };
        savedRef.current = null;
        setSaved(null);
        resetDraft(copy);
        setParams({ t: NEW }, { replace: true });
    };

    const remove = async () => {
        const current = shownDraft;
        if (!current?.id) return;
        setDeleting(true);
        try {
            await productionBomApi.removeTemplate(current.id);
            toast.success(t('productionBom.editor.deleted'));
            setConfirmDelete(false);
            setList((items) => items?.filter((item) => item.id !== current.id) ?? null);
            savedRef.current = null;
            setSaved(null);
            resetDraft(null);
            setParams({}, { replace: true });
            reloadList();
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setDeleting(false);
        }
    };

    const seed = async () => {
        setSeeding(true);
        try {
            const result = await productionBomApi.seedExamples();
            toast.success(result.templates
                ? t('productionBom.templates.examplesDone', { templates: result.templates, products: result.products })
                : t('productionBom.templates.examplesNone'));
            reloadList();
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setSeeding(false);
        }
    };

    const listLoading = !list && !listError;
    const loadingTemplate = Boolean(selectedId && !shownDraft && !templateError);
    const hasExamples = Boolean(list?.some((item) => item.isExample));

    return (
        <div className="ofi-bom is-page">
            <header className="ofi-bom-head">
                {tabs ?? <h1 className="ofi-bom-head__title">{t('productionBom.templates.title')}</h1>}
                {list && <span className="ofi-bom-head__count">{t('productionBom.templates.count', { count: list.length })}</span>}
                <div className="ofi-bom-head__actions">
                    {canEdit && list && !hasExamples && (
                        <button type="button" className="ofi-bom-btn ofi-nosize" disabled={seeding} onClick={() => void seed()}>
                            {seeding ? <BomSpinner small /> : <Sparkles />}
                            {t('productionBom.templates.examples')}
                        </button>
                    )}
                    {canEdit && (
                        <button type="button" className="ofi-bom-btn is-primary ofi-nosize" onClick={() => requestSwitch(NEW)}>
                            <Plus />
                            {t('productionBom.templates.new')}
                        </button>
                    )}
                </div>
            </header>

            {listError && !list ? (
                <div className="ofi-bom-state is-error">
                    <TriangleAlert aria-hidden />
                    <b>{listError}</b>
                    <button type="button" className="ofi-bom-btn ofi-nosize" onClick={() => setListTick((value) => value + 1)}>
                        {t('productionBom.common.retry')}
                    </button>
                </div>
            ) : (
                <div className="ofi-bom-split">
                    <BomTemplateList
                        items={list}
                        loading={listLoading}
                        selectedId={selectedId}
                        draftNew={wanted === NEW && shownDraft ? { name: shownDraft.name, category: shownDraft.category } : null}
                        canEdit={canEdit}
                        categories={categories}
                        onSelect={requestSwitch}
                        onNew={() => requestSwitch(NEW)}
                        onNewCategory={settings?.canEdit ? () => setCategoryDialog({ category: null }) : undefined}
                        onEditCategory={settings?.canEdit ? (category) => setCategoryDialog({ category }) : undefined}
                    />
                    <div className="ofi-bom-main">
                        {shownDraft ? (
                            <BomTemplateEditor
                                key={`${shownDraft.id ?? NEW}:${revision}`}
                                draft={shownDraft}
                                summary={summary}
                                categories={categories}
                                canEdit={canEdit}
                                dirty={dirty}
                                saving={saving}
                                onChange={updateDraft}
                                onSave={() => void save()}
                                onRevert={() => { if (shownSaved) resetDraft(draftFromTemplate(shownSaved)); }}
                                onDuplicate={duplicate}
                                onDelete={() => setConfirmDelete(true)}
                            />
                        ) : templateError ? (
                            <div className="ofi-bom-state is-error">
                                <TriangleAlert aria-hidden />
                                <b>{templateError}</b>
                            </div>
                        ) : loadingTemplate || listLoading ? (
                            <LoadingState />
                        ) : (
                            <EmptyState icon={<Boxes />} title={t('productionBom.templates.empty')} hint={t('productionBom.templates.emptyHint')}>
                                {canEdit && (
                                    <span className="ofi-bom-state__actions">
                                        <button type="button" className="ofi-bom-btn ofi-nosize" disabled={seeding} onClick={() => void seed()}>
                                            <Sparkles />
                                            {t('productionBom.templates.examples')}
                                        </button>
                                        <button type="button" className="ofi-bom-btn is-primary ofi-nosize" onClick={() => requestSwitch(NEW)}>
                                            <Plus />
                                            {t('productionBom.templates.new')}
                                        </button>
                                    </span>
                                )}
                            </EmptyState>
                        )}
                    </div>
                </div>
            )}

            <BomCategoryDialog
                open={categoryDialog !== null}
                category={categoryDialog?.category ?? null}
                onClose={() => setCategoryDialog(null)}
                onSaved={(next) => { setSettings(next); setCategoryDialog(null); }}
            />

            <PopupDialog
                open={confirmDelete}
                onClose={() => { if (!deleting) setConfirmDelete(false); }}
                title={t('productionBom.editor.deleteTitle')}
                subtitle={t('productionBom.editor.deleteText', { name: shownDraft?.name ?? '' })}
                icon={<Trash2 size={18} />}
                tone="danger"
                width={460}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setConfirmDelete(false)} disabled={deleting}>{t('productionBom.common.cancel')}</PopupButton>
                        <PopupButton variant="danger" loading={deleting} onClick={() => void remove()}>{t('productionBom.common.delete')}</PopupButton>
                    </PopupActions>
                )}
            />

            <PopupDialog
                open={switchTo !== null}
                onClose={() => setSwitchTo(null)}
                title={t('productionBom.editor.unsavedTitle')}
                subtitle={t('productionBom.editor.unsavedText')}
                icon={<TriangleAlert size={18} />}
                tone="warning"
                width={460}
                footer={(
                    <PopupActions start={<PopupButton onClick={() => setSwitchTo(null)}>{t('productionBom.editor.keepEditing')}</PopupButton>}>
                        <PopupButton variant="danger" onClick={() => { const target = switchTo; setSwitchTo(null); if (target) applySwitch(target); }}>
                            {t('productionBom.editor.discard')}
                        </PopupButton>
                        <PopupButton variant="primary" onClick={() => { const target = switchTo; void save().then((ok) => { if (ok && target) { setSwitchTo(null); applySwitch(target); } }); }}>
                            {t('productionBom.common.save')}
                        </PopupButton>
                    </PopupActions>
                )}
            />

            <PopupDialog
                open={guard.isOpen}
                onClose={guard.cancel}
                title={t('productionBom.editor.unsavedTitle')}
                subtitle={t('productionBom.editor.unsavedText')}
                icon={<TriangleAlert size={18} />}
                tone="warning"
                width={460}
                footer={(
                    <PopupActions start={<PopupButton onClick={guard.cancel}>{t('productionBom.editor.keepEditing')}</PopupButton>}>
                        <PopupButton variant="danger" onClick={guard.proceed}>{t('productionBom.editor.discard')}</PopupButton>
                        <PopupButton variant="primary" onClick={() => { void save().then((ok) => { if (ok) guard.proceed(); }); }}>
                            {t('productionBom.common.save')}
                        </PopupButton>
                    </PopupActions>
                )}
            />
        </div>
    );
};

export default BomTemplatesPage;
