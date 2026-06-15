import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    AlertTriangle,
    Calculator,
    CalendarPlus01 as CalendarPlus,
    Camera01 as Camera,
    Check,
    ChevronUp,
    Clipboard as ClipboardList,
    DownloadCloud02 as Download,
    Edit01 as Pencil,
    File05 as FileText,
    Hash01 as Hash,
    Image01 as ImageIcon,
    List,
    Mail01 as Mail,
    Package,
    Plus,
    Save01 as Save,
    Scan as ScanBarcode,
    Tag01 as Tag,
    Trash01 as Trash2,
    UploadCloud02 as Upload,
    XClose as X,
} from '@/components/icons/antIconCompat';

import { BarcodeScannerModal } from '../../../components/ui-shared/BarcodeScannerModal';
import { Button } from '../../../components/ui-shared/Button';
import { Card } from '../../../components/ui-shared/Card';
import { Field, Input, Select, Textarea } from '../../../components/ui-shared/Field';
import { Modal } from '../../../components/ui-shared/Modal';
import { Checkbox } from '../../../components/ui-shared/Checkbox';
import { tenderApi } from '../../../lib/api/tender';
import { projectApi } from '../../../lib/api/project';
import { useAuthStore } from '../../../store/authStore';
import { usePdfSettingsStore } from '../../../store/pdfSettingsStore';
import { useTenderStore } from '../../../store/tenderStore';
import type { CostInput, OfferScheduleSlotDto, PositionDto, TenderChangeLog, TenderMaterialUsageDto } from '../../../types/tender';
import type { ArticleStatus, ArticleStockSummary, InventoryArticle } from '../../../types/inventory';
import type { ProjectMaterial } from '../../../types/project';
import {
    FIXED_VAT,
    fmtMoney,
    fmtNumber,
    fmtVatRate,
    flattenTenderTreeForPdf,
    lineTotalWithTax,
    mergeArticleMappingUpdate,
    type TreeNode,
} from './tenderDetailUtils';

import { t } from '@/i18n/translate';

const getArticlePrice = (article?: { salePrice?: number | null; baseCost?: number | null } | null) => {
    const salePrice = Number(article?.salePrice ?? 0);
    return salePrice > 0 ? salePrice : Number(article?.baseCost ?? 0);
};


/* ── TreeRow ──
 * Pricing/quantity fields are editable in draft rows and auto-save through the detail page.
 * Description / long description retain inline pencil → check editing.
 */
const logDateLabel = (date: string) => {
    const d = dayjs(date);
    const now = dayjs();
    if (d.isSame(now, 'day')) return t('tenders.bugun');
    if (d.isSame(now.subtract(1, 'day'), 'day')) return t('tenders.dun');
    return d.format("D MMMM YYYY");
};

const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
};

const fieldLabel = (field?: string | null) => {
    const labels: Record<string, string> = {
        quantity:t('common.quantity'),
        quantityMultiplier:t('common.quantity'),
        unitPrice:t('tenders.unit_price'),
        baseCost:t('tenders.unit_cost'),
        discount:t('common.discount'),
        taxRate: 'KDV',
        shortDescription:t('common.description'),
        longDescription:t('tenders.line_content'),
        description:t('common.description'),
        name: 'Ürün adı',
        unit:t('tenders.unit'),
        articleCode:t('tenders.stock_code'),
        minStockLevel:t('tenders.minimum_stock'),
        criticalStockLevel:t('tenders.critical_stock'),
        maxStockLevel:t('tenders.maksimum_stock'),
        status: 'Durum',
    };
    return field ? (labels[field] ?? field) :t('common.actions');
};

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const renderInlineMarkdownHtml = (value: string) => {
    return escapeHtml(value)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>')
        .replace(/(^|[\s>])(?:\*\*|__|_)(?=($|[\s<]))/g, '$1');
};

export const markdownToHtml = (value: string) => {
    const lines = value.split('\n');
    let html = '';
    let inList = false;

    lines.forEach((line, index) => {
        const bullet = line.match(/^\s*-\s+(.*)$/);
        if (bullet) {
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            html += `<li>${renderInlineMarkdownHtml(bullet[1]) || '<br>'}</li>`;
            return;
        }

        if (inList) {
            html += '</ul>';
            inList = false;
        }

        const heading = line.match(/^(#{1,2})\s+(.*)$/);
        if (heading) {
            const marker = heading[1] ?? '#';
            const headingText = heading[2] ?? '';
            const tag = marker.length === 1 ? 'h2' : 'h3';
            html += `<${tag}>${renderInlineMarkdownHtml(headingText) || '<br>'}</${tag}>`;
            return;
        }

        html += renderInlineMarkdownHtml(line) || '<br>';
        if (index < lines.length - 1) html += '<br>';
    });

    if (inList) html += '</ul>';
    return html;
};

const htmlToMarkdown = (root: HTMLElement) => {
    const walk = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent?.replace(/\u00a0/g, ' ') ?? '';
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const children = Array.from(el.childNodes).map(walk).join('');

        if (tag === 'h1' || tag === 'h2') return `# ${children.trim()}\n`;
        if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return `## ${children.trim()}\n`;
        if (tag === 'strong' || tag === 'b') return children.trim() ? `**${children}**` : children;
        if (tag === 'em' || tag === 'i') return children.trim() ? `_${children}_` : children;
        if (tag === 'li') return `- ${children.trim()}\n`;
        if (tag === 'ul' || tag === 'ol') return `${children}\n`;
        if (tag === 'div' || tag === 'p') return `${children}\n`;
        if (tag === 'br') return '\n';
        return children;
    };

    return Array.from(root.childNodes)
        .map(walk)
        .join('')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n');
};

export const RichTextMarkdownEditor: React.FC<{
    value: string;
    onChange: (value: string) => void;
    minHeight?: number;
    className?: string;
    placeholder?: string;
    variant?: 'boxed' | 'inline';
    showToolbar?: boolean;
}> = ({ value, onChange, minHeight = 92, className = '', placeholder = t('tenders.description_yazin'), variant = 'boxed', showToolbar = true }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState({ list: false, largeHeading: false, smallHeading: false });
    const [focused, setFocused] = useState(false);
    const hasContent = value.trim().length > 0;
    const isInline = variant === 'inline';
    const showInlineToolbar = isInline && focused;
    const shouldShowPlaceholder = !hasContent && placeholder.trim().length > 0;

    useEffect(() => {
        const el = editorRef.current;
        if (!el || document.activeElement === el) return;
        const nextHtml = markdownToHtml(value);
        if (el.innerHTML !== nextHtml) el.innerHTML = nextHtml;
    }, [value]);

    const getCurrentBlockTag = (root: HTMLElement) => {
        const selection = window.getSelection();
        let node = selection?.anchorNode || null;
        while (node && node !== root) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = (node as HTMLElement).tagName.toLowerCase();
                if (/^h[1-6]$/.test(tag) || tag === 'p' || tag === 'div' || tag === 'li') return tag;
            }
            node = node.parentNode;
        }
        return '';
    };

    const updateActiveState = () => {
        const el = editorRef.current;
        if (!el || document.activeElement !== el) return;

        try {
            const tag = getCurrentBlockTag(el);
            setActive({
                list: document.queryCommandState('insertUnorderedList'),
                largeHeading: tag === 'h1' || tag === 'h2',
                smallHeading: tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6',
            });
        } catch {
            setActive({ list: false, largeHeading: false, smallHeading: false });
        }
    };

    useEffect(() => {
        const onSelectionChange = () => {
            const selection = window.getSelection();
            const el = editorRef.current;
            if (!selection || !el || !selection.anchorNode || !el.contains(selection.anchorNode)) return;
            updateActiveState();
        };

        document.addEventListener('selectionchange', onSelectionChange);
        return () => document.removeEventListener('selectionchange', onSelectionChange);
    }, []);

    const emitChange = (preserveEmptyHtml = false) => {
        const el = editorRef.current;
        if (!el) return;
        const nextValue = htmlToMarkdown(el);
        if (!nextValue.trim() && !preserveEmptyHtml) el.innerHTML = '';
        onChange(nextValue);
        updateActiveState();
    };

    const getTextLengthBeforeCaret = (root: HTMLElement) => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
        const range = selection.getRangeAt(0);
        if (!root.contains(range.startContainer)) return null;

        const prefixRange = range.cloneRange();
        prefixRange.selectNodeContents(root);
        prefixRange.setEnd(range.startContainer, range.startOffset);
        return prefixRange.toString().length;
    };

    const selectTextRange = (root: HTMLElement, start: number, end: number) => {
        const selection = window.getSelection();
        if (!selection) return false;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let currentIndex = 0;
        let startNode: Text | null = null;
        let endNode: Text | null = null;
        let startOffset = 0;
        let endOffset = 0;

        while (walker.nextNode()) {
            const node = walker.currentNode as Text;
            const nextIndex = currentIndex + node.data.length;
            if (!startNode && start >= currentIndex && start <= nextIndex) {
                startNode = node;
                startOffset = start - currentIndex;
            }
            if (!endNode && end >= currentIndex && end <= nextIndex) {
                endNode = node;
                endOffset = end - currentIndex;
                break;
            }
            currentIndex = nextIndex;
        }

        if (!startNode || !endNode) return false;
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
    };

    const convertDashAtLineStartToList = () => {
        const el = editorRef.current;
        const textLengthBeforeCaret = el ? getTextLengthBeforeCaret(el) : null;
        if (!el || textLengthBeforeCaret == null || textLengthBeforeCaret < 1) return false;

        const textBeforeCaret = el.innerText.slice(0, textLengthBeforeCaret).replace(/\u00a0/g, ' ');
        const currentLine = textBeforeCaret.slice(Math.max(textBeforeCaret.lastIndexOf('\n') + 1, 0));
        if (!/^\s*-$/.test(currentLine)) return false;

        if (!selectTextRange(el, textLengthBeforeCaret - 1, textLengthBeforeCaret)) return false;
        document.execCommand('delete');
        document.execCommand('insertUnorderedList');
        emitChange(true);
        updateActiveState();
        return true;
    };

    const runListCommand = () => {
        editorRef.current?.focus();
        document.execCommand('insertUnorderedList');
        emitChange(true);
        updateActiveState();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'q') {
            event.preventDefault();
            runListCommand();
            return;
        }

        if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey && convertDashAtLineStartToList()) {
            event.preventDefault();
            return;
        }

        if (event.key !== "Enter") return;

        if (document.queryCommandState('insertUnorderedList')) {
            window.setTimeout(() => emitChange(true), 0);
            return;
        }

        event.preventDefault();
        document.execCommand('insertHTML', false, '<br><br>');
        emitChange(true);
    };

    const toolbarButtonClass = (isActive: boolean) =>
        isInline
            ? `flex h-7 w-7 items-center justify-center rounded-md border bg-white shadow-xs transition-colors duration-150 ${isActive ?t('tenders.border_1f2654_svg_text_1f2654') :t('tenders.border_1f2654_25_svg_text_1f2654_60_hover_svg_te')}`
            : `flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white !text-slate-950 shadow-sm transition-colors hover:bg-[#1f2654] hover:!text-white hover:[&_svg]:!text-white [&_svg]:!text-slate-950 ${isActive ?"bg-[#1f2654] !text-white [&_svg]:!text-white" : ''}`;

    const frameClass = isInline
        ? `relative overflow-visible rounded-md border border-slate-200 bg-white px-2 py-1 transition-[margin,border-color,box-shadow] duration-150 ease-out focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-200 ${showInlineToolbar ? 'mt-10' : 'mt-0'} ${className}`
        : `overflow-hidden rounded-md border border-slate-300 bg-white shadow-xs transition-colors hover:border-slate-400 focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-200 ${className}`;
    const toolbarClass = isInline
        ? `absolute -top-9 left-1 z-20 inline-flex h-7 items-center bg-transparent p-0 transition-all duration-150 ease-out ${showInlineToolbar ?t('tenders.pointer_events_auto_translate_y_0_scale_100_opac') :t('tenders.pointer_events_none_translate_y_1_scale_95_opaci')}`
        :"flex items-center gap-1 border-b border-slate-100 bg-slate-50/90 px-1.5 py-1";
    const editorClass = `rich-text-editor w-full cursor-text text-[13px] leading-6 text-slate-800 outline-none [&_h2]:my-1 [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:leading-6 [&_h3]:my-1 [&_h3]:text-[13.5px] [&_h3]:font-semibold [&_h3]:leading-5 [&_ul]:list-disc [&_ul]:pl-7 [&_li]:my-0.5 [&_li]:pl-1 ${isInline ?t('tenders.bg_transparent_px_0_py_0_5') :"px-3 py-2 focus:bg-white"} ${shouldShowPlaceholder ?"before:pointer-events-none before:text-slate-400 before:content-[attr(data-placeholder)]" : ''}`;

    return (
        <div
            className={frameClass}
            onClick={() => editorRef.current?.focus()}
        >
            {showToolbar && (!isInline || showInlineToolbar) && (
                <div className={toolbarClass} title={t('tenders.bullet_ctrl_q_or_space')}>
                    <button type="button" aria-label={t('tenders.bullet_ctrl_q_or_space')} title={t('tenders.bullet_ctrl_q_or_space')} aria-pressed={active.list} onMouseDown={(e) => e.preventDefault()} onClick={runListCommand} className={toolbarButtonClass(active.list)}>
                        <List size={14} />
                    </button>
                    {!isInline && (
                        <span className="ml-1 text-[10.5px] font-medium text-slate-400">{t('tenders.ctrl_q_bosluk')}</span>
                    )}
                </div>
            )}
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => emitChange()}
                onFocus={() => {
                    setFocused(true);
                    updateActiveState();
                }}
                onBlur={() => {
                    setFocused(false);
                    emitChange();
                }}
                onKeyDown={handleKeyDown}
                onKeyUp={updateActiveState}
                onMouseUp={updateActiveState}
                onPaste={(event) => {
                    event.preventDefault();
                    const text = event.clipboardData.getData('text/plain');
                    document.execCommand('insertText', false, text);
                    emitChange();
                }}
                data-placeholder={placeholder}
                className={editorClass}
                style={{ minHeight }}
            />
        </div>
    );
};

