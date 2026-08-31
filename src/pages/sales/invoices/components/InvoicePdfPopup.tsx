import { useEffect, useState } from 'react';

import { FileDownload02 } from '@/components/icons/antIconCompat';
import { InvoicePopup } from '@/components/billing/InvoicePopup';
import { t } from '@/i18n/translate';

/**
 * PDF-Vorschau des Rechnungsmoduls — die schwebende Karte, kein Bodenblatt
 * (siehe `InvoicePopup`): die Rechnungsliste dahinter bleibt lesbar.
 *
 * Gezeigt wird das ECHTE Dokument, nicht ein nachgebauter Entwurf: die Seiten
 * bauen die Bytes mit demselben Generator, mit dem sie später heruntergeladen
 * werden. Deshalb nimmt die Karte einen fertigen `Blob` entgegen — die
 * Direktrechnung kann so auch eine NOCH NICHT GESPEICHERTE Rechnung zeigen.
 */
export const InvoicePdfPopup = ({
    open,
    title,
    subtitle,
    blob,
    loading,
    onClose,
    onDownload,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    blob: Blob | null;
    loading: boolean;
    onClose: () => void;
    onDownload?: () => void;
}) => {
    const [url, setUrl] = useState<string | null>(null);

    // Objekt-URLs sind eine Ressource: die alte wird bei jedem Wechsel und beim
    // Schliessen freigegeben, sonst hält der Tab die Dokumente fest.
    useEffect(() => {
        if (!blob) { setUrl(null); return; }
        const next = URL.createObjectURL(blob);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [blob]);

    return (
        <InvoicePopup
            open={open}
            title={title}
            subtitle={subtitle}
            size="wide"
            fill
            onClose={onClose}
            footer={onDownload ? (
                <button type="button" className="ofi-inv-btn is-primary" disabled={!blob} onClick={onDownload}>
                    <FileDownload02 size={14} />
                    {t('billing.downloadBtn')}
                </button>
            ) : undefined}
        >
            {loading && <div className="ofi-invp-pdfstate">{t('common.loading')}</div>}
            {!loading && !url && <div className="ofi-invp-pdfstate">{t('billing.pdfError')}</div>}
            {!loading && url && <iframe src={url} title={title} className="ofi-invp-pdfframe" />}
        </InvoicePopup>
    );
};
