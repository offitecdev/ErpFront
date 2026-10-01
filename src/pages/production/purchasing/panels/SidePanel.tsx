import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { t } from '@/i18n/translate';

/**
 * Die Fläche des Wareneingangs — eine Seite mit Kopf, Inhalt und Fuss. «Siparişe
 * git» öffnet die Bestellung selbst (dieselbe Seite wie im Stok).
 */
export const SidePanel = ({ title, subtitle, context, footer, busy, onClose, children, onOpenOrder }: {
    icon: ReactNode;
    title: string;
    subtitle?: ReactNode;
    context?: ReactNode;
    footer?: ReactNode;
    busy?: boolean;
    onClose: () => void;
    children: ReactNode;
    onOpenOrder?: () => void;
}) => (
    <div className="ofi-buy ofi-buy-workspace">
        <section className="ofi-buy-surface" aria-label={title}>
            <header className="ofi-buy-workspace__head">
                <button type="button" className="ofi-buy-back ofi-nosize" disabled={busy} onClick={onClose}><ArrowLeft aria-hidden />{t('common.back')}</button>
                <div className="ofi-buy-workspace__heading">
                    <div className="ofi-buy-workspace__title">
                        <h1>{title}</h1>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                    {onOpenOrder && (
                        <div className="ofi-buy-workspace__actions">
                            <button type="button" className="ofi-buy-btn ofi-nosize" disabled={busy} onClick={onOpenOrder}>
                                {t('productionBom.purchasing.goToOrder')}
                                <ArrowRight />
                            </button>
                        </div>
                    )}
                </div>
                {context && <div className="ofi-buy-workspace__context">{context}</div>}
            </header>
            <div className="ofi-buy-workspace__body">
                {children}
            </div>
            {footer && <footer className="ofi-buy-workspace__footer">{footer}</footer>}
        </section>
    </div>
);
