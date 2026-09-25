import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { Plus, ShoppingCart01, X } from '@/components/icons/antIconCompat';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import { useBackDismiss } from '@/lib/backDismiss';
import type { ProcurementOrder, ProcurementPosition } from '@/lib/api/projectProcurement';
import { QuantityStepper } from '../inventory/components/QuantityStepper';
import { fmtQty } from '../inventory/utils/format';

/**
 * «YİNE DE SİPARİŞ» (Vorgabe Samet, 24.09.2026): «Stokta Var» durumunun
 * yanındaki «+» bu küçük Mac penceresini açar — teklif detayındaki stoğa ekleme
 * penceresiyle aynı gövde (`.ofi-qe.is-mini`). Soru: «Yine de sipariş
 * oluşturmak ister misiniz?»; miktar seçilir, sonra tedarikçinin bu projeye
 * ait AÇIK siparişine eklenir ya da yeni sipariş açılır.
 */
export const ProcurementOrderPopup = ({ position, openOrder, busy, onClose, onSubmit }: {
    position: ProcurementPosition | null;
    /** Tedarikçinin bu projeye ait açık (taslak) siparişi — yoksa yalnız «Yeni». */
    openOrder: ProcurementOrder | null;
    busy: boolean;
    onClose: () => void;
    onSubmit: (quantity: number, target: 'EXISTING' | 'NEW') => void;
}) => {
    const open = position !== null;
    useBackDismiss(open, onClose);

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

    if (!position) return null;
    return createPortal(
        <PopupWindow
            key={position.positionId}
            position={position}
            openOrder={openOrder}
            busy={busy}
            onClose={onClose}
            onSubmit={onSubmit}
        />,
        document.body,
    );
};

const PopupWindow = ({ position, openOrder, busy, onClose, onSubmit }: {
    position: ProcurementPosition;
    openOrder: ProcurementOrder | null;
    busy: boolean;
    onClose: () => void;
    onSubmit: (quantity: number, target: 'EXISTING' | 'NEW') => void;
}) => {
    // Öneri: talep edilen miktar (en az 1).
    const [quantity, setQuantity] = useState(() => Math.max(1, position.requested || 1));
    const unit = position.unit ?? '';

    return (
        <div className="ofi-qe-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
            <section
                role="dialog"
                aria-modal="true"
                aria-label={t('projects.procurement.popupTitle')}
                className="ofi-qe ofi-pop ofi-compact-modal is-mini"
            >
                <header className="ofi-qe__head">
                    <div className="ofi-qe__titles">
                        <h2 className="ofi-qe__title">{t('projects.procurement.orderAnyway')}</h2>
                        {position.articleCode && <div className="ofi-qe__crumbs"><span>{position.articleCode}</span></div>}
                    </div>
                    <button type="button" className="ofi-float-card__iconbtn" aria-label={t('inv.quickEntry.close')} disabled={busy} onClick={onClose}>
                        <X size={18} />
                    </button>
                </header>

                <div className="ofi-qe__body">
                    <div className="ofi-qe__step">
                        <div className="ofi-qe-card">
                            <div className="ofi-qe-card__head"><ShoppingCart01 />{t('projects.procurement.popupTitle')}</div>
                            <form
                                className="ofi-qe-card__body"
                                onSubmit={(event) => { event.preventDefault(); onSubmit(quantity, openOrder ? 'EXISTING' : 'NEW'); }}
                            >
                                <p className="ofi-proc-popup__hint">{t('projects.procurement.popupHint')}</p>
                                <dl className="ofi-qe-stockin__facts">
                                    <div className="ofi-qe-kv">
                                        <dt>{t('inv.quickEntry.fieldName')}</dt>
                                        <dd className="is-name">{position.name}</dd>
                                    </div>
                                    <div className="ofi-qe-kv">
                                        <dt>{t('projects.procurement.requested')}</dt>
                                        <dd className="is-mono">{fmtQty(position.requested)} {unit}</dd>
                                    </div>
                                    <div className="ofi-qe-kv">
                                        <dt>{t('projects.procurement.stock')}</dt>
                                        <dd className="is-mono">{fmtQty(position.stock ?? 0)} {unit}</dd>
                                    </div>
                                    <div className="ofi-qe-kv">
                                        <dt>{t('projects.procurement.supplier')}</dt>
                                        <dd>{position.supplier?.name ?? t('projects.procurement.noSupplier')}</dd>
                                    </div>
                                </dl>
                                <div className="ofi-qe-field ofi-qe-stockin__qty">
                                    <label className="ofi-qe-field__label" htmlFor="ofi-proc-qty">{t('inv.quickEntry.quantity')}</label>
                                    <QuantityStepper
                                        id="ofi-proc-qty"
                                        value={quantity}
                                        onChange={setQuantity}
                                        unit={unit}
                                        disabled={busy}
                                        autoFocus
                                        onSubmit={() => onSubmit(quantity, openOrder ? 'EXISTING' : 'NEW')}
                                    />
                                </div>
                                <button type="submit" hidden />
                            </form>
                            <div className="ofi-qe-card__foot">
                                <button type="button" className="ofi-qe-btn" disabled={busy} onClick={onClose}>{t('common.cancel')}</button>
                                <button
                                    type="button"
                                    className={`ofi-qe-btn${openOrder ? '' : ' is-primary'}`}
                                    disabled={busy || !(quantity > 0)}
                                    onClick={() => onSubmit(quantity, 'NEW')}
                                >
                                    <Plus />
                                    {t('projects.procurement.newOrder')}
                                </button>
                                {openOrder && (
                                    <button
                                        type="button"
                                        className="ofi-qe-btn is-primary"
                                        disabled={busy || !(quantity > 0)}
                                        onClick={() => onSubmit(quantity, 'EXISTING')}
                                    >
                                        {busy ? <span className="ofi-qe__spinner" /> : <ShoppingCart01 />}
                                        {t('projects.procurement.addToOpen')}
                                        <span className="ofi-proc-popup__code"><PurchaseCode value={openOrder.referenceNumber} /></span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};
