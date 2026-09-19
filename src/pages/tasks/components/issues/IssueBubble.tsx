import type { ReactNode } from 'react';
import { LuDownload, LuFile, LuFileText } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { attachmentUrl } from '@/lib/api/tasksModule';
import type { IssueMessage, PeopleMap, TaskAttachment } from '@/types/tasksModule';
import { formatBytes, formatTime, personName } from '../../utils/taskFormat';

/**
 * EINE SPRECHBLASE — GEGENÜBER (16.09.2026, 2. Runde; Samet: «iphone wp gibi
 * olmalı … aynısı olmasın ama benzer bi şey»).
 *
 * Wie im Messenger auf dem Telefon: die EIGENE Nachricht steht RECHTS in der
 * getönten Blase, fremde LINKS in der hellgrauen — beide mit dem kleinen Zipfel
 * an der unteren Ecke, die Uhrzeit leise IN der Blase. Nicht WhatsApp: kein
 * Grün, kein gemustertes Papier; die Töne des Hauses (Apple-Blau, helles Grau).
 *
 * Text, Bild und PDF stehen IN derselben Blase — kein Anhangstreifen daneben.
 * Markierungen («@Name», «@Görev») hebt `withMentions` im Akzentton hervor.
 */

/** «@Name» im Satz einfärben — erkannt werden nur die Markierungen DIESES Fadens. */
const withMentions = (text: string, labels: readonly string[]): ReactNode => {
    const known = [...labels].filter(Boolean).sort((left, right) => right.length - left.length);
    if (!known.length) return text;
    const out: ReactNode[] = [];
    let rest = text;
    let key = 0;
    while (rest.length) {
        let at = -1;
        let hit = '';
        for (const label of known) {
            const found = rest.indexOf(`@${label}`);
            if (found >= 0 && (at < 0 || found < at)) {
                at = found;
                hit = label;
            }
        }
        if (at < 0) {
            out.push(rest);
            break;
        }
        if (at > 0) out.push(rest.slice(0, at));
        key += 1;
        out.push(<b key={key} className="ofi-gv-issue-mention">@{hit}</b>);
        rest = rest.slice(at + hit.length + 1);
    }
    return out;
};

export const IssueBubble = ({
    message,
    people,
    tone,
    own,
    /** Erste Blase einer Reihe derselben Person: nur sie trägt den Namen und den Zipfel. */
    first,
    last,
    mentionLabels,
}: {
    message: IssueMessage;
    people: PeopleMap;
    tone: 'question' | 'issue';
    own: boolean;
    first: boolean;
    last: boolean;
    mentionLabels: readonly string[];
}) => {
    const images = message.attachments.filter((file) => file.isImage);
    const files = message.attachments.filter((file) => !file.isImage);
    return (
        <article className={`ofi-gv-issue-msg ${own ? 'is-own' : 'is-other'} ${first ? 'is-first' : ''} ${last ? 'is-last' : ''}`}>
            {!own && first && (
                <div className={`ofi-gv-issue-msg__author is-${tone}`}>{personName(people, message.authorId)}</div>
            )}
            <div className="ofi-gv-issue-bubble">
                {message.text && (
                    <p className="ofi-gv-issue-bubble__text">{withMentions(message.text, mentionLabels)}</p>
                )}
                {images.length > 0 && (
                    <div className="ofi-gv-issue-bubble__images">
                        {images.map((image) => (
                            <a
                                key={image.id}
                                href={attachmentUrl(image)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={image.fileName}
                                aria-label={t('tasksModule.issues.openImage', { name: image.fileName })}
                            >
                                <img src={attachmentUrl(image)} alt={image.fileName} loading="lazy" decoding="async" />
                            </a>
                        ))}
                    </div>
                )}
                {files.map((file: TaskAttachment) => (
                    <a
                        key={file.id}
                        href={attachmentUrl(file)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ofi-gv-issue-file"
                        title={file.fileName}
                    >
                        <span className="ofi-gv-issue-file__icon" aria-hidden>
                            {file.isPdf ? <LuFileText size={17} /> : <LuFile size={17} />}
                        </span>
                        <span className="ofi-gv-issue-file__body">
                            <span className="ofi-gv-issue-file__name">{file.fileName}</span>
                            <span className="ofi-gv-issue-file__size">{formatBytes(file.sizeBytes)}</span>
                        </span>
                        <LuDownload size={14} aria-hidden />
                    </a>
                ))}
                <time className="ofi-gv-issue-bubble__time" dateTime={message.createdAt}>
                    {formatTime(message.createdAt)}
                </time>
            </div>
        </article>
    );
};
