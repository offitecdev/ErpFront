import { useState } from 'react';
import { ChevronLeft, Ellipsis } from 'lucide-react';
import { toast } from 'sonner';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';
import { productionBomErrorText } from '@/lib/api/productionBom';
import { purchasingApi } from '@/lib/api/purchasing';
import type { ProcurementDetail } from '@/types/purchasing';

import { shortDate } from '../../bom/bomFormat';
import { daysLeft, daysText, isUrgent, whenText } from '../purchasingModel';
import { KindPill, StageText } from '../purchasingUi';

const P = 'productionBom.purchasing';

/**
 * Kopf des Talep: zurück · Nummer · Art · Stand und rechts ⋯ (Tamamlandı say ·
 * İptal et). Darunter die fünf Angaben, die jeder Schritt braucht. Den letzten
 * Handgriff zeigt seit dem 29.09.2026 nur noch die Liste («işlem geçmişi
 * olmayacak»).
 */
export const RequestHead = ({ detail, onBack, onChanged }: { detail: ProcurementDetail; onBack: () => void; onChanged: () => void }) => {
    const { request, bom, stage, canProcure } = detail;
    const [menu, setMenu] = useState<HTMLElement | null>(null);
    const [busy, setBusy] = useState(false);
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
    // Ein geschlossener Talep lässt sich wieder öffnen — etwa für weitere Lieferanten (29.09.2026).
    const actions: Array<'close' | 'cancel' | 'reopen'> = open ? ['close', 'cancel'] : request.status === 'DONE' ? ['reopen'] : [];

    return (
        <>
            <header className="ofi-buy-nav">
                <button type="button" className="ofi-buy-back ofi-nosize" onClick={onBack}>
                    <ChevronLeft aria-hidden />
                    {t(`${P}.back`)}
                </button>
                <h1 className="is-code">{request.requestNumber}</h1>
                <KindPill kind={request.kind} ordered={detail.docs.some((doc) => doc.kind === 'ORDER' && doc.state !== 'CANCELLED')} />
                <StageText stage={stage} />
                {canProcure && actions.length > 0 && (
                    <button
                        type="button"
                        className="ofi-buy-btn is-icon ofi-nosize ofi-buy-more"
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
                {/* Projektnummer und Kommission (= Projektname) getrennt — 29.09.2026. */}
                <div>
                    <dt>{t(`${P}.col.project`)}</dt>
                    <dd className="is-code">{request.project?.projectNumber || '—'}</dd>
                    <dd className="is-sub">{request.project?.customerName ?? ''}</dd>
                </div>
                <div>
                    <dt>{t(`${P}.col.commission`)}</dt>
                    <dd>{request.project?.projectName || '—'}</dd>
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
