import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Boxes, ChevronRight, Minus, Plus, Save, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText, readBomSettings } from '@/lib/api/productionBom';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useUnsavedChangesGuard } from '@/pages/sales/detail/hooks/useUnsavedChangesGuard';
import type { BomCode, BomSettings } from '@/types/productionBom';
import type { BuiltInArea } from '@/types/productionTasks';
import '@/styles/modules/productionBom.css';

import { tempKey } from './bomFormat';
import { BomSpinner, LoadingState, Note } from './bomUi';
import { BomUnsavedDialog } from './device/BomUnsavedDialog';

type Section = 'bom';
const SECTIONS: Section[] = ['bom'];
const MAX = 12;
const AREAS: BuiltInArea[] = ['MECHANICAL', 'ELECTRICAL'];
/** «Ana BOM kod şudur: BOM-MEK-00001, BOM-ELK-00001» — fest, je Bereich. */
const MAIN_PREFIX: Record<BuiltInArea, string> = { MECHANICAL: 'BOM-MEK', ELECTRICAL: 'BOM-ELK' };

interface CodeRow { key: string; prefix: string; name: string }
interface Draft { maxPerArea: number; codes: Record<BuiltInArea, CodeRow[]> }

const draftOf = (settings: BomSettings): Draft => ({
    maxPerArea: settings.maxPerArea,
    codes: {
        MECHANICAL: settings.codes.MECHANICAL.map((code) => ({ key: tempKey(), ...code })),
        ELECTRICAL: settings.codes.ELECTRICAL.map((code) => ({ key: tempKey(), ...code })),
    },
});

/** Wie der Server den Vorsatz liest: gross, Leerzeichen → «-», ein «-XXXX» am Ende fällt weg. */
const cleanPrefix = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, '-').replace(/-X{3,}$/, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

const codesOf = (draft: Draft): Record<BuiltInArea, BomCode[]> => ({
    MECHANICAL: draft.codes.MECHANICAL.filter((row) => row.prefix.trim() || row.name.trim()).map((row) => ({ prefix: cleanPrefix(row.prefix), name: row.name.trim() })),
    ELECTRICAL: draft.codes.ELECTRICAL.filter((row) => row.prefix.trim() || row.name.trim()).map((row) => ({ prefix: cleanPrefix(row.prefix), name: row.name.trim() })),
});

const sameDraft = (draft: Draft, settings: BomSettings): boolean =>
    draft.maxPerArea === settings.maxPerArea && JSON.stringify(codesOf(draft)) === JSON.stringify(settings.codes);

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

    useEffect(() => readBomSettings(
        (next) => { setSettings(next); setError(null); },
        (failure) => setError(productionBomErrorText(failure, 'productionBom.err.loadFailed')),
    ), []);

    const draft = local ?? (settings ? draftOf(settings) : null);
    const dirty = Boolean(settings && local && !sameDraft(local, settings));
    const canEdit = Boolean(settings?.canEdit);

    const edit = (next: Draft) => setLocal(next);
    const patchRow = (area: BuiltInArea, key: string, patch: Partial<CodeRow>) => {
        if (!draft) return;
        edit({ ...draft, codes: { ...draft.codes, [area]: draft.codes[area].map((row) => (row.key === key ? { ...row, ...patch } : row)) } });
    };
    const addRow = (area: BuiltInArea) => {
        if (!draft) return;
        edit({ ...draft, codes: { ...draft.codes, [area]: [...draft.codes[area], { key: tempKey(), prefix: '', name: '' }] } });
    };
    const removeRow = (area: BuiltInArea, key: string) => {
        if (!draft) return;
        edit({ ...draft, codes: { ...draft.codes, [area]: draft.codes[area].filter((row) => row.key !== key) } });
    };

    const save = async (): Promise<boolean> => {
        if (!draft || !dirty) return true;
        if (saving) return false;
        setSaving(true);
        try {
            const next = await productionBomApi.saveSettings({ maxPerArea: draft.maxPerArea, codes: codesOf(draft) });
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
                        {SECTIONS.map((key) => (
                            <button
                                key={key}
                                type="button"
                                role="tab"
                                aria-selected={section === key}
                                className={`ofi-bom-source__row ofi-nosize${section === key ? ' is-selected' : ''}`}
                                onClick={() => setParams(key === 'bom' ? {} : { section: key }, { replace: true })}
                            >
                                <span className="ofi-bom-source__icon"><Boxes /></span>
                                <span className="ofi-bom-source__text">
                                    <b>{t('productionBom.settings.menuBom')}</b>
                                    <small>{t('productionBom.settings.bomTitle')}</small>
                                </span>
                            </button>
                        ))}
                    </div>
                </aside>
                <div className="ofi-bom-main">
                    {error && !settings ? (
                        <div className="ofi-bom-state is-error"><TriangleAlert aria-hidden /><b>{error}</b></div>
                    ) : !settings || !draft ? (
                        <LoadingState />
                    ) : (
                        <div className="ofi-bom-editor is-settings">
                            <section className="ofi-bom-group">
                                <h3 className="ofi-bom-group__title">{t('productionBom.settings.bomTitle')}</h3>
                                <div className="ofi-bom-group__box">
                                    <div className="ofi-bom-row">
                                        <span className="ofi-bom-row__label">
                                            {t('productionBom.settings.mainCodes')}
                                            <small>{t('productionBom.settings.mainCodesSub')}</small>
                                        </span>
                                        <div className="ofi-bom-row__control is-inline ofi-bom-maincodes">
                                            {AREAS.map((area) => (
                                                <span key={area} className="ofi-bom-maincodes__item">
                                                    <span className="ofi-bom-code">{MAIN_PREFIX[area]}-00001</span>
                                                    <small>{t(`productionBom.area.${area}`)}</small>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
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
                                    <button type="button" className="ofi-bom-row is-link ofi-nosize" onClick={() => navigate('/production/templates/bom')}>
                                        <span className="ofi-bom-row__label">{t('productionBom.settings.templatesLink')}</span>
                                        <ChevronRight className="ofi-bom-row__chev" aria-hidden />
                                    </button>
                                </div>
                                <p className="ofi-bom-group__foot">{t('productionBom.settings.maxPerAreaHint')}</p>
                            </section>

                            {AREAS.map((area) => (
                                <section key={area} className="ofi-bom-group">
                                    <h3 className="ofi-bom-group__title">
                                        {t('productionBom.settings.subCodes', { area: t(`productionBom.area.${area}`) })}
                                        <span className="ofi-bom-group__count">{draft.codes[area].length}</span>
                                    </h3>
                                    <div className="ofi-bom-group__box ofi-bom-codes">
                                        {draft.codes[area].map((row) => {
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
                                        {!draft.codes[area].length && <div className="ofi-bom-codes__empty">{t('productionBom.settings.codesEmpty')}</div>}
                                        {canEdit && (
                                            <button type="button" className="ofi-bom-row is-link is-add ofi-nosize" onClick={() => addRow(area)}>
                                                <Plus aria-hidden />
                                                <span className="ofi-bom-row__label">{t('productionBom.settings.codeAdd')}</span>
                                            </button>
                                        )}
                                    </div>
                                    <p className="ofi-bom-group__foot">{t('productionBom.settings.codesHint')}</p>
                                </section>
                            ))}
                            {!canEdit && <Note>{t('productionBom.settings.readOnly')}</Note>}
                        </div>
                    )}
                </div>
            </div>
            <BomUnsavedDialog guard={guard} text={t('productionBom.settings.unsavedText')} onSave={save} />
        </div>
    );
};

export default ProductionSettingsPage;
