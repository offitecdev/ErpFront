import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Boxes, ChevronRight, Minus, Pencil, Plus, Save, Tags, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText, readBomSettings } from '@/lib/api/productionBom';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useUnsavedChangesGuard } from '@/pages/sales/detail/hooks/useUnsavedChangesGuard';
import type { BomCode, BomCustomCategory, BomSettings } from '@/types/productionBom';
import '@/styles/modules/productionBom.css';

import { BomCategoryDialog, BomCategoryIcon } from './bomCategories';
import { bomCategoryOptions, type BomCategoryOption } from './bomCategoryOptions';
import { tempKey } from './bomFormat';
import { BomSpinner, LoadingState, Note } from './bomUi';
import { BomUnsavedDialog } from './device/BomUnsavedDialog';

/**
 * Die Abschnitte links (02.10.2026: «categories should be on another page …
 * a button above the BOM button»): Kategorien samt ihren Alt-BOM-Kodes, dann BOM.
 */
type Section = 'categories' | 'bom';
const SECTIONS: Section[] = ['categories', 'bom'];
const MENU: Record<Section, { icon: LucideIcon; title: string; sub: string }> = {
    categories: { icon: Tags, title: 'productionBom.categories.menu', sub: 'productionBom.categories.menuSub' },
    bom: { icon: Boxes, title: 'productionBom.settings.menuBom', sub: 'productionBom.settings.bomTitle' },
};
const MAX = 12;

interface CodeRow { key: string; prefix: string; name: string }
/** Die Alt-BOM-Kodes je Bereich — MECHANICAL, ELECTRICAL und jede eigene Kategorie («c-…»). */
interface Draft { maxPerArea: number; codes: Record<string, CodeRow[]> }

const rowsOf = (codes: BomCode[] | undefined): CodeRow[] => (codes ?? []).map((code) => ({ key: tempKey(), ...code }));

const draftOf = (settings: BomSettings): Draft => ({
    maxPerArea: settings.maxPerArea,
    codes: Object.fromEntries(bomCategoryOptions(settings).map((option) => [option.area, rowsOf(settings.codes[option.area])])),
});

/**
 * Nach dem Anlegen/Löschen einer Kategorie: ungespeicherte Kodes bleiben, eine
 * neue Kategorie bekommt ihre (leere) Liste, eine gelöschte fällt weg.
 */
const mergeDraft = (draft: Draft, settings: BomSettings): Draft => ({
    maxPerArea: draft.maxPerArea,
    codes: Object.fromEntries(bomCategoryOptions(settings).map((option) => [
        option.area,
        draft.codes[option.area] ?? rowsOf(settings.codes[option.area]),
    ])),
});

