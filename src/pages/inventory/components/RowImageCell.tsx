import { useRef, useState } from 'react';

import { Image01, Trash01 } from '@/components/icons/antIconCompat';
import { Spinner } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { ARTICLE_IMAGE_TYPES } from '@/types/inventory';
import { readArticleImageFile } from '../utils/image';

/**
 * Toplu ekleme tablosundaki GÖRSEL hücresi — satır başına tek görsel.
 * Boşken kesikli kare düğme dosya seçtirir; doluyken küçük önizleme gösterir
 * (tıklamak görseli DEĞİŞTİRİR, yanındaki çöp kutusu kaldırır). Doğrulama
 * detay ekranıyla aynıdır (tür + 2 MB sınırı, `readArticleImageFile`).
 */
export const RowImageCell = ({
    value,
    onChange,
}: {
    value: string | null;
    onChange: (next: string | null) => void;
}) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [reading, setReading] = useState(false);

    const pick = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        setReading(true);
        try {
            const dataUrl = await readArticleImageFile(file);
            if (dataUrl) onChange(dataUrl);
        } finally {
            setReading(false);
        }
    };

    return (
        <div className="flex items-center justify-center gap-1">
            <button
                type="button"
                disabled={reading}
                onClick={() => fileRef.current?.click()}
                aria-label={value ? t('inv.detail.imageReplace') : t('inv.detail.imageUpload')}
                title={value ? t('inv.detail.imageReplace') : t('inv.detail.imageUpload')}
                className={value
                    ? 'flex size-8 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-white/15 dark:bg-white/5'
                    : 'flex size-8 items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-[#272f67] hover:text-[#272f67] disabled:opacity-50 dark:border-white/25 dark:text-white/40 dark:hover:border-white/50 dark:hover:text-white'}
            >
                {reading
                    ? <Spinner size="sm" />
                    : value
                        ? <img src={value} alt="" className="size-full object-cover" />
                        : <Image01 size={14} />}
            </button>
            {value && (
                <button
                    type="button"
                    aria-label={t('common.delete')}
                    title={t('common.delete')}
                    onClick={() => onChange(null)}
                    className="flex size-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/15"
                >
                    <Trash01 size={12} />
                </button>
            )}
            <input
                ref={fileRef}
                type="file"
                accept={ARTICLE_IMAGE_TYPES.join(',')}
                className="hidden"
                onChange={(event) => {
                    void pick(event.target.files);
                    // Aynı dosya tekrar seçilirse change yine tetiklensin.
                    event.target.value = '';
                }}
            />
        </div>
    );
};
