import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Yazılan hücreye tutunan hızlı liste kabuğu. Hücrenin hemen ALTINDAN açılır ve
 * liste aşağı doğru büyür; yalnızca aşağıda yer kalmadığında yukarı çevrilir.
 * Genişlik hücreyi izler (dar tutulur), sayfa kaydıkça hücreyi takip eder.
 * Perde yok: dışarı tıklamak ya da Esc kapatır.
 *
 * Envanterdeki bütün satır içi seçiciler (ürün/malzeme, tedarikçi) bunu paylaşır.
 */
const computeStyle = (anchorEl: HTMLElement, width: number, maxHeight: number): CSSProperties => {
    // Savunma: kopmuş bir çapa sayfayı çökertmemeli.
    if (!anchorEl?.isConnected) return { position: 'fixed', top: -9999, left: -9999, width };
    const rect = anchorEl.getBoundingClientRect();
    const panelWidth = Math.min(Math.max(rect.width, width), 420);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - panelWidth - 8));
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    // Aşağı açmak varsayılan; sadece liste aşağıya sığmıyorsa ve yukarıda daha
    // çok yer varsa yön değişir.
    const flipUp = spaceBelow < Math.min(maxHeight, 220) && rect.top > spaceBelow;
    return flipUp
        ? { position: 'fixed', bottom: window.innerHeight - rect.top + 2, left, width: panelWidth }
        : { position: 'fixed', top: rect.bottom + 2, left, width: panelWidth };
};

export const AnchoredPicker = ({
    anchorEl,
    onClose,
    width = 360,
    maxHeight = 420,
    footer,
    children,
}: {
    /** Seçicinin tutunduğu hücre; null ise seçici kapalıdır. */
    anchorEl: HTMLElement | null;
    onClose: () => void;
    width?: number;
    maxHeight?: number;
    footer?: ReactNode;
    children: ReactNode;
}) => {
    const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', top: -9999, left: -9999 });
    const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);

    // Hücreyi takip et: kaydırma/boyutlandırma başına tek ölçüm (kare başına
    // bir rAF) — her olayda getBoundingClientRect okumak zorunlu reflow demek.
    useEffect(() => {
        if (!anchorEl) return;
        let frame = 0;
        const measure = () => {
            frame = 0;
            setStyle(computeStyle(anchorEl, width, maxHeight));
        };
        const schedule = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(measure);
        };
        measure();
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
        };
    }, [anchorEl, width, maxHeight]);

    // Dışarı tıklama (panel ve çapa hariç) ya da Esc kapatır.
    useEffect(() => {
        if (!anchorEl) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (panelEl?.contains(target) || anchorEl.contains(target)) return;
            onClose();
        };
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [anchorEl, panelEl, onClose]);

    if (!anchorEl) return null;

    return createPortal(
        <div
            ref={setPanelEl}
            role="dialog"
            style={style}
            className="ofi-quick-pop z-[999] flex flex-col overflow-hidden rounded-md border border-slate-300 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.18)] dark:border-white/15 dark:bg-[#151616]"
        >
            <div className="flex min-h-0 flex-col" style={{ maxHeight }}>{children}</div>
            {footer && <div className="border-t border-slate-200 dark:border-white/10">{footer}</div>}
        </div>,
        document.body,
    );
};
