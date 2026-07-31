import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n/translate';

/**
 * In-sheet PDF stage: fills the sliding view with the document built live from
 * the current data, so fresh rows and received signatures are always inside.
 * Nothing opens outside the popup.
 */
export const PdfView = ({ build }: { build: () => Promise<Blob | null> }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const runRef = useRef(0);

    useEffect(() => {
        const run = ++runRef.current;
        let objectUrl: string | null = null;
        build()
            .then((blob) => {
                if (runRef.current !== run) return;
                if (!blob) { setError(true); return; }
                objectUrl = URL.createObjectURL(blob);
                setUrl(objectUrl);
            })
            .catch(() => {
                if (runRef.current === run) setError(true);
            });
        return () => {
            runRef.current += 1;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-slate-100 dark:bg-black/30">
            {url ? (
                <iframe title="pdf" src={url} className="min-h-0 w-full flex-1 border-0 bg-white" />
            ) : (
                <div className="flex flex-1 items-center justify-center text-[12.5px] text-slate-400">
                    {error ? t('projects.pdf_olusturulamadi') : t('common.loading')}
                </div>
            )}
        </div>
    );
};
