import { useEffect, useMemo, useState } from 'react';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { CONTACT_MARKERS, GREETINGS, splitMailBody } from './mailBodyParts';

/* DER RUMPF EINER NACHRICHT — aufgeräumt statt als Textwand (08.09.2026).
 *
 * Zwei Wege, ein Bild:
 *
 *   bodyHtml   Neue Nachrichten tragen das BEREINIGTE HTML (nur Formatierung —
 *              fett, Absätze, Listen, Tabellen; sanitizeMailHtml, Server).
 *              Es wird im Browser zerlegt: oben das neu Geschriebene, darunter
 *              zugeklappt die SIGNATUR und der bisherige VERLAUF — die
 *              zitierten Vorgänger hierarchisch eingerückt, jeder mit seiner
 *              Kopfzeile («Von: …», «Am … schrieb …»).
 *   bodyText   Ältere Nachrichten (vor dem Umbau) haben nur Text; für sie
 *              zerlegt `splitMailBody` wie bisher.
 *
 * EIN Klick öffnet ALLES: der Signatur-Knopf zeigt die ganze Signatur, der
 * Verlaufs-Knopf alle Vorgänger auf einmal (Vorgabe 08.09.2026: «beim Klick
 * auf die Signatur sollen alle Signaturbereiche aufgehen») — kein Knopf je
 * Abschnitt, hinter dem noch ein Knopf wartet.
 *
 * Das HTML kommt IMMER vom eigenen Server und ist dort bereinigt worden
 * (sanitizeMailHtml lässt nur Formatierungs-Tags durch, keine Skripte, keine
 * Bilder, nur http(s)/mailto-Links) — darum darf es hier direkt gerendert
 * werden. */

interface HtmlSection {
    /** Die Kopfzeile des Abschnitts («Von: …», «Am … schrieb …») — falls erkannt. */
    header: string | null;
    html: string;
    /** Zitattiefe: je Antwort-Ebene eine Einrückung. */
    depth: number;
}

interface HtmlParts {
    bodyHtml: string;
    signatureHtml: string | null;
    quoted: HtmlSection[];
}

/** Sieht dieser Block wie die Kopfzeile eines zitierten Vorgängers aus? */
const isQuoteHeaderBlock = (el: Element): boolean => {
    const text = (el.textContent || '').trim();
    if (!text || text.length > 400) return false;
    // Outlook-Kopfblock: «Von: … Gesendet: … An: … Betreff: …» in einem Block.
    if (/^(von|from|kimden|de)\s*:/i.test(text) && /(gesendet|sent|an\s*:|to\s*:|betreff|subject|konu)/i.test(text)) return true;
    // «Am 12.08.2026 um 09:14 schrieb Max Muster:» / "On … wrote:"
    if (/^(am|on)\b[\s\S]{0,160}\b(schrieb|wrote)\b/i.test(text) && text.length < 240) return true;
    if (/şunu yazdı\s*:\s*$/i.test(text) || /sunu yazdi\s*:\s*$/i.test(text)) return true;
    // «-----Ursprüngliche Nachricht-----»
    if (/^-{2,}\s*(original message|ursprüngliche nachricht|weitergeleitete nachricht|forwarded message|orijinal ileti)\s*-{2,}$/i.test(text)) return true;
    return false;
};

/** Beginnt an diesem Block der zitierte Verlauf? */
const isQuoteBoundary = (el: Element): boolean => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'blockquote') return true;
    if (tag === 'hr') return true;
    const id = String(el.getAttribute('id') || '').toLowerCase();
    // Die Markierungen, die Outlook selbst in Antworten setzt.
    if (id === 'appendonsend' || id === 'divrplyfwdmsg' || id === 'stopspelling') return true;
    return isQuoteHeaderBlock(el);
};

const serialize = (nodes: Node[]): string => {
    const holder = document.createElement('div');
    for (const node of nodes) holder.appendChild(node.cloneNode(true));
    return holder.innerHTML.trim();
};

