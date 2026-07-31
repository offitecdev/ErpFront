import { toast } from 'sonner';

import { t } from '@/i18n/translate';

/** Hard per-file limit for report photos taken/attached on the tablet. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

// Same downscale strategy as ReportImageUploader: report images travel as base64
// data URLs inside the report payload, so large photos must be re-encoded.
const fileToScaledDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            const img = new Image();
            img.onerror = () => resolve(dataUrl);
            img.onload = () => {
                const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
                if (scale >= 1) return resolve(dataUrl);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                if (!ctx) return resolve(dataUrl);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    });

/** Filter to images under 10 MB (toasting rejected files) and convert to data URLs. */
export const filesToReportImages = async (fileList: FileList | null, available: number): Promise<string[]> => {
    if (!fileList?.length || available <= 0) return [];
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    const accepted = files.filter((file) => file.size <= MAX_IMAGE_BYTES);
    if (accepted.length < files.length) toast.error(t('montage.imageTooLarge'));
    return Promise.all(accepted.slice(0, available).map(fileToScaledDataUrl));
};
