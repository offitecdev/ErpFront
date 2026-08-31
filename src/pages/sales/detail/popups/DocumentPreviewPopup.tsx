import { useEffect, useState } from 'react';

import { File05, FileDownload02 } from '@/components/icons/antIconCompat';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import type { TenderDocumentDto } from '@/types/tender';

import { isPdfDocument, isPreviewableDocument } from '../utils/tenderDocument.utils';
import { TenderDialog } from './shell/TenderPopupShell';

type DocumentPreviewPopupProps = {
    document: TenderDocumentDto | null;
    onClose: () => void;
};

/**
 * Attachments are stored as `data:` URIs (see `tenderDocument.utils.fileToDataUrl`).
 * Handing that string straight to an iframe/img `src` pushes megabytes of
 * base64 through the main thread as a DOM attribute — the popup used to freeze
 * the page while opening. Instead the URI is decoded ONCE into a Blob and a
 * `blob:` URL is used: the browser streams the document, the decoding is async
 * and the popup opens instantly. `http(s)` sources are used as they are.
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
        // `fetch` turns a data URI into a Blob in one step; faster than a manual
        // atob + Uint8Array loop and lighter on the main thread.
        fetch(source)
            .then((response) => response.blob())
            .then((blob) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(blob);
                setUrl(objectUrl);
            })
            .catch(() => {
                // Undecodable: fall back to the original URI — slow but works.
                if (!cancelled) setUrl(source);
            });

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [source]);

    return url;
};

/**
 * Attachment viewer — a wide centred dialog (like a drive preview): image or
 * PDF inline, anything else as a file tile; download in the header.
 */
export const DocumentPreviewPopup = ({ document, onClose }: DocumentPreviewPopupProps) => {
    const previewUrl = useObjectUrl(document?.fileUrl);

    return (
        <TenderDialog
            open={Boolean(document)}
            onClose={onClose}
            title={document?.fileName || t('tenders.additional_file')}
            width={1040}
            headerActions={document && (
                <a
                    href={previewUrl || document.fileUrl}
                    download={document.fileName}
                    target="_blank"
                    rel="noreferrer"
                    className="ofi-cal-btn"
                    title={t('common.download')}
                >
                    <FileDownload02 size={15} />
                    {t('common.download')}
                </a>
            )}
        >
            {document && (
                <div className="ofi-tp-preview">
                    {!previewUrl && (isPreviewableDocument(document) || isPdfDocument(document)) ? (
                        <InlineLoading />
                    ) : isPreviewableDocument(document) ? (
                        <img
                            src={previewUrl || document.fileUrl}
                            alt={document.fileName}
                            loading="lazy"
                            decoding="async"
                        />
                    ) : isPdfDocument(document) ? (
                        <iframe src={previewUrl || document.fileUrl} title={document.fileName} />
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-2 py-10" style={{ color: 'var(--ofi-cal-muted)' }}>
                            <File05 size={36} />
                            <span className="max-w-full truncate text-[13px] font-medium">{document.fileName}</span>
                        </div>
                    )}
                </div>
            )}
        </TenderDialog>
    );
};
