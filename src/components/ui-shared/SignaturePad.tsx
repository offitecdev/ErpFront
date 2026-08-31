import { useEffect, useRef, useState } from 'react';

import { Trash01 as Trash } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/**
 * Inline-Unterschriftenfeld — die eine Signaturfläche der App.
 *
 * Anders als `SignatureSheet` (der Popup-Ablauf für die KUNDENSIGNATUR) sitzt
 * dieses Feld direkt IM Rapport: der Techniker unterschreibt auf seinem Tablet
 * an Ort und Stelle, der Projektleiter sieht dieselbe Fläche im Rapport-Editor.
 *
 * Die Tinte lebt auf einem einzigen Canvas: ein vorhandener `value` wird beim
 * Öffnen hineingezeichnet, jeder beendete Strich schreibt den Stand zurück
 * (`onChange`). Es gibt daher keinen "Übernehmen"-Knopf — nur Löschen.
 */
export const SignaturePad = ({
    value,
    onChange,
    label,
    caption,
    readOnly,
    height = 150,
}: {
    /** base64 data-URL oder null. */
    value: string | null;
    onChange: (signature: string | null) => void;
    label: string;
    /** Kleine Zeile unter dem Feld: Name, Datum, Rolle. */
    caption?: string;
    readOnly?: boolean;
    height?: number;
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const [hasInk, setHasInk] = useState(Boolean(value));
    /* Nur der EIGENE Strich darf das Neuzeichnen aus `value` überspringen —
       sonst löschte jeder `onChange` die frische Tinte wieder weg. */
    const ownValue = useRef<string | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        if (value && value === ownValue.current) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasInk(Boolean(value));
        if (!value) return;
        const img = new Image();
        img.onload = () => {
            const ratio = Math.min(canvas.width / img.width, canvas.height / img.height);
            const w = img.width * ratio;
            const h = img.height * ratio;
            ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        };
        img.src = value;
    }, [value]);

    const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * canvas.width,
            y: ((event.clientY - rect.top) / rect.height) * canvas.height,
        };
    };

    /* Der Canvas ist transparent — das PDF legt die Signatur auf weissen Grund,
       ein mitgespeicherter Hintergrund würde dort als Kasten erscheinen. */
    const commit = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const data = canvas.toDataURL('image/png');
        ownValue.current = data;
        onChange(data);
    };

    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ownValue.current = null;
        setHasInk(false);
        onChange(null);
    };

    return (
        <div className="ofi-sign-card">
            <div className="ofi-sign-card__head">
                <span className="ofi-sign-card__label">{label}</span>
                {!readOnly && hasInk && (
                    <button type="button" className="ofi-dlv-iconbtn is-danger" title={t('common.clear')} aria-label={t('common.clear')} onClick={clear}>
                        <Trash size={16} />
                    </button>
                )}
            </div>
            <div className="ofi-sign-card__pad" style={{ height }}>
                <canvas
                    ref={canvasRef}
                    width={880}
                    height={280}
                    className={`ofi-sign-canvas ${readOnly ? 'is-readonly' : ''}`}
                    onPointerDown={readOnly ? undefined : (event) => {
                        drawing.current = true;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const ctx = event.currentTarget.getContext('2d');
                        if (!ctx) return;
                        ctx.strokeStyle = '#1f2937';
                        ctx.lineWidth = 3;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        const p = point(event);
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                    }}
                    onPointerMove={readOnly ? undefined : (event) => {
                        if (!drawing.current) return;
                        const ctx = event.currentTarget.getContext('2d');
                        const p = point(event);
                        ctx?.lineTo(p.x, p.y);
                        ctx?.stroke();
                        if (!hasInk) setHasInk(true);
                    }}
                    onPointerUp={readOnly ? undefined : () => {
                        if (!drawing.current) return;
                        drawing.current = false;
                        commit();
                    }}
                    onPointerCancel={readOnly ? undefined : () => { drawing.current = false; }}
                />
                {!hasInk && <span className="ofi-sign-card__hint">{readOnly ? t('signatures.notSignedYet') : t('signatures.signHereLabel')}</span>}
            </div>
            {caption ? <div className="ofi-sign-card__caption">{caption}</div> : null}
        </div>
    );
};

export default SignaturePad;
