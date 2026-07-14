import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { ArrowLeft } from '@/components/icons/antIconCompat';
import i18n from '@/i18n';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { useTenderStore } from '../../store/tenderStore';
import { useAuthStore } from '../../store/authStore';
import { apiClient } from '../../lib/axios';

const suggestTenderNumber = () => {
    const year = dayjs().year();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    // Language-specific document initial: A(ngebot) for German, O(ffer) for
    // English — e.g. "A-2026-4474". Anything else falls back to the German
    // offer prefix so a tender number never carries a non-offer code.
    const lang = (i18n.language || '').split('-')[0];
    const prefix = lang === 'en' ? 'O' : 'A';
    return `${prefix}-${year}-${rand}`;
};

const defaultTenderValidUntil = () => dayjs().add(1, 'month').format('YYYY-MM-DD');

/**
 * Dedicated route for `/crm/tenders/new`. Auto-creates a draft tender (falling
 * back to the first available customer if the backend requires one) and then
 * redirects to the real detail page. Kept separate from TenderDetail so the
 * detail component only ever renders an existing tender.
 */
export const TenderCreate = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    // Optional: pre-link the new quote to a specific customer (e.g. when launched
    // from that customer's panel via `/crm/tenders/new?customerId=<id>`).
    const customerId = searchParams.get('customerId') || undefined;
    const { permissions } = useAuthStore();
    const canManage = permissions.length === 0 || permissions.includes('tenders.manage');
    const { createTender } = useTenderStore();
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current) return;
        if (!canManage) {
            toast.error(t('tenders.bu_action_icin_yetkiniz_not_found'));
            navigate('/crm/tenders', { replace: true });
            return;
        }
        startedRef.current = true;

        const validUntil = defaultTenderValidUntil();
        const tenderNumber = suggestTenderNumber();

        createTender({ tenderNumber, format: 'SIA451', validUntil, customerId })
            .then((created) => {
                toast.success(t('tenders.tender_taslagi_created', { number: tenderNumber }));
                navigate(`/crm/tenders/${created.id}`, { replace: true });
            })
            .catch(async (error: any) => {
                const message = String(error.response?.data?.error || '');
                const needsCustomerFallback = error.response?.status === 400 && /müşteri|musteri|customer/i.test(message);
                if (needsCustomerFallback) {
                    try {
                        const res = await apiClient.get('/customers?page=1&pageSize=200');
                        const customers = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
                        const fallbackCustomer = customers[0];
                        if (!fallbackCustomer) throw new Error(t('tenders.customer_not_found'));
                        const created = await createTender({
                            customerId: fallbackCustomer.id,
                            tenderNumber,
                            format: 'SIA451',
                            validUntil,
                        });
                        toast.success(t('tenders.tender_taslagi_created', { number: tenderNumber }));
                        navigate(`/crm/tenders/${created.id}`, { replace: true });
                        return;
                    } catch (fallbackError: any) {
                        error = fallbackError;
                    }
                }
                startedRef.current = false;
                toast.error(error.response?.data?.error || error.message || t('tenders.tender_olusturulamadi'));
                navigate('/crm/tenders', { replace: true });
            });
    }, [canManage, createTender, navigate, t, customerId]);

    return (
        <div>
            <PageHeader
                breadcrumb={t('tenders.crm_teklif_yeni')}
                title={t('tenders.new_tender')}
                actions={
                    <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/crm/tenders')}>{t('tenders.list_back')}</Button>
                }
            />
            <div className="flex min-h-[360px] items-center justify-center rounded-md border border-slate-200 bg-white">
                <div className="w-full max-w-sm rounded-md border border-slate-200 bg-white px-6 py-5 text-center">
                    <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-[#1f2654]/10">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654]" />
                    </div>
                    <div className="text-[14px] font-semibold text-slate-900">{t('tenders.tender_olusturuluyor')}</div>
                    <div className="mt-1 text-[12px] text-slate-500">{t('tenders.empty_taslak_hazirlaniyor')}</div>
                </div>
            </div>
        </div>
    );
};

export default TenderCreate;
