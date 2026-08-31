import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuSignature } from 'react-icons/lu';
import { Check, Edit01, Trash01, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { FormSignatureValue } from '@/lib/formFields';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT_CLASS, fmtDateTime } from '../ui';

/**
 * Unterschriftsfeld (Feldtyp SIGNATURE) — von Hand gebaut wie das
 * Zeichenfeld: eingeklappt die erfasste Unterschrift mit Name und Zeitpunkt,
 * geöffnet eine grosse Schreibfläche mit Namensfeld und OK. Kein antd.
 */
export const SignatureField = ({
    value,
    onChange,
    disabled = false,
    label,
}: {
    value?: FormSignatureValue | null;
    onChange: (next: FormSignatureValue | null) => void;
    disabled?: boolean;
    label?: string;
}) => {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [hasInk, setHasInk] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);

    useEffect(() => {
        if (!open) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        setHasInk(false);
        setName(value?.name || '');
    }, [open, value?.name]);

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
        onChange({ dataUrl: canvas.toDataURL('image/png'), signedAt: new Date().toISOString(), ...(name.trim() ? { name: name.trim() } : {}) });
        setOpen(false);
    };

    return (
        <div>
            {value?.dataUrl ? (
                <div className="flex flex-wrap items-start gap-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-white/15">
                        <img src={value.dataUrl} alt="" className="h-24 w-auto max-w-full object-contain" />
                        <div className="mt-1 text-[11.5px] text-slate-500 dark:text-white/60">
                            {value.name ? `${value.name} · ` : ''}{fmtDateTime(value.signedAt)}
                        </div>
                    </div>
                    {!disabled && (
                        <div className="flex flex-col gap-1.5">
                            <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(true)}><Edit01 size={13} />{t('signaturePad.resign')}</button>
                            <button type="button" className={BTN_SECONDARY} onClick={() => onChange(null)}><Trash01 size={13} />{t('common.clear')}</button>
                        </div>
                    )}
                </div>
            ) : (
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setOpen(true)}
                    className="flex h-28 w-full cursor-crosshair flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/60 text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:bg-white/5"
                >
                    <LuSignature size={22} />
                    <span className="text-[12px] font-semibold">{t('signaturePad.clickToSign')}</span>
                </button>
            )}

            {open && createPortal(
                <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/60 p-4 animate-in fade-in duration-150" onClick={() => setOpen(false)}>
                    {/* `.ofi-pop` — die gemeinsame Fensteroberfläche, siehe
                        index.css "FENSTER-OBERFLÄCHE". */}
                    <div className="ofi-pop w-full max-w-3xl p-5 animate-in fade-in zoom-in-95 duration-200" onClick={(event) => event.stopPropagation()}>
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="ofi-pop__title">{label || t('signaturePad.title')}</div>
                            <button type="button" onClick={() => setOpen(false)} aria-label={t('common.close')} className="ofi-float-card__iconbtn shrink-0"><X size={16} /></button>
                        </div>
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder={t('forms.signature.namePlaceholder')}
                            className={`${INPUT_CLASS} mb-3`}
                        />
                        <canvas
                            ref={canvasRef}
                            width={1200}
                            height={380}
                            className="h-[280px] w-full cursor-crosshair touch-none rounded-lg border border-slate-300 bg-white"
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
                            <button type="button" className={BTN_SECONDARY} onClick={clear}><Trash01 size={13} />{t('common.clear')}</button>
                            <div className="flex items-center gap-2">
                                <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(false)}>{t('common.cancel')}</button>
                                <button type="button" className={BTN_PRIMARY} disabled={!hasInk} onClick={confirm}><Check size={14} />{t('signaturePad.ok')}</button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};
