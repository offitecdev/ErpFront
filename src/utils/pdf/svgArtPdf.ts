import { GState, type jsPDF } from 'jspdf';

/**
 * ── EIN SVG-BILD ALS VEKTOR INS PDF (15.09.2026, Samet: «wave2026.svg dalga
 * olarak direkt bunu koy, en başa») ───────────────────────────────────────────
 *
 * jsPDF kann kein SVG. Diese kleine Übersetzung liest die Datei selbst und zeichnet
 * sie mit Pfaden — beim Vergrössern bleibt alles scharf. Verstanden wird, was
 * Grafik-Dateien dieser Art enthalten:
 *
 *   <rect>, <ellipse>, <path> (M L H V C Z, auch relativ), <g filter>
 *   fill / stroke: Farbe oder url(#Verlauf), *-opacity, opacity, stroke-width
 *   linearGradient (userSpaceOnUse oder Objektbox), radialGradient
 *   (gradientTransform translate/scale), stop-color + stop-opacity
 *   feGaussianBlur → angenähert (breitere, blassere Züge)
 *
 * Verläufe mit Deckkraft wie im SVG: die Farbe ist ein echter PDF-Farbverlauf,
 * die Deckkraft eine SOFT MASK aus einem zweiten Verlauf in Grau (beide mit
 * exakt denselben Stützstellen). jsPDF bietet Soft Masks nicht an; die Objekte
 * werden über seine Ressourcen-Ereignisse geschrieben, wie es sein eigenes
 * Bild-Plugin tut. (Erster Versuch mit vielen 3-%-Schichten: jeder Viewer rundet
 * jede Schicht auf ganze Graustufen — das Bild wurde deutlich zu dunkel.)
 */

type Rgb = [number, number, number];
type Pt = [number, number];
type Attrs = Record<string, string>;

interface Stop { offset: number; color: Rgb; opacity: number }
interface Gradient { id: string; kind: 'linear' | 'radial'; attrs: Attrs; stops: Stop[] }
interface ArtNode { tag: 'rect' | 'ellipse' | 'path'; attrs: Attrs; blur: number }
interface Box { x: number; y: number; width: number; height: number }
type Segment = { op: 'M' | 'L'; pt: Pt } | { op: 'C'; c1: Pt; c2: Pt; pt: Pt } | { op: 'Z' };

const NAMED: Record<string, Rgb> = { white: [255, 255, 255], black: [0, 0, 0] };

/* ── Lesen ──────────────────────────────────────────────────────────────── */

