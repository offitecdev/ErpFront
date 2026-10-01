import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Check, CircleDashed, Eye, Lock, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import type { BomOrigin } from '@/types/productionBom';
import '@/styles/modules/productionBom.css';

import { BomSpinner } from '../bomUi';
import { openQuoteFile } from '../device/bomFiles';

/** Der Weg zurück in die BOM — genau zu dieser Bestellung. */
const bomOriginPath =(origin: BomOrigin, purchaseOrderId: string): string => {
    const query = new URLSearchParams();
    if (origin.area === 'ELECTRICAL') query.set('area', 'electrical');
    query.set('stage', 'bom');
    query.set('bv', 'purchase');
    query.set('bom', origin.bomId);
    query.set('po', purchaseOrderId);
    return `/production/orders/${encodeURIComponent(origin.productionProjectId)}/devices/${encodeURIComponent(origin.productionItemId)}?${query.toString()}`;
};

/**
 * ── DAS BAND ÜBER EINER BOM-BESTELLUNG (27.09.2026, Vorgabe Samet) ──────────
 *
 * «Siparişler projeden geldiği belli olmalı — proje, cihaz ve sipariş
 *  numaramız.» Oben auf der Auftragsseite: woher der Beleg kommt (BOM,
 *  Projekt, Gerät — ein Klick führt zurück), welche Regeln gelten, und für
 *  eine Bestellung die zwei Bedingungen der Bestätigung: Angebotsnummer des
 *  Lieferanten und sein Angebot (hier gleich hochzuladen).
 */
export const BomOrderBanner = ({
    origin,
    purchaseOrderId,
    savedQuoteNumber,
    onChanged,
}: {
    origin: BomOrigin;
    purchaseOrderId: string;
    savedQuoteNumber: string | null;
    onChanged: () => void;
}) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    /* Das Angebot gilt SOFORT als da (29.09.2026: «pdf yüklemesi 5 saniye sürüyor,
       en fazla 200 ms») — das Hochladen läuft dahinter, die Bestellung liest den
       Stand danach im Hintergrund. Scheitert es, ist der Haken wieder weg. */
    const [uploaded, setUploaded] = useState(false);
    const isOrder = origin.kind === 'ORDER';
    const hasNumber = Boolean(savedQuoteNumber?.trim());
    const hasFile = Boolean(origin.quoteFile) || uploaded;

    const upload = async (file: File | null | undefined) => {
        if (!file) return;
        setUploaded(true);
        setBusy(true);
        try {
            await productionBomApi.uploadQuote(purchaseOrderId, file, { lean: true });
            toast.success(t('productionBom.purchase.uploaded'));
            onChanged();
        } catch (error) {
            setUploaded(false);
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="ofi-bom ofi-bom-wsbanner" role="note">
            <span className="ofi-bom-wsbanner__icon"><Boxes aria-hidden /></span>
            <span className="ofi-bom-wsbanner__text">
                <b>{isOrder ? t('productionBom.origin.fromBom') : t('productionBom.origin.fromBomRequest')}</b>
                <small>
                    <Link to={bomOriginPath(origin, purchaseOrderId)} className="ofi-bom-wsbanner__link">
                        {t('productionBom.origin.chip', { number: origin.bomNumber ?? '—' })}
                    </Link>
                    {typeof origin.bomRevision === 'number' && (origin.bomRevision > 0 || (origin.orderRevision ?? 0) > 0) && (
                        <>
                            <span className="ofi-bom-dot">·</span>
                            {t('productionBom.revision.label', { revision: origin.bomRevision })}
                        </>
                    )}
                    {(origin.orderRevision ?? 0) > 0 && (
                        <span className="ofi-bom-revpill is-inline">{t('productionBom.revision.orderPill', { revision: origin.orderRevision })}</span>
                    )}
                    {origin.projectNumber && (
                        <>
                            <span className="ofi-bom-dot">·</span>
                            {t('productionBom.origin.project')} {origin.projectNumber}{origin.projectName ? ` ${origin.projectName}` : ''}
                        </>
                    )}
                    {origin.deviceName && (
                        <>
                            <span className="ofi-bom-dot">·</span>
                            {t('productionBom.origin.device')} {origin.deviceName}
                        </>
                    )}
                </small>
                <small className="ofi-bom-wsbanner__rule">
                    {isOrder ? t('productionBom.ai.rowsLocked') : t('productionBom.origin.requestNoConvert')}
                </small>
                {origin.revisionPending && (
                    <small className="ofi-bom-wsbanner__rule is-warn">
                        {t('productionBom.revision.orderPending', { revision: origin.orderRevision ?? 0, bomRevision: origin.linkBomRevision ?? 0 })}
                    </small>
                )}
            </span>
            {isOrder && (
                <span className="ofi-bom-wsbanner__checks">
                    <span className={hasNumber ? 'is-ok' : 'is-missing'}>
                        {hasNumber ? <Check aria-hidden /> : <CircleDashed aria-hidden />}
                        {t('productionBom.purchases.checkQuoteNumber')}
                    </span>
                    <span className={hasFile ? 'is-ok' : 'is-missing'}>
                        {hasFile ? <Check aria-hidden /> : <CircleDashed aria-hidden />}
                        {t('productionBom.purchases.checkQuoteFile')}
                    </span>
                    {hasFile ? (
                        <button type="button" className="ofi-bom-btn is-small is-quiet ofi-nosize" disabled={busy} onClick={() => void openQuoteFile(purchaseOrderId)}>
                            {busy ? <BomSpinner small /> : <Eye />}
                            {t('productionBom.purchase.view')}
                        </button>
                    ) : (
                        <button type="button" className="ofi-bom-btn is-small ofi-nosize" disabled={busy} onClick={() => fileRef.current?.click()}>
                            {busy ? <BomSpinner small /> : <Upload />}
                            {t('productionBom.purchase.upload')}
                        </button>
                    )}
                    <input
                        ref={fileRef}
                        type="file"
                        hidden
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }}
                    />
                </span>
            )}
        </div>
    );
};

/** PDF/Mail sind gesperrt, solange die Angebotsnummer des Lieferanten fehlt. */
export const BomSendLocked = () => (
    <div className="ofi-bom ofi-bom-wslock" role="status">
        <Lock aria-hidden />
        <span>
            <b>{t('productionBom.origin.sendNeeds')}</b>
            <small>{t('productionBom.purchase.quoteNumberHint')}</small>
        </span>
    </div>
);
