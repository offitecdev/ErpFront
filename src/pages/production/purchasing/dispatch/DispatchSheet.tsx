import type { ReactNode } from 'react';
import { Send } from 'lucide-react';

import { t } from '@/i18n/translate';
import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import '@/styles/modules/purchasingDispatch.css';

import { DispatchCard } from './DispatchCard';
import { CountRing } from './DispatchGlyphs';
import { isFinal, type DispatchCardModel } from './dispatchModel';

const P = 'productionBom.purchasing.dispatch';

/**
 * ── DAS FENSTER DER SENDUNG (30.09.2026, Vorgabe Samet) ────────────────────
 * «Sipariş gönder dediğimizde bunları hazırlayıp çıkartıyor ve maillerine
 *  atıyor … progressi de görelim … pdf hazırladığım şeyleri de görelim.»
 * Ein macOS-Fenster: oben der Ring (wie viele sind draussen), darunter je
 * Lieferant eine Karte, die hereinschwebt und ihren Weg zeigt (Blatt schreibt
 * sich → Papierflieger → Häkchen). Solange gesendet wird, bleibt das Fenster
 * offen; danach öffnet «PDF», was hinausging.
 */
export const DispatchSheet = ({
    open,
    title,
    subtitle,
    cards,
    running,
    onClose,
    onRetry,
    onOpenDocument,
    children,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    cards: DispatchCardModel[];
    running: boolean;
    onClose: () => void;
    onRetry?: (purchaseOrderId: string) => void;
    onOpenDocument?: (purchaseOrderId: string) => void;
    /** Was darunter gehört (z. B. Zeilen, die nicht bestellt wurden). */
    children?: ReactNode;
}) => {
    const done = cards.filter((card) => isFinal(card.phase)).length;
    const sent = cards.filter((card) => card.phase === 'sent').length;
    const problems = cards.filter((card) => card.phase === 'failed' || card.phase === 'skipped').length;
    const finished = !running && done === cards.length && cards.length > 0;
    const headline = !finished
        ? t(`${P}.running`, { done, total: cards.length })
        : problems
            ? t(`${P}.doneWithProblems`, { sent, problems })
            : t(`${P}.doneAll`, { count: sent });

    return (
        <PopupDialog
            open={open}
            title={title}
            subtitle={subtitle}
            icon={<Send size={18} />}
            width={640}
            closeOnBackdrop={!running}
            closeOnEscape={!running}
            hideClose={running}
            onClose={() => { if (!running) onClose(); }}
            footer={(
                <PopupActions start={<span className="ofi-dsp-foot">{t(`${P}.footHint`)}</span>}>
                    <PopupButton variant={finished ? 'primary' : undefined} disabled={running} onClick={onClose}>
                        {t(finished ? `${P}.done` : `${P}.close`)}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-dsp">
                <header className={`ofi-dsp-head${finished ? ' is-finished' : ''}`}>
                    <CountRing done={done} total={cards.length} />
                    <span>
                        <b>{headline}</b>
                        <small>{t(finished ? `${P}.finishedHint` : `${P}.runningHint`)}</small>
                    </span>
                </header>
                <ul className="ofi-dsp-list">
                    {cards.map((card, index) => (
                        <DispatchCard
                            key={card.purchaseOrderId}
                            card={card}
                            index={index}
                            onRetry={running ? undefined : onRetry}
                            onOpen={running ? undefined : onOpenDocument}
                        />
                    ))}
                </ul>
                {children}
            </div>
        </PopupDialog>
    );
};
