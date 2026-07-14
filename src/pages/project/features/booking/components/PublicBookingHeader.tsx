import { CalendarCheck01 as CalendarCheck } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

interface PublicBookingHeaderProps {
    projectName: string;
    done: boolean;
}

export const PublicBookingHeader = ({ projectName, done }: PublicBookingHeaderProps) => (
    <div className="border-b border-slate-100 px-6 py-5">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-blue-700">
            <CalendarCheck size={15} />
            {t('auto.offitec_erp')}
        </div>
        <h1 className="text-2xl font-semibold">
            {done ? t('auto.randevunuz_alindi') : t('auto.montaj_randevusu_secin')}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
            {projectName || t('nav.projects')}
            {t('auto.icin_size_uygun_saatlerden_birini_secin')}
        </p>
    </div>
);
