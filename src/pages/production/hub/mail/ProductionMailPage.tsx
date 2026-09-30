import { useEffect, useState, type ReactNode } from 'react';
import { Inbox, Plus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { productionBomErrorText } from '@/lib/api/productionBom';
import { productionMailboxApi } from '@/lib/api/purchasing';
import type { ProductionMailboxes } from '@/types/purchasing';
import '@/styles/modules/productionBom.css';
import '@/styles/modules/productionHub.css';

import { LoadingState, Note } from '../../bom/bomUi';
import { MailboxGroup } from './MailboxGroup';

const P = 'productionBom.mailbox';

/**
 * ── ÜRETİM › AYARLAR › E-POSTA (30.09.2026, Vorgabe Samet) ────────────────
 *
 * «Ayarlarda üretim modülü ayarlarında o mailleri girelim, mail ayarlarını
 *  yapalım — şifresi şu bu.» Oben das Postfach der Preisanfragen (rfq@…: geht
 * hinaus, die Antworten der Lieferanten kommen herein und hängen sich an ihre
 * Anfrage), darunter — freiwillig — ein eigenes für die Bestellungen; ohne
 * dieses gehen auch die Bestellungen aus rfq@…. «Şimdi kontrol et» liest die
 * Posteingänge sofort (sonst alle paar Minuten von selbst).
 */
export const ProductionMailPage = ({ tabs }: { tabs?: ReactNode }) => {
    const [data, setData] = useState<ProductionMailboxes | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [orderOpen, setOrderOpen] = useState(false);
    const [checking, setChecking] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let alive = true;
        productionMailboxApi.list()
            .then((value) => { if (alive) { setData(value); setError(null); } })
            .catch((failure) => { if (alive) setError(productionBomErrorText(failure, 'productionBom.err.loadFailed')); });
        return () => { alive = false; };
    }, [tick]);

    const check = async () => {
        if (checking) return;
        setChecking(true);
        try {
            const { runs } = await productionMailboxApi.check();
            const failed = runs.find((run) => run.error);
            const attached = runs.reduce((sum, run) => sum + run.attached, 0);
            if (!runs.length) toast.message(t(`${P}.checkNone`));
            else if (failed) toast.error(t(`${P}.checkFailed`, { error: failed.error }));
            else toast.success(t(`${P}.checkDone`, { count: attached }));
            setTick((value) => value + 1);
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setChecking(false);
        }
    };

    const body = () => {
        if (error && !data) return <div className="ofi-bom-state is-error"><TriangleAlert aria-hidden /><b>{error}</b></div>;
        if (!data) return <LoadingState />;
        const showOrder = Boolean(data.order) || orderOpen;
        return (
            <div className="ofi-bom-editor is-settings">
                <p className="ofi-pmail__intro">{t(`${P}.intro`)}</p>
                <MailboxGroup
                    key={`rfq:${data.rfq?.updatedAt ?? 'new'}`}
                    purpose="RFQ"
                    box={data.rfq}
                    defaults={data.defaults}
                    canEdit={data.canEdit}
                    onSaved={(rfq) => setData({ ...data, rfq })}
                    onRemoved={() => setData({ ...data, rfq: null })}
                />
                {showOrder ? (
                    <MailboxGroup
                        key={`order:${data.order?.updatedAt ?? 'new'}`}
                        purpose="ORDER"
                        box={data.order}
                        defaults={data.defaults}
                        canEdit={data.canEdit}
                        onSaved={(order) => setData({ ...data, order })}
                        onRemoved={() => { setData({ ...data, order: null }); setOrderOpen(false); }}
                    />
                ) : (
                    <section className="ofi-bom-group">
                        <h3 className="ofi-bom-group__title">{t(`${P}.ORDER.title`)}</h3>
                        <div className="ofi-bom-group__box">
                            <div className="ofi-bom-row">
                                <span className="ofi-bom-row__label">{t(`${P}.ORDER.fallback`)}<small>{t(`${P}.ORDER.fallbackSub`)}</small></span>
                                {data.canEdit && (
                                    <span className="ofi-bom-row__control is-inline ofi-pmail__right">
                                        <button type="button" className="ofi-bom-btn is-small ofi-nosize" onClick={() => setOrderOpen(true)}>
                                            <Plus aria-hidden />
                                            {t(`${P}.ORDER.setup`)}
                                        </button>
                                    </span>
                                )}
                            </div>
                        </div>
                    </section>
                )}
                <div className="ofi-pmail__check">
                    <span>
                        <b>{t(`${P}.inboxTitle`)}</b>
                        <small>{t(`${P}.inboxHint`)}</small>
                    </span>
                    <button type="button" className="ofi-bom-btn ofi-nosize" disabled={checking || !data.rfq} onClick={() => void check()}>
                        {checking ? <span className="ofi-bom-spinner is-small" /> : <Inbox aria-hidden />}
                        {t(`${P}.checkNow`)}
                    </button>
                </div>
                {!data.canEdit && <Note>{t(`${P}.readOnly`)}</Note>}
            </div>
        );
    };

    return (
        <div className="ofi-bom is-page">
            <header className="ofi-bom-head">
                {tabs ?? <h1 className="ofi-bom-head__title">{t('productionBom.hub.mailTab')}</h1>}
            </header>
            <div className="ofi-pmail-page">{body()}</div>
        </div>
    );
};

export default ProductionMailPage;
