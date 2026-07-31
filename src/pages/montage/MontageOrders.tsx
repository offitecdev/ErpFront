import { useNavigate } from 'react-router-dom';

import { Clipboard } from '@/components/icons/antIconCompat';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { t } from '@/i18n/translate';

import { MontageHeader } from './components/MontageHeader';
import { MontagePager } from './components/MontagePager';
import { OrdersTable } from './components/OrdersTable';
import { useMontageOrdersPaged } from './hooks/useMontageOrdersPaged';

const OrdersPage = ({ mode }: { mode: 'active' | 'completed' }) => {
    const navigate = useNavigate();
    // Sunucuda sayfalanır: her sayfa yalnızca 10 satırlık tablo verisi indirir.
    const { rows, total, loading, page, setPage } = useMontageOrdersPaged(mode);

    return (
        <div className="space-y-4">
            <MontageHeader
                title={t(mode === 'active' ? 'montage.home.active' : 'montage.home.completed')}
                subtitle={t('montage.orders.count', { count: total })}
                backTo="/montage"
            />
            {loading ? (
                // Belirgin yükleme göstergesi: spinner + etiket (sessiz gri blok değil).
                <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-[3px] border border-slate-200 bg-white dark:border-white/10 dark:bg-[#17191c]">
                    <span
                        aria-hidden
                        className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654] dark:border-white/15 dark:border-t-white"
                    />
                    <span className="text-[13px] text-slate-500 dark:text-slate-400">{t('common.loading')}</span>
                </div>
            ) : rows.length === 0 ? (
                <EmptyState icon={<Clipboard size={30} />} title={t('projects.montaj_yok')} description={t('montage.orders.empty')} />
            ) : (
                <>
                    {/* Completed page also shows the customer-signature state per row. */}
                    <OrdersTable
                        rows={rows}
                        onOpen={(row) => {
                            if (mode === 'completed' && row.fieldReportId) {
                                navigate(`/montage/reports/view/field/${row.fieldReportId}?from=completed`);
                                return;
                            }
                            if (mode === 'active') navigate(`/montage/orders/${row.id}`);
                        }}
                        showSignature={mode === 'completed'}
                    />
                    <MontagePager page={page} total={total} pageSize={mode === 'completed' ? 5 : 10} onPage={setPage} />
                </>
            )}
        </div>
    );
};

export const MontageActiveOrders = () => <OrdersPage mode="active" />;
export const MontageCompletedOrders = () => <OrdersPage mode="completed" />;
