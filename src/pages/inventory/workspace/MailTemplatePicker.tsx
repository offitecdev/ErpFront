import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { readQuery } from '@/lib/api/queryCache';
import { t } from '@/i18n/translate';
import type { PurchaseOrderTextTemplatePage } from '@/types/inventory';
import '@/styles/mailTemplatePicker.css';

/** Shared tenant templates, also available when composing from production. */
export const MailTemplatePicker = ({ disabled, onApply }: { disabled?: boolean; onApply: (content: string) => void }) => {
    const [page, setPage] = useState(1);
    const [data, setData] = useState<PurchaseOrderTextTemplatePage | null>(null);
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        setData(null);
        setError(false);
        return readQuery(`purchase:mail-texts:${page}`, () => purchaseOrdersApi.listTextTemplates(page, 15), { freshMs: 30_000, tags: ['catalog'] }, setData, () => setError(true));
    }, [page, retry]);
    return <div className="ofi-mail-template">
        <label>
            <span>{t('productionBom.purchasing.mailTemplate')}</span>
            <select aria-label={t('productionBom.purchasing.mailTemplate')} disabled={disabled || !data?.items.length} value="" onChange={(event) => {
                const item = data?.items.find((entry) => entry.id === event.target.value);
                if (item) onApply(item.content ?? '');
            }}>
                <option value="">{t(error ? 'productionBom.purchasing.templateError' : !data ? 'productionBom.common.loading' : data.items.length ? 'productionBom.purchasing.chooseTemplate' : 'inv.orders.coverLetter.empty')}</option>
                {data?.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
        </label>
        {error && <button type="button" onClick={() => setRetry((value) => value + 1)}>{t('common.retry')}</button>}
        {(page > 1 || (data?.total ?? 0) > 15) && <>
            <button type="button" disabled={disabled || page <= 1} aria-label={t('inv.orders.coverLetter.prev')} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={15} /></button>
            <span>{page}</span>
            <button type="button" disabled={disabled || !data || page * 15 >= data.total} aria-label={t('inv.orders.coverLetter.next')} onClick={() => setPage((value) => value + 1)}><ChevronRight size={15} /></button>
        </>}
    </div>;
};
