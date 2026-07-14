import { CheckCircle } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

export const BookingSuccessState = () => (
    <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <CheckCircle size={18} className="mt-0.5 shrink-0 text-emerald-600" />
        <span>{t('auto.seciminiz_kaydedildi_bu_saat_artik_diger_musteri')}</span>
    </div>
);
