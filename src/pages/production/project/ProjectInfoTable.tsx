import { Fragment, type ReactNode } from 'react';

import { usePurchaseLang } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import { fmtDate } from '@/pages/inventory/utils/format';
import type { ProductionProjectDevices } from '@/types/production';
import { localizePurchaseCode } from '@/utils/purchaseCode';

type Props = {
    data: ProductionProjectDevices;
};

type InfoCell = { key: string; label: string; value: ReactNode; title?: string };

/**
 * ── DIE PROJEKTTABELLE (24.09.2026, Vorgabe Samet) ──────────────────────────
 *
 * Erste Fassung: «proje bilgileri tablo halinde, daha fazla detay». Danach:
 * «çok detay var, biraz azaltabiliriz — gerekirse 3 sütun, biraz daha dar,
 *  daha az yer kaplasın».
 *
 * Also SECHS feste Felder, drei Paare je Zeile — zwei flache Zeilen über den
 * Gerätekarten: Kunde · Firma · Projektleitung / Aufträge · eingegangene
 * Bestellungen · Liefertermin. Jeder Wert bleibt auf seiner Zeile, was nicht
 * hineinpasst, steht im Tipp. Nummer, Name und einen besonderen Stand
 * (pausiert, abgeschlossen …) trägt der Kopf darüber; Adressen, Zeitraum,
 * Kommission und Referenz stehen im Projekt selbst.
 */
export const ProjectInfoTable = ({ data }: Props) => {
    const { project, details } = data;
    const lang = usePurchaseLang();
    const orders = details?.orders ?? [];
    const intake = (details?.intake ?? []).map((entry) => ({
        ...entry,
        code: localizePurchaseCode(entry.referenceNumber, lang),
    }));

    const cells: InfoCell[] = [
        { key: 'customer', label: t('production.columns.customer'), value: project.customerName || '—', title: project.customerName ?? undefined },
        { key: 'company', label: t('production.columns.company'), value: project.sourceTenantName || '—', title: project.sourceTenantName ?? undefined },
        { key: 'manager', label: t('production.info.manager'), value: details?.managerName || '—', title: details?.managerName ?? undefined },
        {
            key: 'orders',
            label: t('production.info.salesOrders'),
            title: orders.map((order) => order.orderNumber).join(', ') || undefined,
            // Ein stornierter Auftrag bleibt sichtbar, aber durchgestrichen.
            value: orders.length
                ? orders.map((order) => (
                    <span key={order.id} className={order.isActive ? undefined : 'is-off'}>{order.orderNumber}</span>
                ))
                : '—',
        },
        {
            key: 'intake',
            label: t('production.info.intakeOrders'),
            title: intake.map((entry) => entry.code).join(', ') || undefined,
            value: intake.length
                ? intake.map((entry) => <span key={entry.purchaseOrderId}>{entry.code}</span>)
                : <span className="ofi-pinfo__dim">{t('production.info.noIntake')}</span>,
        },
        {
            key: 'deliveryDate',
            label: t('production.info.deliveryDate'),
            value: details?.deliveryDate ? fmtDate(details.deliveryDate) : '—',
        },
    ];

    return (
        <section className="ofi-pinfo" aria-label={t('production.info.title')}>
            {cells.map((cell) => (
                <Fragment key={cell.key}>
                    <div className="ofi-pinfo__label">{cell.label}</div>
                    <div className="ofi-pinfo__value" title={cell.title}>{cell.value}</div>
                </Fragment>
            ))}
        </section>
    );
};
