import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';

export type FlowStep = { id: string; label: string };

type Props = {
    /** Die Überschrift über der Leiste — sagt, WOVON dies der Weg ist. */
    title: string;
    /** Die Stationen, in der Reihenfolge, in der sie auf der Seite stehen. */
    steps: FlowStep[];
    /** Der Stapel, in dem die Abschnitte liegen (jeder trägt `data-flow-step`). */
    stackRef: RefObject<HTMLElement | null>;
};

/* Die Lesezeile: das Band füllt sich bis zu dem Abschnitt, der auf dieser Höhe
   des Fensters steht — nicht erst, wenn er oben anstösst. 28 % ist die Höhe,
   auf der das Auge beim Scrollen liest. */
const ANCHOR_RATIO = 0.28;

/* Die Seite scrollt NICHT im Fenster, sondern in der Hauptfläche der Schale
   (`MainLayout`, ein `overflow-auto`-Kasten). Also den ersten Vorfahren suchen,
   der wirklich scrollt. */
const findScrollPort = (el: HTMLElement | null): HTMLElement | null => {
    let node = el?.parentElement ?? null;
    while (node) {
        const { overflowY } = window.getComputedStyle(node);
        if (overflowY === 'auto' || overflowY === 'scroll') return node;
        node = node.parentElement;
    }
    return null;
};

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * ── DIE SEITENLEISTE ALS WEG (22.09.2026) ─────────────────────────────────
 *
 * Vorgabe Samet: «Siparişlerde ve fiyat [talebi] ayarlarında solda bir başlık
 * şeyi olması lazım, yan başlık gibi … süreç gibi görmesi lazım hepsini
 * kullanıcının, yani aşağıya indikçe o şeyin dolması gerekiyor.»
 *
 * Links steht darum kein blosses Inhaltsverzeichnis, sondern ein Weg: jede
 * Kiste des Stapels ist eine Station, das Band zwischen den Punkten FÜLLT SICH
 * beim Runterscrollen, und man sieht mit einem Blick, was noch kommt. Ein Klick
 * auf eine Station springt zu ihr.
 *
 * Die Leiste misst selbst — sie braucht keine feste Zeilenhöhe: die Mitte jedes
 * Punktes wird gemessen, das gefüllte Stück läuft von der ersten Mitte bis
 * dorthin, wo die Lesezeile gerade zwischen zwei Punkten steht.
 */
