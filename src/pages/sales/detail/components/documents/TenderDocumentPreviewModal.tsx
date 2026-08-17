import { useEffect, useState } from 'react';

import {
    File05 as FileText,
    FileDownload02 as FileDown,
} from '@/components/icons/antIconCompat';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { Modal } from '@/components/ui-shared/Modal';
import { t } from '@/i18n/translate';
import type { TenderDocumentDto } from '@/types/tender';

import { isPdfDocument, isPreviewableDocument } from '../../utils/tenderDocument.utils';

type TenderDocumentPreviewModalProps = {
    document: TenderDocumentDto | null;
    onClose: () => void;
};

/**
 * Ek dosyalar veritabanında `data:` URI olarak saklanır (bkz.
 * `tenderDocument.utils.fileToDataUrl`). Bu metni doğrudan iframe/img `src`'ine
 * vermek, birkaç MB'lık base64'ün DOM özniteliği olarak ana iş parçacığından
 * geçmesi demek: pop-up açılırken sayfa donuyordu. Bunun yerine URI bir kez
 * Blob'a çözülür ve `blob:` adresi verilir — tarayıcı belgeyi akıtarak okur,
 * çözme işi de asenkron olduğu için pop-up anında açılır.
 *
 * Zaten `http(s)` ile gelen (sunucuda barındırılan) dosyalar olduğu gibi
 * kullanılır; çevirisi gereken bir şey yoktur.
 */
const useObjectUrl = (source: string | null | undefined) => {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!source) {
            setUrl(null);
            return;
        }
        if (!/^data:/i.test(source)) {
            setUrl(source);
            return;
        }

        let cancelled = false;
        let objectUrl: string | null = null;
        setUrl(null);
        // `fetch` bir data URI'yi base64'ten tek adımda Blob'a çevirir; elle
        // atob + Uint8Array döngüsünden hem hızlı hem de ana iş parçacığını
        // daha az meşgul eder.
        fetch(source)
            .then((response) => response.blob())
            .then((blob) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(blob);
                setUrl(objectUrl);
            })
            .catch(() => {
                // Çözülemezse özgün URI ile devam et: yavaş ama çalışır.
                if (!cancelled) setUrl(source);
            });

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [source]);

    return url;
};

export const TenderDocumentPreviewModal = ({ document, onClose }: TenderDocumentPreviewModalProps) => {
    const previewUrl = useObjectUrl(document?.fileUrl);

    return (
        <Modal
            open={Boolean(document)}
            onClose={onClose}
            title={document?.fileName ||t('tenders.additional_file')}
            width="xl"
            footer={document && (
                <a
                    href={previewUrl || document.fileUrl}
                    download={document.fileName}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-[2px] border border-[#1f2654] bg-[#1f2654] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#151a3b]"
                >
                    <FileDown size={14} />{t('common.download')}</a>
            )}
        >
            {document && (
                <div className="flex min-h-[320px] items-center justify-center rounded-[2px] border border-slate-200 bg-slate-50 p-2">
                    {!previewUrl && (isPreviewableDocument(document) || isPdfDocument(document)) ? (
                        <InlineLoading />
                    ) : isPreviewableDocument(document) ? (
                        <img
                            src={previewUrl || document.fileUrl}
                            alt={document.fileName}
                            loading="lazy"
                            decoding="async"
                            className="max-h-[70vh] w-full object-contain"
                        />
                    ) : isPdfDocument(document) ? (
                        <iframe
                            src={previewUrl || document.fileUrl}
                            title={document.fileName}
                            className="h-[70vh] w-full rounded border border-slate-200 bg-white"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                            <FileText size={36} />
                            <span className="max-w-full truncate text-[13px] font-medium">{document.fileName}</span>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
};