/** Wie der Server den Vorsatz liest: gross, Leerzeichen → «-», ein «-XXXX» am Ende fällt weg. */
const cleanPrefix = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, '-').replace(/-X{3,}$/, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

const cleanRows = (rows: CodeRow[] | undefined): BomCode[] =>
    (rows ?? []).filter((row) => cleanPrefix(row.prefix) || row.name.trim()).map((row) => ({ prefix: cleanPrefix(row.prefix), name: row.name.trim() }));

const codesOf = (draft: Draft, options: BomCategoryOption[]): BomSettings['codes'] => ({
    MECHANICAL: cleanRows(draft.codes.MECHANICAL),
    ELECTRICAL: cleanRows(draft.codes.ELECTRICAL),
    ...Object.fromEntries(options.filter((option) => option.custom).map((option) => [option.area, cleanRows(draft.codes[option.area])])),
});

const sameDraft = (draft: Draft, settings: BomSettings): boolean => {
    if (draft.maxPerArea !== settings.maxPerArea) return false;
    const options = bomCategoryOptions(settings);
    const mine = codesOf(draft, options) as Record<string, BomCode[]>;
    const saved = settings.codes as Record<string, BomCode[] | undefined>;
    return options.every((option) => JSON.stringify(mine[option.area] ?? []) === JSON.stringify(saved[option.area] ?? []));
};

/**
 * ── ÜRETİM AYARLARI (27.09.2026, Vorgabe Samet) ─────────────────────────────
 *
 * «Bom liste için açılacak max bom belirlenir, bu da üretim modül
 *  ayarlarında olur.» Seit der Hierarchie (gleicher Tag): «BOM kodları şablon
 * haricinde üretim ayarlarında … ana BOM kodu BOM-MEK-00001 / BOM-ELK-00001 …
 * alt BOM kodları Mekanik ve Elektrik için ayrı ayrı.» Links die kleine Liste
 * der Abschnitte (heute: BOM), rechts der Abschnitt — im Rahmen der
 * Geräteseite, ohne Kopfleiste. Ändern darf die Administratorrolle.
 */
/** `tabs`: die grauen Reiter von Üretim › Ayarlar (28.09.2026) — sie stehen statt des Titels. */
export const ProductionSettingsPage = ({ tabs }: { tabs?: ReactNode } = {}) => {
    useLanguageTick();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const raw = params.get('section') as Section | null;
    const section: Section = raw && SECTIONS.includes(raw) ? raw : 'bom';

    const [settings, setSettings] = useState<BomSettings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [local, setLocal] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);
    const [categoryDialog, setCategoryDialog] = useState<{ category: BomCustomCategory | null } | null>(null);

    useEffect(() => readBomSettings(
        (next) => { setSettings(next); setError(null); },
        (failure) => setError(productionBomErrorText(failure, 'productionBom.err.loadFailed')),
    ), []);

    const draft = local ?? (settings ? draftOf(settings) : null);
    const dirty = Boolean(settings && local && !sameDraft(local, settings));
    const canEdit = Boolean(settings?.canEdit);
    const options = bomCategoryOptions(settings);

    const edit = (next: Draft) => setLocal(next);
    const rowsIn = (area: string): CodeRow[] => draft?.codes[area] ?? [];
    const patchRow = (area: string, key: string, patch: Partial<CodeRow>) => {
        if (!draft) return;
        edit({ ...draft, codes: { ...draft.codes, [area]: rowsIn(area).map((row) => (row.key === key ? { ...row, ...patch } : row)) } });
    };
    /** «Alt BOM oluştururken kod alanını kategorinin koduyla doldur»: eine neue Zeile beginnt mit «HYD-». */
    const addRow = (option: BomCategoryOption) => {
        if (!draft) return;
        edit({ ...draft, codes: { ...draft.codes, [option.area]: [...rowsIn(option.area), { key: tempKey(), prefix: `${option.code}-`, name: '' }] } });
    };
    const removeRow = (area: string, key: string) => {
        if (!draft) return;
        edit({ ...draft, codes: { ...draft.codes, [area]: rowsIn(area).filter((row) => row.key !== key) } });
    };
    const categorySaved = (next: BomSettings) => {
        setSettings(next);
        setLocal((current) => (current ? mergeDraft(current, next) : null));
        setCategoryDialog(null);
    };

    const save = async (): Promise<boolean> => {
        if (!draft || !dirty) return true;
        if (saving) return false;
        setSaving(true);
        try {
            const next = await productionBomApi.saveSettings({ maxPerArea: draft.maxPerArea, codes: codesOf(draft, options) });
            setSettings(next);
            setLocal(null);
            toast.success(t('productionBom.settings.saved'));
            return true;
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
            return false;
        } finally {
            setSaving(false);
        }
    };
    // Auch hier: wer mit ungespeicherten Kodes weggeht, wird gefragt.
    const guard = useUnsavedChangesGuard(dirty && !saving);

    return (
        <div className="ofi-bom is-page">
            <header className="ofi-bom-head">
                {tabs ?? <h1 className="ofi-bom-head__title">{t('productionBom.settings.title')}</h1>}
                {canEdit && draft && (
                    <span className="ofi-bom-head__actions">
                        {dirty && (
                            <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" disabled={saving} onClick={() => setLocal(null)}>
                                {t('productionBom.editor.revert')}
                            </button>
                        )}
                        <button type="button" className="ofi-bom-btn is-primary ofi-nosize" disabled={!dirty || saving} onClick={() => void save()}>
                            {saving ? <BomSpinner small /> : <Save />}
                            {t('productionBom.common.save')}
                        </button>
                    </span>
                )}
            </header>
            <div className="ofi-bom-split is-narrow">
                <aside className="ofi-bom-side">
                    <div className="ofi-bom-source" role="tablist" aria-label={t('productionBom.settings.title')}>
                        {SECTIONS.map((key) => {
                            const { icon: Icon, title, sub } = MENU[key];
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={section === key}
                                    className={`ofi-bom-source__row ofi-nosize${section === key ? ' is-selected' : ''}`}
                                    onClick={() => setParams(key === 'bom' ? {} : { section: key }, { replace: true })}
                                >
                                    <span className="ofi-bom-source__icon"><Icon /></span>
                                    <span className="ofi-bom-source__text">
                                        <b>{t(title)}</b>
                                        <small>{t(sub)}</small>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </aside>
                <div className="ofi-bom-main">
                    {error && !settings ? (
                        <div className="ofi-bom-state is-error"><TriangleAlert aria-hidden /><b>{error}</b></div>
                    ) : !settings || !draft ? (
                        <LoadingState />
                    ) : (
                        <div className="ofi-bom-editor is-settings">
                            {section === 'bom' && (
                                <>
                                    <section className="ofi-bom-group">
                                        <h3 className="ofi-bom-group__title">{t('productionBom.settings.bomTitle')}</h3>
                                        <div className="ofi-bom-group__box">
                                            <div className="ofi-bom-row">
                                                <span className="ofi-bom-row__label">
                                                    {t('productionBom.settings.maxPerArea')}
                                                    <small>{t('productionBom.settings.maxPerAreaSub')}</small>
                                                </span>
                                                <div className="ofi-bom-row__control is-inline">
                                                    <span className="ofi-bom-stepper" role="group" aria-label={t('productionBom.settings.maxPerArea')}>
                                                        <button
                                                            type="button"
                                                            className="ofi-nosize"
                                                            disabled={!canEdit || draft.maxPerArea <= 1}
                                                            aria-label="−"
                                                            onClick={() => edit({ ...draft, maxPerArea: Math.max(1, draft.maxPerArea - 1) })}
                                                        >
                                                            <Minus />
                                                        </button>
                                                        <output aria-live="polite">{draft.maxPerArea}</output>
                                                        <button
                                                            type="button"
                                                            className="ofi-nosize"
                                                            disabled={!canEdit || draft.maxPerArea >= MAX}
                                                            aria-label="+"
                                                            onClick={() => edit({ ...draft, maxPerArea: Math.min(MAX, draft.maxPerArea + 1) })}
                                                        >
                                                            <Plus />
                                                        </button>
                                                    </span>
                                                </div>
                                            </div>
                                            <button type="button" className="ofi-bom-row is-link ofi-nosize" onClick={() => setParams({ section: 'categories' }, { replace: true })}>
                                                <span className="ofi-bom-row__label">{t('productionBom.categories.link')}</span>
                                                <ChevronRight className="ofi-bom-row__chev" aria-hidden />
                                            </button>
                                            <button type="button" className="ofi-bom-row is-link ofi-nosize" onClick={() => navigate('/production/templates/bom')}>
                                                <span className="ofi-bom-row__label">{t('productionBom.settings.templatesLink')}</span>
                                                <ChevronRight className="ofi-bom-row__chev" aria-hidden />
                                            </button>
                                        </div>
                                        <p className="ofi-bom-group__foot">{t('productionBom.settings.maxPerAreaHint')}</p>
                                    </section>

                                    {options.map((option) => (
                                        <section key={option.area} className="ofi-bom-group">
                                            <h3 className="ofi-bom-group__title">
                                                {t('productionBom.settings.subCodes', { area: option.label })}
                                                <span className="ofi-bom-group__count">{rowsIn(option.area).length}</span>
                                            </h3>
                                            <div className="ofi-bom-group__box ofi-bom-codes">
                                                {rowsIn(option.area).map((row) => {
                                                    const area = option.area;
                                                    const preview = cleanPrefix(row.prefix);
                                                    return (
                                                        <div key={row.key} className="ofi-bom-codes__row">
                                                            <input
                                                                className="ofi-bom-input is-mono is-upper ofi-bom-codes__prefix"
                                                                value={row.prefix}
                                                                maxLength={24}
                                                                spellCheck={false}
                                                                disabled={!canEdit}
                                                                placeholder={t('productionBom.settings.codePrefix')}
                                                                aria-label={t('productionBom.settings.codePrefix')}
                                                                onChange={(event) => patchRow(area, row.key, { prefix: event.target.value })}
                                                            />
                                                            <input
                                                                className="ofi-bom-input ofi-bom-codes__name"
                                                                value={row.name}
                                                                maxLength={80}
                                                                disabled={!canEdit}
                                                                placeholder={t('productionBom.settings.codeName')}
                                                                aria-label={t('productionBom.settings.codeName')}
                                                                onChange={(event) => patchRow(area, row.key, { name: event.target.value })}
                                                            />
                                                            <span className="ofi-bom-codes__preview">{preview ? `${preview}-00001` : '—'}</span>
                                                            {canEdit && (
                                                                <button
                                                                    type="button"
                                                                    className="ofi-bom-iconbtn is-danger-hover ofi-nosize"
                                                                    title={t('productionBom.settings.codeRemove')}
                                                                    aria-label={t('productionBom.settings.codeRemove')}
                                                                    onClick={() => removeRow(area, row.key)}
                                                                >
                                                                    <Trash2 />
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {!rowsIn(option.area).length && <div className="ofi-bom-codes__empty">{t('productionBom.settings.codesEmpty')}</div>}
                                                {canEdit && (
                                                    <button type="button" className="ofi-bom-row is-link is-add ofi-nosize" onClick={() => addRow(option)}>
                                                        <Plus aria-hidden />
                                                        <span className="ofi-bom-row__label">{t('productionBom.settings.codeAdd')}</span>
                                                    </button>
                                                )}
                                            </div>
                                            <p className="ofi-bom-group__foot">{t('productionBom.settings.codesHint')}</p>
                                        </section>
                                    ))}
                                </>
                            )}

                            {section === 'categories' && (
                                <section className="ofi-bom-group">
                                    <h3 className="ofi-bom-group__title">
                                        {t('productionBom.categories.title')}
                                        <span className="ofi-bom-group__count">{options.length}</span>
                                    </h3>
                                    <div className="ofi-bom-group__box ofi-bom-codes">
                                        {options.map((option) => (
                                            <div key={option.area} className="ofi-bom-codes__row is-category">
                                                <span className="ofi-bom-codes__icon" aria-hidden><BomCategoryIcon category={option.category} /></span>
                                                <span className="ofi-bom-codes__catname">
                                                    <b>{option.label}</b>
                                                    <small>{option.custom ? t('productionBom.categories.custom') : t('productionBom.categories.builtIn')}</small>
                                                </span>
                                                <span className="ofi-bom-code">{option.code}</span>
                                                <span className="ofi-bom-codes__preview">{`BOM-${option.code}-00001`}</span>
                                                {canEdit && option.custom && (
                                                    <button
                                                        type="button"
                                                        className="ofi-bom-iconbtn ofi-nosize"
                                                        title={t('productionBom.categories.edit', { name: option.label })}
                                                        aria-label={t('productionBom.categories.edit', { name: option.label })}
                                                        onClick={() => setCategoryDialog({ category: option.custom })}
                                                    >
                                                        <Pencil />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {canEdit && (
                                            <button type="button" className="ofi-bom-row is-link is-add ofi-nosize" onClick={() => setCategoryDialog({ category: null })}>
                                                <Plus aria-hidden />
                                                <span className="ofi-bom-row__label">{t('productionBom.categories.add')}</span>
                                            </button>
                                        )}
                                    </div>
                                    <p className="ofi-bom-group__foot">{t('productionBom.categories.hint')}</p>
                                </section>
                            )}
                            {!canEdit && <Note>{t('productionBom.settings.readOnly')}</Note>}
                        </div>
                    )}
                </div>
            </div>
            <BomUnsavedDialog guard={guard} text={t('productionBom.settings.unsavedText')} onSave={save} />
            <BomCategoryDialog
                open={categoryDialog !== null}
                category={categoryDialog?.category ?? null}
                onClose={() => setCategoryDialog(null)}
                onSaved={categorySaved}
            />
        </div>
    );
};

export default ProductionSettingsPage;
