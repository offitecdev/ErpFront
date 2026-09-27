import { useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Tags } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { cachedWarehouseSettings, warehouseApi, warehouseErrorText } from '@/lib/api/warehouse';
import type { WarehouseListQuery } from '@/types/warehouse';

import { listExcelTexts } from '../export/exportTexts';
import { PickerPanel, PickerRow } from './pickerParts';

type Kind = 'labels' | 'pdf' | 'excel';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * ── «İNDİR»: ETIKETTEN, LISTE ALS PDF ODER EXCEL ────────────────────────────
 * «Malzeme gruplarına göre bunları toplu indirebilelim — satır satır PDF ve
 *  Excel.» Was heruntergeladen wird, ist genau die Liste, wie sie gerade
 * gefiltert ist (Suche, Gruppen, Barcode) — alle Seiten, bis 5000 Karten.
 * Etiketten gibt es nur für Karten mit ERP-Code.
 */
export const ExportMenu = ({ query, filterLabel }: { query: WarehouseListQuery; filterLabel: string }) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [busy, setBusy] = useState<Kind | null>(null);

    const run = async (kind: Kind) => {
        setAnchor(null);
        if (busy) return;
        setBusy(kind);
        const toastId = toast.loading(t('warehouse.pdf.preparing'));
        try {
            const data = await warehouseApi.exportRows(query);
            if (!data.items.length) {
                toast.error(t('warehouse.products.downloadEmpty'), { id: toastId });
                return;
            }
            let note = '';
            if (kind === 'labels') {
                const [{ buildLabelsPdf, labelItemsOf }, settings] = await Promise.all([
                    import('../export/warehousePdf'),
                    cachedWarehouseSettings(),
                ]);
                const items = labelItemsOf(data.items);
                if (!items.length) {
                    toast.error(t('warehouse.products.downloadNoCodes'), { id: toastId });
                    return;
                }
                const doc = await buildLabelsPdf(items, settings.label);
                doc.save(t('warehouse.pdf.labelsFile', { date: today() }));
                const skipped = data.items.length - items.length;
                note = skipped ? t('warehouse.products.labelsSkipped', { count: skipped }) : '';
                toast.success(t('warehouse.products.labelsReady', { count: items.length }), { id: toastId, ...(note ? { description: note } : {}) });
            } else if (kind === 'pdf') {
                const { buildListPdf } = await import('../export/warehousePdf');
                const doc = await buildListPdf(data.items, {
                    title: t('warehouse.pdf.listTitle'),
                    subtitle: t('warehouse.pdf.listSubtitle', {
                        filter: filterLabel,
                        count: data.items.length,
                        date: new Date().toLocaleDateString('de-CH'),
                    }),
                    columns: {
                        erpCode: t('warehouse.columns.erpCode'),
                        barcode: t('warehouse.columns.barcode'),
                        name: t('warehouse.columns.name'),
                        group: t('warehouse.fields.materialGroup'),
                        brandModel: t('warehouse.add.brandModel'),
                        supplier: t('warehouse.columns.supplier'),
                        quantity: t('warehouse.columns.quantity'),
                    },
                    page: (page, pages) => t('warehouse.pdf.page', { page, pages }),
                });
                doc.save(t('warehouse.pdf.listFile', { date: today() }));
                toast.success(t('warehouse.products.listReady', { count: data.items.length }), { id: toastId });
            } else {
                const { downloadListExcel } = await import('../export/warehouseExcel');
                downloadListExcel(data.items, listExcelTexts());
                toast.success(t('warehouse.products.listReady', { count: data.items.length }), { id: toastId });
            }
            if (data.truncated) toast.message(t('warehouse.products.downloadTruncated', { count: data.items.length }));
        } catch (error) {
            toast.error(warehouseErrorText(error, 'warehouse.pdf.failed'), { id: toastId });
        } finally {
            setBusy(null);
        }
    };

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className={`ofi-wh-btn ofi-nosize ${anchor ? 'is-open' : ''}`}
                aria-haspopup="menu"
                aria-expanded={Boolean(anchor)}
                disabled={Boolean(busy)}
                onClick={() => setAnchor(anchor ? null : buttonRef.current)}
            >
                {busy ? <span className="ofi-wh-spinner" aria-hidden /> : <Download />}
                {t('warehouse.products.download')}
                <ChevronDown className="ofi-wh-btn__chevron" />
            </button>
            <PickerPanel anchorEl={anchor} onClose={() => setAnchor(null)} width={280} ariaLabel={t('warehouse.products.download')}>
                <div className="ofi-wh-picker__caption">{t('warehouse.products.downloadHint', { filter: filterLabel })}</div>
                <PickerRow
                    check={false}
                    selected={false}
                    onSelect={() => void run('labels')}
                    main={<span className="ofi-wh-menuitem"><Tags />{t('warehouse.products.downloadLabels')}</span>}
                    sub={t('warehouse.products.downloadLabelsHint')}
                />
                <PickerRow
                    check={false}
                    selected={false}
                    onSelect={() => void run('pdf')}
                    main={<span className="ofi-wh-menuitem"><FileText />{t('warehouse.products.downloadListPdf')}</span>}
                    sub={t('warehouse.products.downloadListPdfHint')}
                />
                <PickerRow
                    check={false}
                    selected={false}
                    onSelect={() => void run('excel')}
                    main={<span className="ofi-wh-menuitem"><FileSpreadsheet />{t('warehouse.products.downloadListExcel')}</span>}
                    sub={t('warehouse.products.downloadListExcelHint')}
                />
            </PickerPanel>
        </>
    );
};
