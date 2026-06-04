import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    AlertTriangle,
    Bold01 as Bold,
    Calculator,
    CalendarPlus01 as CalendarPlus,
    Camera01 as Camera,
    Check,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Clipboard as ClipboardList,
    DownloadCloud02 as Download,
    Edit01 as Pencil,
    File05 as FileText,
    Hash01 as Hash,
    Image01 as ImageIcon,
    Italic01 as Italic,
    List,
    Mail01 as Mail,
    Minus,
    Package,
    Plus,
    Save01 as Save,
    Scan as ScanBarcode,
    Tag01 as Tag,
    Trash01 as Trash2,
    Type01 as Type,
    UploadCloud02 as Upload,
    XClose as X,
} from '@untitledui/icons';

import { BarcodeScannerModal } from '../../../components/ui-shared/BarcodeScannerModal';
import { Button } from '../../../components/ui-shared/Button';
import { Card } from '../../../components/ui-shared/Card';
import { Field, Input, Select, Textarea } from '../../../components/ui-shared/Field';
import { Modal } from '../../../components/ui-shared/Modal';
import { Checkbox } from '../../../components/base/checkbox/checkbox';
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
    lineTotalWithTax,
    mergeArticleMappingUpdate,
    type TreeNode,
} from './tenderDetailUtils';


/* ── TreeRow ──
 * Pricing/quantity fields are editable in draft rows and auto-save through the detail page.
 * Description / long description retain inline pencil → check editing.
 */
const logDateLabel = (date: string) => {
    const d = dayjs(date);
    const now = dayjs();
    if (d.isSame(now, 'day')) return 'Bugün';
    if (d.isSame(now.subtract(1, 'day'), 'day')) return 'Dün';
    return d.format('D MMMM YYYY');
};

const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
};

const flattenTenderTreeForPdf = (tree: any[]) => {
    const flatTree: any[] = [];
    const flatten = (nodes: any[], isRootLevel = false) => {
        nodes.forEach((n) => {
            flatTree.push({
                positionNumber: n.positionNumber,
                shortDescription: n.shortDescription,
                longDescription: n.longDescription,
                quantity: n.children.length > 0 ? undefined : n.quantity,
                unit: n.children.length > 0 ? undefined : n.unit,
                npkCode: n.npkCode,
                imageUrl: n.imageUrl,
                discount: n.children.length > 0 ? undefined : (n.discount ?? 0),
                taxRate: n.children.length > 0 ? undefined : 8.1,
                unitPrice: n.children.length > 0 ? undefined : n.unitPrice,
                total: n.totalWithChildren,
                isParent: n.children.length > 0,
                isTopLevel: isRootLevel,
                hierarchyLevel: n.hierarchyLevel,
            });
            flatten(n.children, false);
            if (isRootLevel) {
                flatTree.push({
                    positionNumber: `${n.positionNumber}-subtotal`,
                    shortDescription: '',
                    quantity: 0,
                    total: n.totalWithChildren,
                    isSectionSubtotal: true,
                });
            }
        });
    };
    flatten(tree, true);
    return flatTree;
};

const fieldLabel = (field?: string | null) => {
    const labels: Record<string, string> = {
        quantity: 'Miktar',
        quantityMultiplier: 'Miktar',
        unitPrice: 'Birim fiyat',
        baseCost: 'Ürün fiyatı',
        discount: 'İndirim',
        taxRate: 'KDV',
        shortDescription: 'Açıklama',
        longDescription: 'Uzun açıklama',
        description: 'Açıklama',
        name: 'Ürün adı',
        unit: 'Birim',
        articleCode: 'Stok kodu',
        minStockLevel: 'Minimum stok',
        criticalStockLevel: 'Kritik stok',
        maxStockLevel: 'Maksimum stok',
        status: 'Durum',
    };
    return field ? (labels[field] ?? field) : 'İşlem';
};

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const renderInlineMarkdownHtml = (value: string) => {
    const html = escapeHtml(value)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');

    return html
        .replace(/<em>\s*\*{1,2}\s*<\/em>/g, '')
        .replace(/<strong>\s*_\s*<\/strong>/g, '')
        .replace(/(^|[\s>])(?:\*\*|__|_)(?=($|[\s<]))/g, '$1');
};

