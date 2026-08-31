import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuEraser, LuPencilLine, LuUndo2 } from 'react-icons/lu';
import { Check, Trash01, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { BTN_PRIMARY, BTN_SECONDARY } from '../ui';

/**
 * Zeichenfeld (Feldtyp DRAWING): eingeklappt eine Vorschau der Zeichnung bzw.
 * eine "Zeichnen"-Fläche; ein Klick öffnet die grosse Zeichenfläche als
 * Vollbild-Overlay (Tablet-tauglich, Stift/Finger). Werkzeuge: Farbe, Stärke,
 * Radierer, Rückgängig, Alles löschen. Gespeichert wird ein PNG als Data-URL.
 *
 * Nach dem Muster von ui-shared/SignaturePad, aber mit Werkzeugen und
 * Rückgängig-Stapel — eine Skizze braucht mehr als eine Unterschrift.
 */

const COLORS = ['#1f2937', '#d30f15', '#1d4ed8', '#059669', '#f59e0b'];
const WIDTHS = [2, 4, 8];
const CANVAS_W = 1400;
const CANVAS_H = 900;

export const DrawingPad = ({
    value,
    onChange,
    disabled = false,
    label,
}: {
    value?: string | null;
    onChange: (next: string | null) => void;
    disabled?: boolean;
    label?: string;
}) => {
    const [open, setOpen] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const history = useRef<ImageData[]>([]);
    const [color, setColor] = useState(COLORS[0]);
    const [width, setWidth] = useState(WIDTHS[1]);
    const [eraser, setEraser] = useState(false);
    const [historyLength, setHistoryLength] = useState(0);

    // Beim Öffnen: weisse Fläche, bestehende Zeichnung hineinladen.
    useEffect(() => {
        if (!open) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        history.current = [];
        setHistoryLength(0);
        if (value) {
            const img = new Image();
            img.onload = () => {
                const ratio = Math.min(canvas.width / img.width, canvas.height / img.height);
                ctx.drawImage(img, 0, 0, img.width * ratio, img.height * ratio);
            };
            img.src = value;
        }
    }, [open, value]);

    const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * canvas.width,
            y: ((event.clientY - rect.top) / rect.height) * canvas.height,
        };
    };

    const pushHistory = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        history.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (history.current.length > 30) history.current.shift();
        setHistoryLength(history.current.length);
    };

    const undo = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const last = history.current.pop();
        if (!canvas || !ctx || !last) return;
        ctx.putImageData(last, 0, 0);
        setHistoryLength(history.current.length);
    };

    const clearAll = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        pushHistory();
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const confirm = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        onChange(canvas.toDataURL('image/png'));
        setOpen(false);
    };

    return (
        <div>
            {value ? (
                <div className="flex flex-wrap items-start gap-3">
                    <button
                        type="button"
                        onClick={() => !disabled && setOpen(true)}
                        className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/15"
                        title={disabled ? undefined : t('forms.drawing.edit')}
                    >
                        <img src={value} alt="" className="h-40 w-auto max-w-full object-contain" />
                    </button>
                    {!disabled && (
                        <div className="flex flex-col gap-1.5">
                            <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(true)}>
                                <LuPencilLine size={13} />{t('forms.drawing.edit')}
                            </button>
                            <button type="button" className={BTN_SECONDARY} onClick={() => onChange(null)}>
                                <Trash01 size={13} />{t('common.clear')}
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setOpen(true)}
                    className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/60 text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:bg-white/5"
                >
                    <LuPencilLine size={20} />
                    <span className="text-[12px] font-semibold">{t('forms.drawing.start')}</span>
                </button>
            )}

            {open && createPortal(
                <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/60 p-3 animate-in fade-in duration-150">
                    {/* `.ofi-pop` — die gemeinsame Fensteroberfläche, siehe
                        index.css "FENSTER-OBERFLÄCHE". */}
                    <div className="ofi-pop flex h-[min(92vh,900px)] w-full max-w-6xl flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="ofi-pop__rule flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                            <div className="ofi-pop__title">{label || t('forms.drawing.title')}</div>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                    {COLORS.map((candidate) => (
                                        <button
                                            key={candidate}
                                            type="button"
                                            aria-label={candidate}
                                            onClick={() => { setColor(candidate); setEraser(false); }}
                                            className={`size-7 rounded-full border-2 transition-transform ${color === candidate && !eraser ? 'scale-110 border-slate-900 dark:border-white' : 'border-transparent'}`}
                                            style={{ backgroundColor: candidate }}
                                        />
                                    ))}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {WIDTHS.map((candidate) => (
                                        <button
                                            key={candidate}
                                            type="button"
                                            aria-label={`${candidate}px`}
                                            onClick={() => setWidth(candidate)}
                                            className={`flex size-8 items-center justify-center rounded-md border ${width === candidate ? 'border-[#1f2654] bg-[#eef2fb] dark:bg-white/10' : 'border-slate-200 dark:border-white/15'}`}
                                        >
                                            <span className="rounded-full bg-slate-800 dark:bg-white" style={{ width: candidate + 2, height: candidate + 2 }} />
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEraser((current) => !current)}
                                    aria-pressed={eraser}
                                    className={`${BTN_SECONDARY} ${eraser ? '!border-[#1f2654] !text-[#1f2654]' : ''}`}
                                >
                                    <LuEraser size={14} />{t('forms.drawing.eraser')}
                                </button>
                                <button type="button" onClick={undo} disabled={historyLength === 0} className={BTN_SECONDARY}>
                                    <LuUndo2 size={14} />{t('forms.drawing.undo')}
                                </button>
                                <button type="button" onClick={clearAll} className={BTN_SECONDARY}>
                                    <Trash01 size={14} />{t('forms.drawing.clearAll')}
                                </button>
                                <button type="button" onClick={() => setOpen(false)} aria-label={t('common.close')} className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 bg-slate-100 p-3 dark:bg-black/30">
                            <canvas
                                ref={canvasRef}
                                width={CANVAS_W}
                                height={CANVAS_H}
                                className="mx-auto h-full w-full max-w-full cursor-crosshair touch-none rounded-lg border border-slate-300 bg-white object-contain"
                                style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
                                onPointerDown={(event) => {
                                    const ctx = event.currentTarget.getContext('2d');
                                    if (!ctx) return;
                                    pushHistory();
                                    drawing.current = true;
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                    ctx.strokeStyle = eraser ? '#ffffff' : color;
                                    ctx.lineWidth = eraser ? width * 5 : width;
                                    ctx.lineCap = 'round';
                                    ctx.lineJoin = 'round';
                                    const p = point(event);
                                    ctx.beginPath();
                                    ctx.moveTo(p.x, p.y);
                                    // Ein einzelner Punkt soll auch ohne Bewegung sichtbar sein.
                                    ctx.lineTo(p.x + 0.1, p.y + 0.1);
                                    ctx.stroke();
                                }}
                                onPointerMove={(event) => {
                                    if (!drawing.current) return;
                                    const ctx = event.currentTarget.getContext('2d');
                                    const p = point(event);
                                    ctx?.lineTo(p.x, p.y);
                                    ctx?.stroke();
                                }}
                                onPointerUp={() => { drawing.current = false; }}
                                onPointerCancel={() => { drawing.current = false; }}
                            />
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-white/10">
                            <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(false)}>{t('common.cancel')}</button>
                            <button type="button" className={BTN_PRIMARY} onClick={confirm}><Check size={14} />{t('forms.drawing.apply')}</button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};
