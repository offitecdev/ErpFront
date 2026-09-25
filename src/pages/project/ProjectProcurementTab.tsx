import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Plus, ShoppingCart01 } from '@/components/icons/antIconCompat';
import { Card } from '@/components/ui-shared/Card';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { PurchaseCode, usePurchaseLang } from '@/components/ui-shared/PurchaseCode';
import { ColResizeHandle, ResizableCols, TableStateRow } from '@/components/ui-shared/TableKit';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { t } from '@/i18n/translate';
import {
    procurementErrorCode,
    projectProcurementApi,
    type ProcurementOrder,
    type ProcurementOrderRef,
    type ProcurementPosition,
    type ProjectProcurement,
} from '@/lib/api/projectProcurement';
import { useAuthStore } from '@/store/authStore';
import type { ProjectDto } from '@/types/project';
import { localizePurchaseCode } from '@/utils/purchaseCode';
import { articleKindLabel } from '../inventory/utils/articleKind';
import { ORDER_STATUS_META } from '../inventory/utils/orderStatus';
import type { ProjectOrderPrefill } from '../inventory/OrderWorkspacePage';
import { ProcurementOrderPopup } from './ProcurementOrderPopup';

/** Sekme her açılışta yeniden bağlanır — son durum anında görünür, arkada tazelenir. */
const procurementCache = new Map<string, ProjectProcurement>();

