import type { ReactNode } from 'react';
import { MacLoading } from '@/components/ui-shared/MacLoading';
import { CheckCircle2, ListChecks, PackageCheck, Paperclip, Send, ShoppingCart, TriangleAlert } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { ProcurementDocState, ProcurementNextAction, ProcurementStage } from '@/types/purchasing';

import { actionLabel, docDotClass, docStateLabel, stageDetail, stageLabel, stageTone } from './purchasingModel';

/* ── Kleine Bauteile der Seite «Satın alma» (28.09.2026) ── */

const ActionIcon = ({ action }: { action: ProcurementNextAction }) => {
    switch (action) {
        case 'ORDER': return <ShoppingCart aria-hidden />;
        case 'CONFIRM': return <CheckCircle2 aria-hidden />;
        case 'RESEND':
        case 'ASK': return <Send aria-hidden />;
        case 'RECEIVE': return <PackageCheck aria-hidden />;
        case 'COMPARE': return <ListChecks aria-hidden />;
        default: return <Paperclip aria-hidden />;
    }
};

/** Der eine nächste Schritt als Knopf: Zeichen + Wort («Teklif ekle», «Mal kabul» …). */
export const NextButton = ({ action, onClick }: { action: ProcurementNextAction; onClick: () => void }) => (
    <button
        type="button"
        className="ofi-buy-act ofi-nosize"
        onClick={(event) => {
            event.stopPropagation();
            onClick();
        }}
    >
        <ActionIcon action={action} />
        {actionLabel(action)}
    </button>
);

/** Der Stand eines Talep: Punkt + Wort, darunter ein kleiner Ring mit «1/2 onaylandı». */
export const StageText = ({ stage }: { stage: ProcurementStage }) => {
    const detail = stageDetail(stage);
    return (
        <span className="ofi-buy-stage">
            <b className={`ofi-buy-dot is-${stageTone(stage)}`}>{stageLabel(stage)}</b>
            {detail && (
                <small>
                    <Ring value={stage.total ? stage.done / stage.total : 0} />
                    {detail}
                </small>
            )}
        </span>
    );
};

/** Ein Beleg als kleines Schild: Farbpunkt + Nummer (SP-/FT- in der Sprache der Oberfläche). */
export const DocToken = ({ code, kind, state, title }: { code: string; kind: 'ORDER' | 'REQUEST'; state: ProcurementDocState; title?: string }) => (
    <span className={`ofi-buy-tok ${docDotClass(kind, state)}`} title={title ?? docStateLabel(kind, state)}>
        <i aria-hidden />
        {code}
    </span>
);

export const Ring = ({ value, size = 14 }: { value: number; size?: number }) => {
    const stroke = 2.2;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const share = Math.max(0, Math.min(1, value));
    return (
        <svg className={`ofi-buy-ring${share >= 1 ? ' is-full' : ''}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="ofi-buy-ring__track" />
            {share > 0 && (
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${(c * share).toFixed(2)} ${c.toFixed(2)}`}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    className="ofi-buy-ring__arc"
                />
            )}
        </svg>
    );
};

export const Placeholder = ({ icon, title, hint }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode }) => (
    <div className="ofi-buy-empty">
        {icon && <span className="ofi-buy-empty__icon">{icon}</span>}
        <b>{title}</b>
        {hint && <span>{hint}</span>}
    </div>
);

export const Failure = ({ text, retry }: { text: string; retry?: () => void }) => (
    <div className="ofi-buy-empty is-error"><span className="ofi-buy-empty__icon"><TriangleAlert /></span><b>{text}</b>{retry && <button type="button" className="ofi-buy-btn ofi-nosize" onClick={retry}>{t('common.retry')}</button>}</div>
);

/** Ruhige Platzhalterzeilen, solange geladen wird. */
export const Loading = ({ rows = 6 }: { rows?: number }) => (
    <div className="ofi-buy-loading" aria-busy="true" aria-label={t('productionBom.common.loading')}>
        <MacLoading label={t('productionBom.common.loading')} compact={rows < 5} />
    </div>
);
