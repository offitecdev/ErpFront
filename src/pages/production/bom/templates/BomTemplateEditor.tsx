import { Copy, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import type { BomCategory, BomProduct, BomTemplateSummary, BomUnit } from '@/types/productionBom';

import { BomLinesTable } from '../BomLinesTable';
import { Note } from '../bomUi';
import { ProductSearch } from '../ProductSearch';
import { addProduct, draftRows, type TemplateDraft } from './templateDraft';

/**
 * ── EINE BOM-VORLAGE (27.09.2026, Vorgabe Samet) ─────────────────────────────
 *
 * «Bom şablon adı, bom şablon kategorisi elektrik, makineden biri … erp kodu,
 *  model numarası, ürün adına göre aratma olabilir; bu aratma olduğunda direkt
 *  ürünün tüm satırı eklenir.»
 *
 * Oben der Name wie ein Fenstertitel, darunter EINE Tafel mit Kategorie
 * (Makine | Elektrik), Ana kart (CHILLER), BOM-Nummer (Vorsatz + Vorschau
 * ELK-PANO-00001) und Beschreibung; dann das Material: die Suche und die
 * Zeilen, jede wie im Depo.
 */
export const BomTemplateEditor = ({
    draft,
    summary,
    canEdit,
    dirty,
    saving,
    onChange,
    onSave,
    onRevert,
    onDuplicate,
    onDelete,
}: {
    draft: TemplateDraft;
    summary: BomTemplateSummary | null;
    canEdit: boolean;
    dirty: boolean;
    saving: boolean;
    onChange: (next: TemplateDraft) => void;
    onSave: () => void;
    onRevert: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}) => {
    const set = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) => onChange({ ...draft, [key]: value });

    const pick = (product: BomProduct) => {
        const result = addProduct(draft.lines, product);
        onChange({ ...draft, lines: result.lines });
        if (result.merged) toast.message(t('productionBom.search.already'));
    };
    const patchLine = (key: string, patch: Partial<TemplateDraft['lines'][number]>) =>
        onChange({ ...draft, lines: draft.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) });

    const categories: BomCategory[] = ['MACHINE', 'ELECTRICAL'];
    return (
        <div className="ofi-bom-editor">
            <div className="ofi-bom-editor__head">
                <input
                    className="ofi-bom-titleinput"
                    value={draft.name}
                    disabled={!canEdit}
                    placeholder={t('productionBom.editor.namePlaceholder')}
                    aria-label={t('productionBom.editor.name')}
                    onChange={(event) => set('name', event.target.value)}
                />
                {dirty && <span className="ofi-bom-dirty">{t('productionBom.editor.unsaved')}</span>}
                {!canEdit && <span className="ofi-bom-tag">{t('productionBom.editor.readOnlyTemplate')}</span>}
                <span className="ofi-bom-editor__actions">
                    {canEdit && draft.id && (
                        <>
                            <button type="button" className="ofi-bom-btn is-quiet is-icon ofi-nosize" title={t('productionBom.editor.duplicate')} aria-label={t('productionBom.editor.duplicate')} onClick={onDuplicate}>
                                <Copy />
                            </button>
                            <button type="button" className="ofi-bom-btn is-quiet is-icon is-danger-hover ofi-nosize" title={t('productionBom.common.delete')} aria-label={t('productionBom.common.delete')} onClick={onDelete}>
                                <Trash2 />
                            </button>
                        </>
                    )}
                    {canEdit && dirty && draft.id && (
                        <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" onClick={onRevert}>
                            <RotateCcw />
                            {t('productionBom.editor.revert')}
                        </button>
                    )}
                    {canEdit && (
                        <button type="button" className="ofi-bom-btn is-primary ofi-nosize" disabled={!dirty || saving} onClick={onSave} title="⌘S">
                            {saving ? <span className="ofi-bom-spinner is-small is-light" /> : <Save />}
                            {saving ? t('productionBom.common.saving') : t('productionBom.common.save')}
                        </button>
                    )}
                </span>
            </div>

            <section className="ofi-bom-group">
                <h3 className="ofi-bom-group__title">{t('productionBom.editor.info')}</h3>
                <div className="ofi-bom-group__box">
                    <div className="ofi-bom-row">
                        <span className="ofi-bom-row__label">{t('productionBom.editor.category')}</span>
                        <div className="ofi-bom-row__control">
                            <div className="ofi-bom-seg" role="radiogroup" aria-label={t('productionBom.editor.category')}>
                                {categories.map((category) => (
                                    <button
                                        key={category}
                                        type="button"
                                        role="radio"
                                        aria-checked={draft.category === category}
                                        disabled={!canEdit}
                                        className={`ofi-nosize${draft.category === category ? ' is-on' : ''}`}
                                        onClick={() => set('category', category)}
                                    >
                                        {t(`productionBom.category.${category}`)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="ofi-bom-row">
                        <label className="ofi-bom-row__label" htmlFor="bom-tpl-card">{t('productionBom.editor.mainCard')}</label>
                        <div className="ofi-bom-row__control">
                            <input
                                id="bom-tpl-card"
                                className="ofi-bom-input is-upper"
                                value={draft.mainCard}
                                disabled={!canEdit}
                                placeholder={t('productionBom.editor.mainCardPlaceholder')}
                                onChange={(event) => set('mainCard', event.target.value.toUpperCase())}
                            />
                        </div>
                    </div>
                    <div className="ofi-bom-row is-top">
                        <label className="ofi-bom-row__label" htmlFor="bom-tpl-desc">{t('productionBom.editor.description')}</label>
                        <div className="ofi-bom-row__control">
                            <textarea
                                id="bom-tpl-desc"
                                className="ofi-bom-input is-area"
                                rows={2}
                                value={draft.description}
                                disabled={!canEdit}
                                placeholder={t('productionBom.editor.descriptionPlaceholder')}
                                onChange={(event) => set('description', event.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </section>

            <section className="ofi-bom-group is-lines">
                <h3 className="ofi-bom-group__title">
                    {t('productionBom.editor.lines')}
                    <span className="ofi-bom-group__count">{draft.lines.length}</span>
                    {summary && summary.usedBy > 0 && (
                        <span className="ofi-bom-group__meta">{t('productionBom.templates.usedBy', { count: summary.usedBy })}</span>
                    )}
                </h3>
                {canEdit && <ProductSearch onPick={pick} />}
                <BomLinesTable
                    rows={draftRows(draft.lines)}
                    mode="template"
                    editable={canEdit}
                    emptyText={t('productionBom.editor.linesEmpty')}
                    onQuantity={(key, text) => patchLine(key, { quantityText: text })}
                    onUnit={(key, unit: BomUnit) => patchLine(key, { unit })}
                    onNote={(key, note) => patchLine(key, { note })}
                    onRemove={(key) => onChange({ ...draft, lines: draft.lines.filter((line) => line.key !== key) })}
                />
                {!canEdit && <Note>{t('productionBom.templates.readOnly')}</Note>}
            </section>
        </div>
    );
};
