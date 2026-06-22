import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Edit01 as Pen, Trash01 as Trash } from '@/components/icons/antIconCompat';
import { Button } from './Button';
import { t } from '@/i18n/translate';

/**
 * Controlled signature field. Collapsed it shows a small "click to sign" area (or
 * the captured signature). Clicking it zooms into a large centred signing surface
 * with a pen cursor and an "OK" button that saves the drawn signature.
 */
export const SignaturePad = ({
    value,
    onChange,
    label,
}: {
    value?: string | null;
    onChange: (value: string | null) => void;
    label?: string;
}) => {
    const [expanded, setExpanded] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hasInk, setHasInk] = useState(false);
    const drawing = useRef(false);

    useEffect(() => {
        if (!expanded) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        setHasInk(false);
    }, [expanded]);

    const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
    };
    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasInk(false);
    };
    const confirm = () => {
        const canvas = canvasRef.current;
        if (!canvas || !hasInk) return;
        onChange(canvas.toDataURL('image/png'));
        setExpanded(false);
    };

    return (
        <div>
            {label && <div className="mb-1 text-[11.5px] font-semibold text-slate-600">{label}</div>}

            {/* Collapsed area */}
            {value ? (
                <div className="relative inline-block">
                    <img src={value} alt="" className="h-24 rounded-lg border border-slate-200 bg-white" />
                    <div className="mt-1 flex gap-1.5">
                        <Button type="button" variant="secondary" size="sm" icon={<Pen size={12} />} onClick={() => setExpanded(true)}>{t('signaturePad.resign')}</Button>
                        <Button type="button" variant="ghost" size="sm" icon={<Trash size={12} />} onClick={() => onChange(null)}>{t('common.clear')}</Button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="flex h-28 w-full cursor-crosshair flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/60 text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-500"
                >
                    <Pen size={20} />
                    <span className="text-[12px] font-semibold">{t('signaturePad.clickToSign')}</span>
                </button>
            )}

            {/* Zoomed signing overlay */}
            {expanded && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 animate-in fade-in duration-150" onClick={() => setExpanded(false)}>
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-2 flex items-center justify-between">
                            <div className="text-[14px] font-semibold text-slate-900">{label || t('signaturePad.title')}</div>
                            <button type="button" onClick={() => setExpanded(false)} className="text-slate-400 hover:text-slate-700">✕</button>
                        </div>
                        <canvas
                            ref={canvasRef}
                            width={1000}
                            height={320}
                            className="h-[260px] w-full cursor-crosshair touch-none rounded-lg border border-slate-300 bg-white"
                            onPointerDown={(event) => {
                                drawing.current = true;
                                event.currentTarget.setPointerCapture(event.pointerId);
                                const ctx = event.currentTarget.getContext('2d');
                                const p = point(event);
                                ctx?.beginPath();
                                ctx?.moveTo(p.x, p.y);
                            }}
                            onPointerMove={(event) => {
                                if (!drawing.current) return;
                                const ctx = event.currentTarget.getContext('2d');
                                const p = point(event);
                                ctx?.lineTo(p.x, p.y);
                                ctx?.stroke();
                                setHasInk(true);
                            }}
                            onPointerUp={() => { drawing.current = false; }}
                            onPointerCancel={() => { drawing.current = false; }}
                        />
                        <div className="mt-3 flex items-center justify-between">
                            <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} onClick={clear}>{t('common.clear')}</Button>
                            <div className="flex items-center gap-2">
                                <Button type="button" variant="secondary" onClick={() => setExpanded(false)}>{t('common.cancel')}</Button>
                                <Button type="button" variant="primary" icon={<CheckCircle size={14} />} disabled={!hasInk} onClick={confirm}>{t('signaturePad.ok')}</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SignaturePad;
