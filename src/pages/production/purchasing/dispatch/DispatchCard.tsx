import { ArrowRight, FileText, RotateCw } from 'lucide-react';

import { t } from '@/i18n/translate';

import { openBlob } from '../../bom/device/bomFiles';
import { shownPurchaseCode } from '../../bom/bomFormat';
import { purchasingApi } from '@/lib/api/purchasing';
import { PaperGlyph, StatusGlyph } from './DispatchGlyphs';
import { isFinal, phaseText, type DispatchCardModel } from './dispatchModel';

/**
 * Eine Karte der Sendung: das Blatt, das sich schreibt · Lieferant, Umfang,
 * Stand · rechts das Zeichen. Fertig: «PDF» öffnet, was hinausging; ein
 * übersprungener/gescheiterter Beleg bietet «Tekrar dene» und «Aç».
 */
export const DispatchCard = ({
    card,
    index,
    onRetry,
    onOpen,
}: {
    card: DispatchCardModel;
    index: number;
    onRetry?: (purchaseOrderId: string) => void;
    onOpen?: (purchaseOrderId: string) => void;
}) => {
    const problem = card.phase === 'failed' || card.phase === 'skipped';
    return (
        <li className={`ofi-dsp-card is-${card.phase}`} style={{ animationDelay: `${index * 90}ms` }}>
            <PaperGlyph phase={card.phase} code={shownPurchaseCode(card.code)} />
            <span className="ofi-dsp-card__text">
                <b title={card.supplierName}>{card.supplierName || '—'}</b>
                <small>{[shownPurchaseCode(card.code), card.detail].filter(Boolean).join(' · ')}</small>
                <span className={`ofi-dsp-card__phase${problem ? ' is-warn' : ''}`} aria-live="polite">{phaseText(card)}</span>
            </span>
            <span className="ofi-dsp-card__end">
                {isFinal(card.phase) && card.mailId && (
                    <button
                        type="button"
                        className="ofi-dsp-mini ofi-nosize"
                        title={t('productionBom.purchasing.dispatch.openPdf')}
                        onClick={() => void openBlob(() => purchasingApi.file('mail', card.mailId!))}
                    >
                        <FileText aria-hidden />
                        PDF
                    </button>
                )}
                {problem && onRetry && (
                    <button type="button" className="ofi-dsp-mini ofi-nosize" onClick={() => onRetry(card.purchaseOrderId)}>
                        <RotateCw aria-hidden />
                        {t('productionBom.purchasing.dispatch.retry')}
                    </button>
                )}
                {problem && onOpen && (
                    <button type="button" className="ofi-dsp-mini ofi-nosize" onClick={() => onOpen(card.purchaseOrderId)}>
                        {t('productionBom.purchasing.dispatch.openDoc')}
                        <ArrowRight aria-hidden />
                    </button>
                )}
                <StatusGlyph phase={card.phase} />
            </span>
        </li>
    );
};
