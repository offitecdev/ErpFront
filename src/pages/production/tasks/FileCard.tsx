import { useEffect, useRef, useState } from 'react';
import { ImageIcon, X } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { TaskSubtaskFile } from '@/types/productionTasks';

import { fileTypeLabel, thumbnailOf } from './fileThumbs';

/**
 * Eine Datei als Karte (28.09.2026, «the files in the files section should be
 * visible like this»): oben das Vorschaubild (Foto bzw. erste PDF-Seite),
 * darunter das Plättchen der Art (PDF rot, Bild grün), der Name und
 * «M-02.1 · Aykut · heute 09:42». Ein Klick öffnet die Datei in einem neuen Tab.
 * Das Bild wird erst geholt, wenn die Karte in Sicht kommt.
 */
export const FileCard = ({
    file,
    meta,
    load,
    onOpen,
    onRemove,
}: {
    file: TaskSubtaskFile;
    meta: string;
    load: () => Promise<Blob>;
    onOpen: () => void;
    onRemove?: () => void;
}) => {
    const ref = useRef<HTMLElement>(null);
    const [visible, setVisible] = useState(false);
    const [thumb, setThumb] = useState<string | null | undefined>(undefined);
    const label = fileTypeLabel(file.type, file.name);
    const isPdf = label === 'PDF';

    useEffect(() => {
        const node = ref.current;
        if (!node || typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined; }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
        }, { rootMargin: '200px' });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!visible) return undefined;
        let alive = true;
        void thumbnailOf(file.id, file.type, load).then((url) => { if (alive) setThumb(url); });
        return () => { alive = false; };
        // `load` wechselt mit jedem Zeichnen — die Datei selbst ist der Schlüssel.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, file.id, file.type]);

    return (
        <article ref={ref} className="ofi-ptk-filecard">
            <button type="button" className="ofi-ptk-filecard__open ofi-nosize" title={t('productionTasks.files.open', { name: file.name })} onClick={onOpen}>
                <span className={`ofi-ptk-filecard__thumb ${thumb ? '' : 'is-empty'} ${isPdf ? 'is-pdf' : ''}`}>
                    {thumb ? (
                        <img src={thumb} alt="" loading="lazy" />
                    ) : (
                        <span className={`ofi-ptk-filecard__placeholder ${thumb === undefined ? 'is-loading' : ''}`} aria-hidden>
                            {isPdf ? 'PDF' : <ImageIcon />}
                        </span>
                    )}
                </span>
                <span className="ofi-ptk-filecard__foot">
                    <span className={`ofi-ptk-filecard__type ${isPdf ? 'is-pdf' : 'is-image'}`} aria-hidden>
                        <span>{label}</span>
                    </span>
                    <span className="ofi-ptk-filecard__text">
                        <b>
                            {file.name}
                            {/* Eine spätere Fassung (28.09.2026) — «v2». */}
                            {(file.version || 1) > 1 && (
                                <span className="ofi-ptk-versiontag" title={t('productionTasks.files.versionHint', { version: file.version })}>
                                    {t('productionTasks.files.versionShort', { version: file.version })}
                                </span>
                            )}
                        </b>
                        <small>{meta}</small>
                    </span>
                </span>
            </button>
            {onRemove && (
                <button
                    type="button"
                    className="ofi-ptk-filecard__remove ofi-nosize"
                    aria-label={t('productionTasks.files.remove', { name: file.name })}
                    title={t('productionTasks.files.remove', { name: file.name })}
                    onClick={onRemove}
                >
                    <X aria-hidden />
                </button>
            )}
        </article>
    );
};
