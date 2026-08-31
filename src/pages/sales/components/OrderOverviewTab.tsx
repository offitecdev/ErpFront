import { memo } from 'react';
import type React from 'react';
import dayjs from 'dayjs';

import { OrderConfirmationButton } from '@/components/orders/OrderConfirmationButton';
import { t } from '@/i18n/translate';
import type { MyOrderDetailDto } from '@/types/billing';

import { CheckCircle } from '../../../components/icons/antIconCompat';
import { Card } from '../../../components/ui-shared/Card';
import { StatusChip } from '../../../components/ui-shared/StatusBadge';
import { isDeliveryOrder, type Stage } from './orderOverviewShared';
import { QuotePdfButton } from './QuotePdfButton';

const fmtDate = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY') : '-');

const FactRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 py-1.5">
        <span className="shrink-0 text-tertiary">{label}</span>
        <span className="min-w-0 text-right font-medium text-primary">{children}</span>
    </div>
);

/** Mehrzeilige Adresse aus dem Angebot; leer heisst ausdrücklich "nicht hinterlegt". */
const AddressBlock = ({ label, value }: { label: string; value?: string | null }) => (
    <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-tertiary">{label}</div>
        {value && value.trim() ? (
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-primary">{value.trim()}</p>
        ) : (
            <p className="mt-1 text-sm text-slate-400">{t('crm.addressNotStored')}</p>
        )}
    </div>
);

/**
 * Die erste Registerkarte der Auftragsansicht — für den Projekt- wie für den
 * Lieferauftrag dieselbe, nur mit unterschiedlichem Inhalt:
 *
 *   • Projektauftrag  → Zieladresse ist die MONTAGEADRESSE, kein Lieferdatum
 *                       (die Ausführung steuern die Termine).
 *   • Lieferauftrag   → Zieladresse ist die LIEFERADRESSE plus Lieferdatum,
 *                       Rechnungsangaben ja, technische Stufen nein.
 */
export const OrderOverviewTab = memo(({ order, stages, onOpenStage }: {
    order: MyOrderDetailDto;
    /** Bereits durch `stagesForOrder` gefiltert. */
    stages: Stage[];
    onOpenStage: (stage: Stage) => void;
}) => {
    const delivery = isDeliveryOrder(order);
    const tender = order.tender || null;

    return (
        <div className="space-y-4">
            {/* Adressen stehen links, die Auftragsangaben rechts (Benutzerwunsch —
                die beiden Karten wurden getauscht). */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card title={t('crm.orderAddresses')}>
                    <div className="space-y-4">
                        {/* Endstation des Auftrags: beim Projekt die Montageadresse,
                            beim Lieferauftrag direkt die Lieferadresse. */}
                        <AddressBlock
                            label={`${t('crm.destinationAddress')} · ${delivery ? t('crm.deliveryAddressLabel') : t('tenders.lieferungsadresse')}`}
                            value={delivery ? tender?.deliveryAddress : tender?.installationAddress}
                        />
                        <AddressBlock label={t('tenders.rechnungsadresse')} value={tender?.billingAddress} />
                    </div>
                </Card>

                {/* Die Auftragsbestätigung steht NEBEN der Auftragskarte — wie
                    auf der Projektübersicht, damit der Beleg in beiden Modulen
                    an derselben Stelle liegt. */}
                <Card
                    title={t('projects.order')}
                    actions={(
                        <OrderConfirmationButton
                            order={{
                                id: order.id,
                                orderNumber: order.orderNumber,
                                tenderId: tender?.id ?? null,
                                orderDate: order.orderDate ?? null,
                                createdAt: order.createdAt,
                                confirmationNote: order.confirmationNote ?? null,
                                confirmationValidUntil: order.confirmationValidUntil ?? null,
                                createdBy: order.createdBy ?? null,
                            }}
                        />
                    )}
                >
                    <div className="divide-y divide-slate-100 text-sm">
                        <FactRow label={t('crm.order_no')}>{order.orderNumber}</FactRow>
                        <FactRow label={t('common.type')}>
                            <StatusChip variant={delivery ? 'neutral' : 'info'}>
                                {delivery ? t('crm.deliveryOrder') : t('crm.projectOrder')}
                            </StatusChip>
                        </FactRow>
                        <FactRow label={t('tenders.kommission_nr')}>
                            {tender?.commissionNumber?.trim() || <span className="text-slate-400">{t('crm.commissionMissing')}</span>}
                        </FactRow>
                        {/* Neben der Offertnummer öffnet das Auge die Angebots-
                            vorschau (PDF) mit Download — dieselbe Datei wie der
                            Export auf der Offertseite. */}
                        <FactRow label={t('projects.tender')}>
                            {tender?.id ? (
                                <span className="inline-flex items-center gap-2">
                                    {tender.tenderNumber || '-'}
                                    <QuotePdfButton tenderId={tender.id} tenderNumber={tender.tenderNumber} />
                                </span>
                            ) : (tender?.tenderNumber || '-')}
                        </FactRow>
                        <FactRow label={t('nav.quickActionsGroup.customers')}>{order.customer?.companyName || '-'}</FactRow>
                        {/* Das Lieferdatum gehört ausschliesslich zum Lieferauftrag. */}
                        {delivery ? (
                            <FactRow label={t('tenders.lieferdatum_intern')}>{fmtDate(tender?.internalDeliveryDate)}</FactRow>
                        ) : (
                            <FactRow label={t('nav.projects')}>{order.project?.projectName || '-'}</FactRow>
                        )}
                    </div>
                </Card>
            </div>

            <Card title={t('crm.completionStatus')} noPadding>
                <div className="divide-y divide-slate-100">
                    {stages.map((stage) => {
                        const done = stage.items.filter((item) => item.done).length;
                        // Teslimat raporu imzasızken onay işareti YOK (kullanıcı
                        // isteği): rapor varsa "imza gerekli", yoksa "henüz
                        // oluşturulmadı" yazısı durumu açıkça söyler.
                        const deliveryPending = stage.key === 'deliveryReport' && !stage.completed;
                        return (
                            <button
                                key={stage.key}
                                type="button"
                                onClick={() => onOpenStage(stage)}
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    {stage.completed
                                        ? <CheckCircle size={16} className="shrink-0 text-[#059669]" />
                                        : <span className="size-3.5 shrink-0 rounded-full border-2 border-slate-300" />}
                                    <span className="truncate text-[13px] font-medium text-primary">{stage.label}</span>
                                </span>
                                {deliveryPending ? (
                                    <span className={`shrink-0 text-[12px] font-medium ${stage.items.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                        {stage.items.length > 0
                                            ? t('projects.complete.signatureRequired')
                                            : t('projects.complete.notYetCreated')}
                                    </span>
                                ) : (
                                    <span className="shrink-0 text-[12px] text-tertiary">
                                        {stage.items.length > 0 ? `${done}/${stage.items.length}` : ''}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
});
