import { useRef, useState } from 'react';
import { FileText, RefreshCw, Upload } from 'lucide-react';

import { t } from '@/i18n/translate';
import { MacLoading } from '@/components/ui-shared/MacLoading';
import { toast } from 'sonner';

const P = 'productionBom.purchasing.drop';
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';

/** Attach a PDF or image without starting an AI request. */
export const QuoteDrop = ({ fileName, uploading, disabled, onFile }: {
    /** Die neue oder schon gespeicherte Datei — null = noch keine. */
    fileName: string | null;
    uploading: boolean;
    disabled?: boolean;
    onFile: (file: File) => void;
}) => {
    const input = useRef<HTMLInputElement>(null);
    const [over, setOver] = useState(false);
    const take = (list: FileList | null | undefined) => {
        if (disabled || uploading) return;
        const file = list?.[0];
        if (!file) return;
        if (!/\.(pdf|png|jpe?g|webp)$/i.test(file.name) || file.size > 20 * 1024 * 1024 || !file.size) {
            toast.error(t('productionBom.purchasing.drop.invalid'));
            return;
        }
        onFile(file);
    };
    const picker = (
        <input
            ref={input}
            type="file"
            hidden
            accept={ACCEPT}
            onChange={(event) => { take(event.target.files); event.target.value = ''; }}
        />
    );

    if (uploading) return <MacLoading compact label={t('common.loadingData')} />;

    if (fileName) {
        return (
            <div className="ofi-buy-file">
                <FileText aria-hidden />
                <div className="ofi-buy-file__name">
                    <b>{fileName}</b>
                    {uploading && <MacLoading compact label={t('common.loadingData')} />}
                </div>
                {!uploading && (
                    <button type="button" className="ofi-buy-btn ofi-nosize" disabled={disabled} onClick={() => input.current?.click()}>
                        <RefreshCw aria-hidden />
                        {t(`${P}.replace`)}
                    </button>
                )}
                {picker}
            </div>
        );
    }
    return (
        <>
            <button
                type="button"
                className={`ofi-buy-drop ofi-nosize${over ? ' is-over' : ''}`}
                disabled={disabled}
                onClick={() => input.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(event) => { event.preventDefault(); setOver(false); take(event.dataTransfer.files); }}
            >
                <Upload aria-hidden />
                <span><b>{t(`${P}.title`)}</b> {t(`${P}.or`)}</span>
                <small>{t(`${P}.hint`)}</small>
            </button>
            {picker}
        </>
    );
};
