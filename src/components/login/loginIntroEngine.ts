/**
 * ── ERÖFFNUNG DER ANMELDESEITE · Teilchenwerk ───────────────────────────────
 *
 * Reines TypeScript auf zwei Leinwänden (kein WebGL, keine Bibliothek). Die
 * Bühne zeigt drei Zeichen — O · C · C — und jedes Zeichen bekommt seinen
 * eigenen Stoff, der ihm oben UND unten aus der Form fährt:
 *
 *   O  ·  RAUCH   grosse, träge Schwaden, die aufsteigen und nach unten
 *                 absacken, sich drehen, breiter werden und zerfallen.
 *   C  ·  FEUER   eine gewaltige Flamme; heisser weisser Kern am Zeichen,
 *                 darüber Gelb, Orange, Rot, dazu Funken, die davonfliegen.
 *   C  ·  LICHT   violette Lichtkegel — je ein DREIECK nach oben und nach
 *                 unten, mit Schlieren, wandernden Staubkörnern und einem
 *                 anamorphen Blendbalken quer über dem Zeichen.
 *
 * Aufbau (wichtig für das Verständnis der Zeichenreihenfolge):
 *
 *   BACK-Leinwand   Lichtkegel → Flammenkörper → Rauch → Flammenteilchen
 *                   Liegt HINTER den Buchstaben (DOM-Text) — die Zeichen
 *                   stehen dadurch mitten im Qualm statt davor.
 *   FRONT-Leinwand  Funken → Staubkörner → Blendbalken
 *                   Liegt VOR den Buchstaben: einzelne Funken ziehen über
 *                   die Form hinweg, das gibt der Bühne Tiefe.
 *
 * Die Geometrie kommt von aussen: die React-Hülle misst die drei Zeichen im
 * Layout (`getBoundingClientRect`) und reicht sie als `GlyphBox` herein. Damit
 * sitzen die Quellen immer exakt an der Ober- und Unterkante des Buchstabens,
 * an jeder Fenstergrösse und nach jedem Neuumbruch.
 *
 * Farben werden NICHT zur Laufzeit getönt (das kostet einen Zwischenpuffer je
 * Teilchen). Stattdessen entsteht beim Start je Farbstufe ein fertiges
 * Sprite; ein Teilchen wählt nur noch die Stufe zu seinem Alter aus. Das hält
 * die Bildrate auch mit ~900 Teilchen ruhig.
 */

/** Die drei Spalten der Bühne. */
export type IntroChannel = 'smoke' | 'fire' | 'light';

/** Ein gemessener Buchstabe — alle Werte in CSS-Pixeln, relativ zur Bühne. */
export interface GlyphBox {
    /** Waagrechte Mitte des Zeichens. */
    cx: number;
    /** Oberkante (dort setzt die nach oben gerichtete Quelle an). */
    top: number;
    /** Unterkante (Quelle nach unten). */
    bottom: number;
    /** Breite des Zeichens — bestimmt die Streuung der Quelle. */
    w: number;
    /** Höhe des Zeichens — Massstab für Teilchengrösse und Reichweite. */
    h: number;
}

export type IntroGeometry = Record<IntroChannel, GlyphBox>;

/** Sekunde, in der ein Kanal zündet (relativ zum Start der Bühne). */
export type IntroIgnition = Record<IntroChannel, number>;

/* ─────────────────────────── Konstanten ─────────────────────────── */

/** Sekunden vom Zünden bis zur vollen Kraft eines Kanals. */
const RAMP_IN = 0.5;
/** Sekunden, in denen beim Abgang alles herunterfährt. */
const EXIT_FADE = 0.8;
/** Grösster erlaubter Zeitschritt — nach einem Tab-Wechsel darf die
 *  Simulation nicht in einem einzigen Sprung explodieren. */
const MAX_DT = 1 / 30;
/** Bezugshöhe eines Zeichens; alle Grössen skalieren damit. */
const REF_GLYPH = 190;

/** Obergrenzen je Teilchenart (bei voller Qualität). */
const CAP = { smoke: 320, fire: 620, spark: 240, mote: 220 } as const;

/** Höchste Pixeldichte, die die Bühne rechnet — darüber lohnt sich nichts
 *  mehr, die Effekte sind ohnehin weich. */
const MAX_DPR = 1.5;
/** Die hintere Leinwand (Qualm, Flammenkörper, Kegel) läuft absichtlich
 *  gröber und wird hochskaliert: sie trägt nur weiche Flächen, kostet aber
 *  die meiste Füllrate. Die vordere (Funken, Staub) bleibt scharf. */
const BACK_RES = 0.75;

