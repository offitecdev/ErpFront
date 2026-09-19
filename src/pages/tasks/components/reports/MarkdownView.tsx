import { Fragment } from 'react';

import '@/styles/modules/tasksMarkdown.css';
import type { MdBlock, MdSpan } from './markdownDoc';

/**
 * Das freie Blatt auf dem Bildschirm (16.09.2026): dieselben Blöcke, die auch
 * das PDF zeichnet (`markdownDoc.ts` liest den Text, `workReportPdfLayout.ts`
 * druckt ihn). Genutzt in der Vorschau des Rapports UND in der Vorschau des
 * Gün sonu raporu — darum eigene Klassen (`ofi-md-*`), die überall gelten,
 * auch in einem Portal ausserhalb von #root.
 */

const Spans = ({ spans }: { spans: MdSpan[] }) => (
    <>
        {spans.map((span, index) => {
            if (span.text === '\n') return <br key={index} />;
            const className = [span.bold ? 'is-bold' : '', span.italic ? 'is-italic' : '', span.code ? 'is-code' : '']
                .filter(Boolean).join(' ');
            if (span.href) {
                return (
                    <a key={index} className={`ofi-md-link ${className}`.trim()} href={span.href} target="_blank" rel="noreferrer">
                        {span.text}
                    </a>
                );
            }
            return className ? <span key={index} className={className}>{span.text}</span> : <Fragment key={index}>{span.text}</Fragment>;
        })}
    </>
);

export const MarkdownView = ({ blocks, className = '' }: { blocks: MdBlock[]; className?: string }) => (
    <div className={`ofi-md ${className}`.trim()}>
        {blocks.map((block, index) => {
            switch (block.kind) {
                case 'heading': {
                    const Tag = (`h${block.level + 3}`) as 'h4' | 'h5' | 'h6';
                    return <Tag key={index} className={`ofi-md-h is-h${block.level}`}><Spans spans={block.spans} /></Tag>;
                }
                case 'list':
                    return block.ordered ? (
                        <ol key={index} className="ofi-md-list">
                            {block.items.map((item, position) => <li key={position}><Spans spans={item} /></li>)}
                        </ol>
                    ) : (
                        <ul key={index} className="ofi-md-list">
                            {block.items.map((item, position) => <li key={position}><Spans spans={item} /></li>)}
                        </ul>
                    );
                case 'quote':
                    return <blockquote key={index} className="ofi-md-quote"><Spans spans={block.spans} /></blockquote>;
                case 'rule':
                    return <hr key={index} className="ofi-md-rule" />;
                case 'image':
                    return (
                        <figure key={index} className="ofi-md-figure">
                            <img src={block.url} alt={block.alt} loading="lazy" />
                            {block.alt && <figcaption>{block.alt}</figcaption>}
                        </figure>
                    );
                default:
                    return <p key={index} className="ofi-md-p"><Spans spans={block.spans} /></p>;
            }
        })}
    </div>
);
