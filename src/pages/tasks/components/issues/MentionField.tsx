import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LuUser } from 'react-icons/lu';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';
import type { TaskSearchHit } from '@/types/tasksModule';
import { useChatTaskSearch } from '../../hooks/useChatTaskSearch';
import { clipboardFiles } from '../../utils/clipboardFiles';
import { statusTone } from '../../utils/taskFormat';

/**
 * ── ETİKETLEME: NUR «@», WIE IM MESSENGER (16.09.2026, Vorgabe Samet) ───────
 *
 * «mesajlaşma gibi olsun … etiket direkt renkli olması lazım … aşağı yukarı
 * işaretle eklenmesi lazım … sadece görevdeki kişileri, ama tüm görevleri, bu
 * görev dahil … ayrı butonlar olmasın».
 *
 * Drei Dinge machen daraus ein Messenger-Feld:
 *
 * 1. DIE MARKIERUNG IST SOFORT FARBIG — auch beim Tippen. Ein <textarea> kann
 *    keinen Teil seines Textes färben; darum liegt darunter ein SPIEGEL
 *    (`__mirror`), der denselben Text mit farbigen Stellen zeichnet, während
 *    die Schrift im Feld selbst durchsichtig ist. Der Schreibzeiger, die
 *    Auswahl, das Einfügen — alles bleibt ein echtes Textfeld.
 * 2. PFEIL AUF/AB + ENTER wählen aus der Liste; die Maus muss nicht mit.
 * 3. WER DEN NAMEN SELBST TIPPT, hat ihn trotzdem markiert: nach jeder Änderung
 *    wird der Satz nach bekannten «@Name»/«@Görev» abgesucht (`detectMentions`).
 *    «@Mehmet Ali Kenger fef» zählt also, auch wenn niemand die Liste benutzt hat.
 */

export interface Mention {
    kind: 'person' | 'task';
    id: string;
    /** Was im Text steht (ohne «@»). */
    label: string;
}

export interface MentionPerson {
    id: string;
    name: string;
    title?: string | null;
}

/** Bekannte Markierungen, längste zuerst — «Ali Veli» muss vor «Ali» greifen. */
const byLength = (list: readonly Mention[]): Mention[] =>
    [...list].sort((left, right) => right.label.length - left.label.length);

/**
 * Wer im Text steht, in der Reihenfolge des SATZES (nicht der Klicks) — daraus
 * wird das An-Feld der Mail: die erste Nennung bekommt sie, der Rest in Kopie.
 */
export const mentionsOf = (text: string, known: readonly Mention[]): Mention[] => {
    const found: Array<{ at: number; mention: Mention }> = [];
    const seen = new Set<string>();
    for (const mention of byLength(known)) {
        const key = `${mention.kind}:${mention.id}`;
        if (seen.has(key)) continue;
        const at = text.indexOf(`@${mention.label}`);
        if (at < 0) continue;
        seen.add(key);
        found.push({ at, mention });
    }
    return found.sort((left, right) => left.at - right.at).map((entry) => entry.mention);
};

/** Alles, was im Satz als «@Name» steht — auch von Hand getippt. */
export const detectMentions = (text: string, candidates: readonly Mention[]): Mention[] =>
    mentionsOf(text, candidates);