const logValue = (value?: string | null) => {
    if (value == null || value === '') return t('tenders.empty');
    const n = Number(value);
    if (!Number.isNaN(n) && value.trim() !== '') return fmtNumber(n);
    return value;
};

const logSubject = (log: TenderChangeLog) => {
    const text = log.description || '';
    const patterns = [/^(.+?) ürünü /i, /^(.+?) - /, /^(.+?) miktarı /i, /^(.+?) indirimi /i, /^(.+?) tekliften /i];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1].trim();
    }
    if (log.actionType.includes('POSITION')) return t('tenders.line');
    if (log.actionType.includes('ARTICLE')) return t('tenders.product');
    return t('common.actions');
};

const logTitle = (log: TenderChangeLog) => {
    const subject = logSubject(log);
    if (log.actionType === 'ARTICLE_MAPPED') return `${subject} satıra eklendi`;
    if (log.actionType === 'ARTICLE_MAPPING_REMOVED') return `${subject} tekliften kaldırıldı`;
    if (log.actionType === 'ARTICLE_PRICE_UPDATED') return `${subject} ürün fiyatı güncellendi`;
    if (log.actionType === 'ARTICLE_UPDATED') return `${subject} ürün bilgisi güncellendi`;
    if (log.actionType === 'ARTICLE_MAPPING_PRICE_UPDATED') return `${subject} teklif ürünü güncellendi`;
    if (log.actionType === 'POSITION_PRICE_UPDATED') return `${subject} fiyatlandırması güncellendi`;
    if (log.actionType === 'POSITION_CREATED') return `${subject} eklendi`;
    if (log.actionType === 'POSITION_DELETED') return `${subject} silindi`;
    if (log.actionType === 'POSITION_UPDATED') return `${subject} bilgisi güncellendi`;
    return log.description || log.actionType;
};

const logDetail = (log: TenderChangeLog) => {
    const field = fieldLabel(log.fieldName);
    const hasBrokenEncoding = log.description ? /[\u00C2-\u00C5\uFFFD]/.test(log.description) : false;
    if (log.description && !hasBrokenEncoding) return log.description;
    if (log.oldValue != null || log.newValue != null) return `${field}: ${logValue(log.oldValue)} → ${logValue(log.newValue)}`;
    return log.description ||t('tenders.action_kaydedildi');
};

