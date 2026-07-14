import { Clock } from '@/components/icons/antIconCompat';

import type { SlotDay } from '../utils/bookingSlotUtils';
import { formatSlotTimeRange } from '../utils/bookingSlotUtils';

interface SlotDayGroupProps {
    day: SlotDay;
    selectedSlotId: string;
    onSelect: (id: string) => void;
}

export const SlotDayGroup = ({ day, selectedSlotId, onSelect }: SlotDayGroupProps) => (
    <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Clock size={14} className="text-slate-400" />
            {day.label}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {day.slots.map((slot) => {
                const active = selectedSlotId === slot.id;
                return (
                    <button
                        key={slot.id}
                        type="button"
                        onClick={() => onSelect(slot.id)}
                        aria-pressed={active}
                        className={`rounded-md border px-3 py-2 text-center text-sm font-medium transition-colors ${
                            active
                                ? 'border-blue-700 bg-blue-50 text-blue-900'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        {formatSlotTimeRange(slot)}
                    </button>
                );
            })}
        </div>
    </div>
);
