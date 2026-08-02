import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/**
 * ── ONAY PENCERESİ (uygulamanın kendi görünümüyle) ──────────────────────────
 *
 * `window.confirm` YERİNE kullanılır (kullanıcı isteği 2026-08-02: "tarayıcının
 * kendi penceresi değil, düzgün bir popup"). Tarayıcı diyaloğu sayfanın
 * tepesinde, uygulamanın diline/temasına yabancı bir kutu açar ve dokunmatik
 * cihazlarda kaçırılır.
 *
 * ANTD KULLANMAZ: bu modüllerin (envanter, takvim) popup katmanı elle yazılmış
 * portallardan oluşur — `ui-shared/Modal.tsx` antd tabanlıdır ve buraya
 * karıştırılmaz. Görünüm takvimdeki `CenterModal` ile aynı dildedir:
 * ortada yükselen kart (`ofi-rise-in`), yarı saydam arka plan.
 *
 * DAVRANIŞ: arka plana tıklamak ve ESC İPTAL eder; onay düğmesi açılışta
 * odaklanır (Enter doğrudan onaylar). `busy` verildiğinde düğmeler kilitlenir —
 * asenkron işlem sürerken pencere kapanmaz, ikinci tıklama iş açmaz.
 */
export const ConfirmDialog = ({
    open,
    title,
    message,
    confirmLabel,
    cancelLabel,
    tone = 'primary',
    busy = false,
    onConfirm,
    onCancel,
    zIndex = 160,
}: {
    open: boolean;
    title: ReactNode;
    message?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** `danger` kırmızı onay düğmesi çizer (silme gibi geri alınamaz işlemler). */
    tone?: 'primary' | 'danger';
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    zIndex?: number;
}) => {
    const confirmRef = useRef<HTMLButtonElement | null>(null);
    // Çağıranlar `onCancel`i satır içi ok fonksiyonu olarak verir (her render'da
    // yeni kimlik). Ref üzerinden okunur ki dinleyici her render'da sökülüp
    // yeniden takılmasın ve odak sürekli çalınmasın.
    const cancelRef = useRef(onCancel);
    const busyRef = useRef(busy);
    // Ref'ler RENDER SIRASINDA yazılamaz (react-hooks kuralı): her render sonrası
    // effect ile tazelenir.
    useEffect(() => {
        cancelRef.current = onCancel;
        busyRef.current = busy;
    });

    // Açılışta odak onay düğmesine gider (Enter = onayla), ESC iptal eder.
    useEffect(() => {
        if (!open) return;
        confirmRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !busyRef.current) cancelRef.current();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    if (!open) return null;

    const confirmClass = tone === 'danger'
        ? 'bg-red-600 hover:bg-red-700'
        : 'bg-[#272f67] hover:bg-[#1f2654]';

    return createPortal(
        <div className="fixed inset-0 flex items-center justify-center px-3" style={{ zIndex }}>
            <div
                className="absolute inset-0 bg-slate-950/35 dark:bg-black/60"
                onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}
                aria-hidden
            />
            <section
                role="alertdialog"
                aria-modal="true"
                className="ofi-rise-in relative flex w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/15 dark:bg-[#151616]"
            >
                <header className="flex items-start gap-3 px-4 pb-2 pt-4">
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                        tone === 'danger'
                            ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300'
                            : 'bg-[#272f67]/10 text-[#272f67] dark:bg-white/10 dark:text-white'
                    }`}
                    >
                        <AlertTriangle size={17} />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                        <h2 className="text-[14px] font-bold leading-snug text-slate-900 dark:text-white">{title}</h2>
                        {message && (
                            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500 dark:text-white/60">{message}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        aria-label={t('common.close')}
                        disabled={busy}
                        onClick={onCancel}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                        <X size={14} />
                    </button>
                </header>

                <footer className="flex items-center justify-end gap-2 px-4 pb-4 pt-3">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onCancel}
                        className="h-9 rounded-md border border-slate-200 px-4 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
                    >
                        {cancelLabel ?? t('common.cancel')}
                    </button>
                    <button
                        ref={confirmRef}
                        type="button"
                        disabled={busy}
                        onClick={onConfirm}
                        className={`flex h-9 items-center gap-1.5 rounded-md px-4 text-[12.5px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${confirmClass}`}
                    >
                        {busy && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                        {confirmLabel ?? t('common.confirm')}
                    </button>
                </footer>
            </section>
        </div>,
        document.body,
    );
};
