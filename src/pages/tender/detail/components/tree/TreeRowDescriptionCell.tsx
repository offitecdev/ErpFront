import type { RefObject } from 'react';
import {
    Check,
    Edit01 as Pencil,
    File05 as FileText,
    Image01 as ImageIcon,
    List,
    Package,
    Trash01 as Trash2,
} from '@/components/icons/antIconCompat';

import { RichTextMarkdownEditor, markdownToHtml } from '../../TenderRichText';
import type { TreeNode } from '../../tenderDetailUtils';
import { t } from '@/i18n/translate';

type TreeRowDescriptionCellProps = {
    node: TreeNode;
    level: number;
    indent: number;
    rowType: string;
    isDraft: boolean;
    isSectionRow: boolean;
    isInlineContentRow: boolean;
    canInlineEdit: boolean;
    displayDescription: string;
    titleClass: string;
    actionButtonClass: string;
    headingButtonClass: (active: boolean) => string;
    insertionParentId: string | null;
    insertionAfterRowId?: string;
    editingDesc: boolean;
    descVal: string;
    setDescVal: (value: string) => void;
    setEditingDesc: (value: boolean) => void;
    saveDesc: () => void | Promise<void>;
    editingLong: boolean;
    longVal: string;
    setLongVal: (value: string) => void;
    saveLong: () => void | Promise<void>;
    openLongEditor: () => void;
    handleInlineImageFile: (file?: File | null) => void;
    toggleBullet: () => void | Promise<void>;
    onDeletePosition: () => void | Promise<void>;
    onAddChild?: (parentId: string | null, rowType: 'SECTION' | 'DESCRIPTION', afterRowId?: string) => void;
    onAddProduct?: (parentId: string | null, afterRowId?: string) => void;
    longEditorRef: RefObject<HTMLDivElement | null>;
    inlineImageInputRef: RefObject<HTMLInputElement | null>;
};

