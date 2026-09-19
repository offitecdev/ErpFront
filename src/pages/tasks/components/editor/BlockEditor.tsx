import {
    Fragment,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ClipboardEvent,
    type KeyboardEvent,
    type MutableRefObject,
} from 'react';
import { toast } from 'sonner';
import { LuListChecks } from 'react-icons/lu';

import { DangerConfirmDialog } from '@/components/ui-shared/DangerConfirmDialog';
import { DotRing } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type {
    BlockType,
    Checklist,
    ChecklistProgress,
    ContentBlock,
    ContentDto,
    TaskAttachment,
} from '@/types/tasksModule';
import { ChecklistEnvContext, type ChecklistEnv } from '../checklist/checklistEnv';
import { ChecklistGroup } from '../checklist/ChecklistGroup';
import { clipboardFiles } from '../../utils/clipboardFiles';
import { TaskButton } from '../shared/TaskButton';
import { BlockMenu } from './BlockMenu';
import {
    createBlock,
    inlineHtmlToText,
    isTextBlock,
    matchShortcut,
    mergeServerInsertions,
    numberingOf,
    sanitizeInlineHtml,
    type TextBlockType,
} from './blockModel';
import { defaultTableMeta } from './tableModel';
import {
    caretAtEnd,
    caretAtStart,
    findBlockMenuButton,
    findTextElement,
    placeCaret,
    restoreSelection,
    saveSelection,
    selectionTextElement,
    splitAtCaret,
} from './editorDom';
import { EditorBlock, type EditorBlockHandlers } from './EditorBlock';
import { EditorToolbar, type BlockAlign, type InlineCommand } from './EditorToolbar';
import { InsertMenu } from './InsertMenu';
import { LinkPopover } from './LinkPopover';
import { useContentSave } from './useContentSave';
import { useFormatState } from './useFormatState';

type FocusRequest = { blockId: string; at: 'start' | 'end' };
type InsertMenuState = { anchor: HTMLElement; afterId: string | null; slashBlockId: string | null };

/**
 * ── BLOCKEDITOR DER AUFGABE (Görevly ui/editor.js) ───────────────────────────
 *
 * Hält den Blockstand lokal (`blocksRef` ist die Wahrheit zwischen zwei
 * Zeichnungen), speichert ihn verzögert (useContentSave) und übernimmt einen
 * neueren Stand des Servers nur, wenn hier nichts aussteht. Textblöcke setzen
 * ihr innerHTML selbst und nur bei `rev`-Wechsel — die React-19-Falle ist in
 * TextBlock beschrieben.
 */
