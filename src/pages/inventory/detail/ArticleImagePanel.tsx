import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Image01, Trash01, UploadCloud02 } from '@/components/icons/antIconCompat';
import { Spinner } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import { ARTICLE_IMAGE_MAX_BYTES, ARTICLE_IMAGE_TYPES } from '@/types/inventory';
import { SectionCard } from '../components/primitives';

const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

/**
 * Ürün detayının SAĞ SÜTUNU — ürünün TEK görseli.
 *
 * Kaydedilmiş görsel ayrı ve önbelleklenebilir bir binary uçtan gelir. Böylece
 * 2 MB'a kadar çıkabilen base64 metni ürün detay JSON'unu ve ilk render'ı
 * bloke etmez.
 *
 * Yükleme ANINDA KAYDETMEZ: seçilen dosya yalnızca önizlemeye alınır ve
 * `onPick` ile üst bileşene bildirilir. Yazma işlemi ekranın ortak "Kaydet"
 * düğmesiyle, alanlar ve açıklamayla aynı istekte olur.
 */
export const ArticleImagePanel = ({
    canUpdate,
    articleId,
    imageVersion,
    pending,
    onPick,
}: {
    canUpdate: boolean;
    articleId: string;
    imageVersion: string;
    /** Bekleyen seçim: string = yeni görsel, null = kaldırıldı, undefined = değişmedi. */
    pending: string | null | undefined;
    onPick: (next: string | null) => void;
}) => {
    const [reading, setReading] = useState(false);
    const [loadingSaved, setLoadingSaved] = useState(true);
    const [saved, setSaved] = useState<string | null>(null);
    const [zoomed, setZoomed] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        let objectUrl: string | null = null;
        setSaved(null);
        setLoadingSaved(true);

        inventoryApi
            .getArticleImage(articleId, imageVersion)
            .then((blob) => {
                if (cancelled || !blob) return;
                objectUrl = URL.createObjectURL(blob);
                setSaved(objectUrl);
            })
            // Görsel yüklenemezse ürünün geri kalanı kullanılmaya devam eder.
            .catch(() => undefined)
            .finally(() => { if (!cancelled) setLoadingSaved(false); });

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [articleId, imageVersion]);

    // Ekranda gösterilen: bekleyen seçim varsa o, yoksa kaydedilmiş görsel.
    const shown = pending === undefined ? saved : pending;

    const pick = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        if (!ARTICLE_IMAGE_TYPES.includes(file.type)) {
            toast.error(t('inv.detail.imageInvalid'));
            return;
        }
        if (file.size > ARTICLE_IMAGE_MAX_BYTES) {
            toast.error(t('inv.detail.imageTooLarge'));
            return;
        }
        setReading(true);
        try {
            onPick(await fileToDataUrl(file));
        } finally {
            setReading(false);
        }
    };

    return (
        <SectionCard title={t('inv.detail.imageTitle')}>
            <div className="flex flex-col gap-3 p-3">
                {loadingSaved && pending === undefined ? (
                    <div className="flex min-h-32 items-center justify-center rounded-md border border-slate-200 bg-slate-50 dark:border-white/15 dark:bg-white/5">
                        <Spinner size="sm" />
                    </div>
                ) : shown ? (
                    <button
                        type="button"
                        onClick={() => setZoomed(true)}
                        title={t('inv.detail.imageZoom')}
                        className="block overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-white/15 dark:bg-white/5"
                    >
                        <img src={shown} alt={t('inv.detail.imageTitle')} className="max-h-72 w-full object-contain" />
                    </button>
                ) : (
                    <div className="flex flex-col items-center gap-1.5 rounded-md border border-slate-200 py-10 text-slate-400 dark:border-white/15 dark:text-white/40">
                        <Image01 size={22} />
                        <span className="text-[12px]">{t('inv.detail.imageEmpty')}</span>
                    </div>
                )}

                {canUpdate && (
                    <>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={reading}
                                onClick={() => fileRef.current?.click()}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#272f67] hover:text-[#272f67] disabled:opacity-50 dark:border-white/25 dark:text-white/70 dark:hover:border-white/50 dark:hover:text-white"
                            >
                                {reading ? <Spinner size="sm" /> : <UploadCloud02 size={14} />}
                                {/* Tek görsel tutulur: mevcut görsel varken "değiştir". */}
                                {shown ? t('inv.detail.imageReplace') : t('inv.detail.imageUpload')}
                            </button>
                            {shown && (
                                <button
                                    type="button"
                                    aria-label={t('common.delete')}
                                    title={t('common.delete')}
                                    disabled={reading}
                                    onClick={() => { onPick(null); setZoomed(false); }}
                                    className="flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:border-white/20 dark:hover:bg-red-500/15"
                                >
                                    <Trash01 size={14} />
                                </button>
                            )}
                        </div>
                        <p className="text-[11.5px] text-slate-400 dark:text-white/40">{t('inv.detail.imageHint')}</p>
                        {pending !== undefined && (
                            <p className="text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">
                                {t('inv.detail.imagePending')}
                            </p>
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
                    </>
                )}
            </div>

            {/* Büyütme: eldeki veriyi kullanır, yeniden istek atmaz. */}
            {zoomed && shown && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('inv.detail.imageTitle')}
                    onClick={() => setZoomed(false)}
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-6"
                >
                    <img src={shown} alt="" className="max-h-full max-w-full rounded-md object-contain" />
                </div>
            )}
        </SectionCard>
    );
};
