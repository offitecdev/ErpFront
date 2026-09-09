import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

import { t } from '@/i18n/translate';
import { Edit01, Plus, Receipt as ReceiptText, Trash01 } from '@/components/icons/antIconCompat';
import { InvoicePopup } from '@/components/billing/InvoicePopup';
import { addonCreatePath, addonEditPath } from '@/components/orders/addonEditorRoute';
import { AddonEditorSlot } from '@/components/orders/AddonEditorSlot';
import { useOrderLifecycle } from '@/components/orders/useOrderLifecycle';
import { AddonOrderPdfButton } from '@/components/orders/AddonOrderPdfButton';
import { openAmount } from '@/lib/orderBillingTotals';
import { CostList } from '@/pages/project/features/components/common/CostList';
import { displayExpenseType, durationFmt, money, numberFmt } from '@/pages/project/features/utils/projectFormatters';
import { useAuthStore } from '@/store/authStore';
import type { MyOrderAddonDto, MyOrderDetailDto } from '@/types/billing';

const fmtDate = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY') : '-');

/**
 * Ek siparişin içerik dilimi — sunucudaki `createAddonOrderForParent` ile aynı
 * pencere: bir ÖNCEKİ ek siparişin oluşturulmasından BU ek siparişin
 * oluşturulmasına kadar üst siparişe işlenen kayıtlar. Kayıtlar veritabanında
 * ÜST siparişe bağlı kalır (ek sipariş yalnızca faturalama kaydıdır), bu yüzden
 * içerik ancak zamanla kesilerek geri bulunur — proje modülündeki
 * `scopedRecords` ile aynı yaklaşım.
 */
const addonSlice = <T,>(
    records: T[] | undefined,
    addon: MyOrderAddonDto,
    addons: MyOrderAddonDto[],
    dateOf: (record: T) => string | null | undefined,
): T[] => {
    const previous = addons
        .filter((candidate) => dayjs(candidate.createdAt).isBefore(dayjs(addon.createdAt)))
        .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())[0];
    const start = previous ? dayjs(previous.createdAt).valueOf() : null;
    const end = dayjs(addon.createdAt).valueOf();
    return (records || []).filter((record) => {
        const raw = dateOf(record);
        if (!raw) return false;
        const time = dayjs(raw).valueOf();
        return time <= end && (start === null || time > start);
    });
};

/**
 * Ek siparişin içeriğini gösteren pencere — proje modülündeki
 * `AddonOrderOverview` düzeninin sipariş sayfasındaki karşılığı: kostenart
 * tablosu ve malzeme / harici gider / fazla mesai ayrıntı listeleri.
 *
 * Fatura modülünün kılığı (19.08.2026): alttan açılan yaprak DEĞİL, ortada
 * duran, sürüklenebilen `InvoicePopup` — modülün geri kalanıyla aynı pencere.
 */
