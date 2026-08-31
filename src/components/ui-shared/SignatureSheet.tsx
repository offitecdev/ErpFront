import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Trash01 as Trash, X } from '@/components/icons/antIconCompat';

import { Button } from './Button';
import type { SignatureSnapshot } from '../../lib/api/project';

import { t } from '@/i18n/translate';

/** A single auto-added, removable line (material / extra material / external expense). */
export type SignatureAttachment = {
    id: string;
    group: string;
    label: string;
    detail?: string;
    amount?: string;
};

/**
 * Shared signature popup used across the technician flows (field / delivery /
 * general). The signature surface is shown directly (draw straight away) with a
 * Complete button; the report snapshot is saved in the background.
 */
export const SignatureSheet = ({
    open,
    title,
    snapshot,
    attachments = [],
    saving,
    onClose,
    onSave,
}: {
    open: boolean;
    title: string;
    snapshot: SignatureSnapshot;
    attachments?: SignatureAttachment[];
    saving?: boolean;
    onClose: () => void;
    /** Receives the captured signature (or null = unsigned) and the snapshot enriched with the kept attachments. */
    onSave: (signatureBase64: string | null, snapshot: SignatureSnapshot) => void;
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hasInk, setHasInk] = useState(false);
    const drawing = useRef(false);

    const groups = useMemo(() => {
        const order: string[] = [];
        const map = new Map<string, SignatureAttachment[]>();
        for (const item of attachments) {
            if (!map.has(item.group)) {
                map.set(item.group, []);
                order.push(item.group);
            }
            map.get(item.group)!.push(item);
        }
        return order.map((group) => ({ group, items: map.get(group)! }));
    }, [attachments]);

    // Prepare the drawing surface every time the popup opens.
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
        setHasInk(false);
    }, [open]);

    if (!open) return null;

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

    const save = () => {
        const canvas = canvasRef.current;
        const signature = hasInk && canvas ? canvas.toDataURL('image/png') : null;
        const extraSections = groups.map((group) => ({
            heading: group.group,
            rows: group.items.map((item) => ({
                label: item.detail ? `${item.label} - ${item.detail}` : item.label,
                value: item.amount || undefined,
            })),
        }));
        const merged: SignatureSnapshot = {
            ...snapshot,
            sections: [...(snapshot.sections || []), ...extraSections],
        };
        onSave(signature, merged);
    };

    return (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/45 px-4 py-6 animate-in fade-in duration-200" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                /* `.ofi-pop` = die gemeinsame Fensteroberfläche (index.css,
                   "FENSTER-OBERFLÄCHE"). Das eigene `rounded-xl` kam als 8px an
                   und der eigene Schatten wurde im Dunkeln von der
                   `.bg-white`-Decke gelöscht. */
                className="ofi-signature-pop ofi-pop w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="ofi-pop__rule flex items-center justify-between gap-2 border-b px-4 py-2.5">
                    <div className="ofi-pop__title">{title}</div>
                    <button type="button" onClick={onClose} aria-label={t('common.close')} className="ofi-float-card__iconbtn shrink-0"><X size={16} /></button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto px-5 py-5 sm:px-6">
                    <div className="rounded-lg border border-slate-200 p-4">
                        <div className="mb-1.5 text-[11.5px] font-semibold text-slate-600">{t('signatures.signHereLabel')}</div>
                        <canvas
                            ref={canvasRef}
                            width={900}
                            height={260}
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
                        <div className="mt-2 flex justify-end">
                            <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} onClick={clear}>{t('common.clear')}</Button>
                        </div>
                    </div>
                </div>

                <div className="ofi-pop__rule flex items-center justify-end gap-2 border-t px-4 py-2.5">
                    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button variant="primary" icon={<CheckCircle size={16} />} loading={saving} onClick={save}>{t('signatures.complete')}</Button>
                </div>
            </div>
        </div>
    );
};

export default SignatureSheet;
