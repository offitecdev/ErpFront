import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AlertTriangle, RefreshCcw01 } from '@/components/icons/antIconCompat';
import { PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { ospApi, type OspUnitMarkdownDto } from '@/lib/api/osp';
import '@/styles/modules/osp.css';

/**
 * ── DAS DATENBLATT ALS TEXT (21.09.2026) ─────────────────────────────────────
 *
 * Bis hierher gab es das Datenblatt nur als PDF — und wenn die Datei fehlte
 * (die OSP ersetzt sie bei jeder Neuberechnung, und die alte wird drüben
 * gelöscht), stand man ohne alles da. Die Markdown-Fassung ist dieselbe
 * Momentaufnahme in lesbarer Form: oben die PRODUKTANGABEN als Tabelle,
 * darunter das ganze Blatt.
 *
 * Sie ist zugleich die QUELLE dieser Angaben. Wer auf der Offerte eine Zahl
 * nachprüfen will, liest hier nach — ohne ein PDF zu öffnen, und auch dann,
 * wenn es das PDF drüben nicht mehr gibt.
 *
 * Gezeichnet wird von Hand: die Anwendung nimmt keine fremden Bausteine
 * (siehe „No antd in new UI"), und der Markdown, den wir selbst erzeugen,
 * kennt genau vier Formen — Überschrift, Tabelle, Aufzählung, Absatz.
 */

type Block =
    | { kind: 'heading'; level: number; text: string }
    | { kind: 'table'; rows: string[][] }
    | { kind: 'list'; items: Array<{ label: string; value: string }> }
    | { kind: 'text'; text: string };

const splitRow = (line: string): string[] => line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.replace(/\\\|/g, '|').trim());

/** Markdown → Blöcke. Was keiner Form entspricht, bleibt Absatz — nie leer. */
const parseBlocks = (markdown: string): Block[] => {
    const blocks: Block[] = [];
    const lines = String(markdown || '').split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
        const line = (lines[index] || '').trim();
        if (!line) continue;

        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            blocks.push({ kind: 'heading', level: (heading[1] || '#').length, text: heading[2] || '' });
            continue;
        }

        if (line.startsWith('|')) {
            const rows: string[][] = [];
            while (index < lines.length && (lines[index] || '').trim().startsWith('|')) {
                const cells = splitRow((lines[index] || '').trim());
                // Die Trennzeile |---|---| gehört zur Form, nicht zum Inhalt.
                if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
                index += 1;
            }
            index -= 1;
            if (rows.length) blocks.push({ kind: 'table', rows });
            continue;
        }

        if (/^[-*]\s+/.test(line)) {
            const items: Array<{ label: string; value: string }> = [];
            while (index < lines.length && /^[-*]\s+/.test((lines[index] || '').trim())) {
                const item = (lines[index] || '').trim().replace(/^[-*]\s+/, '');
                const split = /^\*{0,2}(.+?)\*{0,2}\s*:\s*(.*)$/.exec(item);
                items.push(split
                    ? { label: (split[1] || '').replace(/\*/g, '').trim(), value: (split[2] || '').trim() }
                    : { label: '', value: item.replace(/\*/g, '') });
                index += 1;
            }
            index -= 1;
            blocks.push({ kind: 'list', items });
            continue;
        }

        blocks.push({ kind: 'text', text: line.replace(/^_|_$/g, '') });
    }
    return blocks;
};

export const OspDatasheetSheet = ({
    unitId,
    title,
    onClose,
}: {
    unitId: string | null;
    title: string;
    onClose: () => void;
}) => {
    const [data, setData] = useState<OspUnitMarkdownDto | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!unitId) { setData(null); return; }
        let cancelled = false;
        setLoading(true);
        ospApi.unitMarkdown(unitId)
            .then((row) => { if (!cancelled) setData(row); })
            .catch((error: any) => {
                if (!cancelled) toast.error(error?.response?.data?.error || t('osp.datasheetFailed'));
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [unitId]);

    const blocks = useMemo(() => parseBlocks(data?.datasheetMarkdown || ''), [data]);

    return (
        <PopupDialog
            open={Boolean(unitId)}
            onClose={onClose}
            title={t('osp.markdown.title')}
            subtitle={title}
            width={760}
        >
            <div className="ofi-osp-md">
                {loading && <p className="ofi-osp-md__note">{t('osp.datasheetLoading')}</p>}

                {!loading && !data?.datasheetMarkdown && (
                    <p className="ofi-osp-md__note">
                        <AlertTriangle size={14} />
                        {data?.datasheetError || t('osp.markdown.empty')}
                    </p>
                )}

                {!loading && data?.datasheetMarkdown && blocks.map((block, index) => {
                    if (block.kind === 'heading') {
                        return block.level <= 1
                            ? <h3 key={index} className="ofi-osp-md__h1">{block.text}</h3>
                            : <h4 key={index} className="ofi-osp-md__h2">{block.text}</h4>;
                    }
                    if (block.kind === 'table') {
                        const [head, ...body] = block.rows;
                        return (
                            <table key={index} className="ofi-osp-md__table">
                                {head && (
                                    <thead>
                                        <tr>{head.map((cell, cellIndex) => <th key={cellIndex}>{cell}</th>)}</tr>
                                    </thead>
                                )}
                                <tbody>
                                    {body.map((row, rowIndex) => (
                                        <tr key={rowIndex}>
                                            {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        );
                    }
                    if (block.kind === 'list') {
                        return (
                            <dl key={index} className="ofi-osp-md__list">
                                {block.items.map((item, itemIndex) => (
                                    <div key={itemIndex}>
                                        {item.label && <dt>{item.label}</dt>}
                                        <dd>{item.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        );
                    }
                    return <p key={index} className="ofi-osp-md__text">{block.text}</p>;
                })}

                {/* Woher die Fassung stammt: aus dem Blatt der OSP, zu einem
                    bestimmten Zeitpunkt geholt. Ohne das läse sich die Tabelle
                    wie eine Eingabe von uns. */}
                {!loading && data?.markdownFetchedAt && (
                    <p className="ofi-osp-md__origin">
                        <RefreshCcw01 size={11} />
                        {t('osp.markdown.fetchedAt', {
                            date: new Date(data.markdownFetchedAt).toLocaleString('de-CH', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                            }),
                        })}
                    </p>
                )}
            </div>
        </PopupDialog>
    );
};

export default OspDatasheetSheet;
