import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { bookingApi } from '@/lib/api/project';
import type { AppointmentDto } from '@/types/project';

import { getBookingRange } from '../utils/bookingSlotUtils';

export interface UsePublicBookingSlots {
    /** 'book' = customer picks a slot; 'scheduled' = installations already planned (read-only). */
    mode: 'book' | 'scheduled';
    projectName: string;
    slots: AppointmentDto[];
    scheduledAppointments: AppointmentDto[];
    selectedSlotId: string;
    selectedSlot: AppointmentDto | null;
    done: boolean;
    loading: boolean;
    error: string;
    load: () => Promise<void>;
    selectSlot: (id: string) => void;
    book: () => Promise<void>;
}

/**
 * Owns all data + interaction state for the public booking screen:
 * loading available slots, selecting one, and confirming the booking.
 * The token comes in as a parameter so the hook stays route-agnostic.
 */
export const usePublicBookingSlots = (token: string | undefined): UsePublicBookingSlots => {
    const [mode, setMode] = useState<'book' | 'scheduled'>('book');
    const [projectName, setProjectName] = useState('');
    const [slots, setSlots] = useState<AppointmentDto[]>([]);
    const [scheduledAppointments, setScheduledAppointments] = useState<AppointmentDto[]>([]);
    const [selectedSlotId, setSelectedSlotId] = useState('');
    const [done, setDone] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError('');
        try {
            const { startDate, endDate } = getBookingRange();
            const res = await bookingApi.getSlots(token, startDate, endDate);
            setMode(res.mode);
            setProjectName(res.projectName);
            setSlots(res.availableSlots || []);
            setScheduledAppointments(res.scheduledAppointments || []);
        } catch (e: any) {
            const message = e.response?.data?.error || t('auto.randevu_saatleri_yuklenemedi');
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        void load();
    }, [load]);

    const selectSlot = useCallback((id: string) => setSelectedSlotId(id), []);

    const book = useCallback(async () => {
        if (!token || !selectedSlotId) return;
        setLoading(true);
        try {
            await bookingApi.book(token, selectedSlotId);
            setDone(true);
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('auto.bu_saat_alinamadi'));
            await load();
        } finally {
            setLoading(false);
        }
    }, [token, selectedSlotId, load]);

    const selectedSlot = useMemo(
        () => slots.find((slot) => slot.id === selectedSlotId) ?? null,
        [slots, selectedSlotId],
    );

    return {
        mode,
        projectName,
        slots,
        scheduledAppointments,
        selectedSlotId,
        selectedSlot,
        done,
        loading,
        error,
        load,
        selectSlot,
        book,
    };
};
