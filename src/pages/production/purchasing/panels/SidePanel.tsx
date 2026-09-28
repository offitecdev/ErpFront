import { lazy, Suspense, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, PanelsTopLeft } from 'lucide-react';

import { t } from '@/i18n/translate';
import { Loading } from '../purchasingUi';

const loadWorkspace = () => import('@/pages/inventory/OrderWorkspacePage');
const Workspace = lazy(() => loadWorkspace().then((module) => ({ default: module.OrderWorkspacePage })));

/** One page surface. Keep the draft mounted when opening its document. */
export const SidePanel = ({ title, subtitle, context, footer, busy, onClose, children, purchaseOrderId, hidden = false, onWorkspaceReturn }: {
    icon: ReactNode;
    title: string;
    subtitle?: ReactNode;
    context?: ReactNode;
    footer?: ReactNode;
    busy?: boolean;
    onClose: () => void;
    children: ReactNode;
    purchaseOrderId?: string;
    hidden?: boolean;
    onWorkspaceReturn?: () => void;
}) => {
    const [documentTab, setDocumentTab] = useState<'lines' | 'template' | null>(null);
    const back = () => {
        if (documentTab) { setDocumentTab(null); onWorkspaceReturn?.(); }
        else onClose();
    };
    return (
        <div className="ofi-buy ofi-buy-workspace" hidden={hidden}>
            <section className="ofi-buy-surface" aria-label={title}>
                <div hidden={Boolean(documentTab)}>
                    <header className="ofi-buy-workspace__head">
                        <button type="button" className="ofi-buy-back ofi-nosize" disabled={busy} onClick={back}><ArrowLeft aria-hidden />{t('common.back')}</button>
                        <div className="ofi-buy-workspace__heading">
                            <div className="ofi-buy-workspace__title">
                                <h1>{title}</h1>
                                {subtitle && <p>{subtitle}</p>}
                            </div>
                            {purchaseOrderId && <div className="ofi-buy-workspace__actions">
                                <button type="button" className="ofi-buy-btn ofi-nosize" disabled={busy} onPointerEnter={() => { void loadWorkspace().catch(() => undefined); }} onFocus={() => { void loadWorkspace().catch(() => undefined); }} onClick={() => setDocumentTab('template')}><PanelsTopLeft />{t('productionBom.purchasing.templatesAndImport')}</button>
                                <button type="button" className="ofi-buy-btn is-icon is-quiet ofi-nosize" disabled={busy} onClick={() => setDocumentTab('lines')} aria-label={t('productionBom.purchasing.openOrder')} title={t('productionBom.purchasing.openOrder')}><ArrowRight /></button>
                            </div>}
                        </div>
                        {context && <div className="ofi-buy-workspace__context">{context}</div>}
                    </header>
                    <div className="ofi-buy-workspace__body">
                        {children}
                    </div>
                    {footer && <footer className="ofi-buy-workspace__footer">{footer}</footer>}
                </div>
                {documentTab && purchaseOrderId && <Suspense fallback={<Loading />}><Workspace key={purchaseOrderId} workspaceId={purchaseOrderId} initialTab={documentTab} onBack={back} /></Suspense>}
            </section>
        </div>
    );
};
