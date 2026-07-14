import { Calendar } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

export const BookingEmptyState = () => (
    <div className="flex flex-col items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-6 py-10 text-center">
        <Calendar size={28} className="text-amber-500" />
        <p className="text-sm font-medium text-amber-800">
            {t('auto.su_an_musait_saat_bulunamadi_lutfen_firma_ile_il')}
        </p>
    </div>
);
