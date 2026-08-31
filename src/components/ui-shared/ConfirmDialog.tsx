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
    zIndex = 900,
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

    /* Die Knöpfe sind die Kalenderpille (`.ofi-cal-btn`) — derselbe Knopf, den
       das Aufgabenfenster im Fuss trägt. Vorher stand hier `bg-[#272f67]`, und
       das ist in dieser Anwendung nicht eine Farbe, sondern ein ganzer Knopf:
       er zog den orangen Schwall der Seitenknöpfe mit ins Fenster. */
    const confirmClass = tone === 'danger' ? 'is-danger' : 'is-primary';

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
                /* `.ofi-pop` = die gemeinsame Fensteroberfläche (index.css,
                   "FENSTER-OBERFLÄCHE"): Fläche, Haarlinie, Schatten und die
                   14px-Kante des Kalenderfensters. Kein `rounded-*` und kein
                   `bg-white` mehr — das erste kam als 8px an, das zweite hat im
                   Dunkeln den Schatten des Fensters gelöscht. */
                className="ofi-rise-in ofi-pop relative flex w-full max-w-[440px] flex-col overflow-hidden"
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
                        {/* Ohne `.ofi-serif`: der Kalender schreibt seine
                            Fenstertitel in der Grundschrift, und eine zweite
                            Schrift in einem 440px-Fenster war der Bruch. */}
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
                        className="ofi-float-card__iconbtn shrink-0 disabled:opacity-40"
                    >
                        <X size={16} />
                    </button>
                </header>

                <footer className="flex items-center justify-end gap-2 px-4 pb-4 pt-3">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onCancel}
                        className="ofi-cal-btn"
                    >
                        {cancelLabel ?? t('common.cancel')}
                    </button>
                    <button
                        ref={confirmRef}
                        type="button"
                        disabled={busy}
                        onClick={onConfirm}
                        className={`ofi-cal-btn ${confirmClass}`}
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