const markdownToHtml = (value: string) => {
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

        if (tag === 'strong' || tag === 'b') return children ? `**${children}**` : '';
        if (tag === 'em' || tag === 'i') return children ? `_${children}_` : '';
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

const RichTextMarkdownEditor: React.FC<{
    value: string;
    onChange: (value: string) => void;
    minHeight?: number;
    className?: string;
    placeholder?: string;
    variant?: 'boxed' | 'inline';
}> = ({ value, onChange, minHeight = 92, className = '', placeholder = 'Açıklama yazın...', variant = 'boxed' }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState({ bold: false, italic: false, list: false });
    const hasContent = value.trim().length > 0;
    const isInline = variant === 'inline';

    useEffect(() => {
        const el = editorRef.current;
        if (!el || document.activeElement === el) return;
        const nextHtml = markdownToHtml(value);
        if (el.innerHTML !== nextHtml) el.innerHTML = nextHtml;
    }, [value]);

    const updateActiveState = () => {
        const el = editorRef.current;
        if (!el || document.activeElement !== el) return;

        try {
            setActive({
                bold: document.queryCommandState('bold'),
                italic: document.queryCommandState('italic'),
                list: document.queryCommandState('insertUnorderedList'),
            });
        } catch {
            setActive({ bold: false, italic: false, list: false });
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

    const runCommand = (command: 'bold' | 'italic' | 'insertUnorderedList') => {
        editorRef.current?.focus();
        document.execCommand(command);
        emitChange(true);
        updateActiveState();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter') return;

        if (document.queryCommandState('insertUnorderedList')) {
            window.setTimeout(() => emitChange(true), 0);
            return;
        }

        event.preventDefault();
        document.execCommand('insertHTML', false, '<br><br>');
        emitChange(true);
    };

    const toolbarButtonClass = (isActive: boolean) =>
        `flex h-6 w-6 items-center justify-center rounded text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 ${isActive ? 'bg-brand-solid !text-white shadow-xs hover:bg-brand-solid hover:!text-white' : ''}`;

    const frameClass = isInline
        ? `rounded-md border border-slate-200 bg-white px-2 py-1 transition-colors hover:border-slate-300 focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-200 ${className}`
        : `overflow-hidden rounded-md border border-slate-300 bg-white shadow-xs transition-colors hover:border-slate-400 focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-200 ${className}`;
    const toolbarClass = isInline
        ? 'mb-1 inline-flex items-center gap-1 rounded-md bg-white px-1 py-0.5'
        : 'flex items-center gap-1 border-b border-slate-100 bg-slate-50/90 px-1.5 py-1';
    const editorClass = `rich-text-editor w-full cursor-text text-[13px] leading-6 text-slate-800 outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 ${isInline ? 'bg-transparent px-0 py-0.5' : 'px-3 py-2 focus:bg-white'} ${hasContent ? '' : 'before:pointer-events-none before:text-slate-400 before:content-[attr(data-placeholder)]'}`;

    return (
        <div
            className={frameClass}
            onClick={() => editorRef.current?.focus()}
        >
            <div className={toolbarClass}>
                <button type="button" title="Kalın" aria-pressed={active.bold} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('bold')} className={toolbarButtonClass(active.bold)}>
                    <Bold size={12} />
                </button>
                <button type="button" title="İtalik" aria-pressed={active.italic} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('italic')} className={toolbarButtonClass(active.italic)}>
                    <Italic size={12} />
                </button>
                <button type="button" title="Madde işareti" aria-pressed={active.list} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertUnorderedList')} className={toolbarButtonClass(active.list)}>
                    <List size={12} />
                </button>
            </div>
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => emitChange()}
                onBlur={() => emitChange()}
                onFocus={updateActiveState}
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
    if (value == null || value === '') return 'boş';
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
    if (log.actionType.includes('POSITION')) return 'Pozisyon';
    if (log.actionType.includes('ARTICLE')) return 'Ürün';
    return 'İşlem';
};

const logTitle = (log: TenderChangeLog) => {
    const subject = logSubject(log);
    if (log.actionType === 'ARTICLE_MAPPED') return `${subject} pozisyona eklendi`;
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
    return log.description || 'İşlem kaydedildi.';
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
                        <h2 className="text-lg font-semibold text-primary">İşlem Logları</h2>
                        <p className="mt-1 text-sm text-tertiary">Teklifte yapılan ürün, pozisyon, fiyat ve stok hareketleri</p>
                        <h2 className="hidden">Eski log başlığı</h2>
                        <p className="hidden">Eski log açıklaması</p>
                    </div>
                    <button onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition-colors hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-2">
                        <X size={17} />
                    </button>
                </div>

                <div className="h-[calc(100vh-73px)] overflow-y-auto px-5 py-5">
                    {loading ? (
                        <div className="py-10 text-center text-[12.5px] text-slate-400">Loglar yukleniyor...</div>
                    ) : logs.length === 0 ? (
                        <div className="py-10 text-center text-[12.5px] text-slate-400">Henüz log kaydı yok.</div>
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
                                                    <span className="text-[11px] text-slate-400">{dayjs(log.createdAt).format('DD.MM, HH:mm')}</span>
                                                </div>
                                                <div className="mt-0.5 text-[14px] font-semibold text-slate-800">
                                                    {logTitle(log)}
                                                </div>
                                                <div className="hidden">
                                                    <span>{fieldLabel(log.fieldName)}</span>
                                                    {log.oldValue != null || log.newValue != null ? (
                                                        <>
                                                            <span className="mx-1 text-slate-400">•</span>
                                                            <span className="font-mono text-slate-500">{log.oldValue ?? 'boş'}</span>
                                                            <span className="mx-1.5 text-slate-500">→</span>
                                                            <span className="font-mono font-semibold text-blue-700">{log.newValue ?? 'boş'}</span>
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
    expanded: Record<string, boolean>;
    onToggle: (id: string) => void;
    selectedId: string | null;
    onSelect: (id: string) => void;
    checkedIds: Record<string, boolean>;
    onCheckedChange: (id: string, checked: boolean) => void;
    isDraft: boolean;
    tenderId: string;
    onEditArticle?: (node: TreeNode) => void;
    articleEditLoadingId?: string | null;
    onInlinePositionChange?: (positionId: string, patch: Pick<Partial<PositionDto>, 'quantity' | 'unit' | 'unitPrice' | 'discount' | 'shortDescription' | 'longDescription'>) => void;
    onInlineMappingChange?: (positionId: string, mappingId: string, patch: { quantityMultiplier?: number; discount?: number | null }) => void;
    onUpdated: () => void;
}> = ({ node, level, expanded, onToggle, selectedId, onSelect, checkedIds, onCheckedChange, isDraft, tenderId, onEditArticle = () => undefined, articleEditLoadingId = null, onInlinePositionChange, onInlineMappingChange, onUpdated }) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded[node.id] ?? false;
    const isSelected = selectedId === node.id;
    const { updatePosition, deletePosition } = useTenderStore();

    const [editingDesc, setEditingDesc] = useState(false);
    const [descVal, setDescVal] = useState(node.shortDescription);
    const [editingLong, setEditingLong] = useState(false);
    const [longVal, setLongVal] = useState(node.longDescription || '');
    const [logOpen, setLogOpen] = useState(false);
    const longEditorRef = useRef<HTMLDivElement>(null);

    const qty = node.quantity;
    const effectivePrice = node.unitPrice ?? null;
    const calcTotal = node.calculation?.totalCalculatedPrice ?? 0;
    const derivedNetTotal = effectivePrice != null && effectivePrice > 0 && qty > 0
        ? qty * effectivePrice * (1 - (node.discount ?? 0) / 100) + (node.calculation?.additionalCost ?? 0)
        : calcTotal;
    const derivedTotal = lineTotalWithTax(derivedNetTotal, node.taxRate);
    const displayTotal = hasChildren ? node.totalWithChildren : (derivedTotal > 0 ? derivedTotal : node.totalWithChildren);
    const displayUnitPrice = effectivePrice != null
        ? effectivePrice
        : (qty > 0 && calcTotal > 0 ? calcTotal / qty : null);
    const indent = level * 16;
    const anyEditing = editingDesc || editingLong;
    const rowLogs: TenderChangeLog[] = [];
    const canInlineEdit = isDraft && !hasChildren;
    const inlineInputClass = "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-[11px] text-slate-700 outline-none transition-colors hover:border-slate-200 focus:border-blue-400 focus:bg-white";
    const inlineTextInputClass = "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-left text-[11px] text-slate-600 outline-none transition-colors hover:border-slate-200 focus:border-blue-400 focus:bg-white";
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
        if (next && next !== node.shortDescription && onInlinePositionChange) {
            onInlinePositionChange(node.id, { shortDescription: next });
            setEditingDesc(false);
            return;
        }
        if (descVal.trim() && descVal !== node.shortDescription) {
            try { await updatePosition(tenderId, node.id, { shortDescription: descVal.trim() }); onUpdated(); }
            catch { toast.error('Güncellenemedi.'); }
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
            catch { toast.error('Güncellenemedi.'); }
        }
        setEditingLong(false);
    };

    const openLongEditor = () => {
        if (!isDraft || node.isArticleMapping) return;
        setLongVal(node.longDescription || '');
        setEditingLong(true);
    };

    return (
        <>
            <tr
                onClick={() => { if (!anyEditing) onSelect(node.id); }}
                className={`border-b border-slate-100 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50/40'
                    }`}
            >
                <td className="px-1.5 py-2 text-center align-top">
                    <Checkbox
                        aria-label="Satırı seç"
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
                        {hasChildren ? (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
                                className="p-0.5 rounded hover:bg-slate-200/60 text-slate-400 shrink-0"
                            >
                                {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                            </button>
                        ) : <span className="w-4 shrink-0" />}
                        {false && node.isArticleMapping && node.articleId && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onEditArticle(node); }}
                                className="w-8 h-8 shrink-0 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 flex items-center justify-center disabled:opacity-50"
                                title="Ürün ayarlarını aç"
                                disabled={articleEditLoadingId === node.articleId}
                            >
                                {articleEditLoadingId === node.articleId ? (
                                    <span className="w-3.5 h-3.5 rounded-full border-2 border-blue-300 border-t-blue-700 animate-spin" />
                                ) : (
                                    <Pencil size={15} />
                                )}
                            </button>
                        )}
                        <span className="text-[10px] font-mono text-black shrink-0 mr-0.5 select-none">{node.positionNumber}</span>

                        {editingDesc ? (
                            <>
                                <input
                                    autoFocus
                                    value={descVal}
                                    onChange={(e) => setDescVal(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') saveDesc(); if (e.key === 'Escape') { setDescVal(node.shortDescription); setEditingDesc(false); } }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-1 min-w-0 rounded border border-blue-400 bg-white px-2 py-1 text-[13px] text-slate-900 outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); saveDesc(); }}
                                    className="shrink-0 p-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                                    title="Kaydet"
                                >
                                    <Check size={10} />
                                </button>
                            </>
                        ) : (
                            <>
                                <span className={`flex-1 truncate text-[13px] leading-5 ${hasChildren ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
                                    {node.shortDescription}
                                </span>
                                {node.npkCode && (
                                    <span className="shrink-0 text-[9px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{node.npkCode}</span>
                                )}
                                {isDraft && !node.isArticleMapping && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setDescVal(node.shortDescription); setEditingDesc(true); }}
                                            className="shrink-0 p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-slate-500"
                                            title="Açıklamayı düzenle"
                                        >
                                            <Pencil size={10} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                const label = hasChildren
                                                    ? `"${node.shortDescription}" ve tüm alt pozisyonları`
                                                    : `"${node.shortDescription}"`;
                                                if (!confirm(`${label} silinsin mi?`)) return;
                                                try {
                                                    await deletePosition(tenderId, node.id);
                                                    toast.success('Pozisyon silindi.');
                                                    onUpdated();
                                                } catch (err: any) {
                                                    toast.error(err.response?.data?.error || 'Silinemedi.');
                                                }
                                            }}
                                            className="shrink-0 p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500"
                                            title="Pozisyonu sil"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </div>

                    {/* Long description row */}
                    {(node.longDescription || editingLong || (isDraft && !node.isArticleMapping)) && (
                        <div className="mt-0.5" style={{ paddingLeft: indent + 20 }}>
                            {editingLong ? (
                                <div
                                    ref={longEditorRef}
                                    className="w-full max-w-[720px]"
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={(e) => {
                                        if (!longEditorRef.current?.contains(e.relatedTarget as Node | null)) {
                                            void saveLong();
                                        }
                                    }}
                                >
                                    <RichTextMarkdownEditor
                                        value={longVal}
                                        onChange={setLongVal}
                                        minHeight={54}
                                        variant="inline"
                                        placeholder="Uzun açıklama yaz..."
                                    />
                                </div>
                            ) : node.longDescription ? (
                                <div
                                    className={`group flex max-w-[520px] items-start gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 ${isDraft && !node.isArticleMapping ? 'cursor-text hover:border-slate-300 hover:shadow-xs' : ''}`}
                                    onClick={(e) => {
                                        if (!isDraft || node.isArticleMapping) return;
                                        e.stopPropagation();
                                        openLongEditor();
                                    }}
                                >
                                    <span
                                        className="rich-text-preview min-w-0 text-[12.5px] leading-5 text-slate-700 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5"
                                        dangerouslySetInnerHTML={{ __html: markdownToHtml(node.longDescription || '') }}
                                    />
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); openLongEditor(); }}
                                    className="mt-1 inline-flex min-h-7 items-center rounded-md border border-slate-200 bg-white px-2 text-left text-[12px] text-slate-400 transition-colors hover:border-slate-300 hover:text-blue-700"
                                >
                                    Uzun açıklama yaz...
                                </button>
                            )}
                        </div>
                    )}
                </td>

                {/* Qty (read-only) */}
                <td className="px-1.5 py-2 text-right align-top">
                    {canInlineEdit ? (
                        <input
                            aria-label="Miktar"
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
                            {!hasChildren && qty > 0 ? qty : ''}
                        </span>
                    )}
                </td>

                {/* Unit (read-only) */}
                <td className="px-1.5 py-2 text-left align-top">
                    {canInlineEdit && !node.isArticleMapping ? (
                        <input
                            aria-label="Birim"
                            className={inlineTextInputClass}
                            value={node.unit ?? ''}
                            onChange={(e) => onInlinePositionChange?.(node.id, { unit: e.target.value || null })}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="text-[11px] text-slate-500">
                            {!hasChildren && node.unit ? node.unit : ''}
                        </span>
                    )}
                </td>

                {/* Unit Price (read-only) */}
                <td className="px-1.5 py-2 text-right align-top">
                    {canInlineEdit && !node.isArticleMapping ? (
                        <input
                            aria-label="Birim fiyat"
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
                            {!hasChildren && displayUnitPrice != null ? fmtMoney(displayUnitPrice) : ''}
                        </span>
                    )}
                </td>

                {/* Discount (read-only) */}
                <td className="px-1.5 py-2 text-right align-top">
                    {canInlineEdit ? (
                        <input
                            aria-label="İndirim"
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
                            {!hasChildren && node.discount && node.discount > 0 ? `${node.discount}%` : ''}
                        </span>
                    )}
                </td>

                {/* KDV — her ürün/pozisyon için sabit %8.1, gri badge */}
                <td className="px-1.5 py-2 text-right align-top">
                    {!hasChildren ? (
                        <span
                            className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 font-mono whitespace-nowrap"
                            title="Sabit KDV oranı"
                        >
                            %{fmtVatRate(node.taxRate != null && node.taxRate > 0 ? node.taxRate : FIXED_VAT)}
                        </span>
                    ) : (
                        <span className="text-slate-300">—</span>
                    )}
                </td>

                {/* Total (read-only) */}
                <td className="px-2 py-2 text-right font-mono text-[10.5px] align-top">
                    {displayTotal > 0 ? (
                        <span className={`font-semibold ${hasChildren ? 'text-slate-600' : 'text-slate-800'}`}>
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
                                ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-blue-700'
                                : 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                            }`}
                        title="Satır logları"
                    >
                        <ChevronUp size={14} />
                    </button>
                    {logOpen && rowLogs.length > 0 && (
                        <div
                            className="absolute right-2 bottom-9 z-30 w-[320px] max-w-[80vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl text-left animate-in slide-in-from-bottom-2 fade-in"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Satır Logları</span>
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
                                                {dayjs(log.createdAt).format('DD.MM.YYYY HH:mm')}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-slate-700">{log.description || log.actionType}</div>
                                        {(log.oldValue != null || log.newValue != null) && (
                                            <div className="mt-1 font-mono text-[10.5px] text-slate-500">
                                                {log.oldValue ?? 'boş'} → {log.newValue ?? 'boş'}
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
            {isExpanded &&
                node.children.map((c) => (
                    <TreeRow
                        key={c.id}
                        node={c}
                        level={level + 1}
                        expanded={expanded}
                        onToggle={onToggle}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        checkedIds={checkedIds}
                        onCheckedChange={onCheckedChange}
                        isDraft={isDraft}
                        tenderId={tenderId}
                        onEditArticle={onEditArticle}
                        articleEditLoadingId={articleEditLoadingId}
                        onInlinePositionChange={onInlinePositionChange}
                        onInlineMappingChange={onInlineMappingChange}
                        onUpdated={onUpdated}
                    />
                ))}
            {isExpanded && hasChildren && (
                <tr aria-hidden="true">
                    <td colSpan={8} className="p-0">
                        <div
                            className="border-b border-slate-300"
                            style={{ marginLeft: indent + 20 }}
                        />
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
    isRoot?: boolean;
    onSaveCalc: (c: CostInput) => Promise<void>;
    onMapArticle: (articleId: string, qty: number, opts?: { discount?: number }) => Promise<void>;
    onRemoveArticleMapping: (mappingId: string) => Promise<void>;
    onOpenNewArticle: () => void;
    onEditArticle: (articleId: string, positionId?: string | null, mappingId?: string | null) => void;
    onSelectArticleMapping: (mappingId: string) => void;
    onLocalPositionChange?: (positionId: string, patch: PositionPricingPatch) => void;
    onLocalMappingChange?: (positionId: string, mappingId: string, patch: MappingPricingPatch) => void;
    articleEditLoadingId: string | null;
}> = ({ position, tenderId, isDraft, canCalc, stockArticles, stockArticlesLoading, stockArticlesLoaded, activeTab, setActiveTab, isRoot, onSaveCalc, onMapArticle, onRemoveArticleMapping, onOpenNewArticle, onEditArticle, onSelectArticleMapping, onLocalPositionChange, onLocalMappingChange, articleEditLoadingId }) => {
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
    const [editingMappingDescriptionId, setEditingMappingDescriptionId] = useState<string | null>(null);
    const [mappingDescriptionDrafts, setMappingDescriptionDrafts] = useState<Record<string, string>>({});
    const mappingDescriptionRef = useRef<HTMLTextAreaElement>(null);
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
        setEditingMappingDescriptionId(null);
        setMappingDescriptionDrafts({});
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

    const calculationDirty = !isArticle && !isRoot && (
        !position.calculation ||
        (cost.materialCost ?? 0) !== (position.calculation.materialCost ?? 0) ||
        (cost.laborCost ?? 0) !== (position.calculation.laborCost ?? 0) ||
        (cost.overheadCost ?? 0) !== (position.calculation.overheadCost ?? 0) ||
        (cost.riskAmount ?? 0) !== (position.calculation.riskAmount ?? 0) ||
        (cost.additionalCost ?? 0) !== (position.calculation.additionalCost ?? 0) ||
        (finalMargin ?? 0) !== (position.calculation.profitMargin ?? 0)
    );
    const autoSaveDirty = isDraft && canCalc && !isRoot && (pricingDirty || calculationDirty);

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
            toast.error(e.response?.data?.error || 'Kaydedilemedi.');
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
            toast.error(err.response?.data?.error || 'İndirim güncellenemedi.');
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
            toast.success('Toplu indirim uygulandi.');
        } catch (err: any) {
            setAppliedMappingDiscounts({});
            toast.error(err.response?.data?.error || 'Toplu indirim guncellenemedi.');
        } finally {
            setMappingLoadingId(null);
        }
    };



    const startEditMappingDescription = (mappingId: string, currentDescription?: string | null) => {
        setEditingMappingDescriptionId(mappingId);
        setMappingDescriptionDrafts((prev) => ({ ...prev, [mappingId]: currentDescription ?? '' }));
        requestAnimationFrame(() => mappingDescriptionRef.current?.focus());
    };
    void startEditMappingDescription;

    const insertMappingDescriptionFormat = (before: string, after = '') => {
        if (!editingMappingDescriptionId) return;
        const current = mappingDescriptionDrafts[editingMappingDescriptionId] ?? '';
        const el = mappingDescriptionRef.current;
        const start = el?.selectionStart ?? current.length;
        const end = el?.selectionEnd ?? current.length;
        const selected = current.slice(start, end) || 'metin';
        const next = `${current.slice(0, start)}${before}${selected}${after}${current.slice(end)}`;
        setMappingDescriptionDrafts((prev) => ({ ...prev, [editingMappingDescriptionId]: next }));
        requestAnimationFrame(() => {
            mappingDescriptionRef.current?.focus();
            mappingDescriptionRef.current?.setSelectionRange(start + before.length, start + before.length + selected.length);
        });
    };

    const insertMappingDescriptionBullet = () => {
        if (!editingMappingDescriptionId) return;
        const current = mappingDescriptionDrafts[editingMappingDescriptionId] ?? '';
        const el = mappingDescriptionRef.current;
        const start = el?.selectionStart ?? current.length;
        const prefix = start === 0 || current[start - 1] === '\n' ? '- ' : '\n- ';
        const next = `${current.slice(0, start)}${prefix}${current.slice(start)}`;
        setMappingDescriptionDrafts((prev) => ({ ...prev, [editingMappingDescriptionId]: next }));
        requestAnimationFrame(() => mappingDescriptionRef.current?.focus());
    };

    const saveMappingDescription = async (mappingId: string) => {
        void mappingId;
        setEditingMappingDescriptionId(null);
    };

    // Render rich text preview inline
    const renderLong = (text: string) =>
        text.split('\n').flatMap((line, i, arr) => {
            const isBullet = line.trimStart().startsWith('- ');
            const content = isBullet ? line.trimStart().slice(2) : line;
            return [
                isBullet ? <span key={`bullet-${i}`}>• </span> : null,
                ...content.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((seg, j) => {
                    if (seg.startsWith('**') && seg.endsWith('**'))
                        return <strong key={`${i}-${j}`}>{seg.slice(2, -2)}</strong>;
                    if (seg.startsWith('_') && seg.endsWith('_'))
                        return <em key={`${i}-${j}`}>{seg.slice(1, -1)}</em>;
                    return <span key={`${i}-${j}`}>{seg}</span>;
                }),
                ...(i < arr.length - 1 ? [<br key={`br-${i}`} />] : []),
            ];
        });

    return (
        <Card
            title={isArticle ? position.shortDescription : `Pozisyon ${position.positionNumber}`}
            icon={<Tag size={13} />}
            noPadding
            actions={
                <span className="text-[10.5px] text-slate-400 font-mono">
                    {isArticle ? 'Ürün Detayı' : `Seviye ${position.hierarchyLevel}`}
                </span>
            }
        >
            {/* Position description header — always visible */}
            <div className="px-4 py-3 border-b border-slate-100 space-y-1">
                <div className="flex items-center gap-2">
                    <p className={`flex-1 text-[13px] leading-snug ${position.shortDescription ? 'font-medium text-slate-800' : 'italic text-slate-400'}`}>
                        {position.shortDescription || 'Açıklama girilmemiş'}
                    </p>
                    {position.npkCode && (
                        <span className="shrink-0 text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200/60">
                            NPK {position.npkCode}
                        </span>
                    )}
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
                    <TabBtn active={activeTab === 'calc'} onClick={() => setActiveTab('calc')} icon={<Calculator size={12} />}>
                        Maliyet
                    </TabBtn>
                    <TabBtn active={activeTab === 'articles'} onClick={() => setActiveTab('articles')} icon={<Package size={12} />}>
                        Ürün (BOM)
                    </TabBtn>
                    <TabBtn active={activeTab === 'meta'} onClick={() => setActiveTab('meta')} icon={<ClipboardList size={12} />}>
                        Düzenle
                    </TabBtn>
                </div>
            )}

            <div className="p-4 space-y-3">
                {visibleActiveTab === 'calc' && (
                    <>
                        {!isDraft && (
                            <div className="flex items-start gap-2 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200/60 rounded p-2">
                                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                                <span>Bu teklif onaylanmış. Fiyatları değiştirmek için yeni versiyon oluşturmanız gerekir.</span>
                            </div>
                        )}

                        {/* ── Pozisyon Fiyatlandırması — Quick pricing block ── */}
                        <div className="border border-slate-200/70 rounded-md p-3 bg-white space-y-2.5">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                    Pozisyon Fiyatlandırması
                                </h4>
                                <span className="text-[10px] text-slate-400">tabloya yansır</span>
                            </div>

                            {isRoot && (
                                <div className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200/60 p-2 rounded">
                                    Bu pozisyonun altında alt pozisyon veya ürün (BOM) olduğu için <strong>Kök Pozisyon</strong> olarak davranmaktadır. Fiyat ve miktar, altındaki kalemlerin toplamından otomatik hesaplanır.
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                                <Field label="Miktar">
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            disabled={!isDraft || isRoot}
                                            onClick={() => updatePricing({ quantity: Math.max(0, pricing.quantity - 1) })}
                                            className="w-6 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 flex items-center justify-center text-sm leading-none disabled:opacity-50"
                                        >−</button>
                                        <Input
                                            type="number"
                                            step="1"
                                            min={0}
                                            value={pricing.quantity}
                                            onChange={(e) => updatePricing({ quantity: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                                            disabled={!isDraft || isRoot}
                                            className="text-center"
                                        />
                                        <button
                                            type="button"
                                            disabled={!isDraft || isRoot}
                                            onClick={() => updatePricing({ quantity: pricing.quantity + 1 })}
                                            className="w-6 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 flex items-center justify-center text-sm leading-none disabled:opacity-50"
                                        >+</button>
                                    </div>
                                </Field>
                                {!isArticle && !isRoot && (
                                    <>
                                        <Field label="Birim">
                                            <Input
                                                value={pricing.unit}
                                                placeholder="stk, m², kg…"
                                                onChange={(e) => updatePricing({ unit: e.target.value })}
                                                disabled={!isDraft || isRoot}
                                            />
                                        </Field>
                                        <Field label="Birim Fiyat (CHF)" className="col-span-2">
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min={0}
                                                value={pricing.unitPrice}
                                                onChange={(e) => updatePricing({ unitPrice: parseFloat(e.target.value) || 0 })}
                                                disabled={!isDraft || isRoot}
                                            />
                                        </Field>
                                    </>
                                )}
                                <Field label="İndirim (%)">
                                    <Input
                                        type="number"
                                        step="0.1"
                                        min={0}
                                        max={100}
                                        value={pricing.discount}
                                        onChange={(e) => updatePricing({ discount: parseFloat(e.target.value) || 0 })}
                                        disabled={!isDraft || isRoot}
                                    />
                                </Field>
                                {!isArticle && (
                                    <Field label="Ek Maliyet">
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min={0}
                                            value={cost.additionalCost}
                                            onChange={(e) => setCost({ ...cost, additionalCost: parseFloat(e.target.value) || 0 })}
                                            disabled={!isDraft || isRoot}
                                        />
                                    </Field>
                                )}
                                <Field label="KDV · Sabit">
                                    <div className="flex items-center gap-2 h-[34px] px-2.5 rounded border border-slate-200 bg-slate-50 cursor-not-allowed">
                                        <span
                                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 font-mono"
                                        >
                                            %{fmtVatRate(effectiveVat)}
                                        </span>
                                        <span className="text-[11px] text-slate-500">sabit oran · her ürüne uygulanır</span>
                                    </div>
                                </Field>
                            </div>

                            {/* Live summary */}
                            <div className="border-t border-slate-100 pt-2 space-y-1 text-[11.5px]">
                                <div className="flex items-center justify-between text-slate-500">
                                    <span>Brüt ({pricing.quantity} × {fmtMoney(pricing.unitPrice)})</span>
                                    <span className="font-mono">{fmtMoney(pricingGross)}</span>
                                </div>
                                {pricing.discount > 0 && (
                                    <div className="flex items-center justify-between text-slate-500">
                                        <span>İndirim ({pricing.discount}%)</span>
                                        <span className="font-mono text-red-600">−{fmtMoney(pricingDiscountAmount)}</span>
                                    </div>
                                )}
                                {!isArticle && (
                                    <div className="flex items-center justify-between text-slate-500">
                                        <span>Ek Maliyet</span>
                                        <span className="font-mono">{cost.additionalCost > 0 ? '+' : ''}{fmtMoney(cost.additionalCost)}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between font-semibold text-slate-700">
                                    <span>Net Tutar</span>
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
                                    <span>Toplam (KDV dahil)</span>
                                    <span className="font-mono">{fmtMoney(pricingTotalWithTax)}</span>
                                </div>
                            </div>

                            {autoSaveDirty && (
                                <div className="text-[10px] text-slate-400 text-right">
                                    {saving ? 'Kaydediliyor...' : 'Otomatik kaydedilecek...'}
                                </div>
                            )}
                        </div>

                        {isArticle && (
                            <div className="border border-slate-200/70 rounded-md p-3 bg-white space-y-2.5">
                                <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                    Ürün İşlemi
                                </h4>
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
                                            toast.success('Ürün tekliften kaldırıldı.');
                                        } catch (err: any) {
                                            toast.error(err.response?.data?.error || 'İşlem tamamlanamadı.');
                                        } finally {
                                            setSaving(false);
                                        }
                                    }}
                                    className="w-full"
                                >
                                    Tekliften Kaldır
                                </Button>
                            </div>
                        )}

                        {/* Advanced cost build-up (collapsed by default visually) */}
                        {!isArticle && (
                            <details className="border border-slate-200/70 rounded-md bg-white">
                                <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hover:bg-slate-50/60 select-none">
                                    Ek Maliyet (opsiyonel)
                                </summary>
                                <div className="px-3 pb-3 space-y-3">
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <Field label="Malzeme">
                                            <Input type="number" step="0.01" value={cost.materialCost}
                                                onChange={(e) => setCost({ ...cost, materialCost: parseFloat(e.target.value) || 0 })}
                                                disabled={!isDraft || !canCalc || isRoot} />
                                        </Field>
                                        <Field label="İşçilik">
                                            <Input type="number" step="0.01" value={cost.laborCost}
                                                onChange={(e) => setCost({ ...cost, laborCost: parseFloat(e.target.value) || 0 })}
                                                disabled={!isDraft || !canCalc || isRoot} />
                                        </Field>
                                        <Field label="Genel Gider">
                                            <Input type="number" step="0.01" value={cost.overheadCost}
                                                onChange={(e) => setCost({ ...cost, overheadCost: parseFloat(e.target.value) || 0 })}
                                                disabled={!isDraft || !canCalc || isRoot} />
                                        </Field>
                                        <Field label="Risk">
                                            <Input type="number" step="0.01" value={cost.riskAmount}
                                                onChange={(e) => setCost({ ...cost, riskAmount: parseFloat(e.target.value) || 0 })}
                                                disabled={!isDraft || !canCalc || isRoot} />
                                        </Field>
                                        <Field label="Ek Maliyet">
                                            <Input type="number" step="0.01" value={cost.additionalCost}
                                                onChange={(e) => setCost({ ...cost, additionalCost: parseFloat(e.target.value) || 0 })}
                                                disabled={!isDraft || !canCalc || isRoot} />
                                        </Field>
                                    </div>

                                    <div className="bg-slate-50/60 border border-slate-200/60 rounded-md p-2.5 space-y-2">
                                        <div className="flex items-center justify-between text-[12px]">
                                            <span className="text-slate-500">Maliyet Toplamı (Marjsız)</span>
                                            <span className="font-mono font-semibold text-slate-700">{fmtMoney(subtotal)}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setMarginMode('amount')}
                                                className={`flex-1 py-1 text-[11.5px] rounded ${marginMode === 'amount' ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                                            >
                                                Tutar
                                            </button>
                                            <button
                                                onClick={() => setMarginMode('percent')}
                                                className={`flex-1 py-1 text-[11.5px] rounded ${marginMode === 'percent' ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                                            >
                                                Yüzde %
                                            </button>
                                        </div>
                                        {marginMode === 'amount' ? (
                                            <Field label="Kâr Marjı (tutar)">
                                                <Input type="number" step="0.01" value={cost.profitMargin}
                                                    onChange={(e) => setCost({ ...cost, profitMargin: parseFloat(e.target.value) || 0 })}
                                                    disabled={!isDraft || !canCalc || isRoot} />
                                            </Field>
                                        ) : (
                                            <Field label="Kâr Marjı (%)">
                                                <Input type="number" step="0.1" value={marginPercent}
                                                    onChange={(e) => setMarginPercent(parseFloat(e.target.value) || 0)}
                                                    disabled={!isDraft || !canCalc || isRoot} />
                                            </Field>
                                        )}
                                    </div>

                                    <div className="bg-blue-50 border border-blue-200/60 rounded-md p-3 space-y-1.5">
                                        <div className="flex items-center justify-between text-[12px]">
                                            <span className="text-blue-900">Hesaplanan Toplam Fiyat (Net)</span>
                                            <span className="font-mono font-bold text-blue-900 text-[14px]">{fmtMoney(total)}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                                            <span className="flex items-center gap-1">KDV <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200 font-mono">%{fmtVatRate(effectiveVat)}</span></span>
                                            <span className="font-mono">+{fmtMoney(total * effectiveVat / 100)}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[12px] pt-1 border-t border-blue-200/40">
                                            <span className="text-blue-900 font-semibold">Toplam (KDV Dahil)</span>
                                            <span className="font-mono font-bold text-blue-900">{fmtMoney(totalWithTax)}</span>
                                        </div>
                                        {position.quantity > 0 && (
                                            <div className="flex items-center justify-between text-[11px] text-blue-700/80 mt-1">
                                                <span>Birim Fiyat ({fmtNumber(position.quantity)} {position.unit || ''})</span>
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
                        <div className="text-[11.5px] text-slate-500 leading-relaxed">
                            Pozisyona stoktan ürün bağlayın. Malzeme maliyeti BOM üzerinden otomatik hesaplanır.
                            Stok seviyesi bu işlemden etkilenmez — stok yönetimi ayrı modülden yapılır.
                        </div>

                        {/* Currently bound articles */}
                        {position.articleMappings && position.articleMappings.length > 0 && (
                            <div className="border border-slate-200/70 rounded-md bg-white">
                                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                                    <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                        Bağlı Ürünler ({position.articleMappings.length})
                                    </h4>
                                    <span className="text-[10px] text-slate-400">BOM maliyetine dahil</span>
                                </div>
                                {isDraft && (
                                    <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/40 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                                        <Field label="Toplu İndirim (%)">
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
                                        >
                                            Toplu İndirimi Uygula
                                        </Button>
                                    </div>
                                )}
                                <ul className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                                    {position.articleMappings.filter((m) => !hiddenMappingIds[m.id]).map((m) => {
                                        const appliedDiscount = appliedMappingDiscounts[m.id] ?? m.discount ?? 0;
                                        const discountedNet = m.article ? m.quantityMultiplier * m.article.baseCost * (1 - appliedDiscount / 100) : 0;
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
                                                            title="Sabit KDV oranı"
                                                        >
                                                            KDV %{fmtVatRate((position.taxRate != null && position.taxRate > 0) ? position.taxRate : FIXED_VAT)}
                                                        </span>
                                                        {isDraft && m.article && (
                                                            <button
                                                                type="button"
                                                                title="Ürün ayarlarını aç"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onEditArticle(m.article!.id, position.id, m.id);
                                                                }}
                                                                className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                                                disabled={articleEditLoadingId === m.article?.id}
                                                            >
                                                                {articleEditLoadingId === m.article?.id ? (
                                                                    <span className="h-3.5 w-3.5 rounded-full border-2 border-blue-300 border-t-blue-700 animate-spin" />
                                                                ) : (
                                                                    <Pencil size={14} />
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="text-[10.5px] font-mono text-slate-500">
                                                        {m.article?.articleCode ?? '—'} · {m.quantityMultiplier} {m.article?.unit ?? 'adet'} × {m.article ? fmtMoney(m.article.baseCost) : '—'}
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
                                                    <div className="text-[9.5px] text-slate-400 font-mono">
                                                        net: {m.article ? fmtMoney(discountedNet) : '—'}
                                                    </div>
                                                </div>
                                                {false && editingMappingDescriptionId === m.id && (
                                                    <div className="basis-full rounded-md border border-slate-200 bg-white overflow-hidden">
                                                        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-100 bg-slate-50/70">
                                                            <button type="button" onClick={() => insertMappingDescriptionFormat('**', '**')} className="w-7 h-6 rounded text-[11px] font-bold hover:bg-white border border-transparent hover:border-slate-200">B</button>
                                                            <button type="button" onClick={() => insertMappingDescriptionFormat('_', '_')} className="w-7 h-6 rounded text-[11px] italic hover:bg-white border border-transparent hover:border-slate-200">I</button>
                                                            <button type="button" onClick={insertMappingDescriptionBullet} className="px-2 h-6 rounded text-[11px] hover:bg-white border border-transparent hover:border-slate-200">Liste</button>
                                                            <div className="ml-auto flex items-center gap-1">
                                                                <button type="button" disabled={mappingLoadingId === m.id} onClick={() => saveMappingDescription(m.id)} className="p-1.5 rounded text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                                                                    <Check size={13} />
                                                                </button>
                                                                <button type="button" onClick={() => setEditingMappingDescriptionId(null)} className="p-1.5 rounded text-slate-500 hover:bg-slate-100">
                                                                    <Minus size={13} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <textarea
                                                            ref={mappingDescriptionRef}
                                                            rows={5}
                                                            value={mappingDescriptionDrafts[m.id] ?? ''}
                                                            onChange={(e) => setMappingDescriptionDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                                                            className="w-full min-h-[120px] px-3 py-2 text-[12.5px] bg-white focus:outline-none resize-y"
                                                            placeholder="Urun aciklamasi..."
                                                        />
                                                        {(mappingDescriptionDrafts[m.id] ?? '').trim() && (
                                                            <div className="border-t border-slate-100 px-3 py-2 text-[12px] text-slate-900 leading-relaxed bg-slate-50/40">
                                                                {renderLong(mappingDescriptionDrafts[m.id] ?? '')}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {isDraft && (
                                                    <div className="basis-full grid grid-cols-1 gap-2 items-end">
                                                        <Field label="İndirim (%)">
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
                                    <span className="text-slate-600 font-medium">Toplam Ürün</span>
                                    <span className="font-mono font-bold text-slate-800">
                                        {fmtMoney(position.articleMappings.filter((m) => !hiddenMappingIds[m.id]).reduce((s, m) => {
                                            const appliedDiscount = appliedMappingDiscounts[m.id] ?? m.discount ?? 0;
                                            const vatRate = (position.taxRate != null && position.taxRate > 0) ? position.taxRate : FIXED_VAT;
                                            return s + (m.article ? lineTotalWithTax(m.quantityMultiplier * m.article.baseCost * (1 - appliedDiscount / 100), vatRate) : 0);
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
                                        {selectedStockArticle.articleCode} · {fmtMoney(selectedStockArticle.baseCost)}/{selectedStockArticle.unit}
                                    </div>
                                    <div className="text-[10.5px] text-slate-500 mt-0.5">
                                        Toplam mevcut: <span className="font-mono font-medium text-slate-700">{fmtNumber(selectedStockArticle.totalQuantity)} {selectedStockArticle.unit}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Field label="Stoktan Ürün Seçin">
                                <Select
                                    value={articleId}
                                    onChange={(e) => setArticleId(e.target.value)}
                                    disabled={stockArticlesLoading}
                                >
                                    <option value="">Ürün seçin</option>
                                    {stockArticles.map((article) => (
                                        <option key={article.id} value={article.id}>
                                            {article.articleCode} · {article.name} · Mevcut: {fmtNumber(article.totalQuantity)} {article.unit}
                                        </option>
                                    ))}
                                </Select>
                                {stockArticlesLoading && (
                                    <p className="mt-1 text-[11px] text-slate-400">Urunler yukleniyor...</p>
                                )}
                                {stockArticlesLoaded && stockArticles.length === 0 && (
                                    <p className="mt-1 text-[11px] text-slate-400">Kayitli urun bulunamadi.</p>
                                )}
                            </Field>
                            <Field label="Miktar (kullanılacak)">
                                <Input type="number" step="1" min={1} value={articleQty}
                                    onChange={(e) => setArticleQty(parseInt(e.target.value, 10) || 0)} />
                            </Field>
                            <Field label="İndirim (%)">
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
                            >
                                Ürün Bağla
                            </Button>
                            <Button variant="secondary" icon={<Plus size={12} />} onClick={onOpenNewArticle}>
                                Yeni
                            </Button>
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
    const [npkCodeVal, setNpkCodeVal] = useState(position.npkCode || '');
    const [imageUrl, setImageUrl] = useState<string | null>(position.imageUrl || null);
    const [saving, setSaving] = useState(false);
    const [uploadingImg, setUploadingImg] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setDesc(position.shortDescription);
        setLongDesc(position.longDescription || '');
        setNpkCodeVal(position.npkCode || '');
        setImageUrl(position.imageUrl || null);
    }, [position.id]);

    const hasChanges =
        desc !== position.shortDescription
        || longDesc !== (position.longDescription || '')
        || npkCodeVal !== (position.npkCode || '')
        || imageUrl !== (position.imageUrl || null);

    const handleImageFile = (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Sadece görsel dosyalar yüklenebilir.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Görsel 2MB\'tan büyük olamaz.');
            return;
        }
        setUploadingImg(true);
        const reader = new FileReader();
        reader.onload = () => {
            setImageUrl(reader.result as string);
            setUploadingImg(false);
        };
        reader.onerror = () => {
            toast.error('Görsel okunamadı.');
            setUploadingImg(false);
        };
        reader.readAsDataURL(file);
    };

    const insertFormat = (before: string, after: string) => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const selected = longDesc.slice(start, end);
        const newText = longDesc.slice(0, start) + before + selected + after + longDesc.slice(end);
        setLongDesc(newText);
        setTimeout(() => {
            el.focus();
            el.setSelectionRange(start + before.length, end + before.length);
        }, 0);
    };

    const save = async () => {
        setSaving(true);
        try {
            await updatePosition(tenderId, position.id, {
                shortDescription: desc.trim(),
                longDescription: longDesc || null,
                npkCode: npkCodeVal.trim() || null,
                imageUrl: imageUrl,
            });
            toast.success('Güncellendi.');
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    // Render rich text preview
    const renderPreview = (text: string) =>
        text.split('\n').map((line, i) => (
            <span key={i}>
                {line.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((seg, j) => {
                    if (seg.startsWith('**') && seg.endsWith('**'))
                        return <strong key={j}>{seg.slice(2, -2)}</strong>;
                    if (seg.startsWith('_') && seg.endsWith('_'))
                        return <em key={j}>{seg.slice(1, -1)}</em>;
                    return seg;
                })}
                {i < text.split('\n').length - 1 && <br />}
            </span>
        ));

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <span>No: {position.positionNumber}</span>
                <span>·</span>
                <span>Seviye: {position.hierarchyLevel}</span>
                {position.npkCode && (
                    <>
                        <span>·</span>
                        <span className="text-blue-600">NPK: {position.npkCode}</span>
                    </>
                )}
            </div>

            <Field label="NPK Kodu" hint="CRB/NPK pozisyon kodu (örn: 111.100)">
                <Input
                    value={npkCodeVal}
                    onChange={(e) => setNpkCodeVal(e.target.value)}
                    placeholder="NPK kodu giriniz"
                    disabled={!isDraft}
                />
            </Field>

            {/* Position Image */}
            <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Görsel</div>
                <div className="flex items-start gap-3">
                    <div className="w-20 h-20 border border-slate-200 rounded-md bg-slate-50/60 flex items-center justify-center overflow-hidden shrink-0">
                        {imageUrl ? (
                            <img src={imageUrl} alt="Pozisyon görseli" className="w-full h-full object-cover" />
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
                                {imageUrl ? 'Değiştir' : 'Görsel Yükle'}
                            </Button>
                            {imageUrl && (
                                <button
                                    type="button"
                                    className="text-[11px] text-red-600 hover:text-red-700 self-start"
                                    onClick={() => setImageUrl(null)}
                                >
                                    Kaldır
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Field label="Açıklama">
                <Input
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    disabled={!isDraft}
                />
            </Field>

            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Uzun Açıklama</span>
                    {isDraft && (
                        <div className="flex items-center gap-1">
                            <button type="button" title="Kalın" onClick={() => insertFormat('**', '**')}
                                className="px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-bold hover:bg-slate-50">
                                <Bold size={11} />
                            </button>
                            <button type="button" title="İtalik" onClick={() => insertFormat('_', '_')}
                                className="px-1.5 py-0.5 border border-slate-200 rounded text-[11px] italic hover:bg-slate-50">
                                <Italic size={11} />
                            </button>
                            <button type="button" title="Normal (seçimi temizle)" onClick={() => {
                                const el = textareaRef.current;
                                if (!el) return;
                                const s = el.selectionStart, e = el.selectionEnd;
                                const sel = longDesc.slice(s, e).replace(/\*\*(.+?)\*\*/g, '$1').replace(/_(.+?)_/g, '$1');
                                setLongDesc(longDesc.slice(0, s) + sel + longDesc.slice(e));
                            }} className="px-1.5 py-0.5 border border-slate-200 rounded hover:bg-slate-50">
                                <Type size={11} />
                            </button>
                            <span className="text-[10px] text-slate-400 ml-1">**kalın** _italik_</span>
                        </div>
                    )}
                </div>
                {isDraft ? (
                    <RichTextMarkdownEditor
                        value={longDesc}
                        onChange={setLongDesc}
                        minHeight={120}
                        className="focus-within:border-blue-400"
                        placeholder="Detaylı açıklama… **kalın**, _italik_"
                    />
                ) : longDesc ? (
                    <div className="rounded-md border border-slate-200 bg-white p-3 text-[13px] leading-6 text-slate-800">
                        {renderPreview(longDesc)}
                    </div>
                ) : (
                    <div className="text-slate-400 text-[12px] italic">Uzun açıklama yok.</div>
                )}
            </div>

            {isDraft && hasChanges && (
                <Button variant="primary" icon={<Save size={13} />} loading={saving} onClick={save} className="w-full">
                    Değişiklikleri Kaydet
                </Button>
            )}
        </div>
    );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({ active, onClick, icon, children }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors ${active ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
    >
        {icon}
        {children}
    </button>
);



export const SummaryStat: React.FC<{ label: string; value: string; icon: React.ReactNode; primary?: boolean }> = ({ label, value, icon, primary }) => (
    <div className={`border rounded-md px-4 py-3 ${primary ? 'bg-blue-50/60 border-blue-200/60' : 'bg-white border-slate-200/70'}`}>
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            {icon}
            {label}
        </div>
        <div className={`mt-1 text-[16px] font-semibold ${primary ? 'text-blue-900' : 'text-slate-800'}`}>
            {value}
        </div>
    </div>
);

/** Auto-generate next position number based on siblings under a parent */
function autoNextPositionNumber(positions: PositionDto[], parentId: string | null): string {
    const siblings = positions.filter((p) =>
        parentId ? p.parentPositionId === parentId : !p.parentPositionId
    );
    if (siblings.length === 0) {
        if (!parentId) return '100';
        const parent = positions.find((p) => p.id === parentId);
        if (parent) return `${parent.positionNumber}.1`;
        return '1';
    }
    // Find the highest sibling number and increment
    const nums = siblings.map((p) => {
        const parts = p.positionNumber.split('.');
        return parseInt(parts[parts.length - 1], 10) || 0;
    });
    const max = Math.max(...nums);
    const base = siblings[0].positionNumber.split('.').slice(0, -1).join('.');
    const next = max + 1;
    return base ? `${base}.${next}` : String(next < 100 ? next * 100 : next + 100);
}

/* ── Add Position Modal ── */
export const AddPositionModal: React.FC<{
    open: boolean;
    onClose: () => void;
    positions: PositionDto[];
    onSubmit: (data: Partial<PositionDto>) => Promise<void>;
}> = ({ open, onClose, positions, onSubmit }) => {
    const [parentPositionId, setParentPositionId] = useState('');
    const [shortDescription, setShortDescription] = useState('');
    const [longDescription, setLongDescription] = useState('');
    const [quantity, setQuantity] = useState<number | ''>('');
    const [unit, setUnit] = useState('');
    const [npkCode, setNpkCode] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitAttempted, setSubmitAttempted] = useState(false);

    useEffect(() => {
        if (open) {
            setParentPositionId('');
            setShortDescription('');
            setLongDescription('');
            setQuantity('');
            setUnit('');
            setNpkCode('');
            setSubmitAttempted(false);
        }
    }, [open]);

    const autoNumber = autoNextPositionNumber(positions, parentPositionId || null);
    const parentPos = positions.find((p) => p.id === parentPositionId);
    const hierarchyLevel = parentPos ? parentPos.hierarchyLevel + 1 : 0;

    return (
        <Modal
            open={open}
            title="Yeni Pozisyon Ekle"
            description="Üst pozisyon seçerek alt pozisyon oluşturun veya kök pozisyon ekleyin."
            onClose={onClose}
            width="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>İptal</Button>
                    <Button
                        variant="primary"
                        loading={submitting}
                        onClick={async () => {
                            setSubmitAttempted(true);
                            if (!shortDescription.trim()) {
                                return;
                            }
                            setSubmitting(true);
                            try {
                                await onSubmit({
                                    positionNumber: autoNumber,
                                    shortDescription: shortDescription.trim(),
                                    longDescription: longDescription || null,
                                    npkCode: npkCode.trim() || null,
                                    quantity: typeof quantity === 'number' ? quantity : 0,
                                    unit: unit || null,
                                    hierarchyLevel,
                                    parentPositionId: parentPositionId || null,
                                });
                                setSubmitAttempted(false);
                            } finally {
                                setSubmitting(false);
                            }
                        }}
                    >
                        Ekle
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                <Field label="Üst Pozisyon" hint="Seçmezseniz kök (bölüm) pozisyon oluşturulur">
                    <Select value={parentPositionId} onChange={(e) => setParentPositionId(e.target.value)}>
                        <option value="">— Kök Pozisyon (Bölüm) —</option>
                        {positions.map((p) => (
                            <option key={p.id} value={p.id}>
                                {'  '.repeat(p.hierarchyLevel)}{p.positionNumber} · {p.shortDescription}
                            </option>
                        ))}
                    </Select>
                </Field>

                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-200/60 rounded-md text-[12px]">
                    <span className="text-slate-500">Pozisyon No:</span>
                    <span className="font-mono font-semibold text-slate-800">{autoNumber}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">Seviye:</span>
                    <span className="font-semibold text-slate-800">{hierarchyLevel === 0 ? 'Bölüm' : hierarchyLevel === 1 ? 'Alt Pozisyon' : `Detay (${hierarchyLevel})`}</span>
                </div>

                <Field label="NPK Kodu" hint="Örn: 111.100, 343.210">
                    <Input
                        value={npkCode}
                        onChange={(e) => setNpkCode(e.target.value)}
                        placeholder="NPK kodu (opsiyonel)"
                    />
                </Field>

                <Field
                    label="Açıklama"
                    required
                    error={submitAttempted && !shortDescription.trim() ? 'Açıklama zorunludur.' : null}
                >
                    <Input
                        autoFocus
                        value={shortDescription}
                        onChange={(e) => setShortDescription(e.target.value)}
                        placeholder="Pozisyon başlığı / kısa açıklama"
                    />
                </Field>

                <Field label="Uzun Açıklama" hint="**kalın** ve _italik_ yazı desteklenir">
                    <RichTextMarkdownEditor
                        value={longDescription}
                        onChange={setLongDescription}
                        minHeight={86}
                        placeholder="Detaylı açıklama… **kalın**, _italik_ yazabilirsiniz"
                        className="focus-within:border-blue-400"
                    />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Miktar" hint="Tam sayı">
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 flex items-center justify-center"
                                onClick={() => setQuantity((q) => Math.max(0, (typeof q === 'number' ? q : 0) - 1))}
                            ><Minus size={11} /></button>
                            <input
                                type="number"
                                min={0}
                                value={quantity === '' ? '' : quantity}
                                onChange={(e) => setQuantity(e.target.value === '' ? '' : Math.round(Number(e.target.value)))}
                                className="flex-1 text-center px-2 py-1.5 border border-slate-200 rounded-md text-[12.5px] focus:outline-none focus:ring-2 focus:ring-blue-700/10 focus:border-blue-400 bg-white font-mono"
                                placeholder="0"
                            />
                            <button
                                type="button"
                                className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 flex items-center justify-center"
                                onClick={() => setQuantity((q) => (typeof q === 'number' ? q : 0) + 1)}
                            ><Plus size={11} /></button>
                        </div>
                    </Field>
                    <Field label="Birim" hint="Adet, m², kg, Psch...">
                        <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Adet" />
                    </Field>
                </div>
            </div>
        </Modal>
    );
};

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
    const descRef = useRef<HTMLTextAreaElement>(null);

    const handleImage = (file: File) => {
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Gorsel 2 MB sinirini asiyor.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => setForm((p) => ({ ...p, imageUrl: e.target?.result as string }));
        reader.readAsDataURL(file);
    };

    const insertDescriptionFormat = (before: string, after = '') => {
        const current = form.description ?? '';
        const el = descRef.current;
        const start = el?.selectionStart ?? current.length;
        const end = el?.selectionEnd ?? current.length;
        const selected = current.slice(start, end) || 'metin';
        setForm((p) => ({
            ...p,
            description: `${current.slice(0, start)}${before}${selected}${after}${current.slice(end)}`,
        }));
        requestAnimationFrame(() => {
            descRef.current?.focus();
            descRef.current?.setSelectionRange(start + before.length, start + before.length + selected.length);
        });
    };

    const insertDescriptionBullet = () => {
        const current = form.description ?? '';
        const el = descRef.current;
        const start = el?.selectionStart ?? current.length;
        const prefix = start === 0 || current[start - 1] === '\n' ? '- ' : '\n- ';
        setForm((p) => ({ ...p, description: `${current.slice(0, start)}${prefix}${current.slice(start)}` }));
        requestAnimationFrame(() => descRef.current?.focus());
    };

    return (
        <Modal
            open
            title="Ürünü Düzenle"
            description="Stok kartını teklif ekranından güncelleyin."
            onClose={onClose}
            width="full"
            closeOnBackdrop={false}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Iptal</Button>
                    <Button
                        variant="primary"
                        loading={submitting}
                        onClick={async () => {
                            if (!form.articleCode || !form.name || !form.unit) {
                                toast.error('Kod, ad ve birim zorunludur.');
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
                        Güncelle
                    </Button>
                </>
            }
        >
            <div className="grid grid-cols-3 items-start gap-3">
                <div className="col-span-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
                    <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                        <ScanBarcode size={13} />
                        Barkod Bilgileri
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label="Genel Ürün Kodu" hint="Kategori barkodu · isteğe bağlı · manuel veya kamera">
                            <button
                                type="button"
                                onClick={() => { setScannerMode('general'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                            >
                                <Camera size={16} />
                                Kamera ile Genel Kod Tara
                            </button>
                            <div className="flex items-center gap-1.5">
                                <Hash size={13} className="shrink-0 text-muted-foreground" />
                                <Input value={form.systemBarcode ?? ''} onChange={(e) => setForm({ ...form, systemBarcode: e.target.value })} placeholder="Barkod okutun veya yazın..." />
                            </div>
                        </Field>
                        <Field label="Ürün Seri Kodu" hint="Zorunlu · her ürüne özgü · manuel veya kamera" required>
                            <button
                                type="button"
                                onClick={() => { setScannerMode('serial'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                            >
                                <Camera size={16} />
                                Kamera ile Seri Kod Tara
                            </button>
                            <div className="flex items-center gap-1.5">
                                <ScanBarcode size={13} className="shrink-0 text-blue-600" />
                                <Input value={form.supplierBarcode ?? ''} onChange={(e) => setForm({ ...form, supplierBarcode: e.target.value })} placeholder="Seri kodu okutun veya yazın..." />
                            </div>
                        </Field>
                    </div>
                </div>

                <div className="col-span-3 md:col-span-1">
                    <Field label="Ürün Görseli">
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
                                {form.imageUrl ? 'Görseli Değiştir' : 'Görsel Yükle'}
                            </Button>
                            <p className="text-[10.5px] text-slate-400 text-center">PNG/JPG, en fazla 2 MB</p>
                        </div>
                    </Field>
                </div>

                <div className="col-span-3 grid grid-cols-2 content-start gap-3 md:col-span-2">
                    <Field label="Stok Kodu" required>
                        <Input value={form.articleCode ?? ''} onChange={(e) => setForm({ ...form, articleCode: e.target.value })} />
                    </Field>
                    <Field label="Birim" required>
                        <Input value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                    </Field>
                    <Field label="Ürün Adı" required className="col-span-2">
                        <Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <Field label="Kategori">
                        <Input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Hidrolik, Servis..." />
                    </Field>
                    <Field label="Birim Maliyet (CHF)">
                        <Input type="number" step="0.01" min={0} value={form.baseCost ?? 0} onChange={(e) => setForm({ ...form, baseCost: Number(e.target.value) || 0 })} />
                    </Field>
                </div>

                <div className="col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="Minimum Seviye">
                        <Input type="number" step="1" min={0} value={form.minStockLevel ?? 0} onChange={(e) => setForm({ ...form, minStockLevel: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label="Kritik Esik">
                        <Input type="number" step="1" min={0} value={form.criticalStockLevel ?? 0} onChange={(e) => setForm({ ...form, criticalStockLevel: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label="Maksimum">
                        <Input type="number" step="1" min={0} value={form.maxStockLevel ?? ''} onChange={(e) => setForm({ ...form, maxStockLevel: e.target.value === '' ? null : Number(e.target.value) })} />
                    </Field>
                    <Field label="Durum">
                        <Select value={form.status ?? 'ACTIVE'} onChange={(e) => setForm({ ...form, status: e.target.value as ArticleStatus })}>
                            <option value="ACTIVE">Aktif</option>
                            <option value="INACTIVE">Pasif</option>
                            <option value="IN_SUPPLY">Tedarikte</option>
                            <option value="IN_PRODUCTION">Uretimde</option>
                        </Select>
                    </Field>
                </div>

                <Field label="Son Siparis / Alim Tarihi" className="col-span-3 md:col-span-1">
                    <Input
                        type="date"
                        value={form.lastPurchaseDate ? dayjs(form.lastPurchaseDate).format('YYYY-MM-DD') : ''}
                        onChange={(e) => setForm({ ...form, lastPurchaseDate: e.target.value || null })}
                    />
                </Field>


                <Field label="Aciklama" className="col-span-3">
                    <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
                        <div className="hidden items-center gap-1 px-2 py-1.5 border-b border-slate-100 bg-slate-50/70">
                            <button type="button" title="Kalin" onClick={() => insertDescriptionFormat('**', '**')} className="w-7 h-6 rounded flex items-center justify-center hover:bg-white border border-transparent hover:border-slate-200">
                                <Bold size={12} />
                            </button>
                            <button type="button" title="Italik" onClick={() => insertDescriptionFormat('_', '_')} className="w-7 h-6 rounded flex items-center justify-center hover:bg-white border border-transparent hover:border-slate-200">
                                <Italic size={12} />
                            </button>
                            <button type="button" title="Madde isareti" onClick={insertDescriptionBullet} className="w-7 h-6 rounded flex items-center justify-center hover:bg-white border border-transparent hover:border-slate-200">
                                <List size={12} />
                            </button>
                        </div>
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
    onSubmit: (a: { articleCode: string; name: string; baseCost: number; unit: string; description?: string; systemBarcode?: string; supplierBarcode?: string }) => Promise<void>;
}> = ({ open, onClose, onSubmit }) => {
    const [form, setForm] = useState({ articleCode: '', name: '', baseCost: 0, unit: '', description: '', systemBarcode: '', supplierBarcode: '' });
    const [submitting, setSubmitting] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerMode, setScannerMode] = useState<'serial' | 'general'>('serial');
    const descRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (open) setForm({ articleCode: '', name: '', baseCost: 0, unit: '', description: '', systemBarcode: '', supplierBarcode: '' });
    }, [open]);

    const insertDescFormat = (before: string, after = '') => {
        const el = descRef.current;
        if (!el) {
            setForm((prev) => ({ ...prev, description: `${prev.description}${before}${after}` }));
            return;
        }
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const selected = form.description.slice(start, end);
        const next = `${form.description.slice(0, start)}${before}${selected || 'metin'}${after}${form.description.slice(end)}`;
        setForm((prev) => ({ ...prev, description: next }));
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(start + before.length, start + before.length + (selected || 'metin').length);
        });
    };

    const insertBullet = () => {
        const el = descRef.current;
        const start = el?.selectionStart ?? form.description.length;
        const prefix = start === 0 || form.description[start - 1] === '\n' ? '- ' : '\n- ';
        const next = `${form.description.slice(0, start)}${prefix}${form.description.slice(start)}`;
        setForm((prev) => ({ ...prev, description: next }));
        requestAnimationFrame(() => descRef.current?.focus());
    };

    return (
        <Modal
            open={open}
            title="Yeni Ürün / Malzeme"
            description="ERP ürün/malzeme kataloğuna kayıt ekleyin."
            onClose={onClose}
            width="full"
            closeOnBackdrop={false}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>İptal</Button>
                    <Button
                        variant="primary"
                        loading={submitting}
                        onClick={async () => {
                            if (!form.articleCode || !form.name || !form.unit) {
                                toast.error('Kod, ad ve birim zorunludur.');
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
                    >
                        Oluştur
                    </Button>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm lg:col-span-2">
                    <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                        <ScanBarcode size={13} />
                        Barkod Bilgileri
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label="Genel Ürün Kodu" hint="Kategori barkodu · isteğe bağlı">
                            <button
                                type="button"
                                onClick={() => { setScannerMode('general'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                            >
                                <Camera size={16} />
                                Kamera ile Genel Kod Tara
                            </button>
                            <div className="flex items-center gap-1.5">
                                <Hash size={13} className="shrink-0 text-muted-foreground" />
                                <Input value={form.systemBarcode} onChange={(e) => setForm({ ...form, systemBarcode: e.target.value })} placeholder="Barkod okutun veya yazın..." />
                            </div>
                        </Field>
                        <Field label="Ürün Seri Kodu" hint="Zorunlu · her ürüne özgü" required>
                            <button
                                type="button"
                                onClick={() => { setScannerMode('serial'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                            >
                                <Camera size={16} />
                                Kamera ile Seri Kod Tara
                            </button>
                            <div className="flex items-center gap-1.5">
                                <ScanBarcode size={13} className="shrink-0 text-blue-600" />
                                <Input value={form.supplierBarcode} onChange={(e) => setForm({ ...form, supplierBarcode: e.target.value })} placeholder="Seri kodu okutun veya yazın..." />
                            </div>
                        </Field>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 content-start">
                    <Field label="Ürün Kodu" required>
                        <Input value={form.articleCode}
                            onChange={(e) => setForm({ ...form, articleCode: e.target.value })} />
                    </Field>
                    <Field label="Birim" required>
                        <Input value={form.unit}
                            onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="m², kg..." />
                    </Field>
                    <Field label="Ürün Adı" required className="col-span-2">
                        <Input value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <Field label="Birim Maliyet (CHF)" className="col-span-2">
                        <Input type="number" step="0.01" value={form.baseCost}
                            onChange={(e) => setForm({ ...form, baseCost: parseFloat(e.target.value) || 0 })} />
                    </Field>
                </div>
                <Field label="Açıklama" hint="PDF çıktısında kalın, italik ve madde işaretleri aynı stil ile gösterilir.">
                    <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
                        <div className="hidden items-center gap-1 px-2 py-1.5 border-b border-slate-100 bg-slate-50/70">
                            <button type="button" onClick={() => insertDescFormat('**', '**')} className="px-2 py-1 rounded text-[11px] font-bold hover:bg-white border border-transparent hover:border-slate-200">B</button>
                            <button type="button" onClick={() => insertDescFormat('_', '_')} className="px-2 py-1 rounded text-[11px] italic hover:bg-white border border-transparent hover:border-slate-200">I</button>
                            <button type="button" onClick={insertBullet} className="px-2 py-1 rounded text-[11px] hover:bg-white border border-transparent hover:border-slate-200">• Liste</button>
                        </div>
                        <RichTextMarkdownEditor
                            value={form.description}
                            onChange={(description) => setForm({ ...form, description })}
                            minHeight={260}
                            className="border-0"
                            placeholder="Örn:&#10;**Bakım seti**&#10;- Lecksuchspray&#10;- Reinigungstücher&#10;_Not: servis için uygundur_"
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

export const TenderSettingsModal: React.FC<{
    open: boolean;
    onClose: () => void;
    tenderId: string;
    tree: TreeNode[];
    grandTotal: number;
    overtimeHourlyRate: number;
    onOvertimeHourlyRateChange: (value: number) => void;
    onChanged: () => Promise<void>;
}> = ({ open, onClose, tenderId, tree, grandTotal, overtimeHourlyRate, onOvertimeHourlyRateChange, onChanged }) => {
    const { detail, activities } = useTenderStore();
    const { user } = useAuthStore();
    const { settings } = usePdfSettingsStore();
    const [slots, setSlots] = useState<OfferScheduleSlotDto[]>([]);
    const [slotForm, setSlotForm] = useState({ date: dayjs().format('YYYY-MM-DD'), start: '09:00', end: '17:00', notes: '' });
    const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'mail' | 'schedule' | 'overtime' | 'materials'>('mail');
    const [localOvertimeRate, setLocalOvertimeRate] = useState(overtimeHourlyRate || 0);
    const [availableMaterials, setAvailableMaterials] = useState<ProjectMaterial[]>([]);
    const [tenderMaterials, setTenderMaterials] = useState<TenderMaterialUsageDto[]>([]);
    const [materialForm, setMaterialForm] = useState({ materialId: '', quantity: 1, description: '' });
    const [materialLoading, setMaterialLoading] = useState(false);
    const [materialSaving, setMaterialSaving] = useState(false);
    const [form, setForm] = useState({
        fromName: 'Offitec ERP',
        fromEmail: user?.email || '',
        to: '',
        subject: '',
        message: 'Merhaba,\n\nTeklifimizi PDF olarak ekte iletiyoruz. Planlanan çalışma tarih ve saatleri aşağıdadır. Uygun görmeniz halinde bu e-postaya yanıt verebilirsiniz.\n\nSaygılarımızla',
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
            toast.error(e.response?.data?.error || 'Malzemeler yüklenemedi.');
        } finally {
            setMaterialLoading(false);
        }
    };

    useEffect(() => {
        if (!open || !detail) return;
        setLocalOvertimeRate(overtimeHourlyRate || 0);
        setForm((prev) => ({
            ...prev,
            to: detail.tender.customerEmail || '',
            subject: `${detail.tender.tenderNumber} teklifiniz`,
        }));
        void loadSlots();
        void loadMaterials();
    }, [open, detail?.tender.id, overtimeHourlyRate]);

    const selectedTenderMaterial = useMemo(
        () => availableMaterials.find((material) => material.id === materialForm.materialId) || null,
        [availableMaterials, materialForm.materialId]
    );

    const addTenderMaterial = async () => {
        if (!materialForm.materialId) return toast.error('Malzeme seçin.');
        const quantity = Number(materialForm.quantity || 0);
        if (quantity <= 0) return toast.error('Miktar 0dan büyük olmalı.');
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
            toast.success('Malzeme eklendi. Fiyata dahil edilmedi.');
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Malzeme eklenemedi.');
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
            toast.success('Malzeme kaldırıldı.');
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Malzeme kaldırılamadı.');
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
        if (!dayjs(endTime).isAfter(dayjs(startTime))) return toast.error('Bitiş saati başlangıçtan sonra olmalıdır.');
        try {
            if (editingSlotId) {
                await tenderApi.updateScheduleSlot(tenderId, editingSlotId, { startTime, endTime, notes: slotForm.notes });
                toast.success('Randevu güncellendi.');
            } else {
                await tenderApi.createScheduleSlot(tenderId, { startTime, endTime, notes: slotForm.notes });
                toast.success('Randevu eklendi.');
            }
            resetSlotForm();
            await loadSlots();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Randevu kaydedilemedi.');
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
            const { buildTenderPdfBytes } = await import('../../../utils/pdf/tenderPdf');
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
            toast.success(res.message || 'Teklif maili gönderildi.');
            await onChanged();
            onClose();
        } catch (e: any) {
            toast.error(e.response?.data?.error || e.message || 'Teklif maili gönderilemedi.');
        } finally {
            setLoading(false);
        }
    };

    const tabs = [
        { key: 'mail' as const, label: 'Mail' },
        { key: 'overtime' as const, label: 'Ek Ücret' },
        { key: 'schedule' as const, label: 'Randevu' },
        { key: 'materials' as const, label: 'Malzemeler' },
    ];

    const usedMaterials = tenderMaterials.map((item) => ({
        id: item.id,
        positionNumber: item.material?.serialId || '-',
        name: item.material?.name || 'Malzeme',
        quantity: item.quantity || 0,
        unit: 'adet',
        unitPrice: item.unitCost || 0,
        total: Number(item.quantity || 0) * Number(item.unitCost || 0),
    }));

    return (
        <Modal
            open={open}
            title="Teklif Ayarları"
            description="Mail, ek ücret ve randevu ayarlarını tek yerden yönetin."
            onClose={onClose}
            placement="drawer"
            drawerWidth="wide"
            closeOnBackdrop={false}
            closeOnEscape={false}
        >
            <div className="flex h-full min-h-[calc(100dvh-9rem)] flex-col">
                <div className="mb-6 flex items-center gap-8 border-b border-slate-200">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`border-b-2 px-0 pb-3 pt-1 text-sm font-semibold transition-colors ${
                                activeTab === tab.key ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'mail' && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Gönderici adı"><Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} /></Field>
                            <Field label="Gönderici e-posta"><Input value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} /></Field>
                        </div>
                        <Field label="Alıcı"><Input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
                        <Field label="Konu"><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
                        <Field label="Ek mesaj"><Textarea rows={12} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                            Mail göndermek opsiyoneldir; sipariş oluşturmak için mail, ek ücret veya randevu ekleme zorunluluğu yoktur.
                        </div>
                    </div>
                )}

                {activeTab === 'schedule' && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                        <div className="xl:col-span-2">
                            <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
                                <Field label="Tarih"><Input type="date" value={slotForm.date} onChange={(e) => setSlotForm({ ...slotForm, date: e.target.value })} /></Field>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Başlangıç"><Input type="time" value={slotForm.start} onChange={(e) => setSlotForm({ ...slotForm, start: e.target.value })} /></Field>
                                    <Field label="Bitiş"><Input type="time" value={slotForm.end} onChange={(e) => setSlotForm({ ...slotForm, end: e.target.value })} /></Field>
                                </div>
                                <Field label="Not"><Input value={slotForm.notes} onChange={(e) => setSlotForm({ ...slotForm, notes: e.target.value })} /></Field>
                                <div className="flex gap-2">
                                    <Button className="flex-1" icon={<CalendarPlus size={13} />} onClick={saveSlot}>
                                        {editingSlotId ? 'Randevuyu Güncelle' : 'Randevu Ekle'}
                                    </Button>
                                    {editingSlotId && (
                                        <Button variant="secondary" icon={<X size={13} />} onClick={resetSlotForm}>
                                            İptal
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="xl:col-span-3">
                            <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                                {slots.length === 0 && <div className="px-3 py-10 text-center text-[12px] text-slate-400">Randevu yok.</div>}
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
                        <Field label="%15 üzeri fazla çalışma saat ücreti (CHF)">
                            <Input
                                type="number"
                                value={localOvertimeRate}
                                onChange={(event) => setLocalOvertimeRate(Number(event.target.value) || 0)}
                                placeholder="0"
                            />
                        </Field>
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
                            Bu alan boş bırakılırsa ya da 0 girilirse, %15 üzeri fazla çalışma için ek ücret 0 CHF olarak projeye aktarılır.
                        </div>
                        <Button onClick={() => { onOvertimeHourlyRateChange(Math.max(0, Number(localOvertimeRate || 0))); toast.success('Fazla çalışma saat ücreti hazır.'); }}>
                            Ücreti Uygula
                        </Button>
                    </div>
                )}

                {activeTab === 'materials' && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded-md border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-3 py-2">
                                <h3 className="text-[12px] font-semibold text-slate-800">Kullanılan Malzemeler</h3>
                                <p className="mt-0.5 text-[11px] text-slate-500">Bu fiyatlar görünür, ancak teklif toplamına dahil edilmez.</p>
                            </div>
                            {usedMaterials.length === 0 ? (
                                <div className="px-3 py-8 text-center text-[12px] text-slate-400">Kullanılan malzeme yok.</div>
                            ) : (
                                <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                                    {usedMaterials.map((item) => (
                                        <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                                            <div className="min-w-0">
                                                <div className="truncate text-[12.5px] font-medium text-slate-800">{item.name}</div>
                                                <div className="mt-0.5 text-[11px] font-mono text-slate-500">
                                                    {item.positionNumber} · {fmtNumber(item.quantity)} {item.unit} x {fmtMoney(item.unitPrice)}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="font-mono text-[12px] font-semibold text-slate-800">{fmtMoney(item.total)}</div>
                                                <div className="text-[10px] text-slate-400">dahil değil</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="rounded-md border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-3 py-2">
                                <h3 className="text-[12px] font-semibold text-slate-800">Malzemeler</h3>
                                <p className="mt-0.5 text-[11px] text-slate-500">Malzeme stoktan düşer; fiyat sadece bilgi amaçlı gösterilir.</p>
                            </div>
                            <div className="space-y-3 p-3">
                                <Field label="Malzeme">
                                    <Select
                                        value={materialForm.materialId}
                                        onChange={(event) => setMaterialForm({ ...materialForm, materialId: event.target.value })}
                                        disabled={materialLoading || materialSaving}
                                    >
                                        <option value="">Malzeme seçin</option>
                                        {availableMaterials.map((material) => (
                                            <option key={material.id} value={material.id}>
                                                {material.serialId} · {material.name} · Mevcut: {fmtNumber(material.stockQuantity)} adet
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                {selectedTenderMaterial && (
                                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                                        <div className="flex items-center justify-between gap-3">
                                            <span>{selectedTenderMaterial.name}</span>
                                            <span className="font-mono">{fmtMoney(selectedTenderMaterial.unitCost)}</span>
                                        </div>
                                        <div className="mt-1 font-mono text-[11px] text-slate-500">
                                            Stok: {fmtNumber(selectedTenderMaterial.stockQuantity)} adet
                                        </div>
                                    </div>
                                )}
                                <Field label="Miktar">
                                    <Input type="number" min={1} step="1" value={materialForm.quantity} onChange={(event) => setMaterialForm({ ...materialForm, quantity: Number(event.target.value) || 0 })} />
                                </Field>
                                <Field label="Açıklama">
                                    <Input value={materialForm.description} onChange={(event) => setMaterialForm({ ...materialForm, description: event.target.value })} />
                                </Field>
                                <Button className="w-full" icon={<Plus size={13} />} loading={materialSaving} disabled={!materialForm.materialId || materialForm.quantity <= 0} onClick={addTenderMaterial}>
                                    Malzeme Ekle
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="mt-auto flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                    <Button variant="secondary" onClick={onClose}>Kapat</Button>
                    {activeTab === 'mail' && (
                        <Button variant="primary" loading={loading} icon={<Mail size={13} />} onClick={send}>PDF ile Teklif Maili Gönder</Button>
                    )}
                </div>
            </div>
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
                const flatTree: any[] = [];
                const flatten = (nodes: any[], isRootLevel = false) => {
                    nodes.forEach(n => {
                        flatTree.push({
                            positionNumber: n.positionNumber,
                            shortDescription: n.shortDescription,
                            longDescription: n.longDescription,
                            quantity: n.children.length > 0 ? undefined : n.quantity,
                            unit: n.children.length > 0 ? undefined : n.unit,
                            npkCode: n.npkCode,
                            imageUrl: n.imageUrl,
                            discount: n.children.length > 0 ? undefined : (n.discount ?? 0),
                            taxRate: n.children.length > 0 ? undefined : 8.1,
                            unitPrice: n.children.length > 0 ? undefined : n.unitPrice,
                            total: n.totalWithChildren,
                            isParent: n.children.length > 0,
                            isTopLevel: isRootLevel,
                            hierarchyLevel: n.hierarchyLevel,
                        });
                        flatten(n.children, false);
                        if (isRootLevel) {
                            flatTree.push({
                                positionNumber: `${n.positionNumber}-subtotal`,
                                shortDescription: '',
                                quantity: 0,
                                total: n.totalWithChildren,
                                isSectionSubtotal: true,
                            });
                        }
                    });
                };
                flatten(tree, true);

                const positions = flatTree;
                const { exportTenderPdf } = await import('../../../utils/pdf/tenderPdf');
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
                toast.success('PDF indirildi.');
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
            toast.error(e.response?.data?.error || e.message || 'Dışa aktarım başarısız.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open={open}
            title="Teklifi Dışa Aktar"
            description="İsviçre standartlarında PDF veya makine-okunur CRBX/SIA çıktısı oluşturun."
            onClose={onClose}
            width="md"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>İptal</Button>
                    <Button variant="primary" loading={loading} icon={<Download size={13} />} onClick={handleExport}>
                        İndir
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                <Field label="Çıktı Formatı">
                    <div className="grid grid-cols-3 gap-2">
                        {(['PDF', 'CRBX', 'SIA451'] as const).map((f) => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => setFormat(f)}
                                className={`px-3 py-3 border rounded text-[12.5px] font-medium transition-colors flex flex-col items-center gap-1 ${format === f
                                        ? 'border-blue-700 bg-blue-50 text-blue-800'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
                        <Field label="Referans Numarası" hint="Boş bırakılırsa QR-Bill referans bölümü atlanır">
                            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="RF18 5390 0754 7034" />
                        </Field>
                        <Checkbox
                            label="Sayfanın altına İsviçre QR-Bill (Empfangsschein + Zahlteil) ekle"
                            size="sm"
                            isSelected={includeQrBill}
                            onChange={setIncludeQrBill}
                            className="rounded-lg bg-brand-primary_alt px-3 py-2 ring-1 ring-utility-brand-200 ring-inset"
                        />

                        {!settings.letterheadBackground && (
                            <div className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200/70 rounded p-2 flex items-start gap-2">
                                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                                <span>
                                    Antetli kağıt arka planı yüklenmemiş - PDF varsayılan OffiTec başlığı ile oluşturulacak.
                                    <button
                                        type="button"
                                        className="text-blue-700 underline ml-1"
                                        onClick={() => { onClose(); navigate('/settings/pdf'); }}
                                    >
                                        Şimdi ekle
                                    </button>
                                </span>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