/** Den Verlauf in Abschnitte zerlegen: jede Kopfzeile beginnt einen neuen,
    jedes blockquote eine Ebene tiefer. */
const collectSections = (nodes: Node[], depth: number, out: HtmlSection[]): void => {
    let header: string | null = null;
    let buffer: Node[] = [];
    const flush = () => {
        const html = serialize(buffer);
        if (html || header) out.push({ header, html, depth });
        header = null;
        buffer = [];
    };
    for (const node of nodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            const tag = el.tagName.toLowerCase();
            if (tag === 'blockquote') {
                flush();
                collectSections(Array.from(el.childNodes), depth + 1, out);
                continue;
            }
            if (tag === 'hr') { flush(); continue; }
            if (isQuoteHeaderBlock(el)) {
                flush();
                header = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200) || null;
                continue;
            }
        }
        buffer.push(node);
    }
    flush();
};

/** Zeilenzahl eines Blocks — grob, für die Visitenkarten-Erkennung. */
const lineCountOf = (text: string): number => text.split('\n').filter((line) => line.trim()).length;

/**
 * Signatur im HAUPTTEIL finden: von hinten die letzte Grussformel, hinter der
 * eine Visitenkarte steht (dieselben Merkmale wie in `mailBodyParts`, nur auf
 * Blöcke statt Zeilen angewandt). Gefunden → die Blöcke NACH der Formel sind
 * die Signatur; die Formel selbst bleibt bei der Nachricht.
 */
const splitSignature = (blocks: Node[]): { body: Node[]; signature: Node[] } => {
    const textOf = (node: Node) => (node.textContent || '').trim();
    for (let index = blocks.length - 1; index > 0; index -= 1) {
        const text = textOf(blocks[index]!);
        if (!text) continue;
        const firstLine = text.split('\n')[0] || '';
        if (!GREETINGS.some((pattern) => pattern.test(firstLine))) continue;
        const trailing = blocks.slice(index + 1);
        const block = trailing.map(textOf).filter(Boolean).join('\n');
        if (!block || lineCountOf(block) > 30) continue;
        const markers = CONTACT_MARKERS.filter((pattern) => pattern.test(block)).length;
        if (markers < 2) continue;
        if (!blocks.slice(0, index).some((node) => textOf(node))) continue;
        return { body: blocks.slice(0, index + 1), signature: trailing };
    }
    return { body: blocks, signature: [] };
};

const splitMailHtml = (html: string): HtmlParts => {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    let root: Element = doc.body;
    // Einen einzelnen umhüllenden <div> auspacken, bis Blöcke daliegen.
    while (root.childNodes.length === 1 && root.firstElementChild && root.firstElementChild === root.firstChild) {
        const only = root.firstElementChild;
        if (['div', 'span', 'font'].includes(only.tagName.toLowerCase()) && !isQuoteBoundary(only)) root = only;
        else break;
    }
    const blocks = Array.from(root.childNodes);

    // Wo beginnt der zitierte Verlauf?
    let boundary = -1;
    for (let index = 0; index < blocks.length; index += 1) {
        const node = blocks[index]!;
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (isQuoteBoundary(node as Element)) {
            // Ganz vorn ist es kein Verlauf, sondern die Nachricht selbst
            // (eine Weiterleitung ohne eigenen Text).
            const before = blocks.slice(0, index).some((prev) => (prev.textContent || '').trim());
            if (before) { boundary = index; break; }
        }
    }

    const mainBlocks = boundary >= 0 ? blocks.slice(0, boundary) : blocks;
    const quotedBlocks = boundary >= 0 ? blocks.slice(boundary) : [];

    const { body, signature } = splitSignature(mainBlocks);
    const quoted: HtmlSection[] = [];
    collectSections(quotedBlocks, 0, quoted);

    return {
        bodyHtml: serialize(body),
        signatureHtml: signature.length ? serialize(signature) : null,
        quoted: quoted.filter((section) => section.html || section.header),
    };
};

