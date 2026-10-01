import { AlertTriangle, Check, Send } from 'lucide-react';

import type { DispatchPhase } from './dispatchModel';

/**
 * ── DAS BLATT, DAS SICH SCHREIBT ───────────────────────────────────────────
 * Ein kleines A4-Blatt mit Eselsohr: solange das PDF entsteht, laufen seine
 * Zeilen von links herein (nacheinander, wie getippt); ist es fertig, trägt
 * es die Nummer des Belegs und das rote «PDF»-Schild springt auf.
 */
export const PaperGlyph = ({ phase, code }: { phase: DispatchPhase; code: string }) => {
    const writing = phase === 'pdf';
    const done = phase === 'sending' || phase === 'sent' || phase === 'preview';
    return (
        <span className={`ofi-dsp-paper${writing ? ' is-writing' : ''}${done ? ' is-done' : ''}${phase === 'failed' || phase === 'skipped' ? ' is-off' : ''}`} aria-hidden>
            <span className="ofi-dsp-paper__fold" />
            <span className="ofi-dsp-paper__lines">
                {[0, 1, 2, 3, 4].map((line) => <i key={line} style={{ animationDelay: `${line * 140}ms` }} />)}
            </span>
            <span className="ofi-dsp-paper__code">{code}</span>
            <b className="ofi-dsp-paper__badge">PDF</b>
        </span>
    );
};

/**
 * Das Zeichen rechts: ein sich drehender Ring (arbeitet), der Papierflieger
 * (fliegt los), das grüne Häkchen, das sich zeichnet (gesendet), oder das
 * gelbe Warnzeichen (übersprungen / gescheitert). Nie ein Balken.
 */
export const StatusGlyph = ({ phase }: { phase: DispatchPhase }) => {
    if (phase === 'sent' || phase === 'preview') {
        return (
            <span className={`ofi-dsp-status is-done${phase === 'preview' ? ' is-preview' : ''}`} aria-hidden>
                <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10.5" className="ofi-dsp-status__disc" />
                    <path d="M7.2 12.4l3.2 3.2 6.4-6.8" className="ofi-dsp-status__tick" />
                </svg>
            </span>
        );
    }
    if (phase === 'failed' || phase === 'skipped') {
        return <span className="ofi-dsp-status is-warn" aria-hidden><AlertTriangle /></span>;
    }
    if (phase === 'sending') {
        return <span className="ofi-dsp-status is-plane" aria-hidden><Send /></span>;
    }
    if (phase === 'pdf') {
        return (
            <span className="ofi-dsp-status is-spin" aria-hidden>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /></svg>
            </span>
        );
    }
    return <span className="ofi-dsp-status is-wait" aria-hidden><Check /></span>;
};

/** Der Ring im Kopf: «2/3» — wie weit der Stapel ist (kein Balken). */
export const CountRing = ({ done, total }: { done: number; total: number }) => {
    const r = 15;
    const c = 2 * Math.PI * r;
    const share = total > 0 ? Math.min(1, done / total) : 0;
    return (
        <span className={`ofi-dsp-ring${share >= 1 ? ' is-full' : ''}`} aria-hidden>
            <svg viewBox="0 0 36 36">
                <circle cx="18" cy="18" r={r} className="ofi-dsp-ring__track" />
                <circle
                    cx="18"
                    cy="18"
                    r={r}
                    className="ofi-dsp-ring__arc"
                    strokeDasharray={`${(c * share).toFixed(2)} ${c.toFixed(2)}`}
                    transform="rotate(-90 18 18)"
                />
            </svg>
            <b>{done}/{total}</b>
        </span>
    );
};
