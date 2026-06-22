import { useRef, useState } from 'react';
import { Image01, UploadCloud02, XClose } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

// Downscale large photos before storing them as base64 data URLs so report
// payloads stay reasonable. Falls back to the raw data URL if anything fails.
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

export const ReportImageUploader = ({
    value,
    onChange,
    disabled,
    max = 12,
}: {
    value: string[];
    onChange: (images: string[]) => void;
    disabled?: boolean;
    max?: number;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const full = value.length >= max;

    const handleFiles = async (fileList: FileList | null) => {
        if (!fileList?.length) return;
        setBusy(true);
        try {
            const available = Math.max(0, max - value.length);
            const files = Array.from(fileList).filter((file) => file.type.startsWith('image/')).slice(0, available);
            const scaled = await Promise.all(files.map(fileToScaledDataUrl));
            if (scaled.length) onChange([...value, ...scaled]);
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className="space-y-2">
            {value.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {value.map((src, index) => (
                        <div key={index} className="group relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                            <img src={src} alt="" className="h-full w-full object-cover" />
                            {!disabled && (
                                <button
                                    type="button"
                                    title={t('projects.gorsel_kaldir')}
                                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity hover:bg-black/75 group-hover:opacity-100"
                                >
                                    <XClose size={13} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {!disabled && !full && (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-[12px] font-semibold text-slate-600 transition-colors hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {busy ? <Image01 size={15} /> : <UploadCloud02 size={15} />}
                    {t('projects.gorsel_ekle')}
                </button>
            )}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void handleFiles(e.target.files)}
            />
        </div>
    );
};