export const TreeRowDescriptionCell = ({
    node,
    level,
    indent,
    rowType,
    isDraft,
    isSectionRow,
    isInlineContentRow,
    canInlineEdit,
    displayDescription,
    titleClass,
    actionButtonClass,
    headingButtonClass,
    insertionParentId,
    insertionAfterRowId,
    editingDesc,
    descVal,
    setDescVal,
    setEditingDesc,
    saveDesc,
    editingLong,
    longVal,
    setLongVal,
    saveLong,
    openLongEditor,
    handleInlineImageFile,
    toggleBullet,
    onDeletePosition,
    onAddChild,
    onAddProduct,
    longEditorRef,
    inlineImageInputRef,
}: TreeRowDescriptionCellProps) => (
    <td
        className="px-2 py-2 align-top"
        onDoubleClick={(e) => {
            e.stopPropagation();
            openLongEditor();
        }}
    >
        {/* Short description row */}
        <div className="flex items-center gap-1" style={{ paddingLeft: indent }}>
            <span className="w-4 shrink-0" />
            {rowType === 'PRODUCT' && (
                <Package size={13} className="shrink-0 text-blue-700" />
            )}

            {editingDesc ? (
                <>
                    <input
                        autoFocus
                        value={descVal}
                        onChange={(e) => setDescVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveDesc(); if (e.key === "Escape") { setDescVal(node.shortDescription); setEditingDesc(false); } }}
                        onClick={(e) => e.stopPropagation()}
                        className={`min-w-0 flex-1 border-0 border-b border-slate-300 bg-transparent px-1 py-0.5 text-slate-900 outline-none focus:border-slate-600 ${titleClass}`}
                    />
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); saveDesc(); }}
                        className="shrink-0 p-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                        title={t('common.save')}
                    >
                        <Check size={10} />
                    </button>
                </>
            ) : isInlineContentRow ? (
                <>
                    <span className="min-w-0 flex-1 text-[12.5px] font-medium text-slate-700">{t('common.description')}</span>
                    {isDraft && !node.isArticleMapping && (
                        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); inlineImageInputRef.current?.click(); }}
                                className={actionButtonClass}
                                title={t('tenders.gorsel_add')}
                            >
                                <ImageIcon size={13} />{t('tenders.gorsel')}</button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onAddProduct?.(insertionParentId, insertionAfterRowId); }}
                                className={actionButtonClass}
                                title={t('tenders.product_add')}
                            >
                                <Package size={11} />{t('tenders.product')}</button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onAddChild?.(insertionParentId, 'DESCRIPTION', insertionAfterRowId); }}
                                className={actionButtonClass}
                                title={t('tenders.line_add')}
                            >
                                <FileText size={11} />{t('tenders.line')}</button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openLongEditor(); }}
                                className="shrink-0 rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                                title={t('tenders.edit_line_content')}
                            >
                                <Pencil size={10} />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void onDeletePosition(); }}
                                className="shrink-0 p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500"
                                title={t('tenders.line_sil')}
                            >
                                <Trash2 size={10} />
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <>
                    <span
                        className={`min-w-0 flex-1 whitespace-pre-wrap break-words leading-5 ${titleClass} ${canInlineEdit ?"cursor-text rounded px-1 -mx-1 hover:bg-white/70" : ''} ${displayDescription ? '' : 'text-slate-400'}`}
                        onClick={(e) => {
                            if (!canInlineEdit) return;
                            e.stopPropagation();
                            setDescVal(node.shortDescription || '');
                            setEditingDesc(true);
                        }}
                    >
                        {displayDescription || (rowType === 'PRODUCT' ?t('tenders.product_adi') : isSectionRow && level > 0 ?t('tenders.subsection') :t('tenders.yazi_yazin'))}
                    </span>
                    {false && node.npkCode && (
                        <span className="shrink-0 text-[9px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{node.npkCode}</span>
                    )}
                    {isDraft && !node.isArticleMapping && (
                        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onAddProduct?.(insertionParentId, insertionAfterRowId); }}
                                className={actionButtonClass}
                                title={t('tenders.product_add')}
                            >
                                <Package size={11} />{t('tenders.product')}</button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onAddChild?.(insertionParentId, 'DESCRIPTION', insertionAfterRowId); }}
                                className={actionButtonClass}
                                title={t('tenders.line_add')}
                            >
                                <FileText size={11} />{t('tenders.line')}</button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void toggleBullet(); }}
                                className={headingButtonClass((node.shortDescription || '').trimStart().startsWith('- '))}
                                title={t('tenders.bullet_ctrl_q_or_space')}
                            >
                                <List size={13} />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setDescVal(node.shortDescription || ''); setEditingDesc(true); }}
                                className="shrink-0 rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                                title={t('tenders.yaziyi_edit')}
                            >
                                <Pencil size={10} />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void onDeletePosition(); }}
                                className="shrink-0 p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500"
                                title={t('tenders.line_sil')}
                            >
                                <Trash2 size={10} />
                            </button>
                        </div>
                    )}
                    <input
                        ref={inlineImageInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                            handleInlineImageFile(e.currentTarget.files?.[0]);
                            e.currentTarget.value = '';
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </>
            )}
        </div>

        {node.imageUrl && !isInlineContentRow && (
            <div className="mt-1" style={{ paddingLeft: indent + 20 }}>
                <img
                    src={node.imageUrl}
                    alt=""
                    className="h-24 max-w-[200px] rounded border border-slate-200 object-cover"
                />
            </div>
        )}

        {/* Long description row */}
        {(node.longDescription || editingLong || isInlineContentRow) && (
            <div className="mt-1" style={{ paddingLeft: isInlineContentRow ? indent : indent + 20 }}>
                {editingLong ? (
                    <div
                        ref={longEditorRef}
                        className={isInlineContentRow ?"w-full max-w-none" :"w-full max-w-[720px]"}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => {
                            if (!longEditorRef.current?.contains(e.relatedTarget as Node | null)) {
                                void saveLong();
                            }
                        }}
                    >
                        {isInlineContentRow && node.imageUrl && (
                            <img
                                src={node.imageUrl}
                                alt=""
                                className="mb-2 h-20 w-32 rounded-md border border-slate-200 bg-white object-cover"
                            />
                        )}
                        <RichTextMarkdownEditor
                            value={longVal}
                            onChange={setLongVal}
                            minHeight={isInlineContentRow ? 150 : 54}
                            variant={isInlineContentRow ? 'boxed' : 'inline'}
                            placeholder={t('tenders.line_content_yaz')}
                        />
                    </div>
                ) : node.longDescription ? (
                    <div
                        className={`${isInlineContentRow ?"min-h-[150px] w-full max-w-none rounded-md border border-slate-200 bg-white px-3 py-2 shadow-xs" :"flex max-w-[640px] items-start gap-1 px-1 py-0.5"} ${isDraft && !node.isArticleMapping ?"cursor-text hover:border-slate-300 hover:bg-white" : ''}`}
                        onClick={(e) => {
                            if (!isDraft || node.isArticleMapping) return;
                            e.stopPropagation();
                            openLongEditor();
                        }}
                    >
                        {isInlineContentRow && node.imageUrl && (
                            <img
                                src={node.imageUrl}
                                alt=""
                                className="mb-2 h-20 w-32 rounded-md border border-slate-200 bg-white object-cover"
                            />
                        )}
                        <span
                            className={`rich-text-preview min-w-0 leading-5 [&_h2]:my-1 [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:text-slate-900 [&_h3]:my-1 [&_h3]:text-[13.5px] [&_h3]:font-semibold [&_h3]:text-slate-800 [&_ul]:list-disc [&_ul]:pl-7 [&_li]:my-0.5 [&_li]:pl-1 ${rowType === 'DESCRIPTION' ?"text-[12.5px] text-slate-600" :"text-[12.5px] text-slate-700"}`}
                            dangerouslySetInnerHTML={{ __html: markdownToHtml(node.longDescription || '') }}
                        />
                    </div>
                ) : isInlineContentRow ? (
                    <div
                        className={`min-h-[150px] w-full max-w-none rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-400 shadow-xs ${isDraft ?"cursor-text hover:border-slate-300" : ''}`}
                        onClick={(e) => {
                            if (!isDraft) return;
                            e.stopPropagation();
                            openLongEditor();
                        }}
                    >
                        {node.imageUrl && (
                            <img
                                src={node.imageUrl}
                                alt=""
                                className="mb-2 h-20 w-32 rounded-md border border-slate-200 bg-white object-cover"
                            />
                        )}{t('tenders.line_content_yazin')}</div>
                ) : null}
            </div>
        )}
    </td>
);
