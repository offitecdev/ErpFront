import { FilePen, Trash2 } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { WarehouseMissingField } from '@/types/warehouse';

/**
 * Der Kopf der Karte: Titel, Code und Gruppe, rechts die Handgriffe. Seit dem
 * 30.09.2026 zwei Arten zu speichern (Samet: «bunlar girilmeden ürün kartı
 * sadece taslak olarak kayıt edilebilir — taslak seçeneği»):
 *   «Taslak olarak kaydet»  immer — die Karte bleibt Taslak
 *   «Kaydet» / «Oluştur»    nur mit Name, Einheit, Lieferant und seiner E-Mail
 */
export const ProductHeader = ({
    title,
    meta,
    savedCode,
    draft,
    dirty,
    canManage,
    isNew,
    saving,
    onDelete,
    onDiscard,
    onSaveDraft,
    onSave,
}: {
    title: string;
    meta: string[];
    savedCode: string | null;
    /** Die gespeicherte Karte ist ein Taslak. */
    draft: boolean;
    dirty: boolean;
    canManage: boolean;
    isNew: boolean;
    saving: 'draft' | 'final' | null;
    onDelete: () => void;
    onDiscard: () => void;
    onSaveDraft: () => void;
    onSave: () => void;
}) => (
    <header className="ofi-wh-head">
        <h1 className="ofi-wh-head__title" title={title}>{title}</h1>
        {draft && <span className="ofi-wh-draftchip"><FilePen aria-hidden />{t('warehouse.product.draftChip')}</span>}
        {meta.length > 0 && (
            <span className="ofi-wh-head__meta">
                {meta.map((part, index) => (
                    <span key={index} style={{ display: 'contents' }}>
                        {index > 0 && <span className="ofi-wh-dot">·</span>}
                        <span className={index === 0 && savedCode ? 'ofi-wh-code is-dim' : ''}>{part}</span>
                    </span>
                ))}
            </span>
        )}
        <div className="ofi-wh-head__actions">
            {dirty && canManage && <span className="ofi-wh-dirty">{t('warehouse.product.unsaved')}</span>}
            {!isNew && canManage && (
                <button type="button" className="ofi-wh-btn is-danger is-quiet ofi-nosize" onClick={onDelete}>
                    <Trash2 />
                    {t('warehouse.actions.delete')}
                </button>
            )}
            {canManage && (isNew || dirty) && (
                <button type="button" className="ofi-wh-btn ofi-nosize" onClick={onDiscard} disabled={saving !== null}>
                    {isNew ? t('warehouse.actions.cancel') : t('warehouse.actions.discard')}
                </button>
            )}
            {canManage && (isNew || dirty || draft) && (
                <button type="button" className="ofi-wh-btn ofi-nosize" disabled={saving !== null || (!isNew && !dirty)} onClick={onSaveDraft}>
                    <FilePen />
                    {saving === 'draft' ? t('warehouse.actions.saving') : t('warehouse.actions.saveDraft')}
                </button>
            )}
            {canManage && (
                <button
                    type="button"
                    className="ofi-wh-btn is-primary ofi-nosize"
                    disabled={saving !== null || (!isNew && !dirty && !draft)}
                    onClick={onSave}
                >
                    {saving === 'final' ? t('warehouse.actions.saving') : isNew ? t('warehouse.actions.create') : t('warehouse.actions.save')}
                </button>
            )}
        </div>
    </header>
);

/**
 * Was einer fertigen Karte fehlt — gelb, unter den Reitern. Steht, solange die
 * gespeicherte Karte ein Taslak ist, und nach einem «Kaydet», dem etwas fehlte.
 */
export const DraftNotice = ({ missing, draft }: { missing: WarehouseMissingField[]; draft: boolean }) => {
    if (!missing.length && !draft) return null;
    return (
        <div className="ofi-wh-draftnote" role="status">
            <FilePen aria-hidden />
            <div>
                <b>{t(draft ? 'warehouse.product.draftTitle' : 'warehouse.product.incompleteTitle')}</b>
                <span>
                    {missing.length
                        ? t('warehouse.product.draftMissing', { fields: missing.map((field) => t(`warehouse.missing.${field}`)).join(', ') })
                        : t('warehouse.product.draftComplete')}
                </span>
                <small>{t('warehouse.product.draftHint')}</small>
            </div>
        </div>
    );
};