const AddonContentSheet = ({ order, addon, canEdit, onClose, onDelete }: {
    order: MyOrderDetailDto;
    addon: MyOrderAddonDto;
    /** Nachträge anlegen dürfen = ihre Positionen bearbeiten dürfen. */
    canEdit: boolean;
    onClose: () => void;
    /** Den Nachtrag zurücknehmen — die Registerkarte fragt und lädt danach neu. */
    onDelete: () => void;
}) => {
    const navigate = useNavigate();
    const addons = order.addonSalesOrders || [];
    // Fakturiert = eingefroren; der Server lehnt Änderungen ohnehin ab.
    const invoiced = (addon.billingSummary?.invoices || []).some((invoice) => invoice.status !== 'CANCELLED');

    const materialRows = useMemo(
        () => addonSlice(order.extraMaterials, addon, addons, (item) => item.addedAt).map((item) => ({
            id: item.id,
            title: item.material?.name || item.article?.name || t('auto.malzeme'),
            meta: `${numberFmt(item.quantity)} ${t('auto.adet_x')} ${money(item.unitPrice)}`,
            amount: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
            note: item.description ?? undefined,
        })),
        [order.extraMaterials, addon, addons],
    );
    const expenseRows = useMemo(
        () => addonSlice(order.expenses, addon, addons, (item) => item.expenseDate).map((expense) => ({
            id: expense.id,
            title: displayExpenseType(expense.expenseType),
            meta: fmtDate(expense.expenseDate),
            amount: Number(expense.amount) || 0,
            note: expense.description ?? undefined,
        })),
        [order.expenses, addon, addons],
    );
    const overtimeRows = useMemo(
        () => addonSlice(order.reports, addon, addons, (report) => report.reportDate || report.workDate)
            .filter((report) => Number(report.overtimeCost) > 0)
            .map((report) => ({
                id: report.id,
                title: fmtDate(report.workDate),
                meta: `${durationFmt(Number(report.overtimeMinutes || 0))} x ${money(report.overtimeHourlyRate)}`,
                amount: Number(report.overtimeCost) || 0,
                note: report.operationsDone || undefined,
            })),
        [order.reports, addon, addons],
    );

    const sum = (rows: Array<{ amount: number }>) => rows.reduce((total, row) => total + row.amount, 0);
    // Aynı üç kalem türü, TEK bir sayı sütununda — tutarlar ve toplam hizada.
    const costRows = [
        { key: 'material', label: t('auto.malzeme'), rows: materialRows },
        { key: 'expense', label: t('auto.harici_gider'), rows: expenseRows },
        { key: 'overtime', label: t('auto.15_uzeri_fazla_calisma'), rows: overtimeRows },
    ];

    return (
        <InvoicePopup
            open
            title={addon.orderNumber}
            subtitle={`${addon.revisionNumber ? `${addon.revisionNumber}. ` : ''}${t('projects.addonOrder')} · ${fmtDate(addon.orderDate || addon.createdAt)}`}
            onClose={onClose}
            /* Der eigene Beleg des Nachtrags (NT-PDF, drei Sprachen) und —
               für wer darf — das Bearbeiten seiner Positionen. */
            headerActions={(
                <span className="flex items-center gap-1.5">
                    {canEdit && (
                        <button
                            type="button"
                            className="ofi-inv-btn"
                            disabled={invoiced}
                            title={invoiced ? t('crm.addon.invoicedLocked') : t('crm.addon.editTitle')}
                            /* Bearbeiten geschieht IN dieser Registerkarte
                               (Vorgabe 05.09.2026) — «Zurück» führt hierher. */
                            onClick={() => navigate(addonEditPath(addon.id, `/sales/orders/${order.id}?tab=addons`))}
                        >
                            <Edit01 size={13} />
                            {t('common.edit')}
                        </button>
                    )}
                    <AddonOrderPdfButton addon={addon} />
                    {/* Der Bereich zum LÖSCHEN des Nachtrags (Vorgabe
                        05.09.2026): das Material geht ans Lager zurück, die
                        Rapporte und Termine an den Hauptauftrag. */}
                    {canEdit && (
                        <button
                            type="button"
                            className="ofi-inv-btn is-danger"
                            disabled={invoiced}
                            title={invoiced ? t('crm.addon.invoicedLocked') : t('common.delete')}
                            onClick={onDelete}
                        >
                            <Trash01 size={13} />
                            {t('common.delete')}
                        </button>
                    )}
                </span>
            )}
        >
            <div className="ofi-inv-scope ofi-inv-pop__pad space-y-4">
                <table data-inv-table data-unstyled-table data-no-col-resize className="w-full">
                    <thead>
                        <tr>
                            <th className="text-left">{t('common.type')}</th>
                            <th className="w-32 text-right">{t('projects.recordUnitMany')}</th>
                            <th className="w-40 text-right">{t('projects.detail.colAmount')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {costRows.map((row) => (
                            <tr key={row.key}>
                                <td><span className="ofi-inv-name">{row.label}</span></td>
                                <td className="ofi-inv-num ofi-inv-muted">{row.rows.length}</td>
                                <td className="ofi-inv-num">{money(sum(row.rows))}</td>
                            </tr>
                        ))}
                        {/* Toplam, ek siparişin KENDİ tutarıdır (kesildiği anda
                            donmuştur) — üç dilimin toplamı sonradan değişebilir. */}
                        <tr className="ofi-inv-total">
                            <td><span className="ofi-inv-name">{t('common.total')}</span></td>
                            <td className="ofi-inv-num ofi-inv-muted">{materialRows.length + expenseRows.length + overtimeRows.length}</td>
                            <td className="ofi-inv-num is-strong">{money(Number(addon.totalAmount) || 0)}</td>
                        </tr>
                    </tbody>
                </table>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <CostList title={t('auto.malzeme_ayrintilari')} empty={t('auto.malzeme_yok')} rows={materialRows} />
                    <CostList title={t('auto.harici_gider_ayrintilari')} empty={t('auto.gider_yok')} rows={expenseRows} />
                    <CostList title={t('auto.15_uzeri_fazla_calisma')} empty={t('auto.fazla_calisma_yok')} rows={overtimeRows} />
                </div>
            </div>
        </InvoicePopup>
    );
};

/**
 * "Zusatzaufträge" sekmesi — proje modülündeki kutunun eşi: ek siparişler kendi
 * NT- numaralarını ve teslim/iş tarihlerini taşır; satıra tıklamak içerik
 * penceresini açar. Teslimat siparişinde bu sekme HİÇ görünmez (ekler yalnızca
 * proje siparişinin altında listelenir).
 *
 * Fatura modülünün kılığında (19.08.2026): `.ofi-inv-card` ve aynı sayı sütunu
 * — fakturiert yeşil, offen kehribar, kapanmışsa yeşil sıfır.
 */
export const OrderAddonsTab = ({ order, initialAddonId, onInitialAddonConsumed, onChanged }: {
    order: MyOrderDetailDto;
    /** Liste derin bağlantısı (`?addon=<id>`): açılışta bu ek siparişin popup'ı açılır. */
    initialAddonId?: string | null;
    /** Derin bağlantı tüketildiğinde çağrılır — sekmeden ayrılıp dönmek popup'ı yeniden açmaz. */
    onInitialAddonConsumed?: () => void;
    /** Ein Nachtrag wurde erfasst oder geändert — die Seite lädt den Auftrag neu. */
    onChanged?: () => void | Promise<void>;
}) => {
    const navigate = useNavigate();
    const addons = order.addonSalesOrders || [];
    const { permissions } = useAuthStore();
    const { requestAction, dialog: lifecycleDialog } = useOrderLifecycle(async () => {
        setActiveAddon(null);
        await onChanged?.();
    });
    // Der FREIE Nachtrag (eigene Positionen, eigener NT-Code) — nur für
    // Projektaufträge: seine Zeilen sind Projektkostensätze.
    const canCreate = permissions.includes('projects.createAddonOrder') && Boolean(order.project?.id);
    const [activeAddon, setActiveAddon] = useState<MyOrderAddonDto | null>(
        () => (initialAddonId ? addons.find((addon) => addon.id === initialAddonId) ?? null : null),
    );

    useEffect(() => {
        if (initialAddonId) onInitialAddonConsumed?.();
        // Bilerek yalnız montajda: derin bağlantı tek seferliktir.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Die Erfassung geschieht IN dieser Registerkarte (Vorgabe 05.09.2026) —
       der Auftragskopf und die Reiter bleiben stehen. */
    return (
        <AddonEditorSlot
            parent={{
                id: order.parentSalesOrder?.id || order.id,
                orderNumber: order.parentSalesOrder?.orderNumber || order.orderNumber,
                projectId: order.project?.id ?? null,
            }}
            onSaved={onChanged}
        >
        <div className="ofi-inv-scope space-y-4">
            <section className="ofi-inv-card">
                <header className="ofi-inv-card__head">
                    <span className="ofi-inv-card__title">
                        <ReceiptText size={14} />
                        <span className="truncate">{t('projects.detail.overview.addonsTitle')}</span>
                        {addons.length > 0 && <span className="ofi-inv-sub">{addons.length}</span>}
                    </span>
                    {/* Der freie Nachtrag: eigener NT-Code, Produkte/Material
                        direkt erfasst — der zweite Weg neben dem Zusammenziehen
                        aus den Rapporten (Vorgabe 05.09.2026). */}
                    {canCreate && (
                        <div className="ofi-inv-card__actions">
                            <button
                                type="button"
                                className="ofi-inv-btn is-primary"
                                onClick={() => navigate(addonCreatePath(
                                    {
                                        id: order.parentSalesOrder?.id || order.id,
                                        orderNumber: order.parentSalesOrder?.orderNumber || order.orderNumber,
                                        projectId: order.project?.id ?? null,
                                    },
                                    `/sales/orders/${order.id}?tab=addons`,
                                ))}
                            >
                                <Plus size={13} />
                                {t('crm.addon.newTitle')}
                            </button>
                        </div>
                    )}
                </header>
                <div className="ofi-inv-card__body">
                    <table data-inv-table data-unstyled-table className="w-full">
                        <thead>
                            <tr>
                                <th className="text-left">{t('projects.detail.colOrder')}</th>
                                <th className="w-36 text-right">{t('projects.detail.colAmount')}</th>
                                <th className="w-36 text-right">{t('billing.billed')}</th>
                                <th className="w-36 text-right">{t('billing.remaining')}</th>
                                {/* Jeder Nachtrag hat seinen EIGENEN Beleg. */}
                                <th className="w-14 text-right">PDF</th>
                            </tr>
                        </thead>
                        <tbody>
                            {addons.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="ofi-inv-empty">
                                        {t('projects.detail.overview.noAddons')}
                                    </td>
                                </tr>
                            ) : addons.map((addon) => {
                                const total = Number(addon.billingSummary?.baseAmount ?? addon.totalAmount) || 0;
                                const billed = Number(addon.billingSummary?.billedAmount) || 0;
                                const open = openAmount(addon.billingSummary?.billedPercent, total, billed);
                                return (
                                    <tr
                                        key={addon.id}
                                        onClick={() => setActiveAddon(addon)}
                                        title={t('projects.addonOrder')}
                                        className="is-link"
                                    >
                                        <td>
                                            {/* STORNIERT (06.09.2026): der Nachtrag bleibt
                                                stehen — durchgestrichen, damit ihn niemand
                                                fuer offen haelt. */}
                                            <span className={`ofi-inv-name ${addon.cancelledAt ? 'line-through opacity-60' : ''}`}>{addon.orderNumber}</span>
                                            {addon.cancelledAt && (
                                                <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-px text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                                                    {t('orders.lifecycle.statusCancelled')}
                                                </span>
                                            )}
                                            {/* Tarih = ek işin ait olduğu randevu/iş günü
                                                (orderDate), proje kutusundaki ile aynı. */}
                                            <span className="ofi-inv-sub">{fmtDate(addon.orderDate || addon.createdAt)}</span>
                                        </td>
                                        <td className="ofi-inv-num is-strong">{money(total)}</td>
                                        <td className="ofi-inv-num is-billed">{money(billed)}</td>
                                        <td className={`ofi-inv-num ${open > 0 ? 'is-open' : 'is-billed'}`}>{money(open)}</td>
                                        <td className="text-right">
                                            <AddonOrderPdfButton addon={addon} variant="icon" />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            {activeAddon && (
                <AddonContentSheet
                    order={order}
                    addon={activeAddon}
                    canEdit={canCreate}
                    onClose={() => setActiveAddon(null)}
                    onDelete={() => requestAction({ id: activeAddon.id, orderNumber: activeAddon.orderNumber, isAddon: true })}
                />
            )}

            {lifecycleDialog}
        </div>
        </AddonEditorSlot>
    );
};
