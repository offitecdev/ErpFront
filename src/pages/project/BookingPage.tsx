import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { CalendarCheck01 as CalendarCheck, Clock } from '@untitledui/icons';
import { toast } from 'sonner';

import { Button } from '../../components/ui-shared/Button';
import { bookingApi } from '../../lib/api/project';
import type { AppointmentDto } from '../../types/project';

export const BookingPage = () => {
    const { token } = useParams();
    const [projectName, setProjectName] = useState('');
    const [slots, setSlots] = useState<AppointmentDto[]>([]);
    const [selected, setSelected] = useState('');
    const [done, setDone] = useState(false);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const startDate = dayjs().startOf('day').toISOString();
            const endDate = dayjs().add(21, 'day').endOf('day').toISOString();
            const res = await bookingApi.getSlots(token, startDate, endDate);
            setProjectName(res.projectName);
            setSlots(res.availableSlots);
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Randevu saatleri yuklenemedi.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [token]);

    const book = async () => {
        if (!token || !selected) return;
        setLoading(true);
        try {
            await bookingApi.book(token, selected);
            setDone(true);
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Bu saat alinamadi.');
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
                        <CalendarCheck size={15} />
                        Offitec ERP
                    </div>
                    <h1 className="text-2xl font-semibold">{done ? 'Randevunuz alindi' : 'Montaj randevusu secin'}</h1>
                    <p className="mt-2 text-sm text-slate-500">{projectName || 'Proje'} icin size uygun saatlerden birini secin.</p>
                </div>

                <div className="p-6">
                    {done ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                            Seciminiz kaydedildi. Bu saat artik diger musterilere kapatildi.
                        </div>
                    ) : (
                        <>
                            {loading && <div className="h-24 animate-pulse rounded bg-slate-100" />}
                            {!loading && slots.length === 0 && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                                    Su an musait saat bulunamadi. Lutfen firma ile iletisime gecin.
                                </div>
                            )}
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {slots.map((slot) => (
                                    <button
                                        key={slot.id}
                                        onClick={() => setSelected(slot.id)}
                                        className={`flex items-center justify-between rounded-md border px-3 py-3 text-left text-sm transition-colors ${selected === slot.id ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                    >
                                        <span>
                                            <span className="block font-medium">{dayjs(slot.startTime).format('DD.MM.YYYY')}</span>
                                            <span className="text-[12px] text-slate-500">{dayjs(slot.startTime).format('HH:mm')} - {dayjs(slot.endTime).format('HH:mm')}</span>
                                        </span>
                                        <Clock size={14} />
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {!done && (
                    <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                        <Button disabled={!selected} loading={loading} onClick={book}>Randevuyu Onayla</Button>
                    </div>
                )}
            </section>
        </main>
    );
};