/** Farbstufen. Jede Stufe wird einmal als Sprite gebacken. */
const SMOKE_RAMP = ['#eef2fb', '#ccd4e6', '#a6afc4', '#818a9e', '#5c6478', '#3f4655'];
const FIRE_RAMP = [
    '#fffdf2',
    '#fff6cd',
    '#ffe58f',
    '#ffca4d',
    '#ffa32a',
    '#ff7a1f',
    '#f5501b',
    '#cf2c14',
    '#8d1a0c',
];
const EMBER_RAMP = ['#fff8dc', '#ffdc86', '#ffab45', '#ff6a24'];
const MOTE_RAMP = ['#f6ecff', '#ddc4ff', '#b98cff', '#8f55ff'];

/** Violett-Palette der Lichtkegel. */
const LIGHT_CORE = '167, 118, 255';
const LIGHT_MID = '124, 62, 246';
const LIGHT_EDGE = '76, 26, 168';
const LIGHT_HOT = '236, 220, 255';

/** Die einzelnen Lagen eines Lichtkegels. `angle` in Grad ab der Senkrechten. */
const CONES = [
    { angle: 26, alpha: 0.2, pulse: 1.7, sway: 2.4, swaySpeed: 0.9, phase: 0.0 },
    { angle: 18, alpha: 0.26, pulse: 2.3, sway: 1.8, swaySpeed: 1.3, phase: 1.7 },
    { angle: 11, alpha: 0.32, pulse: 3.1, sway: 1.2, swaySpeed: 1.9, phase: 3.4 },
    { angle: 5.5, alpha: 0.42, pulse: 4.3, sway: 0.8, swaySpeed: 2.6, phase: 5.1 },
];

/** Schmale Schlieren („Gottesstrahlen") innerhalb der Kegel. */
const BLADES = [
    { offset: -0.62, width: 0.05, alpha: 0.3, speed: 1.6, phase: 0.4 },
    { offset: -0.24, width: 0.035, alpha: 0.24, speed: 2.4, phase: 2.2 },
    { offset: 0.2, width: 0.045, alpha: 0.28, speed: 1.9, phase: 4.0 },
    { offset: 0.58, width: 0.03, alpha: 0.22, speed: 2.9, phase: 5.6 },
];

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Weiches Ein-/Ausblenden ohne Kante. */
const smoothstep = (v: number) => {
    const x = clamp01(v);
    return x * x * (3 - 2 * x);
};

/** Billiger, aber überzeugender Ersatz für Rauschen: eine Summe aus Sinus.
 *  Reicht völlig, um Rauch kringeln und Flammen züngeln zu lassen. */
const swirl = (x: number, y: number, t: number) =>
    Math.sin(x * 0.017 + t * 1.1) * 0.6 +
    Math.sin(y * 0.023 - t * 0.8) * 0.3 +
    Math.sin((x + y) * 0.011 + t * 1.7) * 0.25;

/* ─────────────────────────── Sprites ─────────────────────────── */

const makeCanvas = (size: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    return [cv, ctx];
};

/** #rrggbb → `rgba(r, g, b, a)`. */
const hexA = (hex: string, a: number) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** Runde, weiche Scheibe — Grundform für Feuer, Funken und Staub. */
const discSprite = (color: string, size: number, stops: Array<[number, number]>) => {
    const [cv, ctx] = makeCanvas(size);
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    for (const [at, alpha] of stops) g.addColorStop(at, hexA(color, alpha));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return cv;
};

/** Rauchballen: mehrere versetzte Scheiben, addiert und weichgezeichnet —
 *  eine einzelne Scheibe sähe wie ein Wattebausch aus, erst die unregel-
 *  mässige Ballung wirkt wie Qualm. */
const smokeSprite = (color: string, size = 160) => {
    const [cv, ctx] = makeCanvas(size);
    const blobs: Array<[number, number, number, number]> = [
        [0.5, 0.52, 0.3, 0.85],
        [0.35, 0.42, 0.22, 0.6],
        [0.64, 0.4, 0.2, 0.55],
        [0.42, 0.66, 0.24, 0.62],
        [0.66, 0.63, 0.18, 0.48],
        [0.5, 0.32, 0.16, 0.4],
    ];
    ctx.globalCompositeOperation = 'lighter';
    if ('filter' in ctx) ctx.filter = `blur(${Math.round(size * 0.022)}px)`;
    for (const [bx, by, br, ba] of blobs) {
        const x = bx * size;
        const y = by * size;
        const r = br * size;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, hexA(color, ba));
        g.addColorStop(0.55, hexA(color, ba * 0.42));
        g.addColorStop(1, hexA(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
    }
    return cv;
};

/* ─────────────────────────── Teilchen ─────────────────────────── */

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** verstrichene Lebenszeit / Gesamtlebenszeit ⇒ wählt die Farbstufe. */
    age: number;
    life: number;
    size: number;
    /** Wachstum in px/s. */
    grow: number;
    rot: number;
    spin: number;
    /** Eigenphase, damit sich zwei Teilchen nie gleich bewegen. */
    seed: number;
    /** −1 = nach oben, +1 = nach unten. */
    dir: number;
    /** Spitzenhelligkeit. */
    peak: number;
    /** nur Staub: Länge der Schliere (1 = rund). */
    stretch: number;
}