const fmtQuantity = (value: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(Number(value) || 0);

/**
 * Tablonun grupları. Tedarikçi grupları OTOMATİK sipariş edilir; «Türsüzler»
 * ve «Tedarikçisi olmayanlar» işaretlenip ELLE oluşturulur — oluşan her
 * sipariş kendi U-grubunu alır (U1, U2 …); Ek Hizmet boş form açar.
 */
type GroupKind = 'SUPPLIER' | 'PRODUCTION' | 'NO_PRODUCER' | 'MANUAL_ORDER' | 'UNTYPED' | 'NO_SUPPLIER' | 'SERVICE';

interface ProcurementGroup {
    key: string;
    kind: GroupKind;
    title: string;
    /** Parantez içindeki tür: «Satın Alınacak» / «Üretilecek». */
    kindLabel: string | null;
    positions: ProcurementPosition[];
    /** Grubun siparişleri — en yenisi önce, tekrarsız. */
    orders: ProcurementOrderRef[];
    /** U-grubunun kendi siparişi (yalnızca `MANUAL_ORDER`). */
    order: ProcurementOrder | null;
}

const MANUAL_GROUPS: ReadonlySet<GroupKind> = new Set(['UNTYPED', 'NO_SUPPLIER']);

/**
 * Pozisyonları tedarikçiye göre gruplar; sıra: pozisyonların ilk görünüşü.
 *
 * U-GRUPLARI (Vorgabe Samet, 24.09.2026): Türsüzler'den işaretlenip ELLE
 * açılan her sipariş, tedarikçi grupları gibi gri bir başlık alır — «U1»,
 * «U2» … (en eski sipariş önce) — ve Türsüzler'in ÜSTÜNDE durur; o siparişe
 * giren pozisyonlar Türsüzler'den çıkıp onun altına geçer.
 */
const buildGroups = (positions: ProcurementPosition[], orders: ProcurementOrder[]): ProcurementGroup[] => {
    const typed = new Map<string, ProcurementGroup>();
    const tail: Record<'UNTYPED' | 'NO_SUPPLIER' | 'NO_PRODUCER' | 'SERVICE', ProcurementGroup | null> = {
        UNTYPED: null, NO_SUPPLIER: null, NO_PRODUCER: null, SERVICE: null,
    };
    const tailGroup = (kind: keyof typeof tail, title: string, kindLabel: string | null = null): ProcurementGroup => {
        if (!tail[kind]) tail[kind] = { key: kind, kind, title, kindLabel, positions: [], orders: [], order: null };
        return tail[kind] as ProcurementGroup;
    };
    // Elle açılmış siparişler, en eskisi önce — sıraları U-numarasını verir.
    const manualOrders = orders
        .filter((order) => order.manual)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const manualRank = new Map(manualOrders.map((order, index) => [order.id, index]));
    const manual = new Map<string, ProcurementGroup>();

    for (const position of positions) {
        // Elle açılmış bir siparişteki pozisyon o siparişin başlığı altında
        // durur (birden çoğundaysa en eskisinin).
        const manualRef = position.orders
            .filter((ref) => manualRank.has(ref.id))
            .sort((a, b) => (manualRank.get(a.id) ?? 0) - (manualRank.get(b.id) ?? 0))[0];
        if (manualRef) {
            const order = manualOrders[manualRank.get(manualRef.id) ?? 0];
            const group = manual.get(order.id) ?? {
                key: `U:${order.id}`, kind: 'MANUAL_ORDER', title: '', kindLabel: null,
                positions: [], orders: [manualRef], order,
            };
            manual.set(order.id, group);
            group.positions.push(position);
            continue;
        }

        let group: ProcurementGroup;
        if (position.mode === 'EMPTY') {
            group = tailGroup('SERVICE', t('projects.procurement.servicesGroup'));
        } else if (position.mode === 'PRODUCTION') {
            if (position.supplier) {
                const key = `M:${position.supplier.id}`;
                group = typed.get(key) ?? {
                    key, kind: 'PRODUCTION', title: position.supplier.name,
                    kindLabel: articleKindLabel('MANUFACTURED'), positions: [], orders: [], order: null,
                };
                typed.set(key, group);
            } else {
                group = tailGroup('NO_PRODUCER', t('projects.procurement.producerMissingGroup'), articleKindLabel('MANUFACTURED'));
            }
        } else if (position.articleKind === 'RESALE') {
            if (position.supplier) {
                const key = `P:${position.supplier.id}`;
                group = typed.get(key) ?? {
                    key, kind: 'SUPPLIER', title: position.supplier.name,
                    kindLabel: articleKindLabel('RESALE'), positions: [], orders: [], order: null,
                };
                typed.set(key, group);
            } else {
                group = tailGroup('NO_SUPPLIER', t('projects.procurement.noSupplierGroup'), articleKindLabel('RESALE'));
            }
        } else {
            // Türü seçilmemiş ürün ya da ürüne bağlı olmayan satır.
            group = tailGroup('UNTYPED', t('projects.procurement.untypedGroup'));
        }
        group.positions.push(position);
        for (const order of position.orders) {
            if (!group.orders.some((entry) => entry.id === order.id)) group.orders.push(order);
        }
    }

    // U-numarası: tabloda görünen elle açılmış siparişler, en eskisi U1.
    const manualGroups = [...manual.values()]
        .sort((a, b) => (manualRank.get(a.order?.id ?? '') ?? 0) - (manualRank.get(b.order?.id ?? '') ?? 0));
    manualGroups.forEach((group, index) => {
        group.title = t('projects.procurement.manualOrderGroup', { n: index + 1 });
    });
    return [
        ...typed.values(),
        ...[tail.NO_PRODUCER].filter(Boolean) as ProcurementGroup[],
        ...manualGroups,
        ...[tail.UNTYPED, tail.NO_SUPPLIER, tail.SERVICE].filter(Boolean) as ProcurementGroup[],
    ];
};

/** «Siparişe Git»in hedefi: açık taslak, yoksa en yeni sipariş, o da yoksa en yeni kayıt. */
const targetOrderOf = (orders: ProcurementOrderRef[]): ProcurementOrderRef | null =>
    orders.find((order) => order.status === 'ORDER_DRAFT')
    ?? orders.find((order) => order.status !== 'DRAFT' && order.status !== 'PRICE_REQUEST')
    ?? orders[0]
    ?? null;

/** Pozisyonun henüz sipariş/talebe girmemiş talebi — elle seçilebilir mi? */
const openNeedOf = (position: ProcurementPosition): number =>
    Math.max(0, position.requested - position.ordered - position.inRequest);

/**
 * ── SİPARİŞLERİM (Vorgabe Samet, 24.09.2026) ─────────────────────────────────
 *
 * «Pozisyon Özeti»nin YANINDAKİ ayrı sekme; Pozisyon Özeti olduğu gibi kalır.
 * Tablo TEDARİKÇİYE GÖRE gruplanır: grubun başında birleştirilmiş, ortalanmış
 * bir satır — tedarikçinin adı, parantez içinde türü, yanında «Siparişe Git»
 * ve siparişlerin kodları; altında ürünleri (Talep / Stok / Siparişte / Eksik).
 *
 *   · «Satın Alınacak» ve «Üretilecek» OTOMATİK — ama sekme açılınca DEĞİL,
 *     PROJE OLUŞTURULUNCA (sunucu, bkz. projectProcurement.routes.ts): eksikler
 *     sipariş edilir (aynı tedarikçi → aynı sipariş, farklısı → ayrı sipariş).
 *     «Siparişe Git» grubun sonradan doğan eksiğini de yazar ve siparişi açar.
 *
 * DÜZEN (Vorgabe Samet): tedarikçi adları SOLA yaslı; «Siparişe Git», «Sipariş
 * oluştur» ve «Oluştur» hepsi AYNI HİZADA — grubun başlık satırında ad
 * birleştirilmiş ilk hücrede, düğmeler «Sipariş» sütununun hücresinde.
 *   · «Türsüzler»: başlıkta «Sipariş oluştur» → Mac tarzı işaretler çıkar →
 *     «Oluştur» işaretlileri TEK siparişe koyar. O sipariş Türsüzler'in
 *     ÜSTÜNDE kendi gri başlığını alır — «U1» (sonrakiler U2, U3 …), yanında
 *     tedarikçisi (seçilmediyse «Tedarikçi seçilmedi»), tek bir «Siparişe
 *     Git» ve kodu; siparişe giren pozisyonlar altında durur.
 *   · Ek Hizmet: «Siparişe Git» boş formu açar.
 */
export const ProjectProcurementTab = ({ project }: { project: ProjectDto }) => {
    const navigate = useNavigate();
    const permissions = useAuthStore((state) => state.permissions);
    const canOrder = permissions.includes('inventory.transfer');
    const poLang = usePurchaseLang();
    // Ürün sütunu esnektir; diğerleri sürüklenerek genişletilir.
    const grid = useColumnWidths({
        storageKey: 'offitec:project-procurement:col-widths:v3',
        defaults: { requested: 104, stock: 112, ordered: 124, missing: 140, order: 280 },
        minPx: 64,
    });
    // undefined = yükleniyor, null = yüklenemedi.
    const [data, setData] = useState<ProjectProcurement | null | undefined>(() => procurementCache.get(project.id));
    const [busyPosition, setBusyPosition] = useState<string | null>(null);
    const [anywayFor, setAnywayFor] = useState<ProcurementPosition | null>(null);
    /** Türsüzler: işaretleme açık mı, neler işaretli. */
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [creating, setCreating] = useState(false);
    const [reloadTick, setReloadTick] = useState(0);

    const tenderId = project.tenderId || project.tender?.id || null;
    const loading = data === undefined;

    /* AÇILIŞ: yalnızca OKUNUR — sekme açılınca sipariş oluşmaz (Vorgabe Samet,
       24.09.2026: «Siparişlerim sayfasına girince otomatik oluşturmayacak,
       proje oluşturulunca oluşturulacak»). */
    useEffect(() => {
        let cancelled = false;
        projectProcurementApi.get(project.id)
            .then((next) => {
                procurementCache.set(project.id, next);
                if (!cancelled) setData(next);
            })
            .catch(() => {
                if (cancelled || procurementCache.has(project.id)) return;
                setData(null);
                toast.error(t('projects.procurement.loadFailed'));
            });
        return () => { cancelled = true; };
    }, [project.id, reloadTick]);

    const groups = useMemo(() => buildGroups(data?.positions ?? [], data?.orders ?? []), [data]);
    const projectLabel = data?.project.label
        || [project.projectNumber, project.projectName].filter(Boolean).join(' · ');

    /** Boş sipariş formu (Ek Hizmet) — projenin adı dolu. */
    const openBlankForm = () => {
        const prefill: ProjectOrderPrefill = { projectId: project.id, projectLabel, line: null };
        navigate('/inventory/orders/new', { state: { projectPrefill: prefill } });
    };

    /** «+» (yine de sipariş) — stokta olan «Satın Alınacak» ürün için. */
    const placeOrder = async (
        position: ProcurementPosition,
        options: { quantity?: number; target?: 'AUTO' | 'EXISTING' | 'NEW' } = {},
    ) => {
        setBusyPosition(position.positionId);
        try {
            const result = await projectProcurementApi.order(project.id, { positionId: position.positionId, ...options });
            procurementCache.delete(project.id);
            toast.success(t(result.created ? 'projects.procurement.created' : 'projects.procurement.merged', {
                code: localizePurchaseCode(result.order.referenceNumber, poLang),
            }));
            navigate(`/inventory/orders/${result.order.id}`);
        } catch (error) {
            const code = procurementErrorCode(error);
            if (code === 'PRODUCER_MISSING') { toast.error(t('projects.procurement.producerMissing')); return; }
            const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(message || t('inv.orders.saveFailed'));
        } finally {
            setBusyPosition(null);
            setAnywayFor(null);
        }
    };

    /** Grubun henüz sipariş edilmemiş eksiği var mı? */
    const groupMissing = (group: ProcurementGroup): boolean =>
        group.positions.some((position) => position.missing > 0);

    /* «SİPARİŞE GİT» (tedarikçi grubu): eksik varsa sunucu onu tedarikçinin
       siparişine yazar (açık taslağa ekler, yoksa açar); sonra sipariş açılır.
       Eksik yoksa grubun siparişi doğrudan açılır. */
    const [busyGroup, setBusyGroup] = useState<string | null>(null);
    const goToGroupOrder = async (group: ProcurementGroup) => {
        const target = targetOrderOf(group.orders);
        if (!groupMissing(group) || !canOrder) {
            if (target) navigate(`/inventory/orders/${target.id}`);
            return;
        }
        setBusyGroup(group.key);
        try {
            const result = await projectProcurementApi.supplierOrder(project.id, group.key);
            procurementCache.delete(project.id);
            toast.success(t(result.created ? 'projects.procurement.created' : 'projects.procurement.merged', {
                code: localizePurchaseCode(result.order.referenceNumber, poLang),
            }));
            navigate(`/inventory/orders/${result.order.id}`);
        } catch (error) {
            const code = procurementErrorCode(error);
            const orderId = (error as { response?: { data?: { orderId?: string | null } } })?.response?.data?.orderId;
            if (code === 'NOTHING_MISSING' && orderId) { navigate(`/inventory/orders/${orderId}`); return; }
            if (code === 'PRODUCER_MISSING') { toast.error(t('projects.procurement.producerMissing')); return; }
            const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(message || t('inv.orders.saveFailed'));
        } finally {
            setBusyGroup(null);
        }
    };

    /* «SİPARİŞE GİT» (U-grubu): siparişi açar — tedarikçisi henüz seçilmediyse
       doğrudan seçildiği «Ayarlar» sekmesinde. */
    const openManualOrder = (order: ProcurementOrder) => {
        const supplierSet = Boolean(order.supplierId || order.supplierName.trim());
        navigate(`/inventory/orders/${order.id}${supplierSet ? '' : '?tab=settings'}`);
    };

    const openOrderFor = (position: ProcurementPosition | null): ProcurementOrder | null => {
        if (!position?.supplier) return null;
        return data?.orders.find((order) =>
            order.status === 'ORDER_DRAFT' && order.supplierId === position.supplier?.id) ?? null;
    };

    /* ── TÜRSÜZLER: İŞARETLE VE OLUŞTUR ──────────────────────────────────────
       İşaretlenenler TEK, tedarikçisiz bir siparişe girer; tedarikçi siparişte
       seçilir ve sonra satırların yanında yazar. */
    const toggleSelected = (positionId: string) => {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(positionId)) next.delete(positionId); else next.add(positionId);
            return next;
        });
    };
    const stopSelecting = () => { setSelecting(false); setSelected(new Set()); };
    const createManualOrder = async () => {
        if (!selected.size) return;
        setCreating(true);
        try {
            const result = await projectProcurementApi.manualOrder(project.id, [...selected]);
            procurementCache.delete(project.id);
            const orderId = result.order.id;
            toast.success(t('projects.procurement.manualCreated', {
                code: localizePurchaseCode(result.order.referenceNumber, poLang),
            }), {
                action: {
                    label: t('projects.procurement.openOrder'),
                    onClick: () => navigate(`/inventory/orders/${orderId}?tab=settings`),
                },
            });
            stopSelecting();
            setReloadTick((tick) => tick + 1);
        } catch (error) {
            const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(message || t('inv.orders.saveFailed'));
        } finally {
            setCreating(false);
        }
    };

    if (!tenderId) {
        return (
            <Card title={t('projects.procurement.myOrders')}>
                <EmptyState
                    icon={<ShoppingCart01 size={32} />}
                    title={t('projects.procurement.myOrders')}
                    description={t('auto.bu_proje_bir_teklife_bagli_degil')}
                />
            </Card>
        );
    }

    const dash = <span className="text-slate-300 dark:text-white/30">—</span>;
    const columnCount = 6 + (selecting ? 1 : 0);

    /** Sipariş kodları — tıklanınca o sipariş açılır. */
    const codeChips = (orders: ProcurementOrderRef[], limit = 4) => (
        <span className="ofi-proc-codes">
            {orders.slice(0, limit).map((order) => (
                <button
                    key={order.id}
                    type="button"
                    className="ofi-proc-code"
                    title={t(ORDER_STATUS_META[order.status]?.labelKey ?? 'inv.orders.status.orderDraft')}
                    onClick={() => navigate(`/inventory/orders/${order.id}`)}
                >
                    <PurchaseCode value={order.referenceNumber} />
                </button>
            ))}
        </span>
    );

    /**
     * Grubun başlık satırı. İLK HÜCRE birleştirilmiştir ve adı SOLA yaslı
     * taşır (tedarikçi + parantez içinde tür; U-grubunda «U1» + tedarikçisi);
     * düğmeler «Sipariş» sütununun hücresinde durur — böylece bütün grupların
     * düğmeleri AYNI HİZADADIR.
     */
    const groupHeader = (group: ProcurementGroup) => {
        const target = targetOrderOf(group.orders);
        const manual = MANUAL_GROUPS.has(group.kind);
        const selectable = group.positions.filter((position) => openNeedOf(position) > 0).length;
        const supplierGroup = group.kind === 'SUPPLIER' || group.kind === 'PRODUCTION';
        const canGo = Boolean(target) || (canOrder && groupMissing(group));
        const manualOrder = group.kind === 'MANUAL_ORDER' ? group.order : null;
        return (
            <tr className="ofi-proc-group">
                <td colSpan={columnCount - 1}>
                    <div className="ofi-proc-group__name">
                        <span
                            className="ofi-proc-group__title"
                            title={manualOrder ? t('projects.procurement.manualOrderHint') : undefined}
                        >
                            {group.title}
                        </span>
                        {group.kindLabel && <span className="ofi-proc-group__kind">({group.kindLabel})</span>}
                        {manualOrder && (
                            <span className={`ofi-proc-group__kind${manualOrder.supplierName ? '' : ' is-unset'}`}>
                                ({manualOrder.supplierName || t('projects.procurement.supplierNotSet')})
                            </span>
                        )}
                        {manual && selecting && <span className="ofi-proc-group__hint">{t('projects.procurement.selectHint')}</span>}
                        {group.kind === 'NO_PRODUCER' && (
                            <span className="ofi-proc-group__hint">{t('projects.procurement.producerMissing')}</span>
                        )}
                    </div>
                </td>
                <td className="ofi-proc-group__actions">
                    <div className="ofi-proc-group__bar">
                        {supplierGroup && (
                            <>
                                <button
                                    type="button"
                                    className="ofi-prj-btn is-primary"
                                    disabled={!canGo || busyGroup !== null}
                                    title={canGo ? undefined : t('projects.procurement.nothingToOrder')}
                                    onClick={() => void goToGroupOrder(group)}
                                >
                                    {busyGroup === group.key
                                        ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        : <ShoppingCart01 size={13} />}
                                    {t('projects.procurement.goToOrder')}
                                </button>
                                {group.orders.length > 0 && codeChips(group.orders)}
                            </>
                        )}

                        {manualOrder && (
                            <>
                                <button
                                    type="button"
                                    className="ofi-prj-btn is-primary"
                                    onClick={() => openManualOrder(manualOrder)}
                                >
                                    <ShoppingCart01 size={13} />
                                    {t('projects.procurement.goToOrder')}
                                </button>
                                {codeChips(group.orders)}
                            </>
                        )}

                        {manual && canOrder && !selecting && (
                            <button
                                type="button"
                                className="ofi-prj-btn"
                                disabled={selectable === 0}
                                title={selectable === 0 ? t('projects.procurement.nothingToOrder') : undefined}
                                onClick={() => { setSelected(new Set()); setSelecting(true); }}
                            >
                                <Plus size={13} />
                                {t('projects.procurement.createOrder')}
                            </button>
                        )}
                        {manual && selecting && (
                            <>
                                <button
                                    type="button"
                                    className="ofi-prj-btn is-primary"
                                    disabled={creating || selected.size === 0}
                                    onClick={() => void createManualOrder()}
                                >
                                    {creating
                                        ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        : <ShoppingCart01 size={13} />}
                                    {t('projects.procurement.createSelected', { count: selected.size })}
                                </button>
                                <button type="button" className="ofi-prj-btn" disabled={creating} onClick={stopSelecting}>
                                    {t('common.cancel')}
                                </button>
                            </>
                        )}

                        {group.kind === 'SERVICE' && canOrder && (
                            <button type="button" className="ofi-prj-btn" onClick={openBlankForm}>
                                <ShoppingCart01 size={13} />
                                {t('projects.procurement.goToOrder')}
                            </button>
                        )}
                    </div>
                </td>
            </tr>
        );
    };

    /** Bir ürün satırı. */
    const positionRow = (group: ProcurementGroup, position: ProcurementPosition) => {
        const manual = MANUAL_GROUPS.has(group.kind);
        const purchase = position.mode === 'PURCHASE';
        // Talep tamamen stoktan karşılanıyor, sipariş yok.
        const inStock = purchase && position.articleId !== null
            && position.missing <= 0 && position.ordered <= 0 && position.inRequest <= 0 && position.fromStock > 0;
        const unit = position.unit ? ` ${position.unit}` : '';
        const canSelect = manual && openNeedOf(position) > 0;
        return (
            <tr key={position.positionId} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                {selecting && (
                    <td className="ofi-proc-checkcell">
                        {manual && (
                            <input
                                type="checkbox"
                                className="ofi-proc-check"
                                checked={selected.has(position.positionId)}
                                disabled={!canSelect || creating}
                                onChange={() => toggleSelected(position.positionId)}
                                aria-label={position.name}
                            />
                        )}
                    </td>
                )}
                <td className="text-slate-800 dark:text-white">{position.name}</td>
                {/* ── Talep / Stok / Siparişte / Eksik ── */}
                <td className="text-right font-mono text-[13px] tabular-nums text-slate-700 dark:text-white/80">
                    {position.mode !== 'EMPTY' ? `${fmtQuantity(position.requested)}${unit}` : dash}
                </td>
                <td className="text-right font-mono text-[13px] tabular-nums text-slate-700 dark:text-white/80">
                    {purchase && position.stock !== null ? (
                        <span className="ofi-proc-stack">
                            <span>{fmtQuantity(position.stock)}</span>
                            {position.fromStock > 0 && (
                                <small className="is-stock">{t('projects.procurement.fromStock', { count: fmtQuantity(position.fromStock) })}</small>
                            )}
                        </span>
                    ) : dash}
                </td>
                <td className="text-right font-mono text-[13px] tabular-nums">
                    {position.mode === 'EMPTY' ? dash : (
                        <span className="ofi-proc-stack">
                            <span className={position.ordered > 0 ? 'font-semibold text-[#0a7aff] dark:text-[#5ea8ff]' : 'text-slate-400 dark:text-white/40'}>
                                {fmtQuantity(position.ordered)}
                            </span>
                            {position.inRequest > 0 && (
                                <small className="is-request">{t('projects.procurement.inRequest', { count: fmtQuantity(position.inRequest) })}</small>
                            )}
                        </span>
                    )}
                </td>
                <td className="text-right">
                    {position.mode === 'EMPTY' ? dash : inStock ? (
                        <span className="ofi-proc-instock">
                            <span className="ofi-prj-state is-green">{t('projects.procurement.inStock')}</span>
                            {canOrder && position.supplier && (
                                <button
                                    type="button"
                                    className="ofi-proc-plus"
                                    title={t('projects.procurement.orderAnyway')}
                                    aria-label={t('projects.procurement.orderAnyway')}
                                    onClick={() => setAnywayFor(position)}
                                >
                                    <Plus size={13} />
                                </button>
                            )}
                        </span>
                    ) : (
                        <span className={`font-mono text-[13px] font-semibold tabular-nums ${position.missing > 0 ? 'text-red-600 dark:text-red-300' : 'text-slate-500'}`}>
                            {busyPosition === position.positionId
                                ? <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                : fmtQuantity(position.missing)}
                        </span>
                    )}
                </td>
                {/* ── Sipariş kodları; elle açılan siparişte tedarikçisi de ── */}
                <td>
                    {position.orders.length > 0 ? (
                        <span className="ofi-proc-ordercell">
                            {codeChips(position.orders, 3)}
                            {manual && (() => {
                                const supplierName = targetOrderOf(position.orders)?.supplierName;
                                return supplierName
                                    ? <span className="ofi-proc-supplier">{supplierName}</span>
                                    : <span className="ofi-proc-supplier is-unset">{t('projects.procurement.supplierNotSet')}</span>;
                            })()}
                        </span>
                    ) : dash}
                </td>
            </tr>
        );
    };

    return (
        <>
            <Card title={t('projects.procurement.myOrders')} noPadding>
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="ofi-proc-table w-full">
                        <colgroup>
                            {selecting && <col style={{ width: 44 }} />}
                            {/* Ürün sütunu: genişliği yok, kalan yeri emer. */}
                            <col />
                            <ResizableCols keys={['requested', 'stock', 'ordered', 'missing', 'order'] as const} grid={grid} />
                        </colgroup>
                        <thead>
                            <tr>
                                {selecting && <th aria-label={t('projects.procurement.selectHint')} />}
                                <th className="text-left">{t('nav.articles')}</th>
                                <th className="relative text-right">
                                    {t('projects.procurement.requested')}
                                    <ColResizeHandle {...grid.resizeProps('requested')} />
                                </th>
                                <th className="relative text-right">
                                    {t('projects.procurement.stock')}
                                    <ColResizeHandle {...grid.resizeProps('stock')} />
                                </th>
                                <th className="relative text-right">
                                    {t('projects.procurement.onOrder')}
                                    <ColResizeHandle {...grid.resizeProps('ordered')} />
                                </th>
                                <th className="relative text-right">
                                    {t('projects.procurement.missing')}
                                    <ColResizeHandle {...grid.resizeProps('missing')} />
                                </th>
                                <th className="relative text-left">
                                    {t('projects.procurement.order')}
                                    <ColResizeHandle {...grid.resizeProps('order')} />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || groups.length === 0) && (
                                <TableStateRow
                                    colSpan={columnCount}
                                    loading={loading}
                                    emptyText={data === null ? t('projects.procurement.loadFailed') : t('tenders.tender_line_not_found')}
                                />
                            )}
                            {groups.map((group) => (
                                <Fragment key={group.key}>
                                    {groupHeader(group)}
                                    {group.positions.map((position) => positionRow(group, position))}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <ProcurementOrderPopup
                position={anywayFor}
                openOrder={openOrderFor(anywayFor)}
                busy={busyPosition !== null}
                onClose={() => setAnywayFor(null)}
                onSubmit={(quantity, target) => { if (anywayFor) void placeOrder(anywayFor, { quantity, target }); }}
            />
        </>
    );
};
