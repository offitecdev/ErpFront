import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { CalendarCheck01 as CalendarCheck, Clock, XClose } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { Button } from '../../components/ui-shared/Button';
import { Textarea } from '../../components/ui-shared/Field';
import { maintenanceApi } from '../../lib/api/maintenance';
import type { MaintenanceAppointmentOptionDto } from '../../types/maintenance';

import { t } from '@/i18n/translate';

const DISAPPROVE = '__disapprove__';

export const MaintenanceBookingPage = () => {
    const { token } = useParams();
    const [title, setTitle] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [contractCode, setContractCode] = useState('');
    const [options, setOptions] = useState<MaintenanceAppointmentOptionDto[]>([]);
    const [selected, setSelected] = useState('');
    const [reason, setReason] = useState('');
    const [done, setDone] = useState<'' | 'approved' | 'disapproved'>('');
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
            if (selected && selected !== DISAPPROVE && !(res.options || []).some((option) => option.id === selected && option.isAvailable !== false)) {
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
        if (selected === DISAPPROVE) {
            setLoading(true);
            try {
                await maintenanceApi.disapprovePublicBooking(token, reason.trim() || undefined);
                setDone('disapproved');
            } catch (error: any) {
                toast.error(error.response?.data?.error ||t('auto.red_gonderilemedi'));
                await load();
            } finally {
                setLoading(false);
            }
            return;
        }
        const selectedOption = options.find((option) => option.id === selected);
        if (selectedOption?.isAvailable === false) return toast.error(selectedOption.unavailableReason ||t('auto.bu_randevu_artik_uygun_degil'));
        setLoading(true);
        try {
            await maintenanceApi.confirmPublicBooking(token, selected);
            setDone('approved');
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
                    <h1 className="text-2xl font-semibold">{done === 'approved' ?t('auto.randevunuz_onaylandi') : done === 'disapproved' ?t('auto.geri_bildiriminiz_iletildi') :t('auto.bakim_randevusu_secin')}</h1>
                    <p className="mt-2 text-sm text-slate-500">
                        {t('auto.booking_intro', { target: [contractCode, customerName, title].filter(Boolean).join(' · ') ||t('nav.maintenance') })}</p>
                </div>

                <div className="p-6">
                    {done === 'approved' ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{t('auto.seciminiz_kaydedildi_bakim_ekibi_onaylanan_rande')}</div>
                    ) : done === 'disapproved' ? (
                        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">{t('auto.red_geri_bildiriminiz_alindi')}</div>
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

                            {!loading && (
                                <div className="mt-4 border-t border-slate-100 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setSelected(selected === DISAPPROVE ? '' : DISAPPROVE)}
                                        className={`flex w-full items-center justify-between rounded-md border px-3 py-3 text-left text-sm transition-colors ${selected === DISAPPROVE ?"border-rose-300 bg-rose-50 text-rose-800" :"border-slate-200 bg-white hover:bg-slate-50"}`}
                                    >
                                        <span>
                                            <span className="block font-medium">{t('auto.randevu_onerilerini_reddet')}</span>
                                            <span className="text-[12px] text-slate-500">{t('auto.randevu_red_aciklamasi')}</span>
                                        </span>
                                        <XClose size={16} />
                                    </button>
                                    {selected === DISAPPROVE && (
                                        <div className="mt-2">
                                            <Textarea
                                                rows={3}
                                                value={reason}
                                                placeholder={t('auto.red_nedeni_opsiyonel')}
                                                onChange={(event) => setReason(event.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {!done && (
                    <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                        <Button
                            disabled={!selected}
                            loading={loading}
                            variant={selected === DISAPPROVE ? 'danger' : 'primary'}
                            onClick={confirm}
                        >{selected === DISAPPROVE ?t('auto.yoneticiye_bildir') :t('auto.randevuyu_onayla')}</Button>
                    </div>
                )}
            </section>
        </main>
    );
};