const mkParticle = (): Particle => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    age: 0,
    life: 1,
    size: 1,
    grow: 0,
    rot: 0,
    spin: 0,
    seed: 0,
    dir: -1,
    peak: 1,
    stretch: 1,
});

/* ─────────────────────────── Werk ─────────────────────────── */

export class LoginIntroEngine {
    private readonly backCtx: CanvasRenderingContext2D;
    private readonly frontCtx: CanvasRenderingContext2D;
    private readonly back: HTMLCanvasElement;
    private readonly front: HTMLCanvasElement;
    private readonly ignite: IntroIgnition;

    private smokeSprites: HTMLCanvasElement[] = [];
    private fireSprites: HTMLCanvasElement[] = [];
    private emberSprites: HTMLCanvasElement[] = [];
    private moteSprites: HTMLCanvasElement[] = [];

    private smoke: Particle[] = [];
    private fire: Particle[] = [];
    private sparks: Particle[] = [];
    private motes: Particle[] = [];

    /** Bruchteile offener Ausstösse — hält die Ausstossrate bildratenfest. */
    private acc = { smoke: 0, fire: 0, spark: 0, mote: 0 };

    private geo: IntroGeometry | null = null;
    private w = 0;
    private h = 0;
    private backScale = 1;
    private frontScale = 1;

    private raf = 0;
    private t0 = 0;
    private last = 0;
    /** Bühnenzeit in Sekunden. */
    private t = 0;
    private exitAt = Infinity;
    private running = false;

    /** Selbstdrosselung: fällt die Bildrate, sinkt der Ausstoss. */
    private quality = 1;
    private frameAcc = 0;
    private frameCount = 0;

    constructor(back: HTMLCanvasElement, front: HTMLCanvasElement, ignite: IntroIgnition) {
        this.back = back;
        this.front = front;
        const b = back.getContext('2d', { alpha: true });
        const f = front.getContext('2d', { alpha: true });
        if (!b || !f) throw new Error('2d context unavailable');
        this.backCtx = b;
        this.frontCtx = f;
        this.ignite = ignite;
    }

    /** Sprites backen. Einmalig, ~20 kleine Zeichnungen. */
    private bake() {
        if (this.smokeSprites.length) return;
        this.smokeSprites = SMOKE_RAMP.map((c) => smokeSprite(c));
        this.fireSprites = FIRE_RAMP.map((c) =>
            discSprite(c, 96, [
                [0, 1],
                [0.16, 0.78],
                [0.42, 0.24],
                [0.72, 0.05],
                [1, 0],
            ]),
        );
        this.emberSprites = EMBER_RAMP.map((c) =>
            discSprite(c, 40, [
                [0, 1],
                [0.35, 0.5],
                [1, 0],
            ]),
        );
        this.moteSprites = MOTE_RAMP.map((c) =>
            discSprite(c, 48, [
                [0, 1],
                [0.3, 0.55],
                [1, 0],
            ]),
        );
    }

    /** Grösse der Bühne (CSS-Pixel) — von der React-Hülle bei jedem Umbruch. */
    setSize(w: number, h: number, dpr: number) {
        this.w = w;
        this.h = h;
        const capped = Math.min(dpr, MAX_DPR);
        this.backScale = capped * BACK_RES;
        this.frontScale = capped;
        const parts: Array<[HTMLCanvasElement, CanvasRenderingContext2D, number]> = [
            [this.back, this.backCtx, this.backScale],
            [this.front, this.frontCtx, this.frontScale],
        ];
        for (const [cv, ctx, scale] of parts) {
            cv.width = Math.max(1, Math.round(w * scale));
            cv.height = Math.max(1, Math.round(h * scale));
            cv.style.width = `${w}px`;
            cv.style.height = `${h}px`;
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
        }
    }

    /** Die drei gemessenen Zeichen. */
    setGeometry(geo: IntroGeometry) {
        this.geo = geo;
    }