const attrsOf = (source: string): Attrs => {
    const out: Attrs = {};
    for (const match of source.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[match[1]] = match[2];
    return out;
};

const num = (value: string | undefined, fallback: number): number => {
    if (value === undefined || value.trim() === '') return fallback;
    const text = value.trim();
    const parsed = Number.parseFloat(text);
    if (!Number.isFinite(parsed)) return fallback;
    return text.endsWith('%') ? parsed / 100 : parsed;
};

const colorOf = (value: string | undefined): Rgb | null => {
    const text = (value ?? '').trim().toLowerCase();
    if (!text || text === 'none') return null;
    if (NAMED[text]) return NAMED[text];
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
    if (!hex) return null;
    const digits = hex[1].length === 3 ? hex[1].split('').map((d) => d + d).join('') : hex[1];
    return [0, 2, 4].map((index) => Number.parseInt(digits.slice(index, index + 2), 16)) as Rgb;
};

const parseArt = (svg: string) => {
    const source = svg.replace(/<!--[\s\S]*?-->/g, '');
    const root = attrsOf(/<svg\b([^>]*)>/.exec(source)?.[1] ?? '');
    const viewBox = (root.viewBox ?? `0 0 ${num(root.width, 100)} ${num(root.height, 100)}`).split(/[\s,]+/).map(Number);

    const gradients = new Map<string, Gradient>();
    for (const match of source.matchAll(/<(linearGradient|radialGradient)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
        const attrs = attrsOf(match[2]);
        const stops = [...(match[3] ?? '').matchAll(/<stop\b([^>]*?)\/?>/g)].map((stop) => {
            const a = attrsOf(stop[1]);
            return { offset: Math.min(1, Math.max(0, num(a.offset, 0))), color: colorOf(a['stop-color']) ?? [0, 0, 0], opacity: num(a['stop-opacity'], 1) };
        });
        if (attrs.id && stops.length) {
            gradients.set(attrs.id, { id: attrs.id, kind: match[1] === 'linearGradient' ? 'linear' : 'radial', attrs, stops });
        }
    }

    const blurs = new Map<string, number>();
    for (const match of source.matchAll(/<filter\b([^>]*)>([\s\S]*?)<\/filter>/g)) {
        const id = attrsOf(match[1]).id;
        const deviation = /stdDeviation\s*=\s*"([^"]*)"/.exec(match[2]);
        if (id && deviation) blurs.set(id, num(deviation[1].split(/[\s,]+/)[0], 0));
    }
    const blurOf = (attrs: Attrs) => {
        const id = /url\(#([^)]+)\)/.exec(attrs.filter ?? '')?.[1];
        return id ? blurs.get(id) ?? 0 : 0;
    };

    const body = source.replace(/<defs\b[\s\S]*?<\/defs>/g, '');
    const nodes: ArtNode[] = [];
    const groupBlur: number[] = [];
    for (const match of body.matchAll(/<(rect|ellipse|path)\b([^>]*?)\/>|<g\b([^>]*)>|<\/g>/g)) {
        if (match[1]) {
            const attrs = attrsOf(match[2]);
            nodes.push({ tag: match[1] as ArtNode['tag'], attrs, blur: blurOf(attrs) || groupBlur[groupBlur.length - 1] || 0 });
        } else if (match[3] !== undefined) {
            groupBlur.push(blurOf(attrsOf(match[3])) || groupBlur[groupBlur.length - 1] || 0);
        } else {
            groupBlur.pop();
        }
    }
    return { viewBox, gradients, nodes };
};

const parsePath = (d: string): Segment[] => {
    const tokens = d.match(/[MLHVCZmlhvcz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
    const segments: Segment[] = [];
    let index = 0;
    let command = 'M';
    let current: Pt = [0, 0];
    let start: Pt = [0, 0];
    const next = () => Number(tokens[index++]);
    while (index < tokens.length) {
        if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
        const relative = command === command.toLowerCase();
        const base = (pt: Pt): Pt => (relative ? [current[0] + pt[0], current[1] + pt[1]] : pt);
        switch (command.toUpperCase()) {
            case 'M':
                current = base([next(), next()]);
                start = current;
                segments.push({ op: 'M', pt: current });
                command = relative ? 'l' : 'L';
                break;
            case 'L':
                current = base([next(), next()]);
                segments.push({ op: 'L', pt: current });
                break;
            case 'H': {
                const x = next();
                current = [relative ? current[0] + x : x, current[1]];
                segments.push({ op: 'L', pt: current });
                break;
            }
            case 'V': {
                const y = next();
                current = [current[0], relative ? current[1] + y : y];
                segments.push({ op: 'L', pt: current });
                break;
            }
            case 'C': {
                const c1 = base([next(), next()]);
                const c2 = base([next(), next()]);
                const pt = base([next(), next()]);
                segments.push({ op: 'C', c1, c2, pt });
                current = pt;
                break;
            }
            case 'Z':
                segments.push({ op: 'Z' });
                current = start;
                break;
            default:
                index += 1;
        }
    }
    return segments;
};

/** Polylinien durch den Pfad (Umrisse von Verlaufslinien, Objektboxen). */
const flatten = (segments: Segment[], step = 2): Pt[][] => {
    const runs: Pt[][] = [];
    let run: Pt[] = [];
    let current: Pt = [0, 0];
    for (const segment of segments) {
        if (segment.op === 'M') {
            if (run.length > 1) runs.push(run);
            run = [segment.pt];
        } else if (segment.op === 'L') {
            run.push(segment.pt);
        } else if (segment.op === 'C') {
            const length = Math.hypot(segment.c1[0] - current[0], segment.c1[1] - current[1])
                + Math.hypot(segment.c2[0] - segment.c1[0], segment.c2[1] - segment.c1[1])
                + Math.hypot(segment.pt[0] - segment.c2[0], segment.pt[1] - segment.c2[1]);
            const count = Math.max(2, Math.ceil(length / step));
            for (let k = 1; k <= count; k += 1) {
                const t = k / count;
                const u = 1 - t;
                run.push([
                    u * u * u * current[0] + 3 * u * u * t * segment.c1[0] + 3 * u * t * t * segment.c2[0] + t * t * t * segment.pt[0],
                    u * u * u * current[1] + 3 * u * u * t * segment.c1[1] + 3 * u * t * t * segment.c2[1] + t * t * t * segment.pt[1],
                ]);
            }
        } else if (run.length) {
            run.push(run[0]);
        }
        if (segment.op !== 'Z') current = segment.pt;
    }
    if (run.length > 1) runs.push(run);
    return runs;
};

const boundsOf = (points: Pt[]): Box => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x || 1, height: Math.max(...ys) - y || 1 };
};

/* ── PDF-Objekte, die jsPDF nicht kennt ─────────────────────────────────── */

const f = (value: number) => (Math.round(value * 10000) / 10000).toString();

/** Stückweise lineare PDF-Funktion (Typ 3 aus Typ 2) genau durch die Stützstellen. */
const stitchedFunction = (stops: Stop[], pick: (stop: Stop) => number[]) => {
    const points = [...stops];
    if (points[0].offset > 0) points.unshift({ ...points[0], offset: 0 });
    if (points[points.length - 1].offset < 1) points.push({ ...points[points.length - 1], offset: 1 });
    // Gleiche Offsets (harter Wechsel) minimal auseinanderziehen — Typ 3 verlangt steigende Grenzen.
    for (let index = 1; index < points.length; index += 1) {
        if (points[index].offset <= points[index - 1].offset) points[index] = { ...points[index], offset: Math.min(1, points[index - 1].offset + 1e-4) };
    }
    if (points.length === 1) points.push({ ...points[0], offset: 1 });
    const functions = points.slice(1).map((stop, index) =>
        `<< /FunctionType 2 /Domain [0 1] /C0 [${pick(points[index]).map(f).join(' ')}] /C1 [${pick(stop).map(f).join(' ')}] /N 1 >>`);
    if (functions.length === 1) return functions[0];
    const bounds = points.slice(1, -1).map((stop) => f(stop.offset)).join(' ');
    const encode = functions.map(() => '0 1').join(' ');
    return `<< /FunctionType 3 /Domain [0 1] /Functions [${functions.join(' ')}] /Bounds [${bounds}] /Encode [${encode}] >>`;
};

interface ArtForm {
    name: string;
    content: string;
    /** Name im Inhalt → Verlaufs-Wörterbuch. */
    shadings: Record<string, string>;
    /** Name im Inhalt → ExtGState-Wörterbuch (z. B. Multiplizieren). */
    gstates: Record<string, string>;
    /** Maskenform (Transparenzgruppe in Grau)? */
    mask: boolean;
    objectNumber?: number;
}

interface ArtRegistry {
    seq: number;
    forms: ArtForm[];
    /** ExtGStates mit Soft Mask aus einer Maskenform. */
    masks: Array<{ name: string; form: ArtForm; objectNumber?: number }>;
}

const registries = new WeakMap<jsPDF, ArtRegistry>();

type JsPdfInternal = {
    write: (...parts: string[]) => void;
    out: (line: string) => void;
    newObject: () => number;
    putStream: (options: { data: string; additionalKeyValues?: Array<{ key: string; value: string }>; objectId?: number }) => void;
    events: { subscribe: (topic: string, handler: () => void) => void };
    scaleFactor: number;
    pageSize: { getWidth: () => number; getHeight: () => number };
};

const registryOf = (doc: jsPDF): ArtRegistry => {
    const existing = registries.get(doc);
    if (existing) return existing;
    const registry: ArtRegistry = { seq: 0, forms: [], masks: [] };
    registries.set(doc, registry);
    const internal = doc.internal as unknown as JsPdfInternal;
    const k = internal.scaleFactor;
    const bbox = () => `[0 0 ${f(internal.pageSize.getWidth() * k)} ${f(internal.pageSize.getHeight() * k)}]`;
    internal.events.subscribe('putResources', () => {
        const put = (dict: string) => {
            const id = internal.newObject();
            internal.out(dict);
            internal.out('endobj');
            return id;
        };
        registry.forms.forEach((form) => {
            const shadings = Object.entries(form.shadings).map(([name, dict]) => `/${name} ${put(dict)} 0 R`).join(' ');
            const gstates = Object.entries(form.gstates).map(([name, dict]) => `/${name} ${put(dict)} 0 R`).join(' ');
            form.objectNumber = internal.newObject();
            internal.putStream({
                data: form.content,
                objectId: form.objectNumber,
                additionalKeyValues: [
                    { key: 'Type', value: '/XObject' },
                    { key: 'Subtype', value: '/Form' },
                    { key: 'BBox', value: bbox() },
                    ...(form.mask ? [{ key: 'Group', value: '<< /Type /Group /S /Transparency /CS /DeviceGray >>' }] : []),
                    { key: 'Resources', value: `<< /Shading << ${shadings} >>${gstates ? ` /ExtGState << ${gstates} >>` : ''} >>` },
                ],
            });
            internal.out('endobj');
        });
        registry.masks.forEach((mask) => {
            mask.objectNumber = put(`<< /Type /ExtGState /SMask << /Type /Mask /S /Luminosity /G ${mask.form.objectNumber} 0 R >> >>`);
        });
    });
    internal.events.subscribe('putXobjectDict', () => {
        registry.forms.forEach((form) => internal.out(`/${form.name} ${form.objectNumber} 0 R`));
    });
    internal.events.subscribe('putGStateDict', () => {
        registry.masks.forEach((mask) => internal.out(`/${mask.name} ${mask.objectNumber} 0 R`));
    });
    return registry;
};

/* ── Zeichnen ───────────────────────────────────────────────────────────── */

/**
 * `fade`: linke/rechte Blende als Anteil der Breite (wie das Wellenband der
 * Angebots-PDF: Tinte läuft an den Enden weich aus, kein abgeschnittenes Band).
 */
export const drawSvgArt = (doc: jsPDF, svg: string, box: Box, options: { fade?: [number, number] } = {}): void => {
    const { viewBox, gradients, nodes } = parseArt(svg);
    const [vbX, vbY, vbW, vbH] = viewBox;
    const sx = box.width / vbW;
    const sy = box.height / vbH;
    const X = (x: number) => box.x + (x - vbX) * sx;
    const Y = (y: number) => box.y + (y - vbY) * sy;
    const internal = doc.internal as unknown as JsPdfInternal;
    const registry = registryOf(doc);
    // PDF-Einheiten (pt, Ursprung unten links) für die Objekte, die direkt ins PDF gehen.
    const k = internal.scaleFactor;
    const pageHeightPt = internal.pageSize.getHeight() * k;
    const PX = (x: number) => X(x) * k;
    const PY = (y: number) => pageHeightPt - Y(y) * k;
    /** Bildeinheiten → PDF-Seite (für Verläufe, die in Bildeinheiten definiert sind). */
    const userMatrix = `${f(sx * k)} 0 0 ${f(-sy * k)} ${f(PX(0))} ${f(PY(0))} cm `;
    const pageBox = `0 0 ${f(internal.pageSize.getWidth() * k)} ${f(pageHeightPt)}`;

    // Kantenblende: Grauverlauf quer über das Band, 0 → 1 → 1 → 0 (Stufen wie die Angebots-PDF).
    const [fadeLeft, fadeRight] = options.fade ?? [0, 0];
    const fadeStop = (offset: number, value: number): Stop => ({ offset, color: [0, 0, 0], opacity: value });
    const fadeShading = fadeLeft > 0 || fadeRight > 0
        ? `<< /ShadingType 2 /ColorSpace /DeviceGray /Coords [${f(box.x * k)} 0 ${f((box.x + box.width) * k)} 0] /Function ${stitchedFunction([
            ...(fadeLeft > 0 ? [fadeStop(0, 0), fadeStop(fadeLeft * 0.27, 0.23), fadeStop(fadeLeft, 1)] : [fadeStop(0, 1)]),
            ...(fadeRight > 0 ? [fadeStop(1 - fadeRight, 1), fadeStop(1 - fadeRight * 0.27, 0.23), fadeStop(1, 0)] : [fadeStop(1, 1)]),
        ], (stop) => [stop.opacity])} /Extend [true true] >>`
        : null;
    const addMask = (content: string, shadings: Record<string, string>, gstates: Record<string, string> = {}) => {
        const form: ArtForm = { name: `SvgArtM${(registry.seq += 1)}`, content, shadings, gstates, mask: true };
        const mask = { name: `SvgArtG${(registry.seq += 1)}`, form };
        registry.forms.push(form);
        registry.masks.push(mask);
        return mask.name;
    };

    const setAlpha = (value: number) => {
        const a = Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
        doc.setGState(new GState({ opacity: a, 'stroke-opacity': a }));
    };
    const tracePath = (segments: Segment[]) => {
        segments.forEach((segment) => {
            if (segment.op === 'M') doc.moveTo(X(segment.pt[0]), Y(segment.pt[1]));
            else if (segment.op === 'L') doc.lineTo(X(segment.pt[0]), Y(segment.pt[1]));
            else if (segment.op === 'C') doc.curveTo(X(segment.c1[0]), Y(segment.c1[1]), X(segment.c2[0]), Y(segment.c2[1]), X(segment.pt[0]), Y(segment.pt[1]));
            else doc.close();
        });
    };
    const tracePolygon = (points: Pt[]) => {
        points.forEach(([x, y], index) => (index ? doc.lineTo(X(x), Y(y)) : doc.moveTo(X(x), Y(y))));
        doc.close();
    };
    const clipCurrentPath = () => {
        doc.clip();
        doc.discardPath();
    };

    /** Fläche des Elements als (noch nicht gemalter) Pfad; liefert die Objektbox. */
    const traceShape = (node: ArtNode, grow = 0): Box => {
        const a = node.attrs;
        if (node.tag === 'rect') {
            const r = { x: num(a.x, 0), y: num(a.y, 0), width: num(a.width, 0), height: num(a.height, 0) };
            doc.rect(X(r.x), Y(r.y), r.width * sx, r.height * sy, null);
            return r;
        }
        if (node.tag === 'ellipse') {
            const cx = num(a.cx, 0);
            const cy = num(a.cy, 0);
            const rx = num(a.rx, 0);
            const ry = num(a.ry, 0);
            doc.ellipse(X(cx), Y(cy), (rx + grow) * sx, (ry + grow) * sy, null);
            return { x: cx - rx - grow, y: cy - ry - grow, width: (rx + grow) * 2, height: (ry + grow) * 2 };
        }
        const segments = parsePath(a.d ?? '');
        tracePath(segments);
        return boundsOf(flatten(segments, 6).flat());
    };

    /**
     * Verlauf in der aktuellen Clipfläche: Farbform, bei Deckkraft < 1 mit Soft Mask
     * aus demselben Verlauf in Grau. `geometry` = Koordinaten + optionale Matrix.
     */
    const paintGradient = (gradient: Gradient, bbox: Box, alphaScale: number) => {
        const g = gradient.attrs;
        const user = g.gradientUnits === 'userSpaceOnUse';
        let coords: string;
        let matrix = '';
        let type: 2 | 3;
        if (gradient.kind === 'linear') {
            const coord = (v: string | undefined, fallback: number, axis: 'x' | 'y') => {
                const value = num(v, fallback);
                if (user) return value;
                return axis === 'x' ? bbox.x + value * bbox.width : bbox.y + value * bbox.height;
            };
            const x1 = coord(g.x1, 0, 'x');
            const y1 = coord(g.y1, 0, 'y');
            const x2 = coord(g.x2, user ? 0 : 1, 'x');
            const y2 = coord(g.y2, 0, 'y');
            // In Bildeinheiten + Matrix: bei ungleicher Streckung laufen die Farbstufen schräg wie im Browser.
            coords = `[${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)}]`;
            matrix = userMatrix;
            type = 2;
        } else {
            let tx = 0;
            let ty = 0;
            let gx = 1;
            let gy = 1;
            for (const match of (g.gradientTransform ?? '').matchAll(/(translate|scale)\(([^)]*)\)/g)) {
                const [p, q] = match[2].split(/[\s,]+/).map(Number);
                if (match[1] === 'translate') {
                    tx += (p ?? 0) * gx;
                    ty += (q ?? 0) * gy;
                } else {
                    gx *= p ?? 1;
                    gy *= q ?? p ?? 1;
                }
            }
            const cx = num(g.cx, 0.5);
            const cy = num(g.cy, 0.5);
            const r = num(g.r, 0.5);
            const centerX = user ? tx + cx * gx : bbox.x + (tx + cx * gx) * bbox.width;
            const centerY = user ? ty + cy * gy : bbox.y + (ty + cy * gy) * bbox.height;
            const rx = user ? r * gx : r * gx * bbox.width;
            const ry = user ? r * gy : r * gy * bbox.height;
            // Einheitskreis → Ellipse per Matrix; der Verlauf läuft vom Mittelpunkt bis Radius 1.
            coords = '[0 0 0 0 0 1]';
            matrix = `${f(rx * sx * k)} 0 0 ${f(ry * sy * k)} ${f(PX(centerX))} ${f(PY(centerY))} cm `;
            type = 3;
        }
        const shading = (colorSpace: string, fn: string) =>
            `<< /ShadingType ${type} /ColorSpace ${colorSpace} /Coords ${coords} /Function ${fn} /Extend [true true] >>`;
        const colorForm: ArtForm = {
            name: `SvgArtF${(registry.seq += 1)}`,
            content: `q ${matrix}/S sh Q`,
            shadings: { S: shading('/DeviceRGB', stitchedFunction(gradient.stops, (stop) => stop.color.map((c) => c / 255))) },
            gstates: {},
            mask: false,
        };
        registry.forms.push(colorForm);
        const opaque = alphaScale >= 0.999 && gradient.stops.every((stop) => stop.opacity >= 0.999);
        if (!opaque || fadeShading) {
            // Maske = Deckkraft des Verlaufs × Kantenblende (Multiplizieren in der Graugruppe).
            const shadings: Record<string, string> = {};
            const parts: string[] = [];
            if (opaque) {
                parts.push(`q 1 g ${pageBox} re f Q`);
            } else {
                shadings.A = shading('/DeviceGray', stitchedFunction(gradient.stops, (stop) => [Math.min(1, Math.max(0, stop.opacity * alphaScale))]));
                parts.push(`q ${matrix}/A sh Q`);
            }
            const gstates: Record<string, string> = {};
            if (fadeShading) {
                shadings.B = fadeShading;
                gstates.M = '<< /Type /ExtGState /BM /Multiply >>';
                parts.push('q /M gs /B sh Q');
            }
            internal.write(`/${addMask(parts.join(' '), shadings, gstates)} gs`);
        }
        internal.write(`/${colorForm.name} Do`);
    };

    /** Deckkraft eines Farbauftrags aus Element-Attributen. */
    const alphaOf = (attrs: Attrs, kind: 'fill' | 'stroke') => num(attrs[`${kind}-opacity`], 1) * num(attrs.opacity, 1);

    /**
     * Weichgezeichnete Linie: vier Züge, jeder breiter und blasser, zusammen so viel
     * «Tinte» wie die scharfe Linie. Eine breite Linie behält ihren Kern, eine dünne
     * verteilt sich (wie beim Gauss-Weichzeichner).
     */
    const strokePasses = (width: number, alpha: number, blur: number): Array<[number, number]> => {
        if (!blur) return [[width, alpha]];
        const weights = width >= blur * 2 ? [0.55, 0.25, 0.13, 0.07] : [0.15, 0.3, 0.3, 0.25];
        return [0, 1.3, 2.6, 3.9].map((spread, index): [number, number] => {
            const w = width + blur * spread;
            return [w, Math.min(1, (weights[index] * alpha * width) / w)];
        });
    };

    setAlpha(1); // sorgt dafür, dass jsPDF ein ExtGState-Verzeichnis schreibt (für die Soft Masks)
    doc.saveGraphicsState();
    doc.rect(box.x, box.y, box.width, box.height, null);
    clipCurrentPath();
    if (fadeShading) internal.write(`/${addMask('q /B sh Q', { B: fadeShading })} gs`);

    for (const node of nodes) {
        const a = node.attrs;
        const fillRef = /url\(#([^)]+)\)/.exec(a.fill ?? '')?.[1];
        const fillGradient = fillRef ? gradients.get(fillRef) : undefined;
        const fillColor = colorOf(a.fill);
        if (fillGradient) {
            // Weichzeichner auf einer Verlaufsfläche (Schatten): Fläche und Verlauf etwas grösser.
            const grow = node.blur * 1.5;
            doc.saveGraphicsState();
            const bbox = traceShape(node, grow);
            clipCurrentPath();
            paintGradient(fillGradient, bbox, alphaOf(a, 'fill'));
            doc.restoreGraphicsState();
        } else if (fillColor) {
            doc.setFillColor(...fillColor);
            setAlpha(alphaOf(a, 'fill'));
            traceShape(node);
            doc.fill();
        }

        const strokeRef = /url\(#([^)]+)\)/.exec(a.stroke ?? '')?.[1];
        const strokeGradient = strokeRef ? gradients.get(strokeRef) : undefined;
        const strokeColor = colorOf(a.stroke);
        if (node.tag !== 'path' || (!strokeGradient && !strokeColor)) continue;
        const width = num(a['stroke-width'], 1);
        const segments = parsePath(a.d ?? '');
        if (strokeGradient) {
            // Linie mit Verlauf: ihr Umriss wird zur Clipfläche, der Verlauf füllt ihn.
            for (const run of flatten(segments)) {
                const left: Pt[] = [];
                const right: Pt[] = [];
                run.forEach((point, index) => {
                    const prev = run[Math.max(0, index - 1)];
                    const next = run[Math.min(run.length - 1, index + 1)];
                    const dx = next[0] - prev[0];
                    const dy = next[1] - prev[1];
                    const len = Math.hypot(dx, dy) || 1;
                    left.push([point[0] - (dy / len) * (width / 2), point[1] + (dx / len) * (width / 2)]);
                    right.push([point[0] + (dy / len) * (width / 2), point[1] - (dx / len) * (width / 2)]);
                });
                doc.saveGraphicsState();
                tracePolygon([...left, ...right.reverse()]);
                clipCurrentPath();
                paintGradient(strokeGradient, boundsOf(run), alphaOf(a, 'stroke'));
                doc.restoreGraphicsState();
            }
        } else if (strokeColor) {
            doc.setDrawColor(...strokeColor);
            strokePasses(width, alphaOf(a, 'stroke'), node.blur).forEach(([w, alpha]) => {
                doc.setLineWidth(w * sx);
                setAlpha(alpha);
                tracePath(segments);
                doc.stroke();
            });
        }
    }

    doc.restoreGraphicsState();
    setAlpha(1);
};
