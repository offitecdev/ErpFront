import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Plus } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { Pager, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { InteractionRows } from '../components/InteractionRows';
import { QuickEntrySheet } from '../components/QuickEntrySheet';
import { useCrmPagedList } from '../hooks/useCrmPagedList';
import { CUSTOMER_ADD_ROW_BUTTON_CLASS } from './customerDetail.constants';
import type { CrmInteractionRow } from '../types/crm.types';

/**
 * Interaktionsverlauf EINES Kunden — dieselbe vereinte Sicht wie die
 * modulweite Liste (Schnellerfassung/Verlauf + Notizen + Aktivitäten der
 * Kundenakte), hier auf den Kunden gefiltert. Damit taucht ein per
 * Schnellerfassung erfasstes Telefonat auch in der Kundenakte auf, und eine
 * im Reiter "Notizen" erfasste Notiz steht im modulweiten Verlauf — ohne
 * Abgleich, es ist dieselbe Abfrage.
 *
 * Löschen entfernt die Zeile örtlich; die Reiter "Notizen"/"Aktivitäten"
 * laden ihre eigenen Zeilen beim nächsten Öffnen selbst.
 */
const PAGE_SIZE = 10;

export const CustomerCommunicationTable = ({ customerId }: { customerId: string }) => {
    const [quickOpen, setQuickOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<CrmInteractionRow | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetcher = useCallback(
        (page: number) => crmApi.listInteractions({ customerId, page, pageSize: PAGE_SIZE }),
        [customerId],
    );
    const { rows, total, page, totalPages, loading, setPage, reload, removeRow } = useCrmPagedList<CrmInteractionRow>({
        fetcher,
        filterKey: customerId,
        pageSize: PAGE_SIZE,
        errorMessageKey: 'crm.comm.errorLoad',
    });

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        const target = pendingDelete;
        try {
            setDeleting(true);
            await crmApi.deleteInteraction(target);
            setPendingDelete(null);
            removeRow((row) => row.key === target.key);
        } catch {
            toast.error(t('crm.comm.deleteError'));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <SectionCard title={`${t('nav.crmCommunication')} (${total})`}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col style={{ width: 116 }} />
                        <col style={{ width: 124 }} />
                        <col style={{ width: 176 }} />
                        <col />
                        <col style={{ width: 160 }} />
                        <col style={{ width: 56 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('common.date')}</th>
                            <th className="text-left">{t('crm.comm.colType')}</th>
                            <th className="text-left">{t('crm.quick.contact')}</th>
                            <th className="text-left">{t('crm.comm.colNote')}</th>
                            <th className="text-left">{t('crm.comm.colEmployee')}</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || rows.length === 0) && (
                            <TableStateRow colSpan={6} loading={loading} emptyText={t('crm.comm.empty')} />
                        )}
                        {!loading && <InteractionRows rows={rows} showCustomer={false} onDelete={setPendingDelete} />}
                    </tbody>
                </table>
                <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/10">
                    <button type="button" onClick={() => setQuickOpen(true)} className={CUSTOMER_ADD_ROW_BUTTON_CLASS}>
                        <Plus size={13} />
                        {t('crm.comm.newEntry')}
                    </button>
                    <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
                </div>
            </SectionCard>

            <QuickEntrySheet open={quickOpen} action="PHONE" onClose={() => setQuickOpen(false)} onSaved={reload} />

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title={t('crm.comm.deleteTitle')}
                message={pendingDelete?.note}
                tone="danger"
                busy={deleting}
                confirmLabel={t('common.delete')}
                onConfirm={() => void confirmDelete()}
                onCancel={() => setPendingDelete(null)}
            />
        </>
    );
};