    start() {
        if (this.running) return;
        this.bake();
        this.running = true;
        this.t0 = performance.now();
        this.last = this.t0;
        this.raf = requestAnimationFrame(this.frame);
    }

    /** Abgang: der Ausstoss endet, Vorhandenes verglüht in `EXIT_FADE`. */
    beginExit() {
        if (this.exitAt === Infinity) this.exitAt = this.t;
    }

    stop() {
        this.running = false;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.smoke.length = 0;
        this.fire.length = 0;
        this.sparks.length = 0;
        this.motes.length = 0;
    }

    /* ── Hüllkurven ── */

    /** Kraft eines Kanals: zündet, fährt hoch, fällt beim Abgang ab. */
    private power(channel: IntroChannel) {
        const up = smoothstep((this.t - this.ignite[channel]) / RAMP_IN);
        return up * this.exitFade();
    }

    private exitFade() {
        if (this.exitAt === Infinity) return 1;
        return 1 - smoothstep((this.t - this.exitAt) / EXIT_FADE);
    }

    /** Kurzer Überschuss direkt nach dem Zünden — der „Schlag". */
    private burst(channel: IntroChannel) {
        const dt = this.t - this.ignite[channel];
        if (dt < 0 || dt > 0.45) return 1;
        return 1 + 2.6 * (1 - dt / 0.45);
    }

    /* ── Schleife ── */

    private frame = (now: number) => {
        if (!this.running) return;
        const dtRaw = (now - this.last) / 1000;
        this.last = now;
        const dt = Math.min(dtRaw, MAX_DT);
        this.t = (now - this.t0) / 1000;

        // Selbstdrosselung im Halbsekundentakt.
        this.frameAcc += dtRaw;
        this.frameCount += 1;
        if (this.frameAcc > 0.5) {
            const avg = this.frameAcc / this.frameCount;
            if (avg > 0.026) this.quality = Math.max(0.4, this.quality - 0.18);
            else if (avg < 0.016) this.quality = Math.min(1, this.quality + 0.1);
            this.frameAcc = 0;
            this.frameCount = 0;
        }

        if (this.geo) {
            this.emit(dt);
            this.step(dt);
            this.draw();
        }
        this.raf = requestAnimationFrame(this.frame);
    };

    /* ── Ausstoss ── */

