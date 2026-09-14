import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { Check, Plus, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import { useBackDismiss } from '@/lib/backDismiss';
import { useAuthStore } from '@/store/authStore';
import { fmtQty } from '../utils/format';
import { QuantityStepper } from './QuantityStepper';

/** Was das Fenster über den Artikel wissen muss — Liste und Detail liefern beide genug. */
export interface StockInArticle {
    id: string;
    articleCode: string;
    name: string;
    unit: string;
    modelNumber?: string | null;
    totalQuantity: number;
}

const responseError = (error: unknown): string | null => {
    const data = (error as { response?: { data?: { error?: unknown } } } | null)?.response?.data;
    return typeof data?.error === 'string' && data.error ? data.error : null;
};

/**
 * ZUGANG BUCHEN — EIN ARTIKEL (11.09.2026, Vorgabe Samet: «statt in der
 * Schnellerfassung ‹vorhanden› zu wählen und den Artikel zu suchen, soll in
 * der Produktliste neben jedem Produkt ein Plus stehen — und im Produktdetail
 * auch; ein Tipp darauf öffnet das Fenster gleich»).
 *
 * Ein kleines Mac-Fenster (dieselbe Hülle wie die Schnellerfassung,
 * `.ofi-qe.is-mini`): der Artikel steht schon da, es bleibt nur die Menge —
 * vorbelegt mit 1, von Hand tippbar oder mit dem Stepper. «Buchen» schreibt
 * EINEN Zugang (Herkunft MANUAL, kein Scan) und schliesst das Fenster.
 *
 * Offen, solange `article` gesetzt ist; der Rumpf ist mit der Artikel-Id
 * verschlüsselt, damit jede Öffnung wieder bei 1 beginnt.
 */
export const StockInPopup = ({ article, onClose, onBooked }: {
    article: StockInArticle | null;
    onClose: () => void;
    /** Nach erfolgreicher Buchung — die aufrufende Seite zieht ihren Bestand nach. */
    onBooked: (article: StockInArticle, quantity: number) => void;
}) => {
    const open = article !== null;
    useBackDismiss(open, onClose);

    /* Escape schliesst — ausser ein Fenster liegt darüber. */
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (document.querySelector('[data-cal-stacked="1"]')) return;
            onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!article) return null;
    return createPortal(
        <StockInWindow key={article.id} article={article} onClose={onClose} onBooked={onBooked} />,
        document.body,
    );
};

const StockInWindow = ({ article, onClose, onBooked }: {
    article: StockInArticle;
    onClose: () => void;
    onBooked: (article: StockInArticle, quantity: number) => void;
}) => {
    const permissions = useAuthStore((state) => state.permissions);
    const canTransfer = permissions.includes('inventory.transfer');
    const [quantity, setQuantity] = useState(1);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const book = useCallback(async () => {
        if (saving) return;
        if (!canTransfer) { setError(t('inv.quickEntry.noPermission')); return; }
        if (!(quantity > 0)) { setError(t('inv.stockIn.quantityRequired')); return; }
        setSaving(true);
        setError(null);
        try {
            const result = await inventoryApi.bulkCreateMovements([{
                articleId: article.id,
                movementType: 'IN',
                quantity,
                origin: 'MANUAL',
                description: t('inv.stockIn.note'),
            }]);
            const rowError = result.errors[0]?.error;
            if (rowError || !result.movements.length) {
                setError(rowError || t('inv.quickEntry.saveFailed'));
                return;
            }
            toast.success(t('inv.stockIn.done', { count: fmtQty(quantity), unit: article.unit, name: article.name }));
            onBooked(article, quantity);
            onClose();
        } catch (err) {
            setError(responseError(err) || t('inv.quickEntry.saveFailed'));
        } finally {
            setSaving(false);
        }
    }, [article, canTransfer, onBooked, onClose, quantity, saving]);

    return (
        <div className="ofi-qe-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
            <section
                role="dialog"
                aria-modal="true"
                aria-label={t('inv.stockIn.title')}
                className="ofi-qe ofi-pop ofi-compact-modal is-mini"
            >
                <header className="ofi-qe__head">
                    <div className="ofi-qe__titles">
                        <h2 className="ofi-qe__title">{t('inv.stockIn.title')}</h2>
                        <div className="ofi-qe__crumbs"><span>{article.articleCode}</span></div>
                    </div>
                    <button type="button" className="ofi-float-card__iconbtn" aria-label={t('inv.quickEntry.close')} disabled={saving} onClick={onClose}>
                        <X size={18} />
                    </button>
                </header>

                <div className="ofi-qe__body">
                    <div className="ofi-qe__step">
                        <div className="ofi-qe-card">
                            <div className="ofi-qe-card__head"><Plus />{t('inv.quickEntry.logIn')}</div>
                            <form
                                className="ofi-qe-card__body"
                                onSubmit={(event) => { event.preventDefault(); void book(); }}
                            >
                                <dl className="ofi-qe-stockin__facts">
                                    <div className="ofi-qe-kv">
                                        <dt>{t('inv.quickEntry.fieldName')}</dt>
                                        <dd className="is-name">{article.name}</dd>
                                    </div>
                                    {article.modelNumber && (
                                        <div className="ofi-qe-kv">
                                            <dt>{t('inv.quickEntry.fieldModel')}</dt>
                                            <dd className="is-mono">{article.modelNumber}</dd>
                                        </div>
                                    )}
                                    <div className="ofi-qe-kv">
                                        <dt>{t('inv.quickEntry.stock')}</dt>
                                        <dd className="is-mono">{fmtQty(article.totalQuantity)} {article.unit}</dd>
                                    </div>
                                </dl>
                                <div className="ofi-qe-field ofi-qe-stockin__qty">
                                    <label className="ofi-qe-field__label" htmlFor="ofi-stockin-qty">{t('inv.quickEntry.quantity')}</label>
                                    <QuantityStepper
                                        id="ofi-stockin-qty"
                                        value={quantity}
                                        onChange={setQuantity}
                                        unit={article.unit}
                                        disabled={saving}
                                        autoFocus
                                        onSubmit={() => void book()}
                                    />
                                    {/* Was nach der Buchung im Lager steht — läuft mit der Menge mit. */}
                                    <span className="ofi-qe-stockin__after">
                                        {t('inv.stockIn.after', { count: fmtQty(article.totalQuantity + quantity), unit: article.unit })}
                                    </span>
                                </div>
                                {error && <p className="ofi-qe__error">{error}</p>}
                            </form>
                            <div className="ofi-qe-card__foot">
                                <button type="button" className="ofi-qe-btn" disabled={saving} onClick={onClose}>{t('common.cancel')}</button>
                                <button type="button" className="ofi-qe-btn is-primary" disabled={saving || !canTransfer} onClick={() => void book()}>
                                    {saving ? <span className="ofi-qe__spinner" /> : <Check />}
                                    {t('inv.stockIn.button')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};
