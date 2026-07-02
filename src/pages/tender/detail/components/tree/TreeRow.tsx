import React, { useRef, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    ChevronUp,
} from '@/components/icons/antIconCompat';

import { Checkbox } from '@/components/ui-shared/Checkbox';
import { useTenderStore } from '@/store/tenderStore';
import type { PositionDto, TenderChangeLog } from '@/types/tender';
import {
    fmtMoney,
    type TreeNode,
} from '../../tenderDetailUtils';
import { t } from '@/i18n/translate';
import {
    getTreeRowBorderClass,
    getTreeRowDisplayValues,
    getTreeRowFlags,
    getTreeRowTitleClass,
    parseTreeRowInlineNumber,
} from '../../utils/treeRow.utils';
import { TreeRowDescriptionCell } from './TreeRowDescriptionCell';
import { TreeRowPricingCells } from './TreeRowPricingCells';

export const TreeRow: React.FC<{
    node: TreeNode;
    level: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
    checkedIds: Record<string, boolean>;
    onCheckedChange: (id: string, checked: boolean) => void;
    isDraft: boolean;
    tenderId: string;
    onInlinePositionChange?: (positionId: string, patch: Pick<Partial<PositionDto>, 'quantity' | 'unit' | 'unitPrice' | 'discount' | 'shortDescription' | 'longDescription' | 'rowType' | 'imageUrl'>) => void;
    onInlineMappingChange?: (positionId: string, mappingId: string, patch: { quantityMultiplier?: number; discount?: number | null }) => void;
    onAddChild?: (parentId: string | null, rowType: 'SECTION' | 'DESCRIPTION', afterRowId?: string) => void;
    onAddProduct?: (parentId: string | null, afterRowId?: string) => void;
    onUpdated: () => void;
}> = ({ node, level, selectedId, onSelect, checkedIds, onCheckedChange, isDraft, tenderId, onInlinePositionChange, onInlineMappingChange, onAddChild, onAddProduct, onUpdated }) => {
    const hasChildren = node.children.length > 0;
    const isSelected = selectedId === node.id;
    const { updatePosition, deletePosition } = useTenderStore();
    const { rowType, isSectionRow, isRootSection, isInlineContentRow, isTitleRow, isSeparatedContentRow } = getTreeRowFlags(node, level);
    const insertionParentId = isSectionRow ? node.id : (node.parentPositionId || null);
    // SECTION satırı için: bölüm içindeki son child'ın ID'sini afterRowId olarak ver
    // → yeni satır/ürün bölüm içindeki SON SATIRIN hemen altına eklenir
    const lastNonMappingChildId = isSectionRow
        ? node.children.filter((c) => !c.isArticleMapping).at(-1)?.id
        : undefined;
    const insertionAfterRowId = isSectionRow ? lastNonMappingChildId : node.id;

    const [editingDesc, setEditingDesc] = useState(false);
    const [descVal, setDescVal] = useState(node.shortDescription);
    const [editingLong, setEditingLong] = useState(false);
    const [longVal, setLongVal] = useState(node.longDescription || '');
    const [logOpen, setLogOpen] = useState(false);
    const longEditorRef = useRef<HTMLDivElement>(null);
    const inlineImageInputRef = useRef<HTMLInputElement>(null);

    const { qty, displayTotal, showRowTotal, displayUnitPrice, hasOwnAmount } = getTreeRowDisplayValues(node, hasChildren, isSectionRow);
    const indent = level * 18;
    const anyEditing = editingDesc || editingLong;
    const rowLogs: TenderChangeLog[] = [];
    const canInlineEdit = isDraft && !node.isArticleMapping;
    const displayDescription = node.shortDescription?.trim() || '';
    // SECTION → font-semibold (bölüm başlığı gibi); TITLE → direkt bold başlık (line-through yok)
    const titleClass = getTreeRowTitleClass(rowType, level, isSectionRow, isRootSection);
    const inlineInputClass = "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-[11px] text-slate-700 outline-none transition-colors hover:border-slate-200 focus:border-blue-400 focus:bg-white";
    const inlineTextInputClass = "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-left text-[11px] text-slate-600 outline-none transition-colors hover:border-slate-200 focus:border-blue-400 focus:bg-white";
    const actionButtonClass = t('tenders.inline_flex_h_7_items_center_gap_1_rounded_borde');
    const headingButtonClass = (active: boolean) =>
        `inline-flex h-6 min-w-6 items-center justify-center rounded border px-1 text-[11px] font-semibold transition-colors ${
            active
                ?"border-slate-400 bg-slate-100 text-slate-900"
                :"border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-900"
        }`;
    const rowBorderClass = getTreeRowBorderClass(isRootSection, isSectionRow, isTitleRow, isSeparatedContentRow);
    const updateInlineNumber = (field: 'quantity' | 'unitPrice' | 'discount', value: string) => {
        const next = field === 'discount'
            ? Math.min(parseTreeRowInlineNumber(value), 100)
            : parseTreeRowInlineNumber(value);

        if (node.isArticleMapping && node.parentPositionId && node.mappingId) {
            if (field === 'quantity') {
                onInlineMappingChange?.(node.parentPositionId, node.mappingId, { quantityMultiplier: next });
            } else if (field === 'discount') {
                onInlineMappingChange?.(node.parentPositionId, node.mappingId, { discount: next });
            }
            return;
        }

        onInlinePositionChange?.(node.id, { [field]: next });
    };

    const saveDesc = async () => {
        const next = descVal.trim();
        if (next !== node.shortDescription && onInlinePositionChange) {
            onInlinePositionChange(node.id, { shortDescription: next });
            setEditingDesc(false);
            return;
        }
        if (next !== node.shortDescription) {
            try { await updatePosition(tenderId, node.id, { shortDescription: next }); onUpdated(); }
            catch { toast.error(t('tenders.guncellenemedi')); }
        }
        setEditingDesc(false);
    };

    const saveLong = async () => {
        const next = longVal || null;
        if ((next || '') !== (node.longDescription || '') && onInlinePositionChange) {
            onInlinePositionChange(node.id, { longDescription: next });
            setEditingLong(false);
            return;
        }
        if (longVal !== (node.longDescription || '')) {
            try { await updatePosition(tenderId, node.id, { longDescription: longVal || null }); onUpdated(); }
            catch { toast.error(t('tenders.guncellenemedi')); }
        }
        setEditingLong(false);
    };

    const openLongEditor = () => {
        if (!isDraft || node.isArticleMapping) return;
        setLongVal(node.longDescription || '');
        setEditingLong(true);
    };

    const handleInlineImageFile = (file?: File | null) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error(t('tenders.only_gorsel_dosyalar_yuklenebilir'));
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error(t('tenders.gorsel_2mb_tan_buyuk_olamaz'));
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            const imageUrl = reader.result as string;
            if (onInlinePositionChange) {
                onInlinePositionChange(node.id, { imageUrl });
                return;
            }
            try {
                await updatePosition(tenderId, node.id, { imageUrl });
                onUpdated();
            } catch (err: any) {
                toast.error(err.response?.data?.error ||t('tenders.gorsel_kaydedilemedi'));
            }
        };
        reader.onerror = () => toast.error(t('tenders.gorsel_okunamadi'));
        reader.readAsDataURL(file);
    };

    const toggleBullet = async () => {
        if (!isDraft || node.isArticleMapping) return;
        const current = node.shortDescription || '';
        const nextText = current.trimStart().startsWith('- ')
            ? current.replace(/^\s*-\s?/, '')
            : `- ${current.trim()}`;
        if (onInlinePositionChange) {
            onInlinePositionChange(node.id, { shortDescription: nextText, rowType: 'DESCRIPTION' });
            return;
        }

        try {
            await updatePosition(tenderId, node.id, { shortDescription: nextText, rowType: 'DESCRIPTION' });
            onUpdated();
        } catch {
            toast.error(t('tenders.bullet_could_not_apply'));
        }
    };

    const deleteCurrentPosition = async () => {
        const label = hasChildren
            ? `"${node.shortDescription}" ve tÃ¼m alt satÄ±rlarÄ±`
            : `"${node.shortDescription}"`;
        if (!confirm(t('tenders.silinsin_mi', { label }))) return;
        try {
            await deletePosition(tenderId, node.id);
            toast.success(t('tenders.line_silindi'));
            onUpdated();
        } catch (err: any) {
            toast.error(err.response?.data?.error ||t('tenders.silinemedi'));
        }
    };

    return (
        <>
            {/* isRootSection için üstte ince grup ayırıcısı */}
            {isRootSection && (
                <tr aria-hidden="true">
                    <td colSpan={8} className="h-3 bg-slate-50/70" />
                </tr>
            )}
            <tr
                onClick={() => { if (!anyEditing) onSelect(node.id); }}
                className={`group cursor-pointer transition-colors ${rowBorderClass} ${isRootSection ? 'bg-slate-50/40' : ''} ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50/40'}`}
            >
                <td className="px-1.5 py-2 text-center align-top">
                    <Checkbox
                        aria-label={t('tenders.line_select')}
                        size="sm"
                        isSelected={!!checkedIds[node.id]}
                        onChange={(checked) => onCheckedChange(node.id, checked)}
                        onClick={(e) => e.stopPropagation()}
                    />
                </td>
                <TreeRowDescriptionCell
                    node={node}
                    level={level}
                    indent={indent}
                    rowType={rowType}
                    isDraft={isDraft}
                    isSectionRow={isSectionRow}
                    isInlineContentRow={isInlineContentRow}
                    canInlineEdit={canInlineEdit}
                    displayDescription={displayDescription}
                    titleClass={titleClass}
                    actionButtonClass={actionButtonClass}
                    headingButtonClass={headingButtonClass}
                    insertionParentId={insertionParentId}
                    insertionAfterRowId={insertionAfterRowId}
                    editingDesc={editingDesc}
                    descVal={descVal}
                    setDescVal={setDescVal}
                    setEditingDesc={setEditingDesc}
                    saveDesc={saveDesc}
                    editingLong={editingLong}
                    longVal={longVal}
                    setLongVal={setLongVal}
                    saveLong={saveLong}
                    openLongEditor={openLongEditor}
                    handleInlineImageFile={handleInlineImageFile}
                    toggleBullet={toggleBullet}
                    onDeletePosition={deleteCurrentPosition}
                    onAddChild={onAddChild}
                    onAddProduct={onAddProduct}
                    longEditorRef={longEditorRef}
                    inlineImageInputRef={inlineImageInputRef}
                />
                <TreeRowPricingCells
                    node={node}
                    canInlineEdit={canInlineEdit}
                    inlineInputClass={inlineInputClass}
                    inlineTextInputClass={inlineTextInputClass}
                    qty={qty}
                    displayUnitPrice={displayUnitPrice}
                    hasOwnAmount={hasOwnAmount}
                    showRowTotal={showRowTotal}
                    displayTotal={displayTotal}
                    updateInlineNumber={updateInlineNumber}
                    onInlinePositionChange={onInlinePositionChange}
                />                <td className="hidden px-2 py-2 text-center align-top relative">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (rowLogs.length > 0) setLogOpen((v) => !v); }}
                        disabled={rowLogs.length === 0}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${rowLogs.length > 0
                                ?"border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-blue-700"
                                :"border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
                            }`}
                        title={t('tenders.line_loglari')}
                    >
                        <ChevronUp size={14} />
                    </button>
                    {logOpen && rowLogs.length > 0 && (
                        <div
                            className="absolute right-2 bottom-9 z-30 w-[320px] max-w-[80vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl text-left animate-in slide-in-from-bottom-2 fade-in"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">{t('tenders.line_loglari')}</span>
                                <span className="text-[10px] font-mono text-slate-400">{rowLogs.length}</span>
                            </div>
                            <ul className="max-h-[240px] overflow-y-auto divide-y divide-slate-100">
                                {rowLogs.map((log) => (
                                    <li key={log.id} className="px-3 py-2 text-[11.5px]">
                                        <div className="flex items-center gap-1.5">
                                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-blue-700">
                                                {log.fieldName || log.actionType}
                                            </span>
                                            <span className="ml-auto text-[10px] text-slate-400">
                                                {dayjs(log.createdAt).format("DD.MM.YYYY HH:mm")}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-slate-700">{log.description || log.actionType}</div>
                                        {(log.oldValue != null || log.newValue != null) && (
                                            <div className="mt-1 font-mono text-[10.5px] text-slate-500">
                                                {log.oldValue ??t('tenders.empty')} → {log.newValue ??t('tenders.empty')}
                                            </div>
                                        )}
                                        <div className="mt-1 text-[10.5px] text-slate-400">
                                            {log.employeeName || log.employeeEmail || log.employeeId}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </td>
            </tr>
            {node.children.map((c) => {
                const childRowType = (c.rowType || (c.isArticleMapping ? 'PRODUCT' : 'SECTION')).toUpperCase();
                const childLevel = !c.isArticleMapping && childRowType === 'SECTION' ? level + 1 : level;

                return (
                    <TreeRow
                        key={c.id}
                        node={c}
                        level={childLevel}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        checkedIds={checkedIds}
                        onCheckedChange={onCheckedChange}
                        isDraft={isDraft}
                        tenderId={tenderId}
                        onInlinePositionChange={onInlinePositionChange}
                        onInlineMappingChange={onInlineMappingChange}
                        onAddChild={onAddChild}
                        onAddProduct={onAddProduct}
                        onUpdated={onUpdated}
                    />
                );
            })}
            {isRootSection && (
                <tr className="border-b-2 border-slate-200 bg-slate-50/80">
                    <td />
                    <td colSpan={6} className="px-2 py-1 text-right text-[10.5px] font-semibold text-slate-500">{t('tenders.section_total')}</td>
                    <td className="px-2 py-1 text-right font-mono text-[11px] font-bold text-slate-700">
                        {fmtMoney(node.totalWithChildren)}
                    </td>
                </tr>
            )}
        </>
    );
};
