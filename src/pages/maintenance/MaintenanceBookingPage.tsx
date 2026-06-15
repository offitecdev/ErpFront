import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { CalendarCheck01 as CalendarCheck, Clock } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { Button } from '../../components/ui-shared/Button';
import { maintenanceApi } from '../../lib/api/maintenance';
import type { MaintenanceAppointmentOptionDto } from '../../types/maintenance';

import { t } from '@/i18n/translate';

export const MaintenanceBookingPage = () => {
    const { token } = useParams();
    const [title, setTitle] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [contractCode, setContractCode] = useState('');
    const [options, setOptions] = useState<MaintenanceAppointmentOptionDto[]>([]);
    const [selected, setSelected] = useState('');
    const [done, setDone] = useState(false);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await maintenanceApi.publicBookingOptions(token);
            setTitle(res.title ||t('auto.bakim_randevusu'));
            setCustomerName(res.customerName || '');
            setContractCode(res.contractCode || '');
            setOptions(res.options || []);
            if (selected && !(res.options || []).some((option) => option.id === selected && option.isAvailable !== false)) {
                setSelected('');
            }
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.randevu_onerileri_yuklenemedi'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [token]);

    const confirm = async () => {
        if (!token || !selected) return;
        const selectedOption = options.find((option) => option.id === selected);
        if (selectedOption?.isAvailable === false) return toast.error(selectedOption.unavailableReason ||t('auto.bu_randevu_artik_uygun_degil'));
        setLoading(true);
        try {
            await maintenanceApi.confirmPublicBooking(token, selected);
            setDone(true);
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.bu_randevu_onaylanamadi'));
            await load();
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-8 font-sans text-slate-900">
            <section className="mx-auto max-w-3xl rounded-md border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-6 py-5">
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-blue-700">
                        <CalendarCheck size={15} />{t('auto.offitec_erp')}</div>
                    <h1 className="text-2xl font-semibold">{done ?t('auto.randevunuz_onaylandi') :t('auto.bakim_randevusu_secin')}</h1>
                    <p className="mt-2 text-sm text-slate-500">
                        {t('auto.booking_intro', { target: [contractCode, customerName, title].filter(Boolean).join(' · ') ||t('nav.maintenance') })}</p>
                </div>

                <div className="p-6">
                    {done ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{t('auto.seciminiz_kaydedildi_bakim_ekibi_onaylanan_rande')}</div>
                    ) : (
                        <>
                            {loading && <div className="h-24 animate-pulse rounded bg-slate-100" />}
                            {!loading && options.length === 0 && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{t('auto.su_an_onaylanabilir_randevu_onerisi_bulunamadi')}</div>
                            )}
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {options.map((option) => {
                                    const disabled = option.isAvailable === false;
                                    return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => !disabled && setSelected(option.id)}
                                        className={`flex items-center justify-between rounded-md border px-3 py-3 text-left text-sm transition-colors ${disabled ?t('auto.cursor_not_allowed_border_slate_200_bg_slate_100') : selected === option.id ?"border-blue-700 bg-blue-50 text-blue-900" :"border-slate-200 bg-white hover:bg-slate-50"}`}
                                    >
                                        <span>
                                            <span className="block font-medium">{dayjs(option.startTime).format('DD.MM.YYYY')}</span>
                                            <span className="text-[12px] text-slate-500">{dayjs(option.startTime).format('HH:mm')} - {dayjs(option.endTime).format('HH:mm')}</span>
                                            {disabled && <span className="mt-1 block text-[11px] font-medium text-rose-600">{option.unavailableReason ||t('auto.bu_saat_doldu')}</span>}
                                        </span>
                                        <Clock size={14} />
                                    </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {!done && (
                    <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                        <Button disabled={!selected} loading={loading} onClick={confirm}>{t('auto.randevuyu_onayla')}</Button>
                    </div>
                )}
            </section>
        </main>
    );
};
