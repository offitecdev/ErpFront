import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuSend } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { Recipient } from './RecipientCombo';

/**
 * BESTÄTIGUNG VOR DEM SENDEN (Vorgabe 18.08.2026).
 *
 * Zeigt, WER die Mail bekommt: EINE gemischte Liste, Kunden und Mitarbeitende
 * durcheinander in der Reihenfolge, in der sie gewählt wurden — genau wie die
 * Personenauswahl im Kalender und beim CC (Vorgabe 18.08.2026). Wer wer ist,
 * sagt die leise Nebenzeile, nicht eine eigene Überschrift. Eine Mail an den
 * falschen Verteiler lässt sich nicht zurückholen; die halbe Sekunde Lesen
 * davor ist billiger.
 *
 * LAGE (Vorgabe 18.08.2026): direkt RECHTS neben der Schreiben-Karte, damit die
 * Namen unmittelbar neben dem Fenster stehen, aus dem sie stammen — kein
 * Fenster in der Bildschirmmitte, das den Bezug verliert. Passt rechts nichts
 * mehr hin, weicht die Karte nach links aus und bleibt notfalls am Rand
 * kleben; sie soll nie halb aus dem Bild ragen.
 *
 * Kein Abdunkeln des Hintergrunds (Modulregel): die Schreiben-Karte bleibt
 * sichtbar und behält ihre Eingaben. Escape und ein Klick daneben brechen ab.
 */

const GAP = 12;
const MARGIN = 10;
const WIDTH = 340;

/** Leise Nebenzeile: Mitarbeitende als solche, Ansprechpartner mit ihrer Firma. */
const roleOf = (recipient: Recipient): string | null => {
    // Dieselbe kurze Vokabel wie der Merker in der Nachrichtenliste.
    if (recipient.kind === 'EMPLOYEE') return t('mail.page.internal');
    return recipient.subtitle || null;
};

export const SendConfirmPopup = ({
    open,
    anchorRect,
    to,
    cc,
    subject,
    sending,
    onCancel,
    onConfirm,
}: {
    open: boolean;
    /** Die Schreiben-Karte; die Bestätigung stellt sich rechts daneben. */
    anchorRect: DOMRect | null;
    to: Recipient[];
    cc: Recipient[];
    subject: string;
    sending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) => {
    const cardRef = useRef<HTMLElement | null>(null);
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

    // Erst grob setzen, dann mit der wirklichen Höhe nachziehen — sonst
    // springt die Karte beim ersten Bild oder ragt unten heraus.
    useLayoutEffect(() => {
        if (!open) { setPos(null); return; }
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const height = cardRef.current?.offsetHeight ?? 260;
        const anchor = anchorRect;
        if (!anchor) {
            setPos({ x: Math.max(MARGIN, (vw - WIDTH) / 2), y: Math.max(MARGIN, (vh - height) / 2) });
            return;
        }
        // RECHTS daneben; passt es nicht, links daneben; sonst an den Rand.
        let x = anchor.right + GAP;
        if (x + WIDTH > vw - MARGIN) x = anchor.left - WIDTH - GAP;
        if (x < MARGIN) x = Math.max(MARGIN, vw - WIDTH - MARGIN);
        // Oberkanten bündig, aber vollständig im Bild.
        const y = Math.min(Math.max(MARGIN, anchor.top), Math.max(MARGIN, vh - height - MARGIN));
        setPos({ x, y });
    }, [open, anchorRect, to, cc]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;

    // CC-Empfänger stehen in derselben Gruppe, nur mit einem Merker — sie
    // bekommen die Mail schliesslich genauso.
    const all: Array<Recipient & { viaCc: boolean }> = [
        ...to.map((recipient) => ({ ...recipient, viaCc: false })),
        ...cc.map((recipient) => ({ ...recipient, viaCc: true })),
    ];

    return createPortal(
        <section
            ref={cardRef}
            role="dialog"
            aria-modal="false"
            data-cal-stacked="1"
            className="ofi-mailconfirm-card"
            style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, width: WIDTH }}
        >
            <header className="ofi-mailconfirm-card__head">
                <div className="ofi-mailconfirm-card__title">{t('mail.confirm.title')}</div>
                {subject && <div className="ofi-mailconfirm-card__subtitle" title={subject}>{subject}</div>}
            </header>

            <div className="ofi-mailconfirm">
                {/* Eine Liste, eine Zeile je Person — nicht nach Art getrennt. */}
                <ul className="ofi-mailconfirm__list">
                    {all.map((recipient) => (
                        <li key={`${recipient.email}-${recipient.viaCc ? 'cc' : 'to'}`} className="ofi-mailconfirm__row">
                            <span className="ofi-mailconfirm__name">
                                {recipient.name || recipient.email}
                                {roleOf(recipient) && <span className="ofi-mailconfirm__sub"> · {roleOf(recipient)}</span>}
                            </span>
                            <span className="ofi-mailconfirm__mail">{recipient.email}</span>
                            {recipient.viaCc && <span className="ofi-mailconfirm__cc">Cc</span>}
                        </li>
                    ))}
                </ul>
                {!all.length && <p className="ofi-mailconfirm__empty">{t('mail.compose.invalidTo')}</p>}
            </div>

            <footer className="ofi-mailconfirm__footer">
                <button type="button" className="ofi-cal-btn" onClick={onCancel} disabled={sending}>
                    {t('common.cancel')}
                </button>
                <button type="button" className="ofi-cal-btn is-primary" onClick={onConfirm} disabled={sending}>
                    <LuSend size={14} />
                    {sending ? t('mail.compose.sending') : t('mail.confirm.send', { count: all.length })}
                </button>
            </footer>
        </section>,
        document.body,
    );
};
