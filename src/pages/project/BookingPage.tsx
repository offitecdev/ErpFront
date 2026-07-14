import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { BookingEmptyState } from './features/booking/components/BookingEmptyState';
import { BookingSuccessState } from './features/booking/components/BookingSuccessState';
import { BookingSummaryPanel } from './features/booking/components/BookingSummaryPanel';
import { PublicBookingHeader } from './features/booking/components/PublicBookingHeader';
import { ScheduledInstallations } from './features/booking/components/ScheduledInstallations';
import { SlotDayGroup } from './features/booking/components/SlotDayGroup';
import { usePublicBookingSlots } from './features/booking/hooks/usePublicBookingSlots';
import { groupSlotsByDay } from './features/booking/utils/bookingSlotUtils';
import { t } from '@/i18n/translate';

const SlotSkeleton = () => (
    <div className="space-y-6">
        {[0, 1].map((group) => (
            <div key={group}>
                <div className="mb-3 h-4 w-32 animate-pulse rounded bg-slate-100" />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[0, 1, 2, 3].map((cell) => (
                        <div key={cell} className="h-10 animate-pulse rounded-md bg-slate-100" />
                    ))}
                </div>
            </div>
        ))}
    </div>
);

export const BookingPage = () => {
    const { token } = useParams();
    const { mode, projectName, slots, scheduledAppointments, selectedSlot, selectSlot, done, loading, book } = usePublicBookingSlots(token);

    // 'scheduled' = installations are already planned; show them read-only with no
    // slot picker or confirm panel. 'book' = the original customer slot-picking flow.
    const scheduled = mode === 'scheduled';
    const days = useMemo(() => groupSlotsByDay(slots), [slots]);
    const showSummary = !scheduled && !done && (loading || slots.length > 0);

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-8 font-sans text-slate-900">
            <section className="mx-auto max-w-4xl overflow-hidden rounded-md border border-slate-200 bg-white">
                <PublicBookingHeader projectName={projectName} done={done} />

                <div className="grid gap-6 p-6 lg:grid-cols-[1fr_18rem]">
                    <div>
                        {scheduled ? (
                            loading && scheduledAppointments.length === 0 ? (
                                <SlotSkeleton />
                            ) : (
                                <ScheduledInstallations appointments={scheduledAppointments} />
                            )
                        ) : done ? (
                            <BookingSuccessState />
                        ) : loading && slots.length === 0 ? (
                            <SlotSkeleton />
                        ) : slots.length === 0 ? (
                            <BookingEmptyState />
                        ) : (
                            <div className="space-y-6">
                                <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                                    {t('auto.musait_saatler')}
                                </div>
                                {days.map((day) => (
                                    <SlotDayGroup
                                        key={day.key}
                                        day={day}
                                        selectedSlotId={selectedSlot?.id ?? ''}
                                        onSelect={selectSlot}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {showSummary && (
                        <BookingSummaryPanel
                            projectName={projectName}
                            selectedSlot={selectedSlot}
                            loading={loading}
                            onConfirm={book}
                        />
                    )}
                </div>
            </section>
        </main>
    );
};