export const TenderLogsSheet: React.FC<{
    open: boolean;
    logs: TenderChangeLog[];
    loading: boolean;
    onClose: () => void;
}> = ({ open, logs, loading, onClose }) => {
    if (!open) return null;

    const groups = logs.reduce<Record<string, TenderChangeLog[]>>((acc, log) => {
        const key = dayjs(log.createdAt).format('YYYY-MM-DD');
        acc[key] = acc[key] ? [...acc[key], log] : [log];
        return acc;
    }, {});

    return (
        <div className="fixed inset-0 z-[70] flex justify-end bg-overlay/30 font-sans animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="h-full w-full max-w-[520px] overflow-hidden border-l border-secondary bg-primary text-primary shadow-2xl animate-in slide-in-from-right-2 fade-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 border-b border-secondary px-6 py-5">
                    <div>
                        <h2 className="text-lg font-semibold text-primary">{t('tenders.action_loglari')}</h2>
                        <p className="mt-1 text-sm text-tertiary">{t('tenders.tender_yapilan_product_line_price_ve_stock_hareke')}</p>
                        <h2 className="hidden">{t('tenders.old_log_basligi')}</h2>
                        <p className="hidden">{t('tenders.old_log_description')}</p>
                    </div>
                    <button onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-xs outline-focus-ring transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2" aria-label={t('common.close')}>
                        <X size={16} />
                    </button>
                </div>

                <div className="h-[calc(100vh-73px)] overflow-y-auto px-5 py-5">
                    {loading ? (
                        <div className="py-10 text-center text-[12.5px] text-slate-400">{t('tenders.loglar_loading')}</div>
                    ) : logs.length === 0 ? (
                        <div className="py-10 text-center text-[12.5px] text-slate-400">{t('tenders.no_log_records_yet')}</div>
                    ) : (
                        Object.entries(groups).map(([date, rows]) => (
                            <div key={date} className="mb-5 last:mb-0">
                                <div className="mb-3 flex items-center gap-3">
                                    <div className="h-px flex-1 bg-slate-200" />
                                    <span className="text-[12px] font-semibold text-slate-400">{logDateLabel(date)}</span>
                                    <div className="h-px flex-1 bg-slate-200" />
                                </div>
                                <div className="space-y-4">
                                    {rows.map((log) => (
                                        <div key={log.id} className="grid grid-cols-[42px_1fr] gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-[14px] font-bold text-white">
                                                {(log.employeeName || log.employeeEmail || log.employeeId || '?').slice(0, 1).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-baseline gap-1.5">
                                                    <span className="text-[13px] font-semibold text-slate-800">{log.employeeName || log.employeeEmail || log.employeeId}</span>
                                                    <span className="text-[11px] text-slate-400">{dayjs(log.createdAt).format("DD.MM, HH:mm")}</span>
                                                </div>
                                                <div className="mt-0.5 text-[14px] font-semibold text-slate-800">
                                                    {logTitle(log)}
                                                </div>
                                                <div className="hidden">
                                                    <span>{fieldLabel(log.fieldName)}</span>
                                                    {log.oldValue != null || log.newValue != null ? (
                                                        <>
                                                            <span className="mx-1 text-slate-400">•</span>
                                                            <span className="font-mono text-slate-500">{log.oldValue ??t('tenders.empty')}</span>
                                                            <span className="mx-1.5 text-slate-500">→</span>
                                                            <span className="font-mono font-semibold text-blue-700">{log.newValue ??t('tenders.empty')}</span>
                                                        </>
                                                    ) : (
                                                        <span className="ml-1">{log.description || log.actionType}</span>
                                                    )}
                                                </div>
                                                <div className="mt-1 text-[12.5px] text-slate-600">{logDetail(log)}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

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
    const rowType = (node.rowType || (node.isArticleMapping ? 'PRODUCT' : 'SECTION')).toUpperCase();
    const isSectionRow = !node.isArticleMapping && rowType === 'SECTION';
    const isRootSection = isSectionRow && level === 0;
    const isInlineContentRow = !node.isArticleMapping && (rowType === 'DESCRIPTION' || rowType === 'CUSTOM');
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

    const qty = node.quantity;
    const effectivePrice = node.unitPrice ?? null;
    const calcTotal = node.calculation?.totalCalculatedPrice ?? 0;
    const derivedNetTotal = effectivePrice != null && effectivePrice > 0 && qty > 0
        ? qty * effectivePrice * (1 - (node.discount ?? 0) / 100) + (node.calculation?.additionalCost ?? 0)
        : calcTotal;
    const derivedTotal = lineTotalWithTax(derivedNetTotal, node.taxRate);
    const displayTotal = hasChildren ? node.totalWithChildren : (derivedTotal > 0 ? derivedTotal : node.totalWithChildren);
    const showRowTotal = !isSectionRow && displayTotal > 0;
    const displayUnitPrice = effectivePrice != null
        ? effectivePrice
        : (qty > 0 && calcTotal > 0 ? calcTotal / qty : null);
    const hasOwnAmount = (qty > 0 && displayUnitPrice != null) || calcTotal > 0;
    const indent = level * 18;
    const anyEditing = editingDesc || editingLong;
    const rowLogs: TenderChangeLog[] = [];
    const canInlineEdit = isDraft && !node.isArticleMapping;
    const displayDescription = node.shortDescription?.trim() || '';
    // SECTION → font-semibold (bölüm başlığı gibi); TITLE → direkt bold başlık (line-through yok)
    const titleClass = rowType === 'TITLE'
        ? (level === 0 ?"text-[15px] font-bold text-slate-900" :"text-[14px] font-bold text-slate-800")
        : rowType === 'CUSTOM'
            ?"text-[13px] font-semibold text-slate-800"
            : rowType === 'DESCRIPTION'
                ?"text-[12.5px] leading-5 text-slate-600"
                : rowType === 'PRODUCT'
                    ?"text-[13px] font-semibold text-slate-900"
                    : isSectionRow
                        ? (isRootSection ?"text-[13px] font-semibold text-slate-900" :"text-[12.5px] font-semibold text-slate-800")
                        :"text-[13px] text-slate-800";
    const inlineInputClass = "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-[11px] text-slate-700 outline-none transition-colors hover:border-slate-200 focus:border-blue-400 focus:bg-white";
    const inlineTextInputClass = "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-left text-[11px] text-slate-600 outline-none transition-colors hover:border-slate-200 focus:border-blue-400 focus:bg-white";
    const actionButtonClass = t('tenders.inline_flex_h_7_items_center_gap_1_rounded_borde');
    const headingButtonClass = (active: boolean) =>
        `inline-flex h-6 min-w-6 items-center justify-center rounded border px-1 text-[11px] font-semibold transition-colors ${
            active
                ?"border-slate-400 bg-slate-100 text-slate-900"
                :"border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-900"
        }`;
    const isTitleRow = !node.isArticleMapping && rowType === 'TITLE';
    const isSeparatedContentRow = rowType === 'PRODUCT' || rowType === 'DESCRIPTION' || rowType === 'CUSTOM';
    // isRootSection için üst kalın çizgi kaldırıldı → direkt başlık görünümü
    const rowBorderClass = isRootSection
        ?"border-b border-slate-200"
        : isSectionRow
            ?"border-b border-slate-200"
            : isTitleRow
                ?"border-b border-slate-100"
                : isSeparatedContentRow
                    ?"border-b border-slate-100"
                    :"border-b border-slate-100";
    const parseInlineNumber = (value: string) => {
        const normalized = value.replace(/'/g, '').replace(',', '.');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
    };
    const updateInlineNumber = (field: 'quantity' | 'unitPrice' | 'discount', value: string) => {
        const next = field === 'discount'
            ? Math.min(parseInlineNumber(value), 100)
            : parseInlineNumber(value);

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
                {/* Description + Long */}
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
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                const label = hasChildren
                                                    ? `"${node.shortDescription}" ve tüm alt satırları`
                                                    : `"${node.shortDescription}"`;
                                                if (!confirm(`${label} silinsin mi?`)) return;
                                                try {
                                                    await deletePosition(tenderId, node.id);
                                                    toast.success(t('tenders.line_silindi'));
                                                    onUpdated();
                                                } catch (err: any) {
                                                    toast.error(err.response?.data?.error ||t('tenders.silinemedi'));
                                                }
                                            }}
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
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                const label = hasChildren
                                                    ? `"${node.shortDescription}" ve tüm alt satırları`
                                                    : `"${node.shortDescription}"`;
                                                if (!confirm(`${label} silinsin mi?`)) return;
                                                try {
                                                    await deletePosition(tenderId, node.id);
                                                    toast.success(t('tenders.line_silindi'));
                                                    onUpdated();
                                                } catch (err: any) {
                                                    toast.error(err.response?.data?.error ||t('tenders.silinemedi'));
                                                }
                                            }}
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

                {/* Qty (read-only) */}
                <td className="px-1.5 py-2 text-right align-top">
                    {canInlineEdit ? (
                        <input
                            aria-label={t('common.quantity')}
                            className={inlineInputClass}
                            inputMode="decimal"
                            min={0}
                            step="any"
                            type="number"
                            value={qty > 0 ? qty : ''}
                            onChange={(e) => updateInlineNumber('quantity', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="font-mono text-[11px] text-slate-700">
                            {qty > 0 ? qty : ''}
                        </span>
                    )}
                </td>

                {/* Unit (read-only) */}
                <td className="min-w-[64px] px-1.5 py-2 text-left align-top">
                    {canInlineEdit && !node.isArticleMapping ? (
                        <input
                            aria-label={t('tenders.unit')}
                            className={inlineTextInputClass}
                            value={node.unit ?? ''}
                            onChange={(e) => onInlinePositionChange?.(node.id, { unit: e.target.value || null })}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="text-[11px] text-slate-500">
                            {node.unit ? node.unit : ''}
                        </span>
                    )}
                </td>

                {/* Unit Price (read-only) */}
                <td className="min-w-[88px] px-1.5 py-2 text-right align-top">
                    {canInlineEdit && !node.isArticleMapping ? (
                        <input
                            aria-label={t('tenders.unit_price')}
                            className={inlineInputClass}
                            inputMode="decimal"
                            min={0}
                            step="any"
                            type="number"
                            value={displayUnitPrice != null ? displayUnitPrice : ''}
                            onChange={(e) => updateInlineNumber('unitPrice', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="font-mono text-[11px] text-slate-600">
                            {displayUnitPrice != null ? fmtMoney(displayUnitPrice) : ''}
                        </span>
                    )}
                </td>

                {/* Discount (read-only) */}
                <td className="min-w-[64px] px-1.5 py-2 text-right align-top">
                    {canInlineEdit ? (
                        <input
                            aria-label={t('common.discount')}
                            className={inlineInputClass}
                            inputMode="decimal"
                            max={100}
                            min={0}
                            step="any"
                            type="number"
                            value={node.discount ?? ''}
                            onChange={(e) => updateInlineNumber('discount', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="font-mono text-[11px] text-slate-600">
                            {node.discount && node.discount > 0 ? `${node.discount}%` : ''}
                        </span>
                    )}
                </td>

                {/* KDV — her ürün/satır için sabit %8.1, gri badge */}
                <td className="min-w-[72px] px-1.5 py-2 text-right align-top">
                    {hasOwnAmount ? (
                        <span
                            className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 font-mono whitespace-nowrap"
                            title={t('tenders.fixed_kdv_orani')}
                        >
                            %{fmtVatRate(node.taxRate != null && node.taxRate > 0 ? node.taxRate : FIXED_VAT)}
                        </span>
                    ) : (
                        <span className="text-slate-300">—</span>
                    )}
                </td>

                {/* Total (read-only) */}
                <td className="px-2 py-2 text-right font-mono text-[10.5px] align-top">
                    {showRowTotal ? (
                        <span className="font-semibold text-slate-800">
                            {fmtMoney(displayTotal)}
                        </span>
                    ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="hidden px-2 py-2 text-center align-top relative">
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

/* ── Detail Panel ── */
type PositionPricingPatch = Pick<Partial<PositionDto>, 'quantity' | 'unit' | 'unitPrice' | 'discount' | 'taxRate'>;
type MappingPricingPatch = { quantityMultiplier?: number; discount?: number | null };

export const PositionDetailPanel: React.FC<{
    position: TreeNode;
    tenderId: string;
    isDraft: boolean;
    canCalc: boolean;
    stockArticles: ArticleStockSummary[];
    stockArticlesLoading: boolean;
    stockArticlesLoaded: boolean;
    activeTab: 'calc' | 'articles' | 'meta';
    setActiveTab: (t: 'calc' | 'articles' | 'meta') => void;
    onSaveCalc: (c: CostInput) => Promise<void>;
    onMapArticle: (articleId: string, qty: number, opts?: { discount?: number }) => Promise<void>;
    onRemoveArticleMapping: (mappingId: string) => Promise<void>;
    onSelectArticleMapping: (mappingId: string) => void;
    onLocalPositionChange?: (positionId: string, patch: PositionPricingPatch) => void;
    onLocalMappingChange?: (positionId: string, mappingId: string, patch: MappingPricingPatch) => void;
}> = ({ position, tenderId, isDraft, canCalc, stockArticles, stockArticlesLoading, stockArticlesLoaded, activeTab, setActiveTab, onSaveCalc, onMapArticle, onRemoveArticleMapping, onSelectArticleMapping, onLocalPositionChange, onLocalMappingChange }) => {
    const { settings } = usePdfSettingsStore();
    const defaultTaxRate = settings.vatRate ?? 8.1;
    const { updatePosition: storeUpdatePosition } = useTenderStore();

    // Position-level pricing (editable from this panel)
    const [pricing, setPricing] = useState({
        quantity: position.quantity ?? 0,
        unit: position.unit ?? '',
        unitPrice: position.unitPrice ?? 0,
        discount: position.discount ?? 0,
        taxRate: position.taxRate ?? defaultTaxRate,
    });
    const savedPricingRef = useRef({
        quantity: position.quantity ?? 0,
        unit: position.unit ?? '',
        unitPrice: position.unitPrice ?? 0,
        discount: position.discount ?? 0,
        taxRate: position.taxRate ?? defaultTaxRate,
    });

    const isArticle = position.isArticleMapping;
    const visibleActiveTab = isArticle ? 'calc' : activeTab;

    // Cost breakdown (kept for advanced cost build-up)
    const [cost, setCost] = useState<CostInput>({
        materialCost: 0,
        laborCost: 0,
        overheadCost: 0,
        riskAmount: 0,
        additionalCost: 0,
        profitMargin: 0,
    });
    const [saving, setSaving] = useState(false);
    const [marginMode, setMarginMode] = useState<'amount' | 'percent'>('amount');
    const [marginPercent, setMarginPercent] = useState<number>(0);
    const [articleId, setArticleId] = useState<string>('');
    const [articleQty, setArticleQty] = useState<number>(1);
    const [articleDiscount, setArticleDiscount] = useState<number>(0);
    const [bulkMappingDiscount, setBulkMappingDiscount] = useState<number>(0);
    const [mappingDiscountDrafts, setMappingDiscountDrafts] = useState<Record<string, number>>({});
    const [appliedMappingDiscounts, setAppliedMappingDiscounts] = useState<Record<string, number>>({});
    const [hiddenMappingIds, setHiddenMappingIds] = useState<Record<string, boolean>>({});
    const [mappingLoadingId, setMappingLoadingId] = useState<string | null>(null);
    const autoSaveSeq = useRef(0);
    const mappingDiscountTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    const selectedStockArticle = useMemo(
        () => stockArticles.find((a) => a.id === articleId) || null,
        [stockArticles, articleId]
    );


    useEffect(() => {
        if (position.calculation) {
            setCost({
                materialCost: position.calculation.materialCost,
                laborCost: position.calculation.laborCost,
                overheadCost: position.calculation.overheadCost,
                riskAmount: position.calculation.riskAmount,
                additionalCost: position.calculation.additionalCost || 0,
                profitMargin: position.calculation.profitMargin,
            });
        } else {
            setCost({ materialCost: 0, laborCost: 0, overheadCost: 0, riskAmount: 0, additionalCost: 0, profitMargin: 0 });
        }
        setMarginPercent(0);
        setMarginMode('amount');
        const nextPricing = {
            quantity: position.quantity ?? 0,
            unit: position.unit ?? '',
            unitPrice: position.unitPrice ?? 0,
            discount: position.discount ?? 0,
            taxRate: position.taxRate ?? defaultTaxRate,
        };
        setPricing(nextPricing);
        savedPricingRef.current = nextPricing;
        setMappingDiscountDrafts(
            Object.fromEntries((position.articleMappings ?? []).map((m) => [m.id, m.discount ?? 0]))
        );
        setBulkMappingDiscount(0);
        setAppliedMappingDiscounts({});
        setHiddenMappingIds({});
    }, [position.id]);

    useEffect(() => {
        const saved = savedPricingRef.current;
        const hasUnsavedPanelChange =
            (pricing.quantity ?? 0) !== (saved.quantity ?? 0) ||
            (pricing.unit ?? '') !== (saved.unit ?? '') ||
            (pricing.unitPrice ?? 0) !== (saved.unitPrice ?? 0) ||
            (pricing.discount ?? 0) !== (saved.discount ?? 0) ||
            (pricing.taxRate ?? 0) !== (saved.taxRate ?? defaultTaxRate);

        if (hasUnsavedPanelChange) return;

        const nextPricing = {
            quantity: position.quantity ?? 0,
            unit: position.unit ?? '',
            unitPrice: position.unitPrice ?? 0,
            discount: position.discount ?? 0,
            taxRate: position.taxRate ?? defaultTaxRate,
        };
        setPricing(nextPricing);
        savedPricingRef.current = nextPricing;
    }, [position.quantity, position.unit, position.unitPrice, position.discount, position.taxRate, defaultTaxRate]);

    useEffect(() => {
        return () => {
            Object.values(mappingDiscountTimers.current).forEach(clearTimeout);
        };
    }, []);

    const updatePricing = (patch: Partial<typeof pricing>) => {
        const next = { ...pricing, ...patch };
        setPricing(next);

        if (isArticle && position.parentPositionId && position.mappingId) {
            const mappingPatch: MappingPricingPatch = {};
            if (patch.quantity !== undefined) mappingPatch.quantityMultiplier = patch.quantity;
            if (patch.discount !== undefined) mappingPatch.discount = patch.discount;
            if (Object.keys(mappingPatch).length > 0) {
                onLocalMappingChange?.(position.parentPositionId, position.mappingId, mappingPatch);
            }
            return;
        }

        onLocalPositionChange?.(position.id, patch as PositionPricingPatch);
    };

    const subtotal = cost.materialCost + cost.laborCost + cost.overheadCost + cost.riskAmount + cost.additionalCost;
    const finalMargin = marginMode === 'percent' ? +(subtotal * marginPercent / 100).toFixed(2) : cost.profitMargin;
    const total = subtotal + finalMargin;

    // Add KDV to the total display for Advanced Cost section — always 8.1
    const effectiveVat = (pricing.taxRate != null && pricing.taxRate > 0) ? pricing.taxRate : 8.1;
    const totalWithTax = total * (1 + effectiveVat / 100);

    const unitPrice = position.quantity > 0 ? total / position.quantity : 0;

    // Pricing snapshot derived totals — KDV always 8.1
    const pricingGross = pricing.quantity * pricing.unitPrice;
    const pricingDiscountAmount = pricingGross * (pricing.discount / 100);
    const pricingNet = pricingGross - pricingDiscountAmount;
    const pricingAdditionalCost = isArticle ? 0 : cost.additionalCost;
    const pricingTaxBase = pricingNet + pricingAdditionalCost;
    const pricingTaxAmount = pricingTaxBase * (effectiveVat / 100);
    const pricingTotalWithTax = pricingTaxBase + pricingTaxAmount;

    const savedPricing = savedPricingRef.current;
    const pricingDirty =
        (pricing.quantity ?? 0) !== (savedPricing.quantity ?? 0) ||
        (pricing.unit ?? '') !== (savedPricing.unit ?? '') ||
        (pricing.unitPrice ?? 0) !== (savedPricing.unitPrice ?? 0) ||
        (pricing.discount ?? 0) !== (savedPricing.discount ?? 0) ||
        (pricing.taxRate ?? 0) !== (savedPricing.taxRate ?? defaultTaxRate);

    const calculationDirty = !isArticle && (
        !position.calculation ||
        (cost.materialCost ?? 0) !== (position.calculation.materialCost ?? 0) ||
        (cost.laborCost ?? 0) !== (position.calculation.laborCost ?? 0) ||
        (cost.overheadCost ?? 0) !== (position.calculation.overheadCost ?? 0) ||
        (cost.riskAmount ?? 0) !== (position.calculation.riskAmount ?? 0) ||
        (cost.additionalCost ?? 0) !== (position.calculation.additionalCost ?? 0) ||
        (finalMargin ?? 0) !== (position.calculation.profitMargin ?? 0)
    );
    const autoSaveDirty = isDraft && canCalc && (pricingDirty || calculationDirty);

    const savePricing = async () => {
        try {
            if (isArticle) {
                if (!position.mappingId || !position.parentPositionId || !position.articleId) return;
                const result = await tenderApi.updateArticleMapping(tenderId, position.parentPositionId, position.mappingId, {
                    quantityMultiplier: pricing.quantity,
                    discount: pricing.discount,
                });
                mergeArticleMappingUpdate(position.parentPositionId, position.mappingId, result, {
                    quantityMultiplier: pricing.quantity,
                    discount: pricing.discount,
                });
                savedPricingRef.current = { ...pricing };
                return;
            }
            await Promise.all([
                pricingDirty
                    ? storeUpdatePosition(tenderId, position.id, {
                        quantity: pricing.quantity,
                        unit: pricing.unit || null,
                        unitPrice: pricing.unitPrice || null,
                        discount: pricing.discount,
                        taxRate: pricing.taxRate,
                    })
                    : Promise.resolve(),
                calculationDirty
                    ? onSaveCalc({ ...cost, profitMargin: finalMargin })
                    : Promise.resolve(),
            ]);
            savedPricingRef.current = { ...pricing };
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.kaydedilemedi'));
            throw e;
        }
    };

    useEffect(() => {
        if (!autoSaveDirty) return;
        const seq = autoSaveSeq.current + 1;
        autoSaveSeq.current = seq;
        const t = setTimeout(async () => {
            setSaving(true);
            try {
                await savePricing();
            } catch {
                // Error toast is emitted in savePricing.
            } finally {
                if (autoSaveSeq.current === seq) setSaving(false);
            }
        }, 500);
        return () => clearTimeout(t);
    }, [autoSaveDirty, pricing, cost, finalMargin]);

    const updateArticleMappingDiscount = async (mappingId: string, nextDiscount: number) => {
        const mapping = position.articleMappings?.find((m) => m.id === mappingId);
        if (!mapping || !position.id) return;
        setMappingLoadingId(mappingId);
        try {
            setAppliedMappingDiscounts((prev) => ({ ...prev, [mappingId]: nextDiscount }));
            useTenderStore.setState((state) => ({
                detail: state.detail
                    ? {
                        ...state.detail,
                        positions: state.detail.positions.map((p) =>
                            p.id === position.id
                                ? {
                                    ...p,
                                    articleMappings: p.articleMappings?.map((m) =>
                                        m.id === mappingId ? { ...m, discount: nextDiscount } : m
                                    ),
                                }
                                : p
                        ),
                    }
                    : state.detail,
            }));
            const result = await tenderApi.updateArticleMapping(tenderId, position.id, mapping.id, { discount: nextDiscount });
            mergeArticleMappingUpdate(position.id, mapping.id, result, { discount: nextDiscount });
        } catch (err: any) {
            setAppliedMappingDiscounts((prev) => {
                const next = { ...prev };
                delete next[mappingId];
                return next;
            });
            toast.error(err.response?.data?.error ||t('tenders.discount_guncellenemedi'));
        } finally {
            setMappingLoadingId(null);
        }
    };

    const queueArticleMappingDiscount = (mappingId: string, nextDiscount: number) => {
        const normalized = Math.min(100, Math.max(0, nextDiscount || 0));
        setMappingDiscountDrafts((prev) => ({ ...prev, [mappingId]: normalized }));
        setAppliedMappingDiscounts((prev) => ({ ...prev, [mappingId]: normalized }));
        clearTimeout(mappingDiscountTimers.current[mappingId]);
        mappingDiscountTimers.current[mappingId] = setTimeout(() => {
            updateArticleMappingDiscount(mappingId, normalized);
        }, 500);
    };

    const applyBulkMappingDiscount = async () => {
        const mappings = (position.articleMappings ?? []).filter((m) => !hiddenMappingIds[m.id]);
        if (mappings.length === 0) return;
        const nextDiscount = Math.min(100, Math.max(0, bulkMappingDiscount || 0));
        setMappingLoadingId('__bulk__');
        try {
            setMappingDiscountDrafts((prev) => ({
                ...prev,
                ...Object.fromEntries(mappings.map((m) => [m.id, nextDiscount])),
            }));
            setAppliedMappingDiscounts((prev) => ({
                ...prev,
                ...Object.fromEntries(mappings.map((m) => [m.id, nextDiscount])),
            }));
            useTenderStore.setState((state) => ({
                detail: state.detail
                    ? {
                        ...state.detail,
                        positions: state.detail.positions.map((p) =>
                            p.id === position.id
                                ? {
                                    ...p,
                                    articleMappings: p.articleMappings?.map((m) =>
                                        mappings.some((x) => x.id === m.id) ? { ...m, discount: nextDiscount } : m
                                    ),
                                }
                                : p
                        ),
                    }
                    : state.detail,
            }));
            const results = await Promise.all(
                mappings.map((m) => tenderApi.updateArticleMapping(tenderId, position.id, m.id, { discount: nextDiscount }))
            );
            results.forEach((result, index) => {
                const mapping = mappings[index];
                if (mapping) mergeArticleMappingUpdate(position.id, mapping.id, result, { discount: nextDiscount });
            });
            toast.success(t('tenders.bulk_discount_uygulandi'));
        } catch (err: any) {
            setAppliedMappingDiscounts({});
            toast.error(err.response?.data?.error ||t('tenders.bulk_discount_guncellenemedi'));
        } finally {
            setMappingLoadingId(null);
        }
    };

    const renderLong = (text: string) =>
        text.split('\n').flatMap((line, i, arr) => {
            const isBullet = line.trimStart().startsWith('- ');
            const content = isBullet ? line.trimStart().slice(2) : line;
            return [
                isBullet ? <span key={`bullet-${i}`}>• </span> : null,
                <span key={`${i}-text`}>
                    {content.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^_])_([^_]+)_/g, '$1$2')}
                </span>,
                ...(i < arr.length - 1 ? [<br key={`br-${i}`} />] : []),
            ];
        });

    return (
        <Card
            title={isArticle ? position.shortDescription :t('tenders.line_detayi')}
            icon={<Tag size={13} />}
            noPadding
            actions={
                <span className="text-[10.5px] text-slate-400 font-mono">
                    {isArticle ?t('tenders.product_detayi') : `Girinti ${position.hierarchyLevel}`}
                </span>
            }
        >
            {/* Position description header — always visible */}
            <div className="px-4 py-3 border-b border-slate-100 space-y-1">
                <div className="flex items-center gap-2">
                    <p className={`flex-1 text-[13px] leading-snug ${position.shortDescription ?"font-medium text-slate-800" : 'text-slate-400'}`}>
                        {position.shortDescription ||t('tenders.description_not_entered')}
                    </p>
                </div>
                {position.longDescription && (
                    <p className="text-[11.5px] text-slate-600 leading-relaxed">
                        {renderLong(position.longDescription)}
                    </p>
                )}
            </div>

            {/* Tabs */}
            {!isArticle && (
                <div className="border-b border-slate-100 flex">
                    <TabBtn active={activeTab === 'calc'} onClick={() => setActiveTab('calc')} icon={<Calculator size={12} />}>{t('tenders.cost')}</TabBtn>
                    <TabBtn active={activeTab === 'articles'} onClick={() => setActiveTab('articles')} icon={<Package size={12} />}>{t('tenders.product')}</TabBtn>
                    <TabBtn active={activeTab === 'meta'} onClick={() => setActiveTab('meta')} icon={<ClipboardList size={12} />}>{t('common.edit')}</TabBtn>
                </div>
            )}

            <div className="p-4 space-y-3">
                {visibleActiveTab === 'calc' && (
                    <>
                        {!isDraft && (
                            <div className="flex items-start gap-2 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200/60 rounded p-2">
                                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                                <span>{t('tenders.bu_tender_approved_prices_change_icin')}</span>
                            </div>
                        )}

                        {/* ── Satır Fiyatı — Quick pricing block ── */}
                        <div className="border border-slate-200/70 rounded-md p-3 bg-white space-y-2.5">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('tenders.line_price')}</h4>
                                <span className="text-[10px] text-slate-400">{t('tenders.tabloya_yansir')}</span>
                            </div>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                                <Field label={t('common.quantity')} className="sm:col-span-2">
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            disabled={!isDraft}
                                            onClick={() => updatePricing({ quantity: Math.max(0, pricing.quantity - 1) })}
                                            className="w-6 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 flex items-center justify-center text-sm leading-none disabled:opacity-50"
                                        >−</button>
                                        <Input
                                            type="number"
                                            step="1"
                                            min={0}
                                            value={pricing.quantity}
                                            onChange={(e) => updatePricing({ quantity: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                                            disabled={!isDraft}
                                            className="text-center"
                                        />
                                        <button
                                            type="button"
                                            disabled={!isDraft}
                                            onClick={() => updatePricing({ quantity: pricing.quantity + 1 })}
                                            className="w-6 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 flex items-center justify-center text-sm leading-none disabled:opacity-50"
                                        >+</button>
                                    </div>
                                </Field>
                                {!isArticle && (
                                    <>
                                        <Field label={t('tenders.unit')} className="sm:col-span-2">
                                            <Input
                                                value={pricing.unit}
                                                placeholder={t('tenders.stk_m_kg')}
                                                onChange={(e) => updatePricing({ unit: e.target.value })}
                                                disabled={!isDraft}
                                            />
                                        </Field>
                                        <Field label={t('tenders.unit_price_chf')} className="sm:col-span-4">
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min={0}
                                                value={pricing.unitPrice}
                                                onChange={(e) => updatePricing({ unitPrice: parseFloat(e.target.value) || 0 })}
                                                disabled={!isDraft}
                                            />
                                        </Field>
                                    </>
                                )}
                                <Field label={t('tenders.discount')} className="sm:col-span-2">
                                    <Input
                                        type="number"
                                        step="0.1"
                                        min={0}
                                        max={100}
                                        value={pricing.discount}
                                        onChange={(e) => updatePricing({ discount: parseFloat(e.target.value) || 0 })}
                                        disabled={!isDraft}
                                    />
                                </Field>
                                {!isArticle && (
                                    <Field label={t('tenders.additional_cost')}>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min={0}
                                            value={cost.additionalCost}
                                            onChange={(e) => setCost({ ...cost, additionalCost: parseFloat(e.target.value) || 0 })}
                                            disabled={!isDraft}
                                        />
                                    </Field>
                                )}
                                <Field label={t('tenders.kdv_fixed')} className="sm:col-span-2">
                                    <div className="flex items-center gap-2 h-[34px] px-2.5 rounded border border-slate-200 bg-slate-50 cursor-not-allowed">
                                        <span
                                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 font-mono"
                                        >
                                            %{fmtVatRate(effectiveVat)}
                                        </span>
                                        <span className="text-[11px] text-slate-500">{t('tenders.fixed_rate_applies_to_each_product')}</span>
                                    </div>
                                </Field>
                            </div>

                            {/* Live summary */}
                            <div className="border-t border-slate-100 pt-2 space-y-1 text-[11.5px]">
                                <div className="flex items-center justify-between text-slate-500">
                                    <span>{t('tenders.brut')}{pricing.quantity} × {fmtMoney(pricing.unitPrice)})</span>
                                    <span className="font-mono">{fmtMoney(pricingGross)}</span>
                                </div>
                                {pricing.discount > 0 && (
                                    <div className="flex items-center justify-between text-slate-500">
                                        <span>{t('tenders.discount')}{pricing.discount}%)</span>
                                        <span className="font-mono text-red-600">−{fmtMoney(pricingDiscountAmount)}</span>
                                    </div>
                                )}
                                {!isArticle && (
                                    <div className="flex items-center justify-between text-slate-500">
                                        <span>{t('tenders.additional_cost')}</span>
                                        <span className="font-mono">{cost.additionalCost > 0 ? '+' : ''}{fmtMoney(cost.additionalCost)}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between font-semibold text-slate-700">
                                    <span>{t('tenders.net_amount')}</span>
                                    <span className="font-mono">{fmtMoney(pricingTaxBase)}</span>
                                </div>
                                <div className="flex items-center justify-between text-slate-500">
                                    <span className="flex items-center gap-1">
                                        KDV
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-500 border border-slate-200 font-mono">
                                            %{fmtVatRate(effectiveVat)}
                                        </span>
                                    </span>
                                    <span className="font-mono">+{fmtMoney(pricingTaxAmount)}</span>
                                </div>
                                <div className="flex items-center justify-between font-semibold text-blue-800 border-t border-slate-100 pt-1">
                                    <span>{t('tenders.total_kdv_dahil')}</span>
                                    <span className="font-mono">{fmtMoney(pricingTotalWithTax)}</span>
                                </div>
                            </div>

                            {autoSaveDirty && (
                                <div className="text-[10px] text-slate-400 text-right">
                                    {saving ? 'Kaydediliyor...' :t('tenders.otomatik_kaydedilecek')}
                                </div>
                            )}
                        </div>

                        {isArticle && (
                            <div className="border border-slate-200/70 rounded-md p-3 bg-white space-y-2.5">
                                <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('tenders.product_islemi')}</h4>
                                <Button
                                    variant="danger"
                                    icon={<Trash2 size={12} />}
                                    disabled={!isDraft || !position.mappingId}
                                    loading={saving}
                                    onClick={async () => {
                                        if (!position.mappingId) return;
                                        if (!confirm(`"${position.shortDescription}" ürünü tekliften kaldırılsın mı?`)) return;
                                        setSaving(true);
                                        try {
                                            await onRemoveArticleMapping(position.mappingId);
                                            toast.success(t('tenders.product_from_tender_removed'));
                                        } catch (err: any) {
                                            toast.error(err.response?.data?.error ||t('tenders.action_tamamlanamadi'));
                                        } finally {
                                            setSaving(false);
                                        }
                                    }}
                                    className="w-full"
                                >{t('tenders.tender_kaldir')}</Button>
                            </div>
                        )}

                        {/* Advanced cost build-up (collapsed by default visually) */}
                        {!isArticle && (
                            <details className="border border-slate-200/70 rounded-md bg-white">
                                <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hover:bg-slate-50/60 select-none">{t('tenders.additional_cost_opsiyonel')}</summary>
                                <div className="px-3 pb-3 space-y-3">
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <Field label={t('tenders.material')}>
                                            <Input type="number" step="0.01" value={cost.materialCost}
                                                onChange={(e) => setCost({ ...cost, materialCost: parseFloat(e.target.value) || 0 })}
                                                disabled={!isDraft || !canCalc} />
                                        </Field>
                                        <Field label={t('tenders.iscilik')}>
                                            <Input type="number" step="0.01" value={cost.laborCost}
                                                onChange={(e) => setCost({ ...cost, laborCost: parseFloat(e.target.value) || 0 })}
                                                disabled={!isDraft || !canCalc} />
                                        </Field>
                                        <Field label={t('tenders.general_gider')}>
                                            <Input type="number" step="0.01" value={cost.overheadCost}
                                                onChange={(e) => setCost({ ...cost, overheadCost: parseFloat(e.target.value) || 0 })}
                                                disabled={!isDraft || !canCalc} />
                                        </Field>
                                        <Field label={t('tenders.risk')}>
                                            <Input type="number" step="0.01" value={cost.riskAmount}
                                                onChange={(e) => setCost({ ...cost, riskAmount: parseFloat(e.target.value) || 0 })}
                                                disabled={!isDraft || !canCalc} />
                                        </Field>
                                        <Field label={t('tenders.additional_cost')}>
                                            <Input type="number" step="0.01" value={cost.additionalCost}
                                                onChange={(e) => setCost({ ...cost, additionalCost: parseFloat(e.target.value) || 0 })}
                                                disabled={!isDraft || !canCalc} />
                                        </Field>
                                    </div>

                                    <div className="bg-slate-50/60 border border-slate-200/60 rounded-md p-2.5 space-y-2">
                                        <div className="flex items-center justify-between text-[12px]">
                                            <span className="text-slate-500">{t('tenders.cost_total_without_margin')}</span>
                                            <span className="font-mono font-semibold text-slate-700">{fmtMoney(subtotal)}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setMarginMode('amount')}
                                                className={`flex-1 py-1 text-[11.5px] rounded ${marginMode === 'amount' ?"bg-blue-700 text-white" :"bg-white border border-slate-200 text-slate-600"}`}
                                            >{t('common.amount')}</button>
                                            <button
                                                onClick={() => setMarginMode('percent')}
                                                className={`flex-1 py-1 text-[11.5px] rounded ${marginMode === 'percent' ?"bg-blue-700 text-white" :"bg-white border border-slate-200 text-slate-600"}`}
                                            >{t('tenders.yuzde')}</button>
                                        </div>
                                        {marginMode === 'amount' ? (
                                            <Field label={t('tenders.profit_margin_amount')}>
                                                <Input type="number" step="0.01" value={cost.profitMargin}
                                                    onChange={(e) => setCost({ ...cost, profitMargin: parseFloat(e.target.value) || 0 })}
                                                    disabled={!isDraft || !canCalc} />
                                            </Field>
                                        ) : (
                                            <Field label={t('tenders.profit_margin')}>
                                                <Input type="number" step="0.1" value={marginPercent}
                                                    onChange={(e) => setMarginPercent(parseFloat(e.target.value) || 0)}
                                                    disabled={!isDraft || !canCalc} />
                                            </Field>
                                        )}
                                    </div>

                                    <div className="bg-blue-50 border border-blue-200/60 rounded-md p-3 space-y-1.5">
                                        <div className="flex items-center justify-between text-[12px]">
                                            <span className="text-blue-900">{t('tenders.hesaplanan_total_price_net')}</span>
                                            <span className="font-mono font-bold text-blue-900 text-[14px]">{fmtMoney(total)}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                                            <span className="flex items-center gap-1">KDV <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200 font-mono">%{fmtVatRate(effectiveVat)}</span></span>
                                            <span className="font-mono">+{fmtMoney(total * effectiveVat / 100)}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[12px] pt-1 border-t border-blue-200/40">
                                            <span className="text-blue-900 font-semibold">{t('tenders.total_kdv_dahil')}</span>
                                            <span className="font-mono font-bold text-blue-900">{fmtMoney(totalWithTax)}</span>
                                        </div>
                                        {position.quantity > 0 && (
                                            <div className="flex items-center justify-between text-[11px] text-blue-700/80 mt-1">
                                                <span>{t('tenders.unit_price')}{fmtNumber(position.quantity)} {position.unit || ''})</span>
                                                <span className="font-mono">{fmtMoney(unitPrice)}</span>
                                            </div>
                                        )}
                                    </div>

                                </div>
                            </details>
                        )}
                    </>
                )}

                {visibleActiveTab === 'articles' && (
                    <>
                        <div className="text-[11.5px] text-slate-500 leading-relaxed">{t('tenders.stock_urunden_tender_line_create_burada')}</div>

                        {/* Currently bound articles */}
                        {position.articleMappings && position.articleMappings.length > 0 && (
                            <div className="border border-slate-200/70 rounded-md bg-white">
                                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                                    <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('tenders.linked_products')}{position.articleMappings.length})
                                    </h4>
                                    <span className="text-[10px] text-slate-400">{t('tenders.old_baglanti_record')}</span>
                                </div>
                                {isDraft && (
                                    <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/40 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                                        <Field label={t('tenders.bulk_discount')}>
                                            <Input
                                                type="number"
                                                step="0.1"
                                                min={0}
                                                max={100}
                                                value={bulkMappingDiscount}
                                                onChange={(e) => setBulkMappingDiscount(parseFloat(e.target.value) || 0)}
                                            />
                                        </Field>
                                        <Button
                                            variant="secondary"
                                            loading={mappingLoadingId === '__bulk__'}
                                            onClick={applyBulkMappingDiscount}
                                        >{t('tenders.bulk_discounti_apply')}</Button>
                                    </div>
                                )}
                                <ul className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                                    {position.articleMappings.filter((m) => !hiddenMappingIds[m.id]).map((m) => {
                                        const appliedDiscount = appliedMappingDiscounts[m.id] ?? m.discount ?? 0;
                                        const discountedNet = m.article ? m.quantityMultiplier * getArticlePrice(m.article) * (1 - appliedDiscount / 100) : 0;
                                        return (
                                            <li
                                                key={m.id}
                                                className="px-3 py-2 flex flex-wrap items-center gap-2 cursor-pointer hover:bg-blue-50/40 transition-colors"
                                                onClick={() => onSelectArticleMapping(m.id)}
                                            >
                                                <div className="w-9 h-9 rounded bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                                    <Package size={12} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <div className="text-[12px] font-semibold text-slate-800 truncate">{m.article?.name ?? '—'}</div>
                                                        {/* Sabit KDV badge — açık gri */}
                                                        <span
                                                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 font-mono shrink-0"
                                                            title={t('tenders.fixed_kdv_orani')}
                                                        >{t('tenders.kdv')}{fmtVatRate((position.taxRate != null && position.taxRate > 0) ? position.taxRate : FIXED_VAT)}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10.5px] font-mono text-slate-500">
                                                        {m.article?.articleCode ?? '—'} · {m.quantityMultiplier} {m.article?.unit ?? 'adet'} × {m.article ? fmtMoney(getArticlePrice(m.article)) : '—'}
                                                    </div>
                                                    {false && (
                                                        <div className="mt-1 text-[11.5px] text-slate-600 leading-relaxed line-clamp-3">
                                                            {renderLong('')}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="text-[11.5px] font-mono font-semibold text-slate-700">
                                                        {m.article ? fmtMoney(lineTotalWithTax(discountedNet, (position.taxRate != null && position.taxRate > 0) ? position.taxRate : FIXED_VAT)) : '—'}
                                                    </div>
                                                    <div className="text-[9.5px] text-slate-400 font-mono">{t('tenders.net')}{m.article ? fmtMoney(discountedNet) : '—'}
                                                    </div>
                                                </div>
                                                {isDraft && (
                                                    <div className="basis-full grid grid-cols-1 gap-2 items-end">
                                                        <Field label={t('tenders.discount')}>
                                                            <Input
                                                                type="number"
                                                                step="0.1"
                                                                min={0}
                                                                max={100}
                                                                value={mappingDiscountDrafts[m.id] ?? appliedDiscount}
                                                                onChange={(e) => queueArticleMappingDiscount(m.id, parseFloat(e.target.value) || 0)}
                                                            />
                                                        </Field>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                                <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between text-[11.5px]">
                                    <span className="text-slate-600 font-medium">{t('inventory.dashboard.totalProducts')}</span>
                                    <span className="font-mono font-bold text-slate-800">
                                        {fmtMoney(position.articleMappings.filter((m) => !hiddenMappingIds[m.id]).reduce((s, m) => {
                                            const appliedDiscount = appliedMappingDiscounts[m.id] ?? m.discount ?? 0;
                                            const vatRate = (position.taxRate != null && position.taxRate > 0) ? position.taxRate : FIXED_VAT;
                                            return s + (m.article ? lineTotalWithTax(m.quantityMultiplier * getArticlePrice(m.article) * (1 - appliedDiscount / 100), vatRate) : 0);
                                        }, 0))}
                                    </span>
                                </div>
                            </div>
                        )}

                        {selectedStockArticle && (
                            <div className="flex items-center gap-2 p-2 bg-slate-50/60 border border-slate-200/60 rounded">
                                {selectedStockArticle.imageUrl ? (
                                    <img src={selectedStockArticle.imageUrl} alt="" className="w-10 h-10 rounded object-cover border border-slate-200" />
                                ) : (
                                    <div className="w-10 h-10 rounded bg-white border border-slate-200 flex items-center justify-center text-slate-400">
                                        <ImageIcon size={14} />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="text-[12.5px] font-semibold text-slate-800 truncate">{selectedStockArticle.name}</div>
                                    <div className="text-[10.5px] font-mono text-slate-500">
                                        {selectedStockArticle.articleCode} · {fmtMoney(getArticlePrice(selectedStockArticle))}/{selectedStockArticle.unit}
                                    </div>
                                    <div className="text-[10.5px] text-slate-500 mt-0.5">{"Toplam mevcut:"}<span className="font-mono font-medium text-slate-700">{fmtNumber(selectedStockArticle.totalQuantity)} {selectedStockArticle.unit}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Field label={t('tenders.select_product_from_stock')}>
                                <Select
                                    value={articleId}
                                    onChange={(e) => setArticleId(e.target.value)}
                                    disabled={stockArticlesLoading}
                                >
                                    <option value="">{t('tenders.product_select')}</option>
                                    {stockArticles.map((article) => (
                                        <option key={article.id} value={article.id}>
                                            {article.articleCode} · {article.name}{t('tenders.mevcut')}{fmtNumber(article.totalQuantity)} {article.unit}
                                        </option>
                                    ))}
                                </Select>
                                {stockArticlesLoading && (
                                    <p className="mt-1 text-[11px] text-slate-400">{t('tenders.productler_loading')}</p>
                                )}
                                {stockArticlesLoaded && stockArticles.length === 0 && (
                                    <p className="mt-1 text-[11px] text-slate-400">{t('tenders.registered_product_not_found')}</p>
                                )}
                            </Field>
                            <Field label={t('tenders.quantity_kullanilacak')}>
                                <Input type="number" step="1" min={1} value={articleQty}
                                    onChange={(e) => setArticleQty(parseInt(e.target.value, 10) || 0)} />
                            </Field>
                            <Field label={t('tenders.discount')}>
                                <Input
                                    type="number"
                                    step="0.1"
                                    min={0}
                                    max={100}
                                    value={articleDiscount}
                                    onChange={(e) => setArticleDiscount(parseFloat(e.target.value) || 0)}
                                />
                            </Field>


                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="primary"
                                icon={<Plus size={12} />}
                                disabled={!isDraft || stockArticlesLoading || !articleId || articleQty <= 0}
                                loading={saving}
                                onClick={async () => {
                                    setSaving(true);
                                    try {
                                        await onMapArticle(articleId, articleQty, {
                                            discount: articleDiscount,
                                        });
                                        setArticleId('');
                                        setArticleQty(1);
                                        setArticleDiscount(0);
                                    } catch (err) {
                                        // error is surfaced by store/onMapArticle (toast)
                                    } finally {
                                        setSaving(false);
                                    }
                                }}
                                className="flex-1"
                            >{t('tenders.product_add')}</Button>
                        </div>
                    </>
                )}

                {visibleActiveTab === 'meta' && (
                    <MetaEditTab
                        position={position}
                        tenderId={tenderId}
                        isDraft={isDraft}
                    />
                )}
            </div>
        </Card>
    );
};

/* ── MetaEditTab ── */
const MetaEditTab: React.FC<{
    position: PositionDto;
    tenderId: string;
    isDraft: boolean;
}> = ({ position, tenderId, isDraft }) => {
    const { updatePosition } = useTenderStore();
    const [desc, setDesc] = useState(position.shortDescription);
    const [longDesc, setLongDesc] = useState(position.longDescription || '');
    const [imageUrl, setImageUrl] = useState<string | null>(position.imageUrl || null);
    const [saving, setSaving] = useState(false);
    const [uploadingImg, setUploadingImg] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setDesc(position.shortDescription);
        setLongDesc(position.longDescription || '');
        setImageUrl(position.imageUrl || null);
    }, [position.id]);

    const hasChanges =
        desc !== position.shortDescription
        || longDesc !== (position.longDescription || '')
        || imageUrl !== (position.imageUrl || null);

    const handleImageFile = (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error(t('tenders.only_gorsel_dosyalar_yuklenebilir'));
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error(t('tenders.gorsel_2mb_tan_buyuk_olamaz'));
            return;
        }
        setUploadingImg(true);
        const reader = new FileReader();
        reader.onload = () => {
            setImageUrl(reader.result as string);
            setUploadingImg(false);
        };
        reader.onerror = () => {
            toast.error(t('tenders.gorsel_okunamadi'));
            setUploadingImg(false);
        };
        reader.readAsDataURL(file);
    };

    const save = async () => {
        setSaving(true);
        try {
            await updatePosition(tenderId, position.id, {
                shortDescription: desc.trim(),
                longDescription: longDesc || null,
                imageUrl: imageUrl,
            });
            toast.success(t('tenders.updated'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.kaydedilemedi'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <span>{t('tenders.girinti')}{position.hierarchyLevel}</span>
            </div>

            {/* Position Image */}
            <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{t('tenders.gorsel')}</div>
                <div className="flex items-start gap-3">
                    <div className="w-20 h-20 border border-slate-200 rounded-md bg-slate-50/60 flex items-center justify-center overflow-hidden shrink-0">
                        {imageUrl ? (
                            <img src={imageUrl} alt="Satır görseli" className="w-full h-full object-cover" />
                        ) : (
                            <ImageIcon size={20} className="text-slate-300" />
                        )}
                    </div>
                    {isDraft && (
                        <div className="flex-1 flex flex-col gap-1.5">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleImageFile(f);
                                    e.target.value = '';
                                }}
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={<ImageIcon size={11} />}
                                loading={uploadingImg}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {imageUrl ?t('tenders.degistir') :t('tenders.gorsel_yukle')}
                            </Button>
                            {imageUrl && (
                                <button
                                    type="button"
                                    className="text-[11px] text-red-600 hover:text-red-700 self-start"
                                    onClick={() => setImageUrl(null)}
                                >{t('common.remove')}</button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Field label={t('common.description')}>
                <Input
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    disabled={!isDraft}
                />
            </Field>

            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('tenders.line_content')}</span>
                </div>
                {isDraft ? (
                    <RichTextMarkdownEditor
                        value={longDesc}
                        onChange={setLongDesc}
                        minHeight={120}
                        className="focus-within:border-blue-400"
                        placeholder={t('tenders.baslik_veya_description_yazin')}
                    />
                ) : longDesc ? (
                    <div
                        className="rounded-md border border-slate-200 bg-white p-3 text-[13px] leading-6 text-slate-800 [&_h2]:my-1 [&_h2]:text-[15px] [&_h2]:font-bold [&_h3]:my-1 [&_h3]:text-[13.5px] [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-7 [&_li]:pl-1"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(longDesc) }}
                    />
                ) : (
                    <div className="text-slate-400 text-[12px]">{t('tenders.line_content_not_found')}</div>
                )}
            </div>

            {isDraft && hasChanges && (
                <Button variant="primary" icon={<Save size={13} />} loading={saving} onClick={save} className="w-full">{t('tenders.degisiklikleri_kaydet')}</Button>
            )}
        </div>
    );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({ active, onClick, icon, children }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors ${active ?"border-blue-700 text-blue-800" :"border-transparent text-slate-500 hover:text-slate-700"
            }`}
    >
        {icon}
        {children}
    </button>
);



export const SummaryStat: React.FC<{ label: string; value: string; icon: React.ReactNode; primary?: boolean }> = ({ label, value, icon, primary }) => (
    <div className={`border rounded-md px-4 py-3 ${primary ?"bg-blue-50/60 border-blue-200/60" :"bg-white border-slate-200/70"}`}>
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            {icon}
            {label}
        </div>
        <div className={`mt-1 text-[16px] font-semibold ${primary ? 'text-blue-900' : 'text-slate-800'}`}>
            {value}
        </div>
    </div>
);

type TenderArticleFormData = Partial<InventoryArticle> & {
    adjustQty?: number;
    adjustMovementType?: 'IN' | 'OUT' | 'ADJUSTMENT';
    adjustLocationId?: string;
    adjustGeneralBarcode?: string;
    adjustSerialBarcode?: string;
    totalQuantity?: number;
};

export const TenderArticleFormModal: React.FC<{
    initial: TenderArticleFormData;
    onClose: () => void;
    onSubmit: (data: TenderArticleFormData) => Promise<void>;
}> = ({ initial, onClose, onSubmit }) => {
    const [form, setForm] = useState<TenderArticleFormData>({
        status: 'ACTIVE',
        isActive: true,
        minStockLevel: 0,
        criticalStockLevel: 0,
        ...initial,
    });
    const [submitting, setSubmitting] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerMode, setScannerMode] = useState<'serial' | 'general'>('serial');
    const fileRef = useRef<HTMLInputElement>(null);

    const handleImage = (file: File) => {
        if (file.size > 2 * 1024 * 1024) {
            toast.error(t('tenders.gorsel_2_mb_sinirini_asiyor'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => setForm((p) => ({ ...p, imageUrl: e.target?.result as string }));
        reader.readAsDataURL(file);
    };

    return (
        <Modal
            open
            title={initial.id ?t('tenders.productu_edit') :t('tenders.create_new_product')}
            description={initial.id ?t('tenders.update_product_card_for_stock_management') :t('tenders.productler_screen_stock_karti_formu_with_new_ur')}
            onClose={onClose}
            width="full"
            closeOnBackdrop={false}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>{t('tenders.iptal')}</Button>
                    <Button
                        variant="primary"
                        loading={submitting}
                        onClick={async () => {
                            if (!form.articleCode || !form.name || !form.unit) {
                                toast.error(t('tenders.code_ad_ve_unit_zorunludur'));
                                return;
                            }
                            setSubmitting(true);
                            try {
                                const payload = { ...form };
                                if (payload.systemBarcode === '') payload.systemBarcode = undefined;
                                if (payload.supplierBarcode === '') payload.supplierBarcode = undefined;
                                if (payload.description === '') payload.description = undefined;
                                if (payload.category === '') payload.category = undefined;
                                await onSubmit(payload);
                            } finally {
                                setSubmitting(false);
                            }
                        }}
                    >
                        {initial.id ?t('common.update') :t('common.create')}
                    </Button>
                </>
            }
        >
            <div className="grid grid-cols-3 items-start gap-3">
                <div className="col-span-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
                    <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                        <ScanBarcode size={13} />{t('tenders.barcode_info')}</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label={t('tenders.general_product_code')} hint={t('tenders.optional_category_barcode_manual_or_camera')}>
                            <button
                                type="button"
                                onClick={() => { setScannerMode('general'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                            >
                                <Camera size={16} />{t('tenders.scan_general_code_with_camera')}</button>
                            <div className="flex items-center gap-1.5">
                                <Hash size={13} className="shrink-0 text-muted-foreground" />
                                <Input value={form.systemBarcode ?? ''} onChange={(e) => setForm({ ...form, systemBarcode: e.target.value })} placeholder={t('tenders.barcode_okutun_veya_yazin')} />
                            </div>
                        </Field>
                        <Field label={t('tenders.product_serial_code')} hint={t('tenders.required_unique_for_each_product_manual_or_camera')} required>
                            <button
                                type="button"
                                onClick={() => { setScannerMode('serial'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                            >
                                <Camera size={16} />{t('tenders.scan_serial_code_with_camera')}</button>
                            <div className="flex items-center gap-1.5">
                                <ScanBarcode size={13} className="shrink-0 text-blue-600" />
                                <Input value={form.supplierBarcode ?? ''} onChange={(e) => setForm({ ...form, supplierBarcode: e.target.value })} placeholder={t('tenders.serial_code_okutun_veya_yazin')} />
                            </div>
                        </Field>
                    </div>
                </div>

                <div className="col-span-3 md:col-span-1">
                    <Field label={t('tenders.product_gorseli')}>
                        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-card p-3">
                            {form.imageUrl ? (
                                <div className="relative h-48 w-full overflow-hidden rounded bg-muted md:h-56">
                                    <img src={form.imageUrl} alt="" className="w-full h-full object-cover rounded" />
                                    <button
                                        type="button"
                                        onClick={() => setForm({ ...form, imageUrl: null })}
                                        className="absolute top-1 right-1 p-1 bg-white/90 rounded shadow text-rose-600 hover:bg-rose-50"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex h-48 w-full items-center justify-center rounded bg-muted text-muted-foreground md:h-56">
                                    <ImageIcon size={34} />
                                </div>
                            )}
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleImage(f);
                                }}
                            />
                            <Button type="button" variant="secondary" size="sm" icon={<Upload size={11} />} onClick={() => fileRef.current?.click()}>
                                {form.imageUrl ?t('tenders.gorseli_degistir') :t('tenders.gorsel_yukle')}
                            </Button>
                            <p className="text-[10.5px] text-slate-400 text-center">{"PNG/JPG, en fazla 2 MB"}</p>
                        </div>
                    </Field>
                </div>

                <div className="col-span-3 grid grid-cols-2 content-start gap-3 md:col-span-2">
                    <Field label={t('tenders.stock_code')} required>
                        <Input value={form.articleCode ?? ''} onChange={(e) => setForm({ ...form, articleCode: e.target.value })} />
                    </Field>
                    <Field label={t('tenders.unit')} required>
                        <Input value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                    </Field>
                    <Field label={t('tenders.product_adi')} required className="col-span-2">
                        <Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <Field label={t('common.category')}>
                        <Input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t('tenders.hydraulic_service')} />
                    </Field>
                    <Field label={t('tenders.unit_sales_price_chf')}>
                        <Input type="number" step="0.01" min={0} value={form.salePrice ?? 0} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label={t('tenders.unit_cost_chf')}>
                        <Input type="number" step="0.01" min={0} value={form.baseCost ?? 0} onChange={(e) => setForm({ ...form, baseCost: Number(e.target.value) || 0 })} />
                    </Field>
                </div>

                <div className="col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label={t('tenders.minimum_seviye')}>
                        <Input type="number" step="1" min={0} value={form.minStockLevel ?? 0} onChange={(e) => setForm({ ...form, minStockLevel: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label={t('tenders.critical_threshold')}>
                        <Input type="number" step="1" min={0} value={form.criticalStockLevel ?? 0} onChange={(e) => setForm({ ...form, criticalStockLevel: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label={t('tenders.maksimum')}>
                        <Input type="number" step="1" min={0} value={form.maxStockLevel ?? ''} onChange={(e) => setForm({ ...form, maxStockLevel: e.target.value === '' ? null : Number(e.target.value) })} />
                    </Field>
                    <Field label={t('common.status')}>
                        <Select value={form.status ?? 'ACTIVE'} onChange={(e) => setForm({ ...form, status: e.target.value as ArticleStatus })}>
                            <option value="ACTIVE">{t('common.active')}</option>
                            <option value="INACTIVE">{t('common.inactive')}</option>
                            <option value="IN_SUPPLY">{t('inventory.articles.statusSupply')}</option>
                            <option value="IN_PRODUCTION">{t('tenders.uretimde')}</option>
                        </Select>
                    </Field>
                </div>

                <Field label= "Son Siparis / Alim Tarihi" className="col-span-3 md:col-span-1">
                    <Input
                        type="date"
                        value={form.lastPurchaseDate ? dayjs(form.lastPurchaseDate).format('YYYY-MM-DD') : ''}
                        onChange={(e) => setForm({ ...form, lastPurchaseDate: e.target.value || null })}
                    />
                </Field>


                <Field label={t('tenders.description')} className="col-span-3">
                    <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
                        <RichTextMarkdownEditor
                            value={form.description ?? ''}
                            onChange={(description) => setForm({ ...form, description })}
                            minHeight={150}
                            className="border-0"
                        />
                    </div>
                </Field>
            </div>

            {scannerOpen && (
                <BarcodeScannerModal
                    mode={scannerMode}
                    onClose={() => setScannerOpen(false)}
                    onScan={(code) => {
                        if (scannerMode === 'serial') {
                            setForm((prev) => ({ ...prev, supplierBarcode: code }));
                        } else {
                            setForm((prev) => ({ ...prev, systemBarcode: code }));
                        }
                        setScannerOpen(false);
                    }}
                />
            )}
        </Modal>
    );
};

/* ── New Article Modal ── */
export const NewArticleModal: React.FC<{
    open: boolean;
    onClose: () => void;
    onSubmit: (a: { articleCode: string; name: string; baseCost: number; salePrice?: number; unit: string; description?: string; systemBarcode?: string; supplierBarcode?: string }) => Promise<void>;
}> = ({ open, onClose, onSubmit }) => {
    const [form, setForm] = useState({ articleCode: '', name: '', baseCost: 0, salePrice: 0, unit: '', description: '', systemBarcode: '', supplierBarcode: '' });
    const [submitting, setSubmitting] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerMode, setScannerMode] = useState<'serial' | 'general'>('serial');

    useEffect(() => {
        if (open) setForm({ articleCode: '', name: '', baseCost: 0, salePrice: 0, unit: '', description: '', systemBarcode: '', supplierBarcode: '' });
    }, [open]);

    return (
        <Modal
            open={open}
            title={t('tenders.new_product_material')}
            description={t('tenders.add_record_to_erp_product_material_catalog')}
            onClose={onClose}
            width="full"
            closeOnBackdrop={false}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button
                        variant="primary"
                        loading={submitting}
                        onClick={async () => {
                            if (!form.articleCode || !form.name || !form.unit) {
                                toast.error(t('tenders.code_ad_ve_unit_zorunludur'));
                                return;
                            }
                            setSubmitting(true);
                            try {
                                await onSubmit({
                                    ...form,
                                    systemBarcode: form.systemBarcode || undefined,
                                    supplierBarcode: form.supplierBarcode || undefined,
                                    description: form.description || undefined,
                                });
                            } finally {
                                setSubmitting(false);
                            }
                        }}
                    >{t('common.create')}</Button>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm lg:col-span-2">
                    <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                        <ScanBarcode size={13} />{t('tenders.barcode_info')}</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label={t('tenders.general_product_code')} hint={t('tenders.optional_category_barcode')}>
                            <button
                                type="button"
                                onClick={() => { setScannerMode('general'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                            >
                                <Camera size={16} />{t('tenders.scan_general_code_with_camera')}</button>
                            <div className="flex items-center gap-1.5">
                                <Hash size={13} className="shrink-0 text-muted-foreground" />
                                <Input value={form.systemBarcode} onChange={(e) => setForm({ ...form, systemBarcode: e.target.value })} placeholder={t('tenders.barcode_okutun_veya_yazin')} />
                            </div>
                        </Field>
                        <Field label={t('tenders.product_serial_code')} hint={t('tenders.required_unique_for_each_product')} required>
                            <button
                                type="button"
                                onClick={() => { setScannerMode('serial'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                            >
                                <Camera size={16} />{t('tenders.scan_serial_code_with_camera')}</button>
                            <div className="flex items-center gap-1.5">
                                <ScanBarcode size={13} className="shrink-0 text-blue-600" />
                                <Input value={form.supplierBarcode} onChange={(e) => setForm({ ...form, supplierBarcode: e.target.value })} placeholder={t('tenders.serial_code_okutun_veya_yazin')} />
                            </div>
                        </Field>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 content-start">
                    <Field label={t('tenders.product_code')} required>
                        <Input value={form.articleCode}
                            onChange={(e) => setForm({ ...form, articleCode: e.target.value })} />
                    </Field>
                    <Field label={t('tenders.unit')} required>
                        <Input value={form.unit}
                            onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={t('tenders.m_kg')} />
                    </Field>
                    <Field label={t('tenders.product_adi')} required className="col-span-2">
                        <Input value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <Field label={t('tenders.unit_sales_price_chf')} className="col-span-2">
                        <Input type="number" step="0.01" value={form.salePrice}
                            onChange={(e) => setForm({ ...form, salePrice: parseFloat(e.target.value) || 0 })} />
                    </Field>
                    <Field label={t('tenders.unit_cost_chf')} className="col-span-2">
                        <Input type="number" step="0.01" value={form.baseCost}
                            onChange={(e) => setForm({ ...form, baseCost: parseFloat(e.target.value) || 0 })} />
                    </Field>
                </div>
                <Field label={t('common.description')} hint={t('tenders.pdf_ciktisinda_duz_metin_ve_madde_isaretleri_kor')}>
                    <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
                        <RichTextMarkdownEditor
                            value={form.description}
                            onChange={(description) => setForm({ ...form, description })}
                            minHeight={260}
                            className="border-0"
                            placeholder={t('tenders.orn_10_bakim_seti_10_lecksuchspray_10_reinigungs')}
                        />
                    </div>
                </Field>
            </div>

            {scannerOpen && (
                <BarcodeScannerModal
                    mode={scannerMode}
                    onClose={() => setScannerOpen(false)}
                    onScan={(code) => {
                        if (scannerMode === 'serial') {
                            setForm((prev) => ({ ...prev, supplierBarcode: code }));
                        } else {
                            setForm((prev) => ({ ...prev, systemBarcode: code }));
                        }
                        setScannerOpen(false);
                    }}
                />
            )}
        </Modal>
    );
};

const flattenTreeForSettings = (node: TreeNode): TreeNode[] => [
    node,
    ...node.children.flatMap((child) => flattenTreeForSettings(child)),
];

type TenderSettingsTabKey = 'mail' | 'schedule' | 'overtime' | 'materials';

export const TenderSettingsModal: React.FC<{
    open: boolean;
    onClose: () => void;
    tenderId: string;
    tree: TreeNode[];
    grandTotal: number;
    initialTab?: TenderSettingsTabKey;
    inline?: boolean;
    hideTabs?: boolean;
    overtimeHourlyRate: number;
    onOvertimeHourlyRateChange: (value: number) => void;
    onChanged: () => Promise<void>;
}> = ({ open, onClose, tenderId, tree, grandTotal, initialTab = 'mail', inline = false, hideTabs = false, overtimeHourlyRate, onOvertimeHourlyRateChange, onChanged }) => {
    const { detail, activities } = useTenderStore();
    const { user } = useAuthStore();
    const { settings } = usePdfSettingsStore();
    const [slots, setSlots] = useState<OfferScheduleSlotDto[]>([]);
    const [slotForm, setSlotForm] = useState({ date: dayjs().format('YYYY-MM-DD'), start: '09:00', end: '17:00', notes: '' });
    const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TenderSettingsTabKey>(initialTab);
    const [localOvertimeRate, setLocalOvertimeRate] = useState(overtimeHourlyRate || 0);
    const [availableMaterials, setAvailableMaterials] = useState<ProjectMaterial[]>([]);
    const [tenderMaterials, setTenderMaterials] = useState<TenderMaterialUsageDto[]>([]);
    const [materialForm, setMaterialForm] = useState({ materialId: '', quantity: 1, description: '' });
    const [materialLoading, setMaterialLoading] = useState(false);
    const [materialSaving, setMaterialSaving] = useState(false);
    const [form, setForm] = useState({
        fromName:t('tenders.offitec_erp'),
        fromEmail: user?.email || '',
        to: '',
        subject: '',
        message:t('tenders.merhaba_teklifimizi_pdf_olarak_ekte_iletiyoruz_p'),
    });
    const [loading, setLoading] = useState(false);

    const loadSlots = async () => {
        if (!open) return;
        try {
            setSlots(await tenderApi.getScheduleSlots(tenderId));
        } catch {
            setSlots([]);
        }
    };

    const loadMaterials = async () => {
        if (!open) return;
        setMaterialLoading(true);
        try {
            const [materials, usages] = await Promise.all([
                projectApi.materials(),
                tenderApi.getMaterials(tenderId),
            ]);
            setAvailableMaterials(materials);
            setTenderMaterials(usages);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.materials_yuklenemedi'));
        } finally {
            setMaterialLoading(false);
        }
    };

    useEffect(() => {
        if (!open || !detail) return;
        setActiveTab(initialTab);
        setLocalOvertimeRate(overtimeHourlyRate || 0);
        setForm((prev) => ({
            ...prev,
            to: detail.tender.customerEmail || '',
            subject: `${detail.tender.tenderNumber} teklifiniz`,
        }));
        void loadSlots();
        void loadMaterials();
    }, [open, detail?.tender.id, overtimeHourlyRate, initialTab]);

    const selectedTenderMaterial = useMemo(
        () => availableMaterials.find((material) => material.id === materialForm.materialId) || null,
        [availableMaterials, materialForm.materialId]
    );

    const addTenderMaterial = async () => {
        if (!materialForm.materialId) return toast.error(t('tenders.material_select'));
        const quantity = Number(materialForm.quantity || 0);
        if (quantity <= 0) return toast.error(t('tenders.quantity_0dan_buyuk_olmali'));
        setMaterialSaving(true);
        try {
            const res = await tenderApi.mapMaterial(tenderId, materialForm.materialId, quantity, materialForm.description);
            setTenderMaterials((prev) => [res.usage, ...prev]);
            setAvailableMaterials((prev) => prev.map((material) =>
                material.id === materialForm.materialId
                    ? { ...material, stockQuantity: Math.max(0, Number(material.stockQuantity || 0) - quantity) }
                    : material
            ));
            setMaterialForm({ materialId: '', quantity: 1, description: '' });
            toast.success(t('tenders.material_added_fiyata_dahil_edilmedi'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.material_eklenemedi'));
        } finally {
            setMaterialSaving(false);
        }
    };

    const removeTenderMaterial = async (usage: TenderMaterialUsageDto) => {
        setMaterialSaving(true);
        try {
            await tenderApi.removeMaterialMapping(tenderId, usage.id);
            setTenderMaterials((prev) => prev.filter((item) => item.id !== usage.id));
            setAvailableMaterials((prev) => prev.map((material) =>
                material.id === usage.materialId
                    ? { ...material, stockQuantity: Number(material.stockQuantity || 0) + Number(usage.quantity || 0) }
                    : material
            ));
            toast.success(t('tenders.material_kaldirildi'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.material_kaldirilamadi'));
        } finally {
            setMaterialSaving(false);
        }
    };
    void removeTenderMaterial;

    const resetSlotForm = () => {
        setEditingSlotId(null);
        setSlotForm({ date: dayjs().format('YYYY-MM-DD'), start: '09:00', end: '17:00', notes: '' });
    };

    const saveSlot = async () => {
        const startTime = dayjs(`${slotForm.date}T${slotForm.start}`).toISOString();
        const endTime = dayjs(`${slotForm.date}T${slotForm.end}`).toISOString();
        if (!dayjs(endTime).isAfter(dayjs(startTime))) return toast.error(t('tenders.bitis_saati_baslangictan_sonra_olmalidir'));
        try {
            if (editingSlotId) {
                await tenderApi.updateScheduleSlot(tenderId, editingSlotId, { startTime, endTime, notes: slotForm.notes });
                toast.success(t('tenders.appointment_updated'));
            } else {
                await tenderApi.createScheduleSlot(tenderId, { startTime, endTime, notes: slotForm.notes });
                toast.success(t('tenders.appointment_added'));
            }
            resetSlotForm();
            await loadSlots();
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.appointment_kaydedilemedi'));
        }
    };

    const send = async () => {
        if (!detail) return;
        setLoading(true);
        try {
            onOvertimeHourlyRateChange(Math.max(0, Number(localOvertimeRate || 0)));
            const overtimeNote = Number(localOvertimeRate || 0) > 0
                ? `\n\nNot: Planlanan günlük çalışma süresinin %15 üzerindeki fazla çalışmalar ${localOvertimeRate} CHF/saat üzerinden ayrıca hesaplanır.`
                : '';
            const { buildTenderPdfBytes } = await import("../../../utils/pdf/tenderPdf");
            const pdfBytes = await buildTenderPdfBytes({
                tenderNumber: detail.tender.tenderNumber,
                version: detail.tender.version,
                createdAt: detail.tender.createdAt,
                validUntil: detail.tender.validUntil,
                customerName: detail.tender.customerName || '',
                customerAddress: detail.tender.customerAddress,
                customerEmail: detail.tender.customerEmail,
                customerPhone: detail.tender.customerPhone,
                createdByName: detail.tender.createdByName,
                activities,
                positions: flattenTenderTreeForPdf(tree),
                grandTotal,
            }, settings);
            const res = await tenderApi.sendOfferMail(tenderId, {
                ...form,
                message: `${form.message}${overtimeNote}`,
                attachments: [{
                    filename: `${detail.tender.tenderNumber}.pdf`,
                    contentType: 'application/pdf',
                    contentBase64: bytesToBase64(pdfBytes),
                }],
            });
            toast.success(res.message ||t('tenders.tender_maili_gonderildi'));
            await onChanged();
            onClose();
        } catch (e: any) {
            toast.error(e.response?.data?.error || e.message ||t('tenders.tender_maili_gonderilemedi'));
        } finally {
            setLoading(false);
        }
    };

    const tabs = [
        { key: 'mail' as const, label:t('tenders.mail') },
        { key: 'overtime' as const, label:t('tenders.additional_fee') },
        { key: 'schedule' as const, label:t('tenders.appointment') },
        { key: 'materials' as const, label:t('nav.materials') },
    ];

    const usedMaterials = tenderMaterials.map((item) => ({
        id: item.id,
        serialLabel: item.material?.serialId || '-',
        name: item.material?.name ||t('tenders.material'),
        quantity: item.quantity || 0,
        unit: 'adet',
        unitPrice: item.unitCost || 0,
        total: Number(item.quantity || 0) * Number(item.unitCost || 0),
    }));

    const content = (
        <div className={inline ?"flex flex-col" :"flex h-full min-h-[calc(100dvh-9rem)] flex-col"}>
                {!hideTabs && (
                    <div className="mb-6 flex items-center gap-8 border-b border-slate-200">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`border-b-2 px-0 pb-3 pt-1 text-sm font-semibold transition-colors ${
                                activeTab === tab.key ?"border-blue-700 text-blue-700" :"border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                    </div>
                )}

                {activeTab === 'mail' && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('settings.mail.senderName')}><Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} /></Field>
                            <Field label={t('settings.mail.senderEmail')}><Input value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} /></Field>
                        </div>
                        <Field label={t('tenders.alici')}><Input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
                        <Field label={t('tenders.konu')}><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
                        <Field label={t('tenders.additional_mesaj')}><Textarea rows={12} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{t('tenders.mail_gondermek_opsiyoneldir_order_olusturmak_i')}</div>
                    </div>
                )}

                {activeTab === 'schedule' && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                        <div className="xl:col-span-2">
                            <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
                                <Field label={t('common.date')}><Input type="date" value={slotForm.date} onChange={(e) => setSlotForm({ ...slotForm, date: e.target.value })} /></Field>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label={t('common.start')}><Input type="time" value={slotForm.start} onChange={(e) => setSlotForm({ ...slotForm, start: e.target.value })} /></Field>
                                    <Field label={t('common.end')}><Input type="time" value={slotForm.end} onChange={(e) => setSlotForm({ ...slotForm, end: e.target.value })} /></Field>
                                </div>
                                <Field label={t('tenders.note')}><Input value={slotForm.notes} onChange={(e) => setSlotForm({ ...slotForm, notes: e.target.value })} /></Field>
                                <div className="flex gap-2">
                                    <Button className="flex-1" icon={<CalendarPlus size={13} />} onClick={saveSlot}>
                                        {editingSlotId ?t('tenders.randevuyu_update') :t('tenders.appointment_add')}
                                    </Button>
                                    {editingSlotId && (
                                        <Button variant="secondary" icon={<X size={13} />} onClick={resetSlotForm}>{t('common.cancel')}</Button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="xl:col-span-3">
                            <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                                {slots.length === 0 && <div className="px-3 py-10 text-center text-[12px] text-slate-400">{t('tenders.appointment_not_found')}</div>}
                                {slots.map((slot) => (
                                    <div key={slot.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[12.5px]">
                                        <div>
                                            <div className="font-medium text-slate-800">{dayjs(slot.startTime).format('DD.MM.YYYY')}</div>
                                            <div className="text-slate-500">{dayjs(slot.startTime).format('HH:mm')} - {dayjs(slot.endTime).format('HH:mm')}</div>
                                            {slot.notes && <div className="mt-1 text-[11.5px] text-slate-400">{slot.notes}</div>}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                                onClick={() => {
                                                    setEditingSlotId(slot.id);
                                                    setSlotForm({
                                                        date: dayjs(slot.startTime).format('YYYY-MM-DD'),
                                                        start: dayjs(slot.startTime).format('HH:mm'),
                                                        end: dayjs(slot.endTime).format('HH:mm'),
                                                        notes: slot.notes || '',
                                                    });
                                                }}
                                            >
                                                <Pencil size={13} />
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                                onClick={async () => {
                                                    await tenderApi.deleteScheduleSlot(tenderId, slot.id);
                                                    if (editingSlotId === slot.id) resetSlotForm();
                                                    await loadSlots();
                                                }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'overtime' && (
                    <div className="max-w-xl space-y-4">
                        <Field label={t('tenders.15_uzeri_fazla_work_saat_ucreti_chf')}>
                            <Input
                                type="number"
                                value={localOvertimeRate}
                                onChange={(event) => setLocalOvertimeRate(Number(event.target.value) || 0)}
                                placeholder="0"
                            />
                        </Field>
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">{t('tenders.bu_field_empty_when_empty_ya_da_0_girilirse_15_uze')}</div>
                        <Button onClick={() => { onOvertimeHourlyRateChange(Math.max(0, Number(localOvertimeRate || 0))); toast.success(t('tenders.fazla_work_saat_ucreti_hazir')); }}>{t('tenders.ucreti_uygula')}</Button>
                    </div>
                )}

                {activeTab === 'materials' && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded-md border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-3 py-2">
                                <h3 className="text-[12px] font-semibold text-slate-800">{t('tenders.used_materials')}</h3>
                                <p className="mt-0.5 text-[11px] text-slate-500">{t('tenders.bu_fiyatlar_gorunur_ancak_tender_toplamina_dahil')}</p>
                            </div>
                            {usedMaterials.length === 0 ? (
                                <div className="px-3 py-8 text-center text-[12px] text-slate-400">{t('tenders.used_material_not_found')}</div>
                            ) : (
                                <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                                    {usedMaterials.map((item) => (
                                        <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                                            <div className="min-w-0">
                                                <div className="truncate text-[12.5px] font-medium text-slate-800">{item.name}</div>
                                                <div className="mt-0.5 text-[11px] font-mono text-slate-500">
                                                    {item.serialLabel} · {fmtNumber(item.quantity)} {item.unit} x {fmtMoney(item.unitPrice)}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="font-mono text-[12px] font-semibold text-slate-800">{fmtMoney(item.total)}</div>
                                                <div className="text-[10px] text-slate-400">{t('tenders.dahil_not')}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="rounded-md border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-3 py-2">
                                <h3 className="text-[12px] font-semibold text-slate-800">{t('nav.materials')}</h3>
                                <p className="mt-0.5 text-[11px] text-slate-500">{t('tenders.material_stock_duser_price_only_info_amacli')}</p>
                            </div>
                            <div className="space-y-3 p-3">
                                <Field label={t('tenders.material')}>
                                    <Select
                                        value={materialForm.materialId}
                                        onChange={(event) => setMaterialForm({ ...materialForm, materialId: event.target.value })}
                                        disabled={materialLoading || materialSaving}
                                    >
                                        <option value="">{t('tenders.material_select')}</option>
                                        {availableMaterials.map((material) => (
                                            <option key={material.id} value={material.id}>
                                                {material.serialId} · {material.name}{t('tenders.mevcut')}{fmtNumber(material.stockQuantity)}{t('tenders.adet')}</option>
                                        ))}
                                    </Select>
                                </Field>
                                {selectedTenderMaterial && (
                                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                                        <div className="flex items-center justify-between gap-3">
                                            <span>{selectedTenderMaterial.name}</span>
                                            <span className="font-mono">{fmtMoney(selectedTenderMaterial.unitCost)}</span>
                                        </div>
                                        <div className="mt-1 font-mono text-[11px] text-slate-500">{t('tenders.stock')}{fmtNumber(selectedTenderMaterial.stockQuantity)}{t('tenders.adet')}</div>
                                    </div>
                                )}
                                <Field label={t('common.quantity')}>
                                    <Input type="number" min={1} step="1" value={materialForm.quantity} onChange={(event) => setMaterialForm({ ...materialForm, quantity: Number(event.target.value) || 0 })} />
                                </Field>
                                <Field label={t('common.description')}>
                                    <Input value={materialForm.description} onChange={(event) => setMaterialForm({ ...materialForm, description: event.target.value })} />
                                </Field>
                                <Button className="w-full" icon={<Plus size={13} />} loading={materialSaving} disabled={!materialForm.materialId || materialForm.quantity <= 0} onClick={addTenderMaterial}>{t('tenders.material_add')}</Button>
                            </div>
                        </div>
                    </div>
                )}

                {(!inline || activeTab === 'mail') && (
                <div className={`${inline ? 'mt-6' : 'mt-auto'} flex items-center justify-end gap-2 border-t border-slate-200 pt-4`}>
                    {!inline && <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>}
                    {activeTab === 'mail' && (
                        <Button variant="primary" loading={loading} icon={<Mail size={13} />} onClick={send}>{t('tenders.pdf_ile_tender_maili_gonder')}</Button>
                    )}
                </div>
                )}
        </div>
    );

    if (inline) {
        if (!open) return null;
        return (
            <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                {content}
            </div>
        );
    }

    return (
        <Modal
            open={open}
            title={t('tenders.tender_settings')}
            description={t('tenders.mail_additional_fee_ve_appointment_ayarlarini_tek_place_y')}
            onClose={onClose}
            placement="drawer"
            drawerWidth="wide"
            closeOnBackdrop={false}
            closeOnEscape={false}
        >
            {content}
        </Modal>
    );
};

export const ExportModal: React.FC<{
    open: boolean;
    onClose: () => void;
    tenderId: string;
    tenderNumber: string;
    tree: any[];
    grandTotal: number;
}> = ({ open, onClose, tenderId, tenderNumber, tree, grandTotal }) => {
    const [format, setFormat] = useState<'PDF' | 'CRBX' | 'SIA451'>('PDF');
    const [loading, setLoading] = useState(false);
    const [includeQrBill, setIncludeQrBill] = useState(false);
    const [reference, setReference] = useState('');
    const { detail, activities } = useTenderStore();
    const { settings } = usePdfSettingsStore();
    const navigate = useNavigate();

    const handleExport = async () => {
        if (!detail) return;
        setLoading(true);
        try {
            if (format === 'PDF') {
                const positions = flattenTenderTreeForPdf(tree);
                const { exportTenderPdf } = await import("../../../utils/pdf/tenderPdf");
                await exportTenderPdf(
                    {
                        tenderNumber: detail.tender.tenderNumber,
                        version: detail.tender.version,
                        createdAt: detail.tender.createdAt,
                        validUntil: detail.tender.validUntil,
                        customerName: detail.tender.customerName || '',
                        customerAddress: detail.tender.customerAddress,
                        customerEmail: detail.tender.customerEmail,
                        customerPhone: detail.tender.customerPhone,
                        createdByName: detail.tender.createdByName,
                        activities,
                        positions,
                        grandTotal,
                        referenceNumber: reference || undefined,
                        qrBillEnabled: includeQrBill,
                    },
                    settings
                );
                toast.success(t('tenders.pdf_indirildi'));
                onClose();
            } else {
                const res = await tenderApi.exportFile(tenderId, format);
                const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${tenderNumber}-${format}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success(`${format} verisi indirildi.`);
                onClose();
            }
        } catch (e: any) {
            toast.error(e.response?.data?.error || e.message ||t('tenders.export_aktarim_basarisiz'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open={open}
            title={t('tenders.tender_export')}
            description={t('tenders.isvicre_standartlarinda_pdf_veya_makine_okunur_c')}
            onClose={onClose}
            width="md"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button variant="primary" loading={loading} icon={<Download size={13} />} onClick={handleExport}>{t('common.download')}</Button>
                </>
            }
        >
            <div className="space-y-3">
                <Field label={t('tenders.output_formati')}>
                    <div className="grid grid-cols-3 gap-2">
                        {(['PDF', 'CRBX', 'SIA451'] as const).map((f) => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => setFormat(f)}
                                className={`px-3 py-3 border rounded text-[12.5px] font-medium transition-colors flex flex-col items-center gap-1 ${format === f
                                        ?"border-blue-700 bg-blue-50 text-blue-800"
                                        :"border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                    }`}
                            >
                                <FileText size={14} />
                                {f}
                            </button>
                        ))}
                    </div>
                </Field>

                {format === 'PDF' && (
                    <>
                        <Field label={t('tenders.reference_numarasi')} hint={t('tenders.qr_bill_reference_skipped_when_empty')}>
                            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('tenders.rf18_5390_0754_7034')} />
                        </Field>
                        <Checkbox
                            label={t('tenders.sayfanin_altina_isvicre_qr_bill_empfangsschein_z')}
                            size="sm"
                            isSelected={includeQrBill}
                            onChange={setIncludeQrBill}
                            className="rounded-lg bg-brand-primary_alt px-3 py-2 ring-1 ring-utility-brand-200 ring-inset"
                        />

                        {!settings.letterheadBackground && (
                            <div className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200/70 rounded p-2 flex items-start gap-2">
                                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                                <span>{t('tenders.antetli_kagit_arka_plani_yuklenmemis_pdf_varsayi')}<button
                                        type="button"
                                        className="text-blue-700 underline ml-1"
                                        onClick={() => { onClose(); navigate('/settings/pdf'); }}
                                    >{t('tenders.simdi_add')}</button>
                                </span>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

