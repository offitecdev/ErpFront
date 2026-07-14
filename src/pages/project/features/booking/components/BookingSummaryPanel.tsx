import { CalendarCheck01 as CalendarCheck, Clock } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { t } from '@/i18n/translate';
import type { AppointmentDto } from '@/types/project';

import { formatSlotDate, formatSlotTimeRange } from '../utils/bookingSlotUtils';

interface BookingSummaryPanelProps {
    projectName: string;
    selectedSlot: AppointmentDto | null;
    loading: boolean;
    onConfirm: () => void;
}

export const BookingSummaryPanel = ({ projectName, selectedSlot, loading, onConfirm }: BookingSummaryPanelProps) => (
    <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur sm:top-6 sm:rounded-md sm:border sm:shadow-sm">
        <div className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
            {t('auto.randevu_ozeti')}
        </div>

        {selectedSlot ? (
            <dl className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-700">
                    <CalendarCheck size={15} className="text-blue-700" />
                    <span className="font-medium">{formatSlotDate(selectedSlot.startTime)}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                    <Clock size={15} className="text-blue-700" />
                    <span className="font-medium">{formatSlotTimeRange(selectedSlot)}</span>
                </div>
                {projectName && <div className="text-slate-500">{projectName}</div>}
            </dl>
        ) : (
            <p className="text-sm text-slate-500">{t('auto.henuz_bir_saat_secmediniz')}</p>
        )}

        <Button
            className="mt-4 w-full"
            disabled={!selectedSlot}
            loading={loading}
            onClick={onConfirm}
        >
            {t('auto.randevuyu_onayla')}
        </Button>
    </div>
);
