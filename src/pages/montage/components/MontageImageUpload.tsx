import { useRef, useState } from 'react';

import { Image01, UploadCloud02, XClose } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { filesToReportImages } from '../utils/montageImages';

/** Big-tap photo attach (camera or gallery) with a 10 MB per-file limit. */
export const MontageImageUpload = ({
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
        setBusy(true);
        try {
            const scaled = await filesToReportImages(fileList, Math.max(0, max - value.length));
            if (scaled.length) onChange([...value, ...scaled]);
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className="space-y-3">
            {value.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                    {value.map((src, index) => (
                        <div key={index} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
                            <img src={src} alt="" className="h-full w-full object-cover" />
                            {!disabled && (
                                <button
                                    type="button"
                                    title={t('projects.gorsel_kaldir')}
                                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                                    className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                                >
                                    <XClose size={18} />
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
                    className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 text-[15px] font-bold text-slate-600 transition-colors hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-300"
                >
                    {busy ? <Image01 size={20} /> : <UploadCloud02 size={20} />}
                    {t('montage.addPhoto')}
                </button>
            )}
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
        </div>
    );
};