/** Die farbigen Stellen des Spiegels. */
const paint = (text: string, known: readonly Mention[]): ReactNode[] => {
    const labels = byLength(known).map((mention) => mention.label);
    const out: ReactNode[] = [];
    let rest = text;
    let key = 0;
    while (rest.length) {
        let at = -1;
        let hit = '';
        for (const label of labels) {
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
        out.push(<mark key={key} className="ofi-gv-mention-token">@{hit}</mark>);
        rest = rest.slice(at + hit.length + 1);
    }
    return out;
};

/** Das angefangene «@wort» unmittelbar vor dem Schreibzeiger. */
const triggerAt = (text: string, caret: number): { query: string; start: number } | null => {
    const before = text.slice(0, caret);
    const match = /(^|\s)@([^\n@]{0,40})$/.exec(before);
    if (!match) return null;
    return { query: match[2] ?? '', start: caret - (match[2] ?? '').length - 1 };
};

export const MentionField = ({
    value,
    onChange,
    onPick,
    people,
    known,
    placeholder,
    rows = 3,
    autoFocus = false,
    maxLength = 5000,
    onSubmit,
    onPasteFiles,
}: {
    value: string;
    onChange: (next: string) => void;
    /** Eine gesetzte Markierung — auch die selbst getippte. */
    onPick: (mention: Mention) => void;
    /** Die Menschen DIESER Aufgabe; niemand sonst ist markierbar. */
    people: readonly MentionPerson[];
    /** Schon gesetzte Markierungen — sie bleiben farbig, auch ohne offene Liste. */
    known: readonly Mention[];
    placeholder: string;
    rows?: number;
    autoFocus?: boolean;
    maxLength?: number;
    onSubmit?: () => void;
    onPasteFiles?: (files: File[]) => void;
}) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const mirrorRef = useRef<HTMLDivElement | null>(null);
    const [trigger, setTrigger] = useState<{ query: string; start: number } | null>(null);
    const [active, setActive] = useState(0);
    const armed = trigger !== null;
    const { hits } = useChatTaskSearch(trigger?.query ?? '', armed);

    const needle = (trigger?.query ?? '').toLocaleLowerCase();
    const personRows = useMemo(
        () => people.filter((person) => !needle || person.name.toLocaleLowerCase().includes(needle)).slice(0, 6),
        [people, needle],
    );
    const taskRows = useMemo(
        () => hits.filter((hit) => !needle || hit.title.toLocaleLowerCase().includes(needle)).slice(0, 6),
        [hits, needle],
    );
    /** Eine Reihe für die Pfeiltasten — Personen zuerst, dann Aufgaben. */
    const options = useMemo<Mention[]>(() => [
        ...personRows.map((person) => ({ kind: 'person' as const, id: person.id, label: person.name })),
        ...taskRows.map((hit) => ({ kind: 'task' as const, id: hit.id, label: hit.title })),
    ], [personRows, taskRows]);

    /* OHNE TREFFER KEIN FENSTER (16.09.2026, Samet: «etiketten sonra takılı
       kalıyor, sonuç yok yazıyor hep altta»). Wer hinter einer fertigen
       Markierung weiterschreibt, hat im «@…» längst kein Wort mehr, das passt —
       das Fenster blieb aber offen, fing die Pfeiltasten ab und zeigte ewig
       «Sonuç yok». Jetzt schliesst es sich von selbst, sobald nichts mehr passt. */
    const open = armed && options.length > 0;

    useEffect(() => { setActive(0); }, [needle, armed]);

    /** Alles, was farbig werden darf: gesetzte Markierungen UND mögliche. */
    const paintable = useMemo<Mention[]>(() => [
        ...known,
        ...people.map((person) => ({ kind: 'person' as const, id: person.id, label: person.name })),
    ], [known, people]);

    useLayoutEffect(() => {
        const element = textareaRef.current;
        if (!element) return;
        element.style.height = 'auto';
        element.style.height = `${Math.min(element.scrollHeight + 2, 260)}px`;
        if (mirrorRef.current) mirrorRef.current.scrollTop = element.scrollTop;
    }, [value]);

    useEffect(() => { if (!value) setTrigger(null); }, [value]);

    /** «@bar» im Text durch «@Barış Şahin » ersetzen und weiterschreiben lassen. */
    const insert = (mention: Mention) => {
        const element = textareaRef.current;
        if (!element || !trigger) return;
        const caret = element.selectionStart ?? value.length;
        const next = `${value.slice(0, trigger.start)}@${mention.label} ${value.slice(caret)}`;
        onChange(next);
        onPick(mention);
        setTrigger(null);
        const position = trigger.start + mention.label.length + 2;
        window.requestAnimationFrame(() => {
            element.focus();
            element.setSelectionRange(position, position);
        });
    };

    /** Nach jeder Änderung: was im Satz steht, ist markiert — auch von Hand getippt. */
    const change = (next: string, caret: number) => {
        onChange(next);
        setTrigger(triggerAt(next, caret));
        for (const mention of detectMentions(next, people.map((person) => ({ kind: 'person' as const, id: person.id, label: person.name })))) {
            if (!known.some((entry) => entry.kind === mention.kind && entry.id === mention.id)) onPick(mention);
        }
    };

    return (
        <>
            <div className="ofi-gv-mentionbox">
                {/* Der Spiegel zeichnet denselben Text — nur die Markierungen farbig. */}
                <div className="ofi-gv-mentionbox__mirror" aria-hidden ref={mirrorRef}>
                    {paint(value, paintable)}
                    {'​'}
                </div>
                <textarea
                    ref={textareaRef}
                    rows={rows}
                    autoFocus={autoFocus}
                    value={value}
                    maxLength={maxLength}
                    className="ofi-gv-issue-new__text ofi-gv-mentionbox__input"
                    placeholder={placeholder}
                    aria-label={placeholder}
                    onChange={(event) => change(event.target.value, event.target.selectionStart ?? 0)}
                    onScroll={(event) => {
                        if (mirrorRef.current) mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
                    }}
                    onClick={(event) => setTrigger(triggerAt(value, event.currentTarget.selectionStart ?? 0))}
                    onBlur={() => window.setTimeout(() => setTrigger(null), 120)}
                    onPaste={(event) => {
                        // Strg/⌘+V: ein kopiertes Bild wird Teil DIESER Blase; Text fügt sich normal ein.
                        if (!onPasteFiles) return;
                        const pasted = clipboardFiles(event.clipboardData);
                        if (!pasted.length) return;
                        event.preventDefault();
                        onPasteFiles(pasted);
                    }}
                    onKeyDown={(event) => {
                        if (open && options.length) {
                            if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                setActive((current) => (current + 1) % options.length);
                                return;
                            }
                            if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                setActive((current) => (current - 1 + options.length) % options.length);
                                return;
                            }
                            if (event.key === 'Enter' || event.key === 'Tab') {
                                event.preventDefault();
                                const chosen = options[active];
                                if (chosen) insert(chosen);
                                return;
                            }
                        }
                        if (event.key === 'Escape' && open) {
                            event.preventDefault();
                            setTrigger(null);
                            return;
                        }
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && onSubmit) {
                            event.preventDefault();
                            onSubmit();
                        }
                    }}
                />
            </div>
            <AnchoredPicker
                anchorEl={open ? textareaRef.current : null}
                onClose={() => setTrigger(null)}
                width={300}
                maxHeight={280}
                panelClassName="ofi-gv-picker ofi-gv-mention"
            >
                {personRows.length > 0 && (
                    <div className="ofi-gv-mention__group">{t('tasksModule.issues.mentionPeople')}</div>
                )}
                {personRows.map((person, index) => (
                    <MentionRow
                        key={`p-${person.id}`}
                        active={active === index}
                        onChoose={() => insert({ kind: 'person', id: person.id, label: person.name })}
                    >
                        <LuUser size={13} aria-hidden />
                        <span className="ofi-gv-picker__name">{person.name}</span>
                        {person.title && <span className="ofi-gv-mention__meta">{person.title}</span>}
                    </MentionRow>
                ))}
                {taskRows.length > 0 && (
                    <div className="ofi-gv-mention__group">{t('tasksModule.issues.mentionTasks')}</div>
                )}
                {taskRows.map((hit: TaskSearchHit, index) => (
                    <MentionRow
                        key={`t-${hit.id}`}
                        active={active === personRows.length + index}
                        onChoose={() => insert({ kind: 'task', id: hit.id, label: hit.title })}
                    >
                        <i className={`ofi-gv-issue-dot is-${statusTone(hit.status)}`} aria-hidden />
                        <span className="ofi-gv-picker__name" title={hit.title}>{hit.title}</span>
                    </MentionRow>
                ))}
            </AnchoredPicker>
        </>
    );
};

/** Eine Zeile der Liste; die mit den Pfeilen gewählte rollt sich selbst ins Bild. */
const MentionRow = ({
    active,
    onChoose,
    children,
}: {
    active: boolean;
    onChoose: () => void;
    children: ReactNode;
}) => {
    const ref = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        if (active) ref.current?.scrollIntoView({ block: 'nearest' });
    }, [active]);
    return (
        <button
            ref={ref}
            type="button"
            className={`ofi-option-row ofi-gv-picker__row ${active ? 'is-active' : ''}`}
            // Der Schreibzeiger bleibt im Feld: sonst schlösse der Fokuswechsel die Liste.
            onMouseDown={(event) => event.preventDefault()}
            onClick={onChoose}
        >
            {children}
        </button>
    );
};
