import { create } from 'zustand';
import { apiClient } from '../lib/axios';

export type BreakPeriodDto = { start: string; end: string | null };

function parseBreakPeriods(raw: unknown): BreakPeriodDto[] {
    if (!Array.isArray(raw)) return [];
    const out: BreakPeriodDto[] = [];
    for (const item of raw) {
        if (item && typeof item === 'object' && typeof (item as BreakPeriodDto).start === 'string') {
            const end = (item as BreakPeriodDto).end;
            out.push({ start: (item as BreakPeriodDto).start, end: typeof end === 'string' ? end : null });
        }
    }
    return out;
}

export type AttendanceRecentRow = {
    id: string;
    logDate: string;
    checkInTime: string;
    checkOutTime: string | null;
    netWorkSeconds: number | null;
};

interface AttendanceState {
    isAttendanceLoading: boolean;
    /** true = bu an aktif bir seans var (henüz check-out yapılmamış) */
    isCheckedIn: boolean;
    /** isCheckedOut UI'da artık kullanılmıyor; uyumluluk için tutuldu */
    isCheckedOut: boolean;
    checkInTime: number | null;
    breakPeriods: BreakPeriodDto[];
    netWorkSeconds: number | null;
    stationQrPayload: string | null;
    recentLogs: AttendanceRecentRow[];
    fetchTodayAttendance: () => Promise<void>;
    processCheckIn: (qrPayload: string) => Promise<void>;
    processCheckOut: (qrPayload: string) => Promise<void>;
    startBreak: () => Promise<void>;
    endBreak: () => Promise<void>;
}

const IDLE = {
    isCheckedIn: false,
    isCheckedOut: false,
    checkInTime: null,
    breakPeriods: [] as BreakPeriodDto[],
    netWorkSeconds: null,
};

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
    isAttendanceLoading: true,
    ...IDLE,
    stationQrPayload: null,
    recentLogs: [],

    fetchTodayAttendance: async () => {
        try {
            set({ isAttendanceLoading: true });
            const res  = await apiClient.get('/attendance/me/today');
            const row  = res.data as Record<string, unknown>;

            const stationQrPayload = typeof row.stationQrPayload === 'string' ? row.stationQrPayload : null;
            const recentLogs       = Array.isArray(row.recentLogs) ? (row.recentLogs as AttendanceRecentRow[]) : [];

            /* Yalnızca checkOutTime olmayan (aktif) seans gösterilir.
               Kapalı seans varsa IDLE'a düşüp yeni seans başlatılabilir. */
            if (row.checkInTime && !row.checkOutTime) {
                set({
                    isCheckedIn: true,
                    isCheckedOut: false,
                    checkInTime: new Date(row.checkInTime as string).getTime(),
                    breakPeriods: parseBreakPeriods(row.breakPeriodsJson),
                    netWorkSeconds: typeof row.netWorkSeconds === 'number' ? row.netWorkSeconds : null,
                    stationQrPayload,
                    recentLogs,
                });
            } else {
                /* Seans yok ya da kapandı → hazır duruma geç */
                set({ ...IDLE, stationQrPayload, recentLogs });
            }
        } catch (e) {
            console.error('Attendance fetch error', e);
        } finally {
            set({ isAttendanceLoading: false });
        }
    },

    processCheckIn: async (qrPayload) => {
        await apiClient.post('/attendance/check-in', { qrPayload });
        await get().fetchTodayAttendance();
    },

    processCheckOut: async (qrPayload) => {
        await apiClient.post('/attendance/check-out', { qrPayload });
        await get().fetchTodayAttendance();
    },

    startBreak: async () => {
        await apiClient.post('/attendance/break/start');
        await get().fetchTodayAttendance();
    },

    endBreak: async () => {
        await apiClient.post('/attendance/break/end');
        await get().fetchTodayAttendance();
    },
}));
