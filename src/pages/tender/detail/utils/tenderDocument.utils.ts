import { t } from '@/i18n/translate';
import type { TenderDocumentDto } from '../../../../types/tender';

export const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error(t('tenders.file_okunamadi')));
        reader.readAsDataURL(file);
    });

export const isPreviewableDocument = (doc: Pick<TenderDocumentDto, 'fileType' | 'fileUrl'>) =>
    doc.fileType.startsWith('image/') || /^data:image\//i.test(doc.fileUrl);

export const isPdfDocument = (doc: Pick<TenderDocumentDto, 'fileType' | 'fileName' | 'fileUrl'>) =>
    doc.fileType === 'application/pdf' || /\.pdf$/i.test(doc.fileName) || /^data:application\/pdf/i.test(doc.fileUrl);

export const normalizeDocumentName = (value?: string | null) =>
    String(value || '')
        .replace(/^Ek dosya eklendi:\s*/i, '')
        .trim()
        .toLocaleLowerCase('tr-TR');

export const inferDocumentType = (file: File) => {
    if (file.type) return file.type;
    const fileName = file.name;
    if (/\.pdf$/i.test(fileName)) return 'application/pdf';
    if (/\.png$/i.test(fileName)) return 'image/png';
    if (/\.(jpe?g)$/i.test(fileName)) return 'image/jpeg';
    return '';
};