export const BlockEditor = ({
    taskId,
    content,
    checklists,
    attachments,
    editable,
    isManager,
    checklistEnv,
    busyRef,
    onContentChange,
    onChecklistAdded,
    onChecklistRemoved,
    onProgress,
    onAttachmentsAdded,
}: {
    taskId: string;
    content: ContentDto;
    checklists: Checklist[];
    attachments: TaskAttachment[];
    editable: boolean;
    isManager: boolean;
    checklistEnv: Omit<ChecklistEnv, 'deleteChecklist' | 'editable'>;
    busyRef: MutableRefObject<boolean>;
    onContentChange: (content: ContentDto) => void;
    onChecklistAdded: (checklist: Checklist) => void;
    onChecklistRemoved: (checklistId: string) => void;
    onProgress: (progress: ChecklistProgress) => void;
    onAttachmentsAdded: (attachments: TaskAttachment[]) => void;
}) => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [blocks, setBlocks] = useState<ContentBlock[]>(content.blocks);
    const blocksRef = useRef<ContentBlock[]>(content.blocks);
    const [syncRev, setSyncRev] = useState(0);
    const blockRevRef = useRef(new Map<string, number>());
    const focusRequestRef = useRef<FocusRequest | null>(null);
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const activeBlockRef = useRef<string | null>(null);
    const [insertMenu, setInsertMenu] = useState<InsertMenuState | null>(null);
    const insertMenuRef = useRef<InsertMenuState | null>(null);
    insertMenuRef.current = insertMenu;
    const [blockMenu, setBlockMenu] = useState<{ anchor: HTMLElement; blockId: string } | null>(null);
    const [linkState, setLinkState] = useState<{ anchor: HTMLElement; blockId: string; range: Range } | null>(null);
    const [pendingDeleteGroup, setPendingDeleteGroup] = useState<string | null>(null);
    const [deletingGroup, setDeletingGroup] = useState(false);
    const [addingChecklist, setAddingChecklist] = useState(false);
    const [autoFocusGroupId, setAutoFocusGroupId] = useState<string | null>(null);
    /** Laufender Upload: wo seine Blöcke landen — dort steht bis dahin ein Platzhalter mit Ladekranz. */
    const [pendingUpload, setPendingUpload] = useState<{ afterId: string | null; slashBlockId: string | null; count: number } | null>(null);
    const uploading = pendingUpload !== null;
    const mediaTargetRef = useRef<{ afterId: string | null; slashBlockId: string | null }>({ afterId: null, slashBlockId: null });

    /** Ganzer Stand von aussen (Konflikt, neuerer Serverstand): alle Textblöcke neu setzen. */
    const applyServerBlocks = useCallback((next: ContentBlock[]) => {
        blocksRef.current = next;
        setBlocks(next);
        setSyncRev((value) => value + 1);
    }, []);

    const { status, versionRef, markDirty, runExclusive, setVersion } = useContentSave({
        taskId,
        initialVersion: content.version,
        getBlocks: () => blocksRef.current,
        onSaved: onContentChange,
        onConflict: (current) => {
            applyServerBlocks(current.blocks);
            onContentChange(current);
        },
        busyRef,
    });

    const { format, refreshFormat } = useFormatState(hostRef, editable);

    // Neuerer Stand vom Server (Nachladen, andere Person) — nur ohne eigene offene Eingaben.
    useEffect(() => {
        if (content.version > versionRef.current && !busyRef.current) {
            setVersion(content.version);
            applyServerBlocks(content.blocks);
        }
    }, [content, versionRef, busyRef, setVersion, applyServerBlocks]);

    // Schreibmarke dorthin, wo die letzte Handlung sie haben wollte.
    useLayoutEffect(() => {
        const request = focusRequestRef.current;
        if (!request) return;
        const element = findTextElement(hostRef.current, request.blockId);
        focusRequestRef.current = null;
        if (element) placeCaret(element, request.at);
    });

    /* ── Stand ändern ─────────────────────────────────────────────────── */

    const commit = (next: ContentBlock[], options: { touched?: string[]; save?: boolean } = {}) => {
        for (const id of options.touched ?? []) blockRevRef.current.set(id, (blockRevRef.current.get(id) ?? 0) + 1);
        blocksRef.current = next;
        setBlocks(next);
        if (options.save !== false) markDirty();
    };

    const updateBlock = (blockId: string, recipe: (block: ContentBlock) => ContentBlock, options: { touched?: string[] } = {}) => {
        commit(blocksRef.current.map((block) => (block.id === blockId ? recipe(block) : block)), options);
    };

    const insertIndexAfter = (afterId: string | null): number => {
        const index = afterId ? blocksRef.current.findIndex((block) => block.id === afterId) : -1;
        return index >= 0 ? index + 1 : blocksRef.current.length;
    };

    const nearestTextBlock = (fromIndex: number, step: -1 | 1): ContentBlock | null => {
        const candidate = blocksRef.current[fromIndex + step];
        return candidate && isTextBlock(candidate.type) ? candidate : null;
    };

    /* ── Checklisten (ändern den Inhalt auf dem Server) ───────────────── */

    const addChecklist = async (afterId: string | null, replaceBlockId: string | null) => {
        if (replaceBlockId) updateBlock(replaceBlockId, (block) => ({ ...block, text: '' }), { touched: [replaceBlockId] });
        setAddingChecklist(true);
        try {
            await runExclusive(async () => {
                const result = await tasksApi.addChecklist(taskId, {
                    title: '',
                    appendBlock: true,
                    afterBlockId: afterId,
                });
                onChecklistAdded(result.checklist);
                if (result.content) {
                    setVersion(result.content.version);
                    let merged = mergeServerInsertions(blocksRef.current, result.content.blocks);
                    if (replaceBlockId) merged = merged.filter((block) => block.id !== replaceBlockId);
                    blocksRef.current = merged;
                    setBlocks(merged);
                    if (replaceBlockId) markDirty();
                    onContentChange({ ...result.content, blocks: merged });
                }
                setAutoFocusGroupId(result.checklist.id);
            });
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setAddingChecklist(false);
        }
    };

    const deleteChecklist = async (groupId: string): Promise<boolean> => {
        try {
            await runExclusive(async () => {
                const result = await tasksApi.deleteChecklist(groupId);
                setVersion(result.content.version);
                const next = blocksRef.current.filter((block) => !(block.type === 'checklist' && block.meta.groupId === groupId));
                blocksRef.current = next;
                setBlocks(next);
                onChecklistRemoved(groupId);
                onProgress(result.progress);
                onContentChange({ ...result.content, blocks: next });
            });
            return true;
        } catch (error) {
            toast.error(tasksErrorMessage(error));
            return false;
        }
    };

    /* ── Einfügen ─────────────────────────────────────────────────────── */

    const insertBlock = (type: BlockType, afterId: string | null, slashBlockId: string | null) => {
        const slash = slashBlockId ? blocksRef.current.find((block) => block.id === slashBlockId) ?? null : null;

        if (type === 'checklist') {
            void addChecklist(slash ? slash.id : afterId, slash ? slash.id : null);
            return;
        }
        if (type === 'image' || type === 'file') {
            mediaTargetRef.current = { afterId, slashBlockId: slash ? slash.id : null };
            const input = fileInputRef.current;
            if (input) {
                input.accept = type === 'image' ? 'image/*' : '';
                input.value = '';
                input.click();
            }
            return;
        }
        if (isTextBlock(type)) {
            if (slash) {
                focusRequestRef.current = { blockId: slash.id, at: 'start' };
                updateBlock(slash.id, (block) => ({ ...block, type, text: '' }), { touched: [slash.id] });
                return;
            }
            const block = createBlock(type);
            const next = [...blocksRef.current];
            next.splice(insertIndexAfter(afterId), 0, block);
            focusRequestRef.current = { blockId: block.id, at: 'start' };
            commit(next);
            return;
        }
        if (type === 'table') {
            const meta = defaultTableMeta();
            if (slash) {
                updateBlock(slash.id, (block) => ({ ...block, type: 'table', text: '', meta }), { touched: [slash.id] });
                return;
            }
            const next = [...blocksRef.current];
            next.splice(insertIndexAfter(afterId), 0, createBlock('table', meta));
            commit(next);
            return;
        }
        if (type === 'divider') {
            const paragraph = createBlock('p');
            const next = [...blocksRef.current];
            if (slash) {
                const index = next.findIndex((block) => block.id === slash.id);
                next.splice(index, 1, { ...slash, type: 'divider', text: '', meta: {} }, paragraph);
            } else {
                next.splice(insertIndexAfter(afterId), 0, createBlock('divider'), paragraph);
            }
            focusRequestRef.current = { blockId: paragraph.id, at: 'start' };
            commit(next, { touched: slash ? [slash.id] : [] });
        }
    };

    const onFilesChosen = async (files: File[]) => {
        if (!files.length) return;
        const { afterId, slashBlockId } = mediaTargetRef.current;
        setPendingUpload({ afterId, slashBlockId, count: files.length });
        try {
            const uploaded = await tasksApi.uploadAttachments(taskId, files);
            onAttachmentsAdded(uploaded);
            const mediaBlocks = uploaded.map((attachment) => createBlock(attachment.isImage ? 'image' : 'file', { attId: attachment.id }));
            const next = [...blocksRef.current];
            const slashIndex = slashBlockId ? next.findIndex((block) => block.id === slashBlockId) : -1;
            if (slashIndex >= 0) next.splice(slashIndex, 1, ...mediaBlocks);
            else next.splice(insertIndexAfter(afterId), 0, ...mediaBlocks);
            commit(next);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setPendingUpload(null);
        }
    };

    /**
     * Strg/⌘+V mit einem Bild (Bildschirmfoto, «Bild kopieren»): hochladen und als
     * Bildblock hinter den aktuellen Block setzen — ein leerer Absatz wird ersetzt.
     * Läuft in der Capture-Phase, damit Textblock/Tabelle das Einfügen nicht als Text schlucken.
     */
    const onPasteCapture = (event: ClipboardEvent<HTMLDivElement>) => {
        if (!editable) return;
        const images = clipboardFiles(event.clipboardData, { imagesOnly: true });
        if (!images.length) return;
        event.preventDefault();
        event.stopPropagation();
        if (uploading) return;
        const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-editor-text]') : null;
        const blockId = target?.dataset.editorText ?? activeBlockRef.current;
        const block = blockId ? blocksRef.current.find((entry) => entry.id === blockId) : undefined;
        const replace = block && block.type === 'p' && !inlineHtmlToText(block.text).trim() && blocksRef.current.length > 1;
        mediaTargetRef.current = { afterId: block?.id ?? null, slashBlockId: replace ? block.id : null };
        void onFilesChosen(images);
    };

    /* ── Tastatur und Eingabe in Textblöcken ──────────────────────────── */

    const onInput = (blockId: string, element: HTMLElement) => {
        const block = blocksRef.current.find((entry) => entry.id === blockId);
        if (!block) return;
        const plain = element.textContent ?? '';

        const shortcut = isTextBlock(block.type) ? matchShortcut(plain) : null;
        if (shortcut === 'checklist') {
            void addChecklist(blockId, blockId);
            return;
        }
        if (shortcut && isTextBlock(shortcut) && shortcut !== block.type) {
            focusRequestRef.current = { blockId, at: 'start' };
            updateBlock(blockId, (entry) => ({ ...entry, type: shortcut, text: '' }), { touched: [blockId] });
            return;
        }

        const html = sanitizeInlineHtml(element.innerHTML);
        if (html !== block.text) updateBlock(blockId, (entry) => ({ ...entry, text: html }));

        const menu = insertMenuRef.current;
        if (plain === '/') {
            setInsertMenu({ anchor: findBlockMenuButton(hostRef.current, blockId) ?? element, afterId: blockId, slashBlockId: blockId });
        } else if (menu?.slashBlockId === blockId) {
            setInsertMenu(null);
        }
    };

    const onKeyDown = (blockId: string, event: KeyboardEvent<HTMLElement>) => {
        if (event.nativeEvent.isComposing) return;
        const element = event.currentTarget;
        const index = blocksRef.current.findIndex((entry) => entry.id === blockId);
        const block = blocksRef.current[index];
        if (!block) return;

        if (event.key === 'ArrowDown' && insertMenuRef.current?.slashBlockId === blockId) {
            const row = document.querySelector<HTMLButtonElement>('.ofi-gv-menu [role="menuitem"]:not(:disabled)');
            if (row) {
                event.preventDefault();
                row.focus();
                return;
            }
        }

        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            const isList = block.type === 'bullet' || block.type === 'number';
            if (isList && !inlineHtmlToText(element.innerHTML).trim()) {
                // Leerer Listenpunkt + Enter verlässt die Liste.
                focusRequestRef.current = { blockId, at: 'start' };
                updateBlock(blockId, (entry) => ({ ...entry, type: 'p', text: '' }), { touched: [blockId] });
                return;
            }
            const { head, tail } = splitAtCaret(element);
            const created = createBlock(isList ? block.type : 'p', block.meta.align ? { align: block.meta.align } : {}, sanitizeInlineHtml(tail));
            const next = [...blocksRef.current];
            next[index] = { ...block, text: sanitizeInlineHtml(head) };
            next.splice(index + 1, 0, created);
            focusRequestRef.current = { blockId: created.id, at: 'start' };
            commit(next);
            return;
        }

        if (event.key === 'Backspace') {
            const empty = !(element.textContent ?? '');
            if (empty && blocksRef.current.length > 1) {
                event.preventDefault();
                const previous = nearestTextBlock(index, -1);
                if (previous) focusRequestRef.current = { blockId: previous.id, at: 'end' };
                commit(blocksRef.current.filter((entry) => entry.id !== blockId));
                return;
            }
            if (!empty && block.type !== 'p' && caretAtStart(element)) {
                // Wie jeder Editor: Rücktaste am Anfang einer Überschrift/Liste macht Text daraus.
                event.preventDefault();
                updateBlock(blockId, (entry) => ({ ...entry, type: 'p' }));
            }
            return;
        }

        if (event.key === 'ArrowUp' && caretAtStart(element)) {
            const previous = nearestTextBlock(index, -1);
            const target = previous ? findTextElement(hostRef.current, previous.id) : null;
            if (target) {
                event.preventDefault();
                placeCaret(target, 'end');
            }
        } else if (event.key === 'ArrowDown' && caretAtEnd(element)) {
            const following = nearestTextBlock(index, 1);
            const target = following ? findTextElement(hostRef.current, following.id) : null;
            if (target) {
                event.preventDefault();
                placeCaret(target, 'start');
            }
        }
    };

    /* ── Werkzeugleiste ───────────────────────────────────────────────── */

    const runCommand = (command: InlineCommand) => {
        const element = selectionTextElement(hostRef.current);
        const blockId = element?.dataset.editorText;
        if (!element || !blockId) return;
        try {
            document.execCommand('styleWithCSS', false, 'false');
        } catch {
            /* ältere Browser kennen den Schalter nicht */
        }
        document.execCommand(command, false);
        if (command === 'removeFormat') document.execCommand('unlink', false);
        onInput(blockId, element);
        refreshFormat();
    };

    const openLink = (anchor: HTMLElement) => {
        const element = selectionTextElement(hostRef.current);
        const range = element ? saveSelection(element) : null;
        const blockId = element?.dataset.editorText;
        if (!element || !range || !blockId) {
            toast(t('tasksModule.editor.linkNeedsSelection'));
            return;
        }
        setLinkState({ anchor, blockId, range });
    };

    const applyLink = (href: string) => {
        const state = linkState;
        setLinkState(null);
        if (!state) return;
        const element = findTextElement(hostRef.current, state.blockId);
        if (!element) return;
        restoreSelection(element, state.range);
        document.execCommand('createLink', false, href);
        onInput(state.blockId, element);
        refreshFormat();
    };

    const setAlign = (align: BlockAlign) => {
        const blockId = activeBlockRef.current;
        const block = blockId ? blocksRef.current.find((entry) => entry.id === blockId) : undefined;
        if (!block || !isTextBlock(block.type)) return;
        updateBlock(block.id, (entry) => ({ ...entry, meta: { ...entry.meta, align } }));
    };

    const addParagraphAtEnd = () => {
        const last = blocksRef.current[blocksRef.current.length - 1];
        if (last && last.type === 'p' && !last.text) {
            const element = findTextElement(hostRef.current, last.id);
            if (element) placeCaret(element, 'end');
            return;
        }
        const block = createBlock('p');
        focusRequestRef.current = { blockId: block.id, at: 'start' };
        commit([...blocksRef.current, block]);
    };

    /* ── Blockmenü ────────────────────────────────────────────────────── */

    const menuBlockIndex = blockMenu ? blocks.findIndex((block) => block.id === blockMenu.blockId) : -1;
    const menuBlock = menuBlockIndex >= 0 ? blocks[menuBlockIndex] : null;

    const convertBlock = (type: TextBlockType) => {
        if (!menuBlock) return;
        updateBlock(menuBlock.id, (block) => ({ ...block, type }));
    };

    const moveBlock = (direction: -1 | 1) => {
        if (!menuBlock) return;
        const next = [...blocksRef.current];
        const index = next.findIndex((block) => block.id === menuBlock.id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        commit(next);
    };

    const deleteBlock = () => {
        if (!menuBlock) return;
        if (menuBlock.type === 'checklist' && menuBlock.meta.groupId) {
            setPendingDeleteGroup(menuBlock.meta.groupId);
            return;
        }
        commit(blocksRef.current.filter((block) => block.id !== menuBlock.id));
    };

    /* ── Stabile Griffe für die (memoisierten) Blöcke ─────────────────── */

    const actionsRef = useRef({ onInput, onKeyDown, deleteChecklist, markDirty });
    actionsRef.current = { onInput, onKeyDown, deleteChecklist, markDirty };

    const handlers = useMemo<EditorBlockHandlers>(() => ({
        onInput: (blockId, element) => actionsRef.current.onInput(blockId, element),
        onKeyDown: (blockId, event) => actionsRef.current.onKeyDown(blockId, event),
        onFocus: (blockId) => {
            activeBlockRef.current = blockId;
            setActiveBlockId(blockId);
        },
        onMenu: (blockId, anchor) => setBlockMenu({ blockId, anchor }),
        onTableChange: (blockId, table) => {
            const next = table
                ? blocksRef.current.map((block) => (block.id === blockId ? { ...block, meta: table } : block))
                : blocksRef.current.filter((block) => block.id !== blockId);
            blocksRef.current = next;
            setBlocks(next);
            actionsRef.current.markDirty();
        },
        onImageChange: (blockId, patch) => {
            const next = blocksRef.current.map((block) => {
                if (block.id !== blockId) return block;
                const meta = { ...block.meta, ...patch };
                for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
                    if (patch[key] === undefined) delete meta[key];
                }
                return { ...block, meta };
            });
            blocksRef.current = next;
            setBlocks(next);
            actionsRef.current.markDirty();
        },
    }), []);

    const env = useMemo<ChecklistEnv>(() => ({
        ...checklistEnv,
        editable,
        deleteChecklist: (checklistId) => actionsRef.current.deleteChecklist(checklistId),
    }), [checklistEnv, editable]);

    /* ── Zeichnen ─────────────────────────────────────────────────────── */

    const numbers = useMemo(() => numberingOf(blocks), [blocks]);
    const attachmentById = useMemo(() => new Map(attachments.map((attachment) => [attachment.id, attachment])), [attachments]);
    const checklistById = useMemo(() => new Map(checklists.map((checklist) => [checklist.id, checklist])), [checklists]);
    const orphans = useMemo(() => {
        const linked = new Set(blocks.filter((block) => block.type === 'checklist').map((block) => block.meta.groupId));
        return checklists.filter((checklist) => !linked.has(checklist.id));
    }, [blocks, checklists]);

    const activeBlock = activeBlockId ? blocks.find((block) => block.id === activeBlockId) : undefined;
    const alignEnabled = Boolean(activeBlock && isTextBlock(activeBlock.type));
    const soleTextBlock = blocks.length === 1 && isTextBlock(blocks[0].type);
    // Ohne Zielblock (oder Ziel inzwischen weg) steht der Platzhalter am Ende.
    const uploadAnchored = Boolean(pendingUpload && blocks.some((block) =>
        block.id === (pendingUpload.slashBlockId ?? pendingUpload.afterId)));
    const uploadPlaceholder = pendingUpload ? (
        <div className="ofi-gv-editor-block is-uploading">
            {Array.from({ length: pendingUpload.count }, (_, index) => (
                <div key={index} className="ofi-gv-editor-uploading">
                    <DotRing size={30} label={t('tasksModule.editor.uploading')} />
                </div>
            ))}
        </div>
    ) : null;

    return (
        <ChecklistEnvContext.Provider value={env}>
            <div
                ref={hostRef}
                className={`ofi-gv-editor ${editable ? 'is-editable' : 'is-readonly'}`}
                onPasteCapture={editable ? onPasteCapture : undefined}
            >
                {editable && (
                    <EditorToolbar
                        format={format}
                        align={activeBlock?.meta.align ?? 'left'}
                        alignEnabled={alignEnabled}
                        status={status}
                        onInsert={(anchor) => setInsertMenu({ anchor, afterId: activeBlockRef.current, slashBlockId: null })}
                        onCommand={runCommand}
                        onLink={openLink}
                        onAlign={setAlign}
                    />
                )}

                <div className="ofi-gv-editor-blocks">
                    {blocks.map((block) => {
                        const uploadHere = pendingUpload && (pendingUpload.slashBlockId === block.id
                            || (!pendingUpload.slashBlockId && pendingUpload.afterId === block.id));
                        const replaced = uploadHere && pendingUpload.slashBlockId === block.id;
                        return (
                            <Fragment key={block.id}>
                                {!replaced && (
                                    <EditorBlock
                                        block={block}
                                        number={numbers.get(block.id) ?? 1}
                                        editable={editable}
                                        rev={`${syncRev}:${blockRevRef.current.get(block.id) ?? 0}`}
                                        showPlaceholder={soleTextBlock}
                                        attachment={block.meta.attId ? attachmentById.get(block.meta.attId) : undefined}
                                        checklist={block.meta.groupId ? checklistById.get(block.meta.groupId) : undefined}
                                        autoFocusChecklist={Boolean(block.meta.groupId && block.meta.groupId === autoFocusGroupId)}
                                        handlers={handlers}
                                    />
                                )}
                                {uploadHere && uploadPlaceholder}
                            </Fragment>
                        );
                    })}
                    {pendingUpload && !uploadAnchored && uploadPlaceholder}
                    {!editable && !blocks.length && !orphans.length && (
                        <div className="ofi-gv-editor-empty">{t('tasksModule.editor.empty')}</div>
                    )}
                </div>

                {editable && (
                    <button type="button" className="ofi-gv-editor-tail ofi-btn-plain" onClick={addParagraphAtEnd}>
                        {t('tasksModule.editor.tail')}
                    </button>
                )}

                {orphans.length > 0 && (
                    <div className="ofi-gv-editor-orphans">
                        {orphans.map((checklist) => (
                            <ChecklistGroup key={checklist.id} checklist={checklist} autoFocusNew={checklist.id === autoFocusGroupId} />
                        ))}
                    </div>
                )}

                {editable && (
                    <div className="ofi-gv-editor-foot">
                        <TaskButton icon={<LuListChecks size={14} />} disabled={addingChecklist} onClick={() => void addChecklist(null, null)}>
                            {t('tasksModule.editor.addChecklist')}
                        </TaskButton>
                    </div>
                )}

                {editable && (
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        hidden
                        onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            event.target.value = '';
                            void onFilesChosen(files);
                        }}
                    />
                )}

                <InsertMenu
                    anchorEl={insertMenu?.anchor ?? null}
                    isManager={isManager}
                    focusFirst={Boolean(insertMenu && !insertMenu.slashBlockId)}
                    onClose={() => setInsertMenu(null)}
                    onPick={(type) => {
                        const state = insertMenuRef.current;
                        setInsertMenu(null);
                        insertBlock(type, state?.afterId ?? null, state?.slashBlockId ?? null);
                    }}
                />
                <BlockMenu
                    anchorEl={blockMenu?.anchor ?? null}
                    block={menuBlock}
                    isFirst={menuBlockIndex <= 0}
                    isLast={menuBlockIndex === blocks.length - 1}
                    onClose={() => setBlockMenu(null)}
                    onConvert={convertBlock}
                    onMove={moveBlock}
                    onDelete={deleteBlock}
                />
                <LinkPopover anchorEl={linkState?.anchor ?? null} onClose={() => setLinkState(null)} onApply={applyLink} />
                <DangerConfirmDialog
                    open={pendingDeleteGroup !== null}
                    title={t('tasksModule.checklist.deleteListTitle')}
                    message={t('tasksModule.checklist.deleteListMessage', {
                        title: checklistById.get(pendingDeleteGroup ?? '')?.title || t('tasksModule.checklist.titlePlaceholder'),
                    })}
                    confirmLabel={t('tasksModule.checklist.deleteList')}
                    requirePassword={false}
                    busy={deletingGroup}
                    onCancel={() => setPendingDeleteGroup(null)}
                    onConfirm={() => {
                        const groupId = pendingDeleteGroup;
                        if (!groupId) return;
                        setDeletingGroup(true);
                        void deleteChecklist(groupId).then((ok) => {
                            setDeletingGroup(false);
                            if (ok) setPendingDeleteGroup(null);
                        });
                    }}
                />
            </div>
        </ChecklistEnvContext.Provider>
    );
};
