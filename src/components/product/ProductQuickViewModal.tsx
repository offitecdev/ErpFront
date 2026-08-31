import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    ArrowRight,
    Image01 as ImageIcon,
    Package,
} from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Modal } from '@/components/ui-shared/Modal';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { articleApi } from '@/lib/api/inventory';
import { t } from '@/i18n/translate';
import type { ArticleStatus, InventoryArticle } from '@/types/inventory';
import { richTextToHtml } from '@/pages/sales/detail/TenderRichText';

// A single, reusable "quick view" for a product. Opened by the tag icon in the
// product lists (inventory list + tender picker). It is the one list-side place
// besides the detail screen where the product image is shown, so it fetches the
// full record by id (the list payloads no longer carry image data).
type ProductQuickViewModalProps = {
    articleId: string | null;
    onClose: () => void;
};

const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v);

const STATUS_VARIANT: Record<ArticleStatus, 'active' | 'passive' | 'info' | 'warning'> = {
    ACTIVE: 'active',
    INACTIVE: 'passive',
    IN_SUPPLY: 'warning',
    IN_PRODUCTION: 'info',
};

const statusLabel = (status: ArticleStatus): string => ({
    ACTIVE: t('common.active'),
    INACTIVE: t('common.inactive'),
    IN_SUPPLY: t('inventory.articles.statusSupply'),
    IN_PRODUCTION: t('inventory.articles.statusProduction'),
}[status]);

const InfoRow = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="grid grid-cols-[128px_minmax(0,1fr)] items-start gap-3 py-1.5 text-[12.5px]">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        <div className="font-medium text-slate-800">{value ?? '—'}</div>
    </div>
);

export const ProductQuickViewModal = ({ articleId, onClose }: ProductQuickViewModalProps) => {
    const navigate = useNavigate();
    const [article, setArticle] = useState<InventoryArticle | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!articleId) {
            setArticle(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setArticle(null);
        articleApi
            .getById(articleId)
            .then((data) => {
                if (!cancelled) setArticle(data);
            })
            .catch(() => {
                if (!cancelled) setArticle(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [articleId]);

    return (
        <Modal
            open={!!articleId}
            onClose={onClose}
            title={article?.name || t('common.detail')}
            description={article?.articleCode}
            width="lg"
            closeOnBackdrop
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
                    {article && (
                        <Button
                            variant="primary"
                            icon={<ArrowRight size={13} />}
                            onClick={() => {
                                onClose();
                                navigate(`/inventory/articles/${article.id}`);
                            }}
                        >
                            {t('common.detail')}
                        </Button>
                    )}
                </>
            }
        >
            {loading ? (
                <div className="h-64 animate-pulse rounded-md border border-slate-100 bg-slate-50" />
            ) : !article ? (
                <div className="px-4 py-10 text-center text-[13px] text-slate-400">{t('auto.urun_bulunamadi')}</div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="flex h-44 w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {article.imageUrl ? (
                            <img src={article.imageUrl} alt={article.name} className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex flex-col items-center gap-2 text-slate-300">
                                <ImageIcon size={34} />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 divide-y divide-slate-100">
                        <InfoRow label={t('auto.urun_adi')} value={article.name} />
                        <InfoRow label={t('auto.stok_kodu')} value={<span className="font-mono">{article.articleCode}</span>} />
                        <InfoRow
                            label={t('common.status')}
                            value={<StatusChip variant={STATUS_VARIANT[article.status]}>{statusLabel(article.status)}</StatusChip>}
                        />
                        <InfoRow label={t('auto.satis_fiyati')} value={<span className="font-mono">{fmtMoney(Number(article.salePrice || 0))}/{article.unit}</span>} />
                        <InfoRow label={t('common.category')} value={article.category || '—'} />
                        <InfoRow label={t('auto.barkod_seri_no')} value={<span className="font-mono">{article.systemBarcode || article.supplierBarcode || '—'}</span>} />
                        {article.description && (
                            <div className="py-2 text-[12.5px]">
                                <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                                    <Package size={12} />{t('common.description')}
                                </div>
                                <div
                                    className="leading-5 text-slate-700 [&_h1]:my-1 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:my-1 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:my-1 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:my-1 [&_h4]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                                    dangerouslySetInnerHTML={{ __html: richTextToHtml(article.description) }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
};
