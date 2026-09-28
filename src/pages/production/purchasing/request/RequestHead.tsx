import { useState } from 'react';
import { ChevronLeft, Ellipsis, ShoppingCart, Tag } from 'lucide-react';
import { toast } from 'sonner';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';
import { productionBomErrorText } from '@/lib/api/productionBom';
import { purchasingApi } from '@/lib/api/purchasing';
import type { ProcurementDetail } from '@/types/purchasing';

import { shortDate } from '../../bom/bomFormat';
import { daysLeft, daysText, eventText, isUrgent, whenText } from '../purchasingModel';
import { StageText } from '../purchasingUi';

const P = 'productionBom.purchasing';

/**
 * Kopf des Talep: zurück · Nummer · Art · Stand, rechts der letzte Handgriff
 * («son işlem hep gözüksün») und ⋯ (Tamamlandı say · İptal et · Yeniden aç).
 * Darunter die fünf Angaben, die jeder Schritt braucht.
 */
export const RequestHead = ({ detail, onBack, onChanged }: { detail: ProcurementDetail; onBack: () => void; onChanged: () => void }) => {
    const { request, bom, stage, history, canProcure } = detail;
    const [menu, setMenu] = useState<HTMLElement | null>(null);
    const [busy, setBusy] = useState(false);
    const last = history[0] ?? null;
    const open = request.status === 'OPEN' || request.status === 'IN_PROGRESS';
    const delivery = request.project?.deliveryDate ?? null;
    const days = open ? daysLeft(delivery) : null;

    const act = async (action: 'close' | 'reopen' | 'cancel') => {
        setMenu(null);
        setBusy(true);
        try {
            await purchasingApi.action(request.id, action);
            toast.success(t(`${P}.action.${action}Done`, { number: request.requestNumber }));
            onChanged();
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(false);
        }
    };
    const actions: Array<'close' | 'cancel'> = ['close', 'cancel'];

    return (
        <>
            <header className="ofi-buy-nav">
                <button type="button" className="ofi-buy-back ofi-nosize" onClick={onBack}>
                    <ChevronLeft aria-hidden />
                    {t(`${P}.back`)}
                </button>
                <h1 className="is-code">{request.requestNumber}</h1>
                <span className="ofi-buy-kind">
                    {request.kind === 'PRICE' ? <Tag aria-hidden /> : <ShoppingCart aria-hidden />}
                    {t(`productionBom.procurement.kind.${request.kind}`)}
                </span>
                <StageText stage={stage} />
                {last && (
                    <span className="ofi-buy-last">
                        <small>{t(`${P}.col.last`)}</small>
                        <b>{eventText(last)}</b>
                        <small>{[last.actorName, whenText(last.at)].filter(Boolean).join(' · ')}</small>
                    </span>
                )}
                {canProcure && open && (
                    <button
                        type="button"
                        className="ofi-buy-btn is-icon ofi-nosize"
                        aria-label={t(`${P}.more`)}
                        aria-expanded={Boolean(menu)}
                        disabled={busy}
                        onClick={(event) => setMenu(menu ? null : event.currentTarget)}
                    >
                        <Ellipsis aria-hidden />
                    </button>
                )}
            </header>
            <AnchoredPicker anchorEl={menu} onClose={() => setMenu(null)} width={220} exactWidth ariaLabel={t(`${P}.more`)}>
                <div className="ofi-buy-menu">
                    {actions.map((action) => (
                        <button key={action} type="button" className={`ofi-option-row ofi-nosize${action === 'cancel' ? ' is-danger' : ''}`} onClick={() => void act(action)}>
                            {t(`${P}.action.${action}`)}
                        </button>
                    ))}
                </div>
            </AnchoredPicker>

            <dl className="ofi-buy-facts">
                <div>
                    <dt>{t(`${P}.col.project`)}</dt>
                    <dd>{request.project?.projectName || request.project?.customerName || '—'}</dd>
                    <dd className="is-sub is-code">{request.project?.projectNumber ?? ''}</dd>
                </div>
                <div>
                    <dt>{t(`${P}.col.device`)}</dt>
                    <dd>{request.device?.name ?? '—'}</dd>
                    <dd className="is-sub">
                        {[request.device?.positionNumber ? t(`${P}.position`, { value: request.device.positionNumber }) : null, t(`productionBom.area.${bom.area}`)].filter(Boolean).join(' · ')}
                    </dd>
                </div>
                <div>
                    <dt>BOM</dt>
                    <dd className="is-code">{bom.bomNumber}</dd>
                    <dd className="is-sub">
                        {[t(`productionBom.status.${bom.consumedAt ? 'CONSUMED' : bom.status}`), t('productionBom.revision.label', { revision: request.bomRevision })].join(' · ')}
                    </dd>
                </div>
                <div>
                    <dt>{t(`${P}.col.delivery`)}</dt>
                    <dd className={isUrgent(days) ? 'is-urgent' : undefined}>{delivery ? shortDate(delivery) : '—'}</dd>
                    <dd className={`is-sub${isUrgent(days) ? ' is-urgent' : ''}`}>{days !== null ? daysText(days) : ''}</dd>
                </div>
                <div>
                    <dt>{t(`${P}.requestedBy`)}</dt>
                    <dd>{request.createdByName ?? '—'}</dd>
                    <dd className="is-sub">{[whenText(request.createdAt), request.note ? `«${request.note}»` : null].filter(Boolean).join(' · ')}</dd>
                </div>
            </dl>
        </>
    );
};