    private emit(dt: number) {
        const geo = this.geo;
        if (!geo || this.exitAt !== Infinity) return; // beim Abgang nichts Neues

        const q = this.quality;

        // ── Rauch am O ──────────────────────────────────────────────────
        const ps = this.power('smoke');
        if (ps > 0.001) {
            const box = geo.smoke;
            const sc = box.h / REF_GLYPH;
            this.acc.smoke += 205 * ps * this.burst('smoke') * q * dt;
            while (this.acc.smoke >= 1) {
                this.acc.smoke -= 1;
                if (this.smoke.length >= CAP.smoke * q) break;
                const dir = Math.random() < 0.5 ? -1 : 1;
                const p = mkParticle();
                // Am Ring des O ansetzen, nicht über die ganze Kastenbreite.
                p.x = box.cx + rnd(-0.44, 0.44) * box.w;
                p.y = (dir < 0 ? box.top : box.bottom) + dir * rnd(0, 16) * sc;
                p.vx = rnd(-20, 20) * sc;
                p.vy = dir * rnd(200, 380) * sc;
                p.life = rnd(2.6, 4.8);
                p.size = rnd(34, 82) * sc;
                p.grow = rnd(62, 132) * sc;
                p.rot = Math.random() * TAU;
                p.spin = rnd(-0.5, 0.5);
                p.seed = Math.random() * TAU;
                p.dir = dir;
                p.peak = rnd(0.24, 0.44);
                this.smoke.push(p);
            }
        }

        // ── Feuer am ersten C ───────────────────────────────────────────
        const pf = this.power('fire');
        if (pf > 0.001) {
            const box = geo.fire;
            const sc = box.h / REF_GLYPH;
            this.acc.fire += 620 * pf * this.burst('fire') * q * dt;
            while (this.acc.fire >= 1) {
                this.acc.fire -= 1;
                if (this.fire.length >= CAP.fire * q) break;
                const dir = Math.random() < 0.5 ? -1 : 1;
                const p = mkParticle();
                p.x = box.cx + rnd(-0.42, 0.42) * box.w;
                p.y = (dir < 0 ? box.top : box.bottom) + dir * rnd(-4, 12) * sc;
                p.vx = rnd(-38, 38) * sc;
                p.vy = dir * rnd(340, 800) * sc;
                p.life = rnd(0.62, 1.35);
                p.size = rnd(8, 22) * sc;
                p.grow = rnd(18, 48) * sc;
                // In Flugrichtung gezogen: eine Zunge, keine Kugel.
                p.stretch = rnd(1.5, 3.1);
                p.seed = Math.random() * TAU;
                p.dir = dir;
                p.peak = rnd(0.34, 0.66);
                this.fire.push(p);
            }

            // Funken — seltener, kleiner, dafür weit fliegend.
            this.acc.spark += 76 * pf * this.burst('fire') * q * dt;
            while (this.acc.spark >= 1) {
                this.acc.spark -= 1;
                if (this.sparks.length >= CAP.spark * q) break;
                const dir = Math.random() < 0.62 ? -1 : 1;
                const p = mkParticle();
                p.x = box.cx + rnd(-0.45, 0.45) * box.w;
                p.y = (dir < 0 ? box.top : box.bottom) + dir * rnd(0, 20) * sc;
                p.vx = rnd(-100, 100) * sc;
                p.vy = dir * rnd(320, 820) * sc;
                p.life = rnd(0.9, 2.2);
                p.size = rnd(2, 5.4) * sc;
                p.grow = -1.2 * sc;
                p.seed = Math.random() * TAU;
                p.dir = dir;
                p.peak = rnd(0.55, 1);
                this.sparks.push(p);
            }
        }

        // ── Licht am zweiten C ──────────────────────────────────────────
        const pl = this.power('light');
        if (pl > 0.001) {
            const box = geo.light;
            const sc = box.h / REF_GLYPH;
            this.acc.mote += 112 * pl * this.burst('light') * q * dt;
            while (this.acc.mote >= 1) {
                this.acc.mote -= 1;
                if (this.motes.length >= CAP.mote * q) break;
                const dir = Math.random() < 0.5 ? -1 : 1;
                const p = mkParticle();
                // Im Kegel verteilt starten, nicht nur an der Spitze — dadurch
                // ist das Dreieck vom ersten Bild an mit Staub gefüllt.
                const along = Math.random() * Math.random(); // dicht an der Quelle
                const reach = dir < 0 ? box.top + 60 : this.h - box.bottom + 60;
                const d = along * reach;
                p.x = box.cx + rnd(-1, 1) * (box.w * 0.3 + d * 0.3);
                p.y = (dir < 0 ? box.top : box.bottom) + dir * d;
                p.vx = rnd(-24, 24) * sc;
                p.vy = dir * rnd(70, 230) * sc;
                p.life = rnd(1.1, 2.6);
                p.size = rnd(3, 11) * sc;
                p.grow = rnd(-1, 6) * sc;
                p.seed = Math.random() * TAU;
                p.dir = dir;
                p.peak = rnd(0.35, 0.95);
                p.stretch = rnd(1, 3.4);
                this.motes.push(p);
            }
        }
    }

    /* ── Bewegung ── */

    private step(dt: number) {
        const t = this.t;

        // Rauch: träge, dreht sich, wird nach aussen getragen und zerfällt.
        for (let i = this.smoke.length - 1; i >= 0; i--) {
            const p = this.smoke[i];
            p.age += dt;
            if (p.age >= p.life) {
                this.smoke[i] = this.smoke[this.smoke.length - 1];
                this.smoke.pop();
                continue;
            }
            const k = p.age / p.life;
            const curl = swirl(p.x, p.y, t + p.seed);
            p.vx += (curl * 34 + Math.sin(t * 0.7 + p.seed) * 12) * dt;
            // Auftrieb lässt nach: die Schwade wird schwer und legt sich hin.
            p.vy += p.dir * -40 * dt * k;
            p.vx *= 1 - 0.5 * dt;
            p.vy *= 1 - 0.26 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.size += p.grow * dt;
            p.rot += p.spin * dt;
        }

        // Feuer: beschleunigt vom Zeichen weg, züngelt seitlich, kühlt aus.
        for (let i = this.fire.length - 1; i >= 0; i--) {
            const p = this.fire[i];
            p.age += dt;
            if (p.age >= p.life) {
                this.fire[i] = this.fire[this.fire.length - 1];
                this.fire.pop();
                continue;
            }
            const lick = Math.sin(p.y * 0.03 + t * 7 + p.seed) * 108 + swirl(p.x, p.y, t * 1.6 + p.seed) * 42;
            p.vx += lick * dt;
            p.vy += p.dir * 350 * dt; // Hitze zieht weiter vom Zeichen fort
            p.vx *= 1 - 2.1 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.size += p.grow * dt;
        }

        // Funken: fliegen weit, flackern, sinken am Ende zurück.
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const p = this.sparks[i];
            p.age += dt;
            if (p.age >= p.life) {
                this.sparks[i] = this.sparks[this.sparks.length - 1];
                this.sparks.pop();
                continue;
            }
            p.vx += Math.sin(t * 3.4 + p.seed) * 58 * dt;
            p.vy += 96 * dt; // Schwerkraft holt den Funken zurück
            p.vx *= 1 - 0.9 * dt;
            p.vy *= 1 - 0.75 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }

