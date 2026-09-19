import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { LuCrop, LuRotateCcw } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { attachmentUrl } from '@/lib/api/tasksModule';
import type { ContentBlock, ImageCrop, TaskAttachment } from '@/types/tasksModule';
import { TaskButton } from '../shared/TaskButton';

/** Was ein Bildblock an seinem `meta` ändert; `undefined` = Wert entfernen. */
export interface ImageMetaPatch {
    width?: number | undefined;
    crop?: ImageCrop | undefined;
    ratio?: number | undefined;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';
type CropGrip = Corner | 'n' | 's' | 'w' | 'e' | 'move';

const MIN_WIDTH = 48;
const MIN_CROP = 0.05;
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
const CROP_GRIPS: CropGrip[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const FULL: ImageCrop = { x: 0, y: 0, w: 1, h: 1 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const isFullCrop = (crop: ImageCrop) => crop.x < 0.005 && crop.y < 0.005 && crop.w > 0.99 && crop.h > 0.99;

/** Neuer Ausschnitt, während ein Griff gezogen wird (dx/dy in Anteilen des Bildes). */
const dragCrop = (start: ImageCrop, grip: CropGrip, dx: number, dy: number): ImageCrop => {
    if (grip === 'move') {
        return { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
    }
    let left = start.x;
    let top = start.y;
    let right = start.x + start.w;
    let bottom = start.y + start.h;
    if (grip.includes('w')) left = clamp(start.x + dx, 0, right - MIN_CROP);
    if (grip.includes('e')) right = clamp(right + dx, left + MIN_CROP, 1);
    if (grip.includes('n')) top = clamp(start.y + dy, 0, bottom - MIN_CROP);
    if (grip.includes('s')) bottom = clamp(bottom + dy, top + MIN_CROP, 1);
    return { x: left, y: top, w: right - left, h: bottom - top };
};

/**
 * Bildblock im Editor (15.09.2026, Samet): kein Link, keine Hand, kein
 * Vergrössern beim Klick. Ein Klick WÄHLT das Bild: an den Ecken zieht man es
 * kleiner/grösser (Seitenverhältnis bleibt), «Kırp» öffnet den Ausschnitt.
 * Beides steht nur im `meta` des Blocks — die Datei selbst bleibt unverändert.
 */
export const ImageBlock = memo(({
    block,
    attachment,
    editable,
    onChange,
}: {
    block: ContentBlock;
    attachment: TaskAttachment;
    editable: boolean;
    onChange: (blockId: string, patch: ImageMetaPatch) => void;
}) => {
    /** Bild + Ausschnitt-Leiste: ein Klick darin ist kein «Klick daneben». */
    const figureRef = useRef<HTMLElement | null>(null);
    const clipRef = useRef<HTMLDivElement | null>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [selected, setSelected] = useState(false);
    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
    const [dragWidth, setDragWidth] = useState<number | null>(null);
    const dragWidthRef = useRef<number | null>(null);
    /** Ausschnitt-Modus: Entwurf + Breite, in der das ganze Bild dabei gezeigt wird. */
    const [cropping, setCropping] = useState<{ draft: ImageCrop; viewWidth: number } | null>(null);

    const { width, crop, ratio: storedRatio } = block.meta;
    const url = attachmentUrl(attachment);
    const ratio = storedRatio ?? (natural ? natural.w / natural.h : undefined);

    // Klick daneben oder Esc: Auswahl weg, ein offener Ausschnitt wird verworfen.
    useEffect(() => {
        if (!selected) return undefined;
        const onPointerDown = (event: PointerEvent) => {
            if (figureRef.current?.contains(event.target as Node)) return;
            setSelected(false);
            setCropping(null);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (cropping) setCropping(null);
                else setSelected(false);
            } else if (event.key === 'Enter' && cropping) {
                event.preventDefault();
                applyCrop();
            }
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
        };
    });

    const containerWidth = () => figureRef.current?.clientWidth ?? 2000;

    const naturalRatio = (): number | undefined => {
        const img = imgRef.current;
        if (img?.naturalWidth && img.naturalHeight) return img.naturalWidth / img.naturalHeight;
        return ratio;
    };

    /* ── Grösse an den Ecken ─────────────────────────────────────────── */

    const startResize = (corner: Corner, event: ReactPointerEvent<HTMLSpanElement>) => {
        const clip = clipRef.current;
        if (!clip) return;
        event.preventDefault();
        event.stopPropagation();
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);
        const startX = event.clientX;
        const startWidth = clip.getBoundingClientRect().width;
        const direction = corner.endsWith('e') ? 1 : -1;
        const maxWidth = Math.max(MIN_WIDTH, containerWidth());

        const onMove = (move: PointerEvent) => {
            const next = Math.round(clamp(startWidth + direction * (move.clientX - startX), MIN_WIDTH, maxWidth));
            dragWidthRef.current = next;
            setDragWidth(next);
        };
        const onUp = () => {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
            const finalWidth = dragWidthRef.current;
            dragWidthRef.current = null;
            setDragWidth(null);
            if (finalWidth !== null && finalWidth !== width) onChange(block.id, { width: finalWidth });
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
    };

    /* ── Ausschnitt ──────────────────────────────────────────────────── */

    const openCrop = () => {
        const clip = clipRef.current;
        const shown = clip?.getBoundingClientRect().width ?? width ?? 320;
        const current = crop ?? FULL;
        const viewWidth = Math.round(clamp(shown / current.w, 120, Math.max(120, containerWidth())));
        setCropping({ draft: current, viewWidth });
    };

    const startCropDrag = (grip: CropGrip, event: ReactPointerEvent<HTMLElement>) => {
        const clip = clipRef.current;
        if (!clip || !cropping) return;
        event.preventDefault();
        event.stopPropagation();
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        const box = clip.getBoundingClientRect();
        const start = cropping.draft;
        const startX = event.clientX;
        const startY = event.clientY;

        const onMove = (move: PointerEvent) => {
            const dx = (move.clientX - startX) / box.width;
            const dy = (move.clientY - startY) / box.height;
            setCropping((current) => (current ? { ...current, draft: dragCrop(start, grip, dx, dy) } : current));
        };
        const onUp = () => {
            target.removeEventListener('pointermove', onMove);
            target.removeEventListener('pointerup', onUp);
            target.removeEventListener('pointercancel', onUp);
        };
        target.addEventListener('pointermove', onMove);
        target.addEventListener('pointerup', onUp);
        target.addEventListener('pointercancel', onUp);
    };

    function applyCrop() {
        if (!cropping) return;
        const { draft, viewWidth } = cropping;
        setCropping(null);
        const full = isFullCrop(draft);
        onChange(block.id, {
            crop: full ? undefined : draft,
            ratio: naturalRatio(),
            // Gleicher Massstab wie im Ausschnitt-Modus: das Bild springt nicht.
            width: Math.round(Math.max(MIN_WIDTH, viewWidth * (full ? 1 : draft.w))),
        });
    }

    const reset = () => onChange(block.id, { width: undefined, crop: undefined, ratio: undefined });

    /* ── Zeichnen ────────────────────────────────────────────────────── */

    const shownWidth = cropping ? cropping.viewWidth : dragWidth ?? width;
    const visibleCrop = cropping ? null : crop;
    const clipStyle: CSSProperties = {};
    let imgStyle: CSSProperties | undefined;
    if (shownWidth) clipStyle.width = `${shownWidth}px`;
    // Ausschnitt-Modus zeigt das ganze Bild im Fluss; sonst schneidet der Rahmen den Ausschnitt heraus.
    if (visibleCrop && ratio) {
        clipStyle.aspectRatio = `${(ratio * visibleCrop.w) / visibleCrop.h}`;
        if (!shownWidth) clipStyle.width = 'min(100%, 420px)';
        imgStyle = {
            position: 'absolute',
            width: `${100 / visibleCrop.w}%`,
            height: `${100 / visibleCrop.h}%`,
            left: `${(-visibleCrop.x / visibleCrop.w) * 100}%`,
            top: `${(-visibleCrop.y / visibleCrop.h) * 100}%`,
        };
    }
    const sized = Boolean(shownWidth || visibleCrop);
    const draft = cropping?.draft;

    return (
        <figure ref={figureRef} className="ofi-gv-editor-image">
            <div
                className={`ofi-gv-img ${editable && selected ? 'is-selected' : ''} ${cropping ? 'is-cropping' : ''} ${dragWidth !== null ? 'is-resizing' : ''}`}
                onPointerDown={editable && !selected ? () => setSelected(true) : undefined}
            >
                <div ref={clipRef} className={`ofi-gv-img__clip ${sized ? 'is-sized' : ''}`} style={clipStyle}>
                    <img
                        ref={imgRef}
                        src={url}
                        alt={attachment.fileName}
                        loading="lazy"
                        draggable={false}
                        className={imgStyle ? 'is-cropped' : undefined}
                        style={imgStyle}
                        onLoad={(event) => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
                    />
                    {draft && (
                        <div
                            className="ofi-gv-crop"
                            style={{
                                left: `${draft.x * 100}%`,
                                top: `${draft.y * 100}%`,
                                width: `${draft.w * 100}%`,
                                height: `${draft.h * 100}%`,
                            }}
                            onPointerDown={(event) => startCropDrag('move', event)}
                        >
                            {CROP_GRIPS.map((grip) => (
                                <span
                                    key={grip}
                                    className={`ofi-gv-crop__grip is-${grip}`}
                                    onPointerDown={(event) => startCropDrag(grip, event)}
                                />
                            ))}
                        </div>
                    )}
                    {/* Kırmızı kılavuz: her kırpma kenarı resmin boyunca — nerenin kesildiği bir bakışta. */}
                    {draft && (
                        <>
                            <span className="ofi-gv-crop__guide is-h" style={{ top: `${draft.y * 100}%` }} />
                            <span className="ofi-gv-crop__guide is-h" style={{ top: `${(draft.y + draft.h) * 100}%` }} />
                            <span className="ofi-gv-crop__guide is-v" style={{ left: `${draft.x * 100}%` }} />
                            <span className="ofi-gv-crop__guide is-v" style={{ left: `${(draft.x + draft.w) * 100}%` }} />
                        </>
                    )}
                </div>

                {editable && selected && !cropping && (
                    <>
                        {CORNERS.map((corner) => (
                            <span
                                key={corner}
                                className={`ofi-gv-img__handle is-${corner}`}
                                role="presentation"
                                onPointerDown={(event) => startResize(corner, event)}
                            />
                        ))}
                        {dragWidth === null && (
                            <div className="ofi-gv-img__tools">
                                <button type="button" className="ofi-gv-img__tool ofi-btn-plain ofi-nosize" onClick={openCrop}>
                                    <LuCrop size={13} />
                                    {t('tasksModule.editor.image.crop')}
                                </button>
                                {(width || crop) && (
                                    <button
                                        type="button"
                                        className="ofi-gv-img__tool ofi-btn-plain ofi-nosize"
                                        title={t('tasksModule.editor.image.resetHint')}
                                        onClick={reset}
                                    >
                                        <LuRotateCcw size={13} />
                                        {t('tasksModule.editor.image.reset')}
                                    </button>
                                )}
                            </div>
                        )}
                        {dragWidth !== null && <div className="ofi-gv-img__size">{dragWidth} px</div>}
                    </>
                )}
            </div>

            {cropping && (
                <div className="ofi-gv-img__cropbar">
                    <TaskButton onClick={() => setCropping(null)}>{t('tasksModule.editor.image.cancel')}</TaskButton>
                    <TaskButton variant="primary" onClick={applyCrop}>{t('tasksModule.editor.image.apply')}</TaskButton>
                </div>
            )}
        </figure>
    );
});

ImageBlock.displayName = 'ImageBlock';