export const FlowRail = ({ title, steps, stackRef }: Props) => {
    const listRef = useRef<HTMLDivElement | null>(null);
    const markRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const [state, setState] = useState({ index: 0, top: 0, len: 0, fill: 0 });

    const stepKey = steps.map((step) => step.id).join('|');

    const measure = useCallback(() => {
        const stack = stackRef.current;
        const list = listRef.current;
        if (!stack || !list || steps.length === 0) return;

        const port = findScrollPort(stack);
        const portTop = port ? port.getBoundingClientRect().top : 0;
        const portHeight = port ? port.clientHeight : window.innerHeight;
        const anchor = portTop + portHeight * ANCHOR_RATIO;

        /* Wo steht jeder Abschnitt gerade? Fehlt einer (er wird gerade nicht
           gezeichnet), erbt er die Höhe seines Vorgängers und ändert nichts. */
        let previous = anchor - 1;
        const tops = steps.map((step) => {
            const node = stack.querySelector<HTMLElement>(`[data-flow-step="${step.id}"]`);
            if (!node) return previous;
            previous = node.getBoundingClientRect().top;
            return previous;
        });

        let index = 0;
        for (let i = 0; i < tops.length; i += 1) if (tops[i] <= anchor) index = i;
        let ratio = 0;
        const nextTop = tops[index + 1];
        if (nextTop !== undefined) ratio = clamp01((anchor - tops[index]) / Math.max(nextTop - tops[index], 1));
        /* Ganz unten ist ALLES gesehen — auch wenn die letzte Kiste zu niedrig
           ist, als dass die Lesezeile sie je erreichen könnte. Dasselbe gilt für
           eine Seite, die gar nicht scrollt. */
        const atEnd = !port || port.scrollTop + port.clientHeight >= port.scrollHeight - 2;
        if (atEnd) { index = tops.length - 1; ratio = 0; }

        /* Die Mitten der Punkte, gemessen am Kasten der Liste — so ist es egal,
           welches Element gerade `offsetParent` ist. */
        const listTop = list.getBoundingClientRect().top;
        const centreOf = (i: number): number | null => {
            const mark = markRefs.current[i];
            if (!mark) return null;
            const rect = mark.getBoundingClientRect();
            return rect.top + rect.height / 2 - listTop;
        };
        const first = centreOf(0);
        const last = centreOf(steps.length - 1);
        if (first === null || last === null) return;
        const here = centreOf(index) ?? first;
        const there = centreOf(index + 1) ?? here;

        const next = {
            index,
            top: Math.round(first),
            len: Math.max(0, Math.round(last - first)),
            fill: Math.max(0, Math.round(here + (there - here) * ratio - first)),
        };
        /* Der Scroll-Handler läuft in JEDEM Bild: bleibt alles, wie es war,
           gibt er denselben Wert zurück und React zeichnet nichts neu. */
        setState((current) => (
            current.index === next.index && current.top === next.top
                && current.len === next.len && current.fill === next.fill
                ? current
                : next
        ));
    }, [stackRef, stepKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useLayoutEffect(() => { measure(); }, [measure]);

    useEffect(() => {
        const stack = stackRef.current;
        if (!stack) return;
        const port = findScrollPort(stack);
        let frame = 0;
        const onScroll = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(() => { frame = 0; measure(); });
        };
        (port ?? window).addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        /* Wächst eine Kiste (ein Anschreiben wird länger, eine Zusatzkostenzeile
           kommt dazu), rücken alle Punkte — also auch dann neu messen. */
        const observer = new ResizeObserver(onScroll);
        observer.observe(stack);
        if (listRef.current) observer.observe(listRef.current);
        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            (port ?? window).removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            observer.disconnect();
        };
    }, [measure, stackRef]);

    const goTo = (id: string) => {
        const stack = stackRef.current;
        const node = stack?.querySelector<HTMLElement>(`[data-flow-step="${id}"]`);
        if (!stack || !node) return;
        const port = findScrollPort(stack);
        if (!port) { node.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        const delta = node.getBoundingClientRect().top - port.getBoundingClientRect().top - 12;
        port.scrollTo({ top: port.scrollTop + delta, behavior: 'smooth' });
    };

    /* Bei einer einzigen Station ist ein Weg keiner. */
    if (steps.length < 2) return null;

    return (
        <nav className="ofi-ows-rail" aria-label={title}>
            <div className="ofi-ows-rail__head">
                <span>{title}</span>
                <em>{state.index + 1}/{steps.length}</em>
            </div>
            <div
                className="ofi-ows-rail__list"
                ref={listRef}
                style={{
                    '--rail-top': `${state.top}px`,
                    '--rail-len': `${state.len}px`,
                    '--rail-fill': `${state.fill}px`,
                } as CSSProperties}
            >
                <span className="ofi-ows-rail__track" aria-hidden="true" />
                <span className="ofi-ows-rail__fill" aria-hidden="true" />
                {steps.map((step, i) => (
                    <button
                        key={step.id}
                        type="button"
                        className="ofi-ows-rail__step"
                        data-state={i < state.index ? 'done' : i === state.index ? 'now' : 'next'}
                        aria-current={i === state.index ? 'step' : undefined}
                        onClick={() => goTo(step.id)}
                    >
                        <span
                            className="ofi-ows-rail__mark"
                            ref={(el) => { markRefs.current[i] = el; }}
                            aria-hidden="true"
                        />
                        <span className="ofi-ows-rail__label">{step.label}</span>
                    </button>
                ))}
            </div>
        </nav>
    );
};