        // Staub im Licht: driftet ruhig, atmet mit dem Kegel.
        for (let i = this.motes.length - 1; i >= 0; i--) {
            const p = this.motes[i];
            p.age += dt;
            if (p.age >= p.life) {
                this.motes[i] = this.motes[this.motes.length - 1];
                this.motes.pop();
                continue;
            }
            p.vx += Math.sin(t * 1.6 + p.seed) * 26 * dt;
            p.vx *= 1 - 0.6 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.size += p.grow * dt;
        }
    }

    /* ── Zeichnen ── */

    private draw() {
        const geo = this.geo!;
        const b = this.backCtx;
        const f = this.frontCtx;
        b.clearRect(0, 0, this.w, this.h);
        f.clearRect(0, 0, this.w, this.h);

        const pLight = this.power('light');
        const pFire = this.power('fire');
        const pSmoke = this.power('smoke');
        const fade = this.exitFade();

        /* HINTEN: Licht → Flammenkörper → Rauch → Feuer */
        b.globalCompositeOperation = 'lighter';
        if (pLight > 0.001) {
            this.drawCones(b, geo.light, -1, pLight);
            this.drawCones(b, geo.light, 1, pLight);
            this.drawSource(b, geo.light, pLight, LIGHT_HOT, 1.5);
        }
        if (pFire > 0.001) {
            this.drawFlameBody(b, geo.fire, -1, pFire);
            this.drawFlameBody(b, geo.fire, 1, pFire);
        }
        if (pSmoke > 0.001) this.drawSource(b, geo.smoke, pSmoke * 0.5, '214, 224, 245', 0.9);

        // Rauch deckend (nicht additiv) — sonst leuchtet er statt zu qualmen.
        b.globalCompositeOperation = 'source-over';
        const smokeRampMax = this.smokeSprites.length - 1;
        for (const p of this.smoke) {
            const k = p.age / p.life;
            // Auf- und wieder abblenden; nie hart einsetzen.
            const a = p.peak * smoothstep(k / 0.22) * (1 - smoothstep((k - 0.42) / 0.58)) * fade;
            if (a <= 0.002) continue;
            const sprite = this.smokeSprites[Math.min(smokeRampMax, (k * smokeRampMax * 1.35) | 0)];
            const s = p.size;
            b.globalAlpha = a;
            const c = Math.cos(p.rot);
            const sn = Math.sin(p.rot);
            const d = this.backScale;
            b.setTransform(d * c, d * sn, -d * sn, d * c, d * p.x, d * p.y);
            b.drawImage(sprite, -s / 2, -s / 2, s, s);
        }
        b.setTransform(this.backScale, 0, 0, this.backScale, 0, 0);

        b.globalCompositeOperation = 'lighter';
        const fireRampMax = this.fireSprites.length - 1;
        for (const p of this.fire) {
            const k = p.age / p.life;
            const a = p.peak * (1 - smoothstep(k)) * fade;
            if (a <= 0.002) continue;
            const sprite = this.fireSprites[Math.min(fireRampMax, (k * fireRampMax * 1.15) | 0)];
            const s = p.size;
            // Je schneller, desto länger die Zunge — wie eine Bewegungsspur.
            const sh = s * p.stretch;
            b.globalAlpha = a;
            b.drawImage(sprite, p.x - s / 2, p.y - sh / 2, s, sh);
        }
        b.globalAlpha = 1;
        b.globalCompositeOperation = 'source-over';

        /* VORNE: Funken → Staub → Blendbalken */
        f.globalCompositeOperation = 'lighter';
        const emberMax = this.emberSprites.length - 1;
        for (const p of this.sparks) {
            const k = p.age / p.life;
            // Flackern: der Funke glimmt, statt gleichmässig zu leuchten.
            const flick = 0.55 + 0.45 * Math.sin(this.t * 26 + p.seed * 7);
            const a = p.peak * flick * (1 - smoothstep(k * k)) * fade;
            if (a <= 0.002) continue;
            const sprite = this.emberSprites[Math.min(emberMax, (k * emberMax * 1.3) | 0)];
            const s = Math.max(1.2, p.size) * 2.2;
            f.globalAlpha = a;
            f.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
        }
        const moteMax = this.moteSprites.length - 1;
        for (const p of this.motes) {
            const k = p.age / p.life;
            const twinkle = 0.62 + 0.38 * Math.sin(this.t * 9 + p.seed * 5);
            const a = p.peak * twinkle * smoothstep(k / 0.18) * (1 - smoothstep((k - 0.35) / 0.65)) * fade;
            if (a <= 0.002) continue;
            const sprite = this.moteSprites[Math.min(moteMax, (k * moteMax * 1.2) | 0)];
            const w = Math.max(1.5, p.size) * 3.2;
            const hh = w * p.stretch;
            f.globalAlpha = a;
            f.drawImage(sprite, p.x - w / 2, p.y - hh / 2, w, hh);
        }
        if (pLight > 0.001) this.drawFlare(f, geo.light, pLight);
        f.globalAlpha = 1;
        f.globalCompositeOperation = 'source-over';
    }

    /** Weicher Lichtquell-Fleck direkt am Zeichen. */
    private drawSource(ctx: CanvasRenderingContext2D, box: GlyphBox, power: number, rgbOrHex: string, mul: number) {
        const rgb = rgbOrHex.startsWith('#')
            ? (() => {
                  const n = parseInt(rgbOrHex.slice(1), 16);
                  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
              })()
            : rgbOrHex;
        const r = box.h * 0.85 * mul;
        const flick = 0.85 + 0.15 * Math.sin(this.t * 5.3);
        const g = ctx.createRadialGradient(box.cx, (box.top + box.bottom) / 2, 0, box.cx, (box.top + box.bottom) / 2, r);
        g.addColorStop(0, `rgba(${rgb}, ${0.4 * power * flick})`);
        g.addColorStop(0.4, `rgba(${rgb}, ${0.14 * power * flick})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(box.cx - r, (box.top + box.bottom) / 2 - r, r * 2, r * 2);
    }

    /** Der glühende Körper der Flamme hinter den Teilchen — er gibt der
     *  Säule Volumen; ohne ihn wirken selbst 400 Teilchen wie Konfetti. */
    private drawFlameBody(ctx: CanvasRenderingContext2D, box: GlyphBox, dir: number, power: number) {
        const startY = dir < 0 ? box.top : box.bottom;
        const reach = (dir < 0 ? startY + 80 : this.h - startY + 80) * (0.9 + 0.22 * power);
        const flick = 0.78 + 0.22 * Math.sin(this.t * 11.3 + dir) * Math.sin(this.t * 7.1);
        const width = box.w * (0.66 + 0.1 * Math.sin(this.t * 6.7 + dir * 2));

        const g = ctx.createLinearGradient(box.cx, startY, box.cx, startY + dir * reach);
        g.addColorStop(0, `rgba(255, 250, 235, ${0.8 * power * flick})`);
        g.addColorStop(0.1, `rgba(255, 205, 96, ${0.5 * power * flick})`);
        g.addColorStop(0.34, `rgba(255, 122, 31, ${0.28 * power * flick})`);
        g.addColorStop(0.66, `rgba(214, 46, 18, ${0.1 * power * flick})`);
        g.addColorStop(1, 'rgba(120, 16, 6, 0)');
        ctx.fillStyle = g;

        // Eine Fackelform: unten schmal am Zeichen, oben ausgestellt und
        // von den Sinuswellen leicht schief gezogen.
        const sway = Math.sin(this.t * 2.4 + dir) * box.w * 0.16;
        ctx.beginPath();
        ctx.moveTo(box.cx - width * 0.5, startY);
        ctx.bezierCurveTo(
            box.cx - width * 0.92 + sway,
            startY + dir * reach * 0.34,
            box.cx - width * 0.52 + sway * 2,
            startY + dir * reach * 0.74,
            box.cx + sway * 2.6,
            startY + dir * reach,
        );
        ctx.bezierCurveTo(
            box.cx + width * 0.52 + sway * 2,
            startY + dir * reach * 0.74,
            box.cx + width * 0.92 + sway,
            startY + dir * reach * 0.34,
            box.cx + width * 0.5,
            startY,
        );
        ctx.closePath();
        ctx.fill();
    }

    /** Die violetten DREIECKE: mehrere Lagen mit eigenem Puls, dazu schmale
     *  Schlieren und zwei betonte Kanten, damit die Dreiecksform trägt. */
    private drawCones(ctx: CanvasRenderingContext2D, box: GlyphBox, dir: number, power: number) {
        const apexY = dir < 0 ? box.top + 4 : box.bottom - 4;
        // Die Kegel laufen ÜBER den Bildrand hinaus — ein Lichtstrahl, der
        // sichtbar an der Kante endet, wäre eine Fläche, kein Strahl.
        const reach = (dir < 0 ? apexY : this.h - apexY) + 260;
        const endY = apexY + dir * reach;
        const apexHalf = box.w * 0.3;

        for (const c of CONES) {
            const sway = Math.sin(this.t * c.swaySpeed + c.phase) * c.sway;
            const half = reach * Math.tan((c.angle + sway) * DEG) + apexHalf;
            const pulse = 0.6 + 0.4 * Math.sin(this.t * c.pulse + c.phase);
            const a = c.alpha * pulse * power;

            const g = ctx.createLinearGradient(box.cx, apexY, box.cx, endY);
            g.addColorStop(0, `rgba(${LIGHT_HOT}, ${a})`);
            g.addColorStop(0.08, `rgba(${LIGHT_CORE}, ${a * 0.86})`);
            g.addColorStop(0.42, `rgba(${LIGHT_MID}, ${a * 0.4})`);
            g.addColorStop(1, `rgba(${LIGHT_EDGE}, 0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(box.cx - apexHalf, apexY);
            ctx.lineTo(box.cx - half, endY);
            ctx.lineTo(box.cx + half, endY);
            ctx.lineTo(box.cx + apexHalf, apexY);
            ctx.closePath();
            ctx.fill();
        }

        // Schlieren im Kegel.
        const outer = reach * Math.tan((CONES[0].angle + 2) * DEG) + apexHalf;
        for (const bl of BLADES) {
            const drift = Math.sin(this.t * bl.speed + bl.phase) * 0.16;
            const at = bl.offset + drift;
            const xEnd = box.cx + at * outer;
            const wEnd = outer * bl.width * (1.1 + 0.5 * Math.sin(this.t * bl.speed * 1.7 + bl.phase));
            const a = bl.alpha * power * (0.5 + 0.5 * Math.sin(this.t * bl.speed * 2.3 + bl.phase));
            const g = ctx.createLinearGradient(box.cx, apexY, box.cx, endY);
            g.addColorStop(0, `rgba(${LIGHT_HOT}, ${a})`);
            g.addColorStop(0.5, `rgba(${LIGHT_CORE}, ${a * 0.45})`);
            g.addColorStop(1, `rgba(${LIGHT_MID}, 0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(box.cx - apexHalf * 0.24, apexY);
            ctx.lineTo(xEnd - wEnd, endY);
            ctx.lineTo(xEnd + wEnd, endY);
            ctx.lineTo(box.cx + apexHalf * 0.24, apexY);
            ctx.closePath();
            ctx.fill();
        }

        // Die beiden Schenkel des äussersten Dreiecks nachziehen.
        const edgeSway = Math.sin(this.t * CONES[0].swaySpeed) * CONES[0].sway;
        const half = reach * Math.tan((CONES[0].angle + edgeSway) * DEG) + apexHalf;
        const eg = ctx.createLinearGradient(box.cx, apexY, box.cx, endY);
        eg.addColorStop(0, `rgba(${LIGHT_HOT}, ${0.5 * power})`);
        eg.addColorStop(0.6, `rgba(${LIGHT_CORE}, ${0.12 * power})`);
        eg.addColorStop(1, `rgba(${LIGHT_MID}, 0)`);
        ctx.strokeStyle = eg;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(box.cx - apexHalf, apexY);
        ctx.lineTo(box.cx - half, endY);
        ctx.moveTo(box.cx + apexHalf, apexY);
        ctx.lineTo(box.cx + half, endY);
        ctx.stroke();
    }

    /** Anamorpher Blendbalken quer über dem zweiten C — das „Brillante". */
    private drawFlare(ctx: CanvasRenderingContext2D, box: GlyphBox, power: number) {
        const cy = (box.top + box.bottom) / 2;
        const breathe = 0.7 + 0.3 * Math.sin(this.t * 3.1);
        const len = box.w * 7 * breathe;
        const thick = box.h * 0.085;
        const g = ctx.createLinearGradient(box.cx - len / 2, cy, box.cx + len / 2, cy);
        g.addColorStop(0, `rgba(${LIGHT_MID}, 0)`);
        g.addColorStop(0.3, `rgba(${LIGHT_CORE}, ${0.16 * power})`);
        g.addColorStop(0.5, `rgba(${LIGHT_HOT}, ${0.5 * power * breathe})`);
        g.addColorStop(0.7, `rgba(${LIGHT_CORE}, ${0.16 * power})`);
        g.addColorStop(1, `rgba(${LIGHT_MID}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(box.cx, cy, len / 2, thick, 0, 0, TAU);
        ctx.fill();
    }
}
