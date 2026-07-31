import {
    File05 as FileText,
    FileDownload02 as FileDown,
} from '@/components/icons/antIconCompat';
import { Modal } from '@/components/ui-shared/Modal';
import { t } from '@/i18n/translate';
import type { TenderDocumentDto } from '@/types/tender';

import { isPdfDocument, isPreviewableDocument } from '../../utils/tenderDocument.utils';

type TenderDocumentPreviewModalProps = {
    document: TenderDocumentDto | null;
    onClose: () => void;
};

export const TenderDocumentPreviewModal = ({ document, onClose }: TenderDocumentPreviewModalProps) => (
    <Modal
        open={Boolean(document)}
        onClose={onClose}
        title={document?.fileName ||t('tenders.additional_file')}
        width="xl"
        footer={document && (
            <a
                href={document.fileUrl}
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
                {isPreviewableDocument(document) ? (
                    <img
                        src={document.fileUrl}
                        alt={document.fileName}
                        loading="lazy"
                        decoding="async"
                        className="max-h-[70vh] w-full object-contain"
                    />
                ) : isPdfDocument(document) ? (
                    <iframe
                        src={document.fileUrl}
                        title={document.fileName}
                        loading="lazy"
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
