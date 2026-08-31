import { memo } from 'react';
import dayjs from 'dayjs';

import { OrderConfirmationButton } from '@/components/orders/OrderConfirmationButton';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { OrderNotifications, type OrderNotification } from './OrderNotifications';
import { OverviewCard } from './OverviewCard';

const day = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY') : '-');

type Fact = { label: string; value: string; strong?: boolean; mono?: boolean };

/**
 * The single block at the very top: who the order is for and what it is. Nothing
 * else on the screen repeats this, so everything below can stay narrow. The bell
 * sits in the card header — its notifications play as single pop-ups at the
 * bottom of the screen — and to its LEFT the order's ONE document, the navy
 * "Verkaufs-PDF" button (which prints the Auftragsbestätigung). There used to be
 * a second, red one beside it; it was retired on 29.08.2026.
 *
 * BESCHRIFTUNG ÜBER WERT, KEINE TABELLE (Benutzerwunsch 19.08.2026: "unter der
 * Kundenzeile soll nichts seitwärts rollen"). Sieben Angaben zu EINER Sache
 * sind eine Liste und keine Tabelle mit einer einzigen Zeile: sieben feste
 * Spalten müssen auf einer schmalen Karte irgendwann rollen, das Raster
 * (`.ofi-prj-facts`) bricht stattdessen um. Damit fällt auch der automatische
 * Spaltenzieher weg, der den Rollbalken überhaupt erst gesetzt hat.
 *
 * KEIN Zustand in diesem Block (Benutzerwunsch 19.08.2026): die Kopfzeile der
 * Seite trägt ihn bereits neben dem Kundennamen, hier war er eine Wiederholung.
 */
export const OrderHeaderTable = memo(({ project, order, notifications }: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    notifications: OrderNotification[];
}) => {
    const creator = order?.createdBy || project.manager || null;
    // Kommission — kendi teklifinden, yoksa projenin teklifinden. Projede tek
    // bir kommission olduğu için müşteri/sipariş satırının yanında durur.
    const commission = (order?.tender?.commissionNumber || project.tender?.commissionNumber || '').trim();
    const facts: Fact[] = [
        {
            label: t('projects.delivery.colCustomer'),
            value: project.customer?.companyName || '-',
            strong: true,
        },
        { label: t('projects.order'), value: order?.orderNumber || '-', strong: true },
        {
            label: t('projects.tender'),
            value: order?.tender?.tenderNumber || project.tender?.tenderNumber || '-',
        },
        { label: t('tenders.kommission_nr'), value: commission || '-', mono: Boolean(commission) },
        { label: t('common.start'), value: day(project.startDate) },
        { label: t('common.end'), value: day(project.endDate) },
        {
            label: t('projects.detail.overview.creator'),
            value: creator ? `${creator.firstName} ${creator.lastName}`.trim() : '-',
        },
    ];

    return (
        <OverviewCard
            title={`${t('projects.delivery.colCustomer')} · ${t('projects.order')}`}
            /* Der Beleg des Auftrags steht links neben der Glocke: beides sind
               Wege aus dieser Kopfzeile heraus. */
            action={(
                <span className="ofi-prj-card__actions">
                    <OrderConfirmationButton order={order} fallbackTenderId={project.tenderId} />
                    <OrderNotifications items={notifications} />
                </span>
            )}
        >
            <dl className="ofi-prj-facts">
                {facts.map((fact) => (
                    <div key={fact.label} className="ofi-prj-facts__cell">
                        <dt className="ofi-prj-facts__label">{fact.label}</dt>
                        <dd
                            className={[
                                'ofi-prj-facts__value',
                                fact.strong ? 'is-strong' : '',
                                fact.mono ? 'ofi-prj-mono' : '',
                                fact.value === '-' ? 'is-empty' : '',
                            ].filter(Boolean).join(' ')}
                            title={fact.value}
                        >
                            {fact.value}
                        </dd>
                    </div>
                ))}
            </dl>
        </OverviewCard>
    );
});
