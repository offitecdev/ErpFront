import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    AlertTriangle,
    ArrowUp,
    CheckCircle,
    Clock,
    Mail01 as Mail,
    Package,
    SearchLg as Search,
    ShoppingCart01 as ShoppingCart,
    Trash01 as Trash2,
    X,
} from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { SubTabs } from '../project/features/components/common/SubTabs';
import { RequestDirectlyPanel, type RequestPanelItem } from '../../components/inventory/RequestDirectlyPanel';

import { supplyApi, inventoryApi } from '../../lib/api/inventory';
import type { LowStockItem, LowStockResponse, SupplyRequestRow, SearchItem } from '../../types/inventory';

import { t } from '@/i18n/translate';

type TabKey = 'minimum' | 'critical' | 'other' | 'pending';

const fmtNumber = (v: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(v);

const suggestQty = (it: LowStockItem) => Math.max(Math.ceil((it.minStockLevel || 0) - (it.totalQuantity || 0)), 1);

export const SupplyRequests = () => {
    const navigate = useNavigate();
    const [tab, setTab] = useState<TabKey>('minimum');

    const [low, setLow] = useState<LowStockResponse | null>(null);
    const [lowLoading, setLowLoading] = useState(false);

    const [pending, setPending] = useState<SupplyRequestRow[]>([]);
    const [reqLoading, setReqLoading] = useState(false);

    const [search, setSearch] = useState('');
    const [results, setResults] = useState<SearchItem[]>([]);
    const [searching, setSearching] = useState(false);

    const [panel, setPanel] = useState<{ open: boolean; item: RequestPanelItem | null }>({ open: false, item: null });

    const loadLow = useCallback(async () => {
        setLowLoading(true);
        try {
            setLow(await supplyApi.lowStock());
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('supply.lowLoadError'));
        } finally {
            setLowLoading(false);
        }
    }, []);

    const loadPending = useCallback(async () => {
        setReqLoading(true);
        try {
            setPending(await supplyApi.listRequests('PENDING'));
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('supply.pendingLoadError'));
        } finally {
            setReqLoading(false);
        }
    }, []);

    // Sekmeye göre yalnızca ilgili veriyi çek.
    useEffect(() => {
        if ((tab === 'minimum' || tab === 'critical') && !low) void loadLow();
        if (tab === 'pending') void loadPending();
    }, [tab, low, loadLow, loadPending]);

    // "Başka Ürün/Malzeme" araması (debounce).
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (tab !== 'other') return;
        const q = search.trim();
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (!q) { setResults([]); return; }
        searchTimer.current = setTimeout(async () => {
            setSearching(true);
            try {
                setResults(await inventoryApi.searchItems(q));
            } catch {
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [search, tab]);

    const openRequest = (item: RequestPanelItem) => setPanel({ open: true, item });

    const onRequested = () => { void loadPending(); };

    // Yukarı ok: pop-up AÇMAZ — ürün/malzeme, miktar ve tedarikçi önceden dolu şekilde
    // Stok Hareketleri (Lagerbewegungen) sayfasına yönlendirir; kullanıcı işlemi orada
    // tamamlar. Prefill bilgisi router state ile taşınır.
    const goToMovements = (r: SupplyRequestRow) => {
        const id = r.itemType === 'PRODUCT' ? r.articleId : r.materialId;
        if (!id) {
            toast.error(t('supply.noItemLink'));
            return;
        }
        navigate('/inventory/movements', {
            state: {
                supplyPrefill: {
                    kind: r.itemType,
                    id,
                    code: r.itemCode || '',
                    name: r.itemName,
                    unit: r.unit || (r.itemType === 'MATERIAL' ? 'adet' : ''),
                    quantity: r.requestedQuantity,
                    supplierId: r.supplierId || '',
                },
            },
        });
    };

    // "Talebi Tamamla": talebi tamamlandı (RECEIVED) olarak işaretler. Satır listede
    // kalır; buton yerine yukarı ok rozeti (Tamamlandı) gösterilir.
    const completeRequest = async (r: SupplyRequestRow) => {
        try {
            await supplyApi.receiveRequest(r.id);
            setPending((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: 'RECEIVED' as const, receivedAt: new Date().toISOString() } : x)));
            toast.success(t('supply.completeSuccess'));
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('supply.completeError'));
        }
    };

    const deletePending = async (r: SupplyRequestRow) => {
        if (!confirm(t('supply.deleteConfirm'))) return;
        try {
            await supplyApi.deleteRequest(r.id);
            setPending((prev) => prev.filter((x) => x.id !== r.id));
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('supply.deleteError'));
        }
    };

    const pendingCount = pending.filter((r) => r.status === 'PENDING').length;
    const tabs = useMemo(() => ([
        { key: 'minimum' as const, label: t('supply.tabMinimum') },
        { key: 'critical' as const, label: t('supply.tabCritical') },
        { key: 'other' as const, label: t('supply.tabOther') },
        { key: 'pending' as const, label: `${t('supply.tabPending')}${pendingCount ? ` (${pendingCount})` : ''}` },
    ]), [pendingCount]);

    return (
        <div>
            <PageHeader
                title={t('supply.title')}
                description={t('supply.description')}
            />

            <SubTabs tabs={tabs} activeTab={tab} onSelectTab={setTab} />

            {(tab === 'minimum' || tab === 'critical') && (
                <LowStockTab
                    level={tab}
                    items={tab === 'minimum' ? (low?.minimum ?? []) : (low?.critical ?? [])}
                    loading={lowLoading}
                    onRequest={(it) => openRequest({
                        kind: it.kind,
                        id: it.id,
                        code: it.code,
                        name: it.name,
                        unit: it.unit,
                        suggestedQuantity: suggestQty(it),
                    })}
                />
            )}

            {tab === 'other' && (
                <Card noPadding>
                    <div className="border-b border-slate-100 p-3">
                        <div className="relative max-w-md">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('supply.searchPlaceholder')}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-[13px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                                autoFocus
                            />
                            {search && (
                                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={t('common.clear')}>
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {searching && <div className="px-4 py-6 text-center text-[12.5px] text-slate-400">{t('supply.searching')}</div>}
                        {!searching && search.trim() && results.length === 0 && (
                            <div className="px-4 py-6 text-center text-[12.5px] text-slate-400">{t('supply.noResults')}</div>
                        )}
                        {!searching && !search.trim() && (
                            <div className="px-4 py-10 text-center text-[12.5px] text-slate-400">{t('supply.searchHint')}</div>
                        )}
                        {results.map((it) => (
                            <div key={`${it.kind}-${it.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50/60">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <span className="flex size-8 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                                        <Package size={14} />
                                    </span>
                                    <div className="min-w-0">
                                        <div className="truncate text-[13px] font-medium text-slate-800">{it.name}</div>
                                        <div className="font-mono text-[11px] text-slate-500">
                                            {it.code} · {it.kind === 'MATERIAL' ? t('supply.typeMaterial') : t('supply.typeProduct')}
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<Mail size={12} />}
                                    onClick={() => openRequest({
                                        kind: it.kind,
                                        id: it.id,
                                        code: it.code,
                                        name: it.name,
                                        unit: it.unit || 'adet',
                                        suggestedQuantity: 1,
                                    })}
                                >
                                    {t('supply.requestBtn')}
                                </Button>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {tab === 'pending' && (
                <PendingRequestsTab
                    rows={pending}
                    loading={reqLoading}
                    onGoToMovements={goToMovements}
                    onComplete={completeRequest}
                    onDelete={deletePending}
                />
            )}

            <RequestDirectlyPanel
                open={panel.open}
                item={panel.item}
                onClose={() => setPanel({ open: false, item: null })}
                onRequested={onRequested}
            />
        </div>
    );
};

// ---- Minimum / Kritik seviye sekmesi ----
const LowStockTab = ({
    level,
    items,
    loading,
    onRequest,
}: {
    level: 'minimum' | 'critical';
    items: LowStockItem[];
    loading: boolean;
    onRequest: (it: LowStockItem) => void;
}) => {
    const isCritical = level === 'critical';
    return (
        <Card
            title={isCritical ? t('supply.criticalTitle') : t('supply.minTitle')}
            description={isCritical ? t('supply.criticalDesc') : t('supply.minDesc')}
            icon={<AlertTriangle size={13} />}
            noPadding
        >
            {loading ? (
                <div className="space-y-2 p-3">
                    {[1, 2, 3, 4].map((i) => <div key={i} className="h-11 animate-pulse rounded bg-slate-100" />)}
                </div>
            ) : items.length === 0 ? (
                <EmptyState
                    icon={<CheckCircle size={28} />}
                    title={isCritical ? t('supply.emptyCriticalTitle') : t('supply.emptyMinTitle')}
                    description={t('supply.emptySafeDesc')}
                />
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">{t('supply.colItem')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('supply.colType')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('supply.colCurrent')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('supply.colMin')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('supply.colCritical')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('supply.colAction')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.map((it) => (
                                <tr key={`${it.kind}-${it.id}`} className="hover:bg-slate-50/60">
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2.5">
                                            <span className="flex size-7 items-center justify-center rounded bg-slate-100 text-slate-400">
                                                <Package size={13} />
                                            </span>
                                            <div className="min-w-0">
                                                <div className="truncate font-medium text-slate-800">{it.name}</div>
                                                <div className="font-mono text-[11px] text-slate-500">{it.code}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600">
                                            {it.kind === 'MATERIAL' ? t('supply.typeMaterial') : t('supply.typeProduct')}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono">
                                        <span className={isCritical ? 'font-semibold text-rose-700' : 'font-semibold text-amber-700'}>
                                            {fmtNumber(it.totalQuantity)} {it.unit}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtNumber(it.minStockLevel)}</td>
                                    <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtNumber(it.criticalStockLevel)}</td>
                                    <td className="px-3 py-2 text-right">
                                        <Button variant="primary" size="sm" icon={<Mail size={12} />} onClick={() => onRequest(it)}>
                                            {t('supply.requestDirect')}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};

// ---- Bekleyen talepler sekmesi ----
const PendingRequestsTab = ({
    rows,
    loading,
    onGoToMovements,
    onComplete,
    onDelete,
}: {
    rows: SupplyRequestRow[];
    loading: boolean;
    onGoToMovements: (r: SupplyRequestRow) => void;
    onComplete: (r: SupplyRequestRow) => void;
    onDelete: (r: SupplyRequestRow) => void;
}) => (
    <Card
        title={t('supply.pendingTitle')}
        description={t('supply.pendingDesc')}
        icon={<Clock size={13} />}
        noPadding
    >
        {loading ? (
            <div className="space-y-2 p-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />)}
            </div>
        ) : rows.length === 0 ? (
            <EmptyState
                icon={<ShoppingCart size={28} />}
                title={t('supply.emptyPendingTitle')}
                description={t('supply.emptyPendingDesc')}
            />
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                    <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold">{t('supply.colItem')}</th>
                            <th className="px-3 py-2 text-left font-semibold">{t('supply.colSupplier')}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t('supply.colQty')}</th>
                            <th className="px-3 py-2 text-left font-semibold">{t('supply.colEmail')}</th>
                            <th className="px-3 py-2 text-left font-semibold">{t('supply.colDate')}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t('supply.colAction')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50/60">
                                <td className="px-3 py-2">
                                    <div className="font-medium text-slate-800">{r.itemName}</div>
                                    <div className="font-mono text-[11px] text-slate-500">
                                        {r.itemCode} · {r.itemType === 'MATERIAL' ? t('supply.typeMaterial') : t('supply.typeProduct')}
                                    </div>
                                </td>
                                <td className="px-3 py-2">
                                    <div className="text-slate-700">{r.supplierName || '—'}</div>
                                    {r.supplierEmail && <div className="truncate font-mono text-[11px] text-slate-500">{r.supplierEmail}</div>}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">{fmtNumber(r.requestedQuantity)} {r.unit}</td>
                                <td className="px-3 py-2">
                                    {r.emailSent ? (
                                        <span className="inline-flex items-center gap-1 rounded border border-emerald-200/70 bg-emerald-50 px-1.5 py-0.5 text-[10.5px] text-emerald-700">
                                            <CheckCircle size={10} /> {t('supply.emailSent')}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10.5px] text-slate-500">
                                            {t('supply.emailSaved')}
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-slate-500">
                                    {dayjs(r.createdAt).format('DD.MM.YYYY HH:mm')}
                                </td>
                                <td className="px-3 py-2 text-right">
                                    {r.status === 'RECEIVED' ? (
                                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200/70 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                            <ArrowUp size={13} /> {t('supply.completed')}
                                        </span>
                                    ) : (
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                type="button"
                                                title={t('supply.goToMovementsTip')}
                                                onClick={() => onGoToMovements(r)}
                                                className="flex size-7 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 transition-colors hover:bg-blue-100"
                                            >
                                                <ArrowUp size={14} />
                                            </button>
                                            <Button variant="secondary" size="sm" icon={<CheckCircle size={12} />} onClick={() => onComplete(r)}>
                                                {t('supply.completeBtn')}
                                            </Button>
                                            <button
                                                type="button"
                                                title={t('common.delete')}
                                                onClick={() => onDelete(r)}
                                                className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </Card>
);