const Toggle = ({ open, label, onClick }: { open: boolean; label: string; onClick: () => void }) => (
    <button type="button" className="ofi-mail-quotes__toggle" onClick={onClick}>
        {open ? <LuChevronDown size={13} /> : <LuChevronRight size={13} />}
        {label}
    </button>
);

export const MailBodyView = ({ html, text }: { html: string | null; text: string | null }) => {
    const [openQuotes, setOpenQuotes] = useState(false);
    const [openSignature, setOpenSignature] = useState(false);
    // Eine andere Nachricht fängt wieder zugeklappt an.
    useEffect(() => { setOpenQuotes(false); setOpenSignature(false); }, [html, text]);

    const htmlParts = useMemo(() => (html ? splitMailHtml(html) : null), [html]);
    const textParts = useMemo(() => (html ? null : splitMailBody(text)), [html, text]);

    const empty = htmlParts
        ? !htmlParts.bodyHtml && !htmlParts.quoted.length && !htmlParts.signatureHtml
        : !textParts?.body && !textParts?.quoted.length && !textParts?.signature;
    if (empty) {
        return <div className="ofi-mail-reader__body"><span className="ofi-mail-reader__nobody">{t('mail.reader.noBody')}</span></div>;
    }

    const quotedCount = htmlParts ? htmlParts.quoted.length : (textParts?.quoted.length || 0);
    const hasSignature = htmlParts ? Boolean(htmlParts.signatureHtml) : Boolean(textParts?.signature);

    return (
        <div className="ofi-mail-reader__body">
            {htmlParts
                ? (htmlParts.bodyHtml
                    ? <div className="ofi-mail-html" dangerouslySetInnerHTML={{ __html: htmlParts.bodyHtml }} />
                    : <span className="ofi-mail-reader__nobody">{t('mail.reader.noBody')}</span>)
                : (textParts?.body
                    ? <div className="ofi-mail-plain">{textParts.body}</div>
                    : <span className="ofi-mail-reader__nobody">{t('mail.reader.noBody')}</span>)}

            {/* Die Signatur — EIN Klick öffnet sie GANZ (Vorgabe 08.09.2026). */}
            {hasSignature && (
                <div className="ofi-mail-quotes">
                    <Toggle open={openSignature} label={t('mail.reader.signature')} onClick={() => setOpenSignature((open) => !open)} />
                    {openSignature && (htmlParts
                        ? <div className="ofi-mail-html ofi-mail-quote__text is-signature" dangerouslySetInnerHTML={{ __html: htmlParts.signatureHtml! }} />
                        : <div className="ofi-mail-plain ofi-mail-quote__text is-signature">{textParts!.signature}</div>)}
                </div>
            )}

            {/* Der bisherige Verlauf — hierarchisch eingerückt, jüngster oben. */}
            {quotedCount > 0 && (
                <div className="ofi-mail-quotes">
                    <Toggle
                        open={openQuotes}
                        label={t('mail.reader.earlierMessages', { count: quotedCount })}
                        onClick={() => setOpenQuotes((open) => !open)}
                    />
                    {openQuotes && htmlParts && htmlParts.quoted.map((section, index) => (
                        <div key={index} className="ofi-mail-quote" style={{ marginLeft: Math.min(section.depth, 6) * 14 }}>
                            {section.header && <div className="ofi-mail-quote__head">{section.header}</div>}
                            {section.html && <div className="ofi-mail-html ofi-mail-quote__text" dangerouslySetInnerHTML={{ __html: section.html }} />}
                        </div>
                    ))}
                    {openQuotes && !htmlParts && textParts!.quoted.map((part, index) => (
                        <div key={index} className="ofi-mail-quote" style={{ marginLeft: Math.min(index, 6) * 14 }}>
                            {part.header && <div className="ofi-mail-quote__head">{part.header}</div>}
                            <div className="ofi-mail-plain ofi-mail-quote__text">{part.text}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
