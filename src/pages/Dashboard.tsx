import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CalendarDate as CalendarDays, CheckCircle, Clipboard, Clock, ClockSnooze as Coffee, QrCode01 as QrCode } from '@/components/icons/antIconCompat';
import dayjs from 'dayjs';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

import { useAttendanceStore } from '../store/attendanceStore';
import { useAuthStore } from '../store/authStore';
import { QRScanner } from '../components/QRScanner';
import { PageHeader } from '../components/layout/PageHeader';
import { StatusBadge } from '../components/ui-shared/StatusBadge';
import type { BreakPeriodDto } from '../store/attendanceStore';


/* ── Yardımcılar ── */
function netMs(checkIn: number, periods: BreakPeriodDto[], now: number) {
    let brk = 0;
    let openStart: number | null = null;
    for (const p of periods) {
        const s = new Date(p.start).getTime();
        if (p.end) brk += new Date(p.end).getTime() - s;
        else openStart = s;
    }
    return Math.max(0, (openStart ?? now) - checkIn - brk);
}

function fHMS(ms: number) {
    const t = Math.floor(ms / 1000);
    return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60]
        .map(n => String(n).padStart(2, '0')).join(':');
}

function fDt(iso?: string | null) {
    return iso ? dayjs(iso).format("DD.MM.YYYY HH:mm") : '—';
}

export const Dashboard = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [now, setNow] = useState(Date.now);
    const [code, setCode] = useState('');
    const { user, permissions } = useAuthStore();

    const {
        isCheckedIn, checkInTime, breakPeriods,
        stationQrPayload, recentLogs,
        processCheckIn, startBreak, endBreak,
    } = useAttendanceStore();

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const isOnBreak = breakPeriods.some(p => !p.end);
    const liveMs = checkInTime ? netMs(checkInTime, breakPeriods, now) : 0;
    const isTechnician = user?.roleName?.toLowerCase().includes('teknisyen')
        || user?.employeeRoles?.some((r: any) => r.role?.roleName?.toLowerCase().includes('teknisyen'));
    const canOpenProjectInstallations = isTechnician && (
        permissions.length === 0
        || permissions.includes('projects.report')
        || permissions.includes('maintenance.tasks.manage')
    );
    const formatDuration = (sec: number | null) => {
        if (sec == null) return t('common.none');
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return h > 0 ? t('common.hm', { h, m }) : t('common.mOnly', { m });
    };

    const scan = async (raw: string) => {
        const v = raw.trim();
        if (!v) return;
        try {
            await processCheckIn(v);
            toast.success(isCheckedIn ? t('dashboard.sessionClosed') : t('dashboard.attendanceStarted'));
            setCode('');
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } } };
            toast.error(e.response?.data?.error ?? t('dashboard.operationFailed'));
        }
    };

    const doBreak = async (start: boolean) => {
        try {
            if (start) {
                await startBreak();
                toast.success(t('dashboard.breakStarted'));
            } else {
                await endBreak();
                toast.success(t('dashboard.breakEnded'));
            }
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } } };
            toast.error(e.response?.data?.error ?? t('dashboard.actionFailed'));
        }
    };

    let statusBadge = null;
    if (isCheckedIn && isOnBreak) {
        statusBadge = <StatusBadge variant="warning">{t('dashboard.onBreak')}</StatusBadge>;
    } else if (isCheckedIn) {
        statusBadge = <StatusBadge variant="active">{t('dashboard.activeSession')}</StatusBadge>;
    } else {
        statusBadge = <StatusBadge variant="passive">{t('dashboard.ready')}</StatusBadge>;
    }

    return (
        <div>
            <PageHeader
                title={t('dashboard.title')}
                description={t('dashboard.greeting', { firstName: user?.firstName ?? '', date: dayjs().format("DD MMMM YYYY") })}
                actions={statusBadge}
            />

            {canOpenProjectInstallations && (
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button
                        type="button"
                        onClick={() => navigate('/projects/installation/calendar')}
                        className="flex items-center justify-between rounded-md border border-slate-200/70 bg-white px-4 py-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50"
                    >
                        <span>
                            <span className="block text-[13px] font-semibold text-slate-900">{t('dashboard.techCalendar')}</span>
                            <span className="mt-0.5 block text-[12px] text-slate-500">{t('dashboard.techCalendarSub')}</span>
                        </span>
                        <CalendarDays size={18} className="text-blue-700" />
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/projects/installation/tasks')}
                        className="flex items-center justify-between rounded-md border border-slate-200/70 bg-white px-4 py-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50"
                    >
                        <span>
                            <span className="block text-[13px] font-semibold text-slate-900">{t('dashboard.myInstallations')}</span>
                            <span className="mt-0.5 block text-[12px] text-slate-500">{t('dashboard.myInstallationsSub')}</span>
                        </span>
                        <Clipboard size={18} className="text-blue-700" />
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">

                {/* Sol + Orta */}
                <div className="xl:col-span-2 flex flex-col gap-4 min-w-0">

                    {/* Timer Card */}
                    <div className="bg-white border border-slate-200/70 rounded-md">
                        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Clock size={13} className="text-slate-400" />
                                <span className="text-[12.5px] font-semibold text-slate-700">{t('dashboard.currentSession')}</span>
                            </div>
                            {statusBadge}
                        </div>

                        <div className="px-5 py-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                            <div className="min-w-0">
                                {isCheckedIn ? (
                                    <>
                                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                            {t('dashboard.netWorkTime')}
                                        </div>
                                        <div className={`text-[40px] font-bold font-mono tracking-tight leading-none ${
                                            isOnBreak ? 'text-amber-600' : 'text-slate-900'
                                        }`}>
                                            {fHMS(liveMs)}
                                        </div>
                                        {isOnBreak && (
                                            <div className="mt-1.5 text-[11px] text-amber-700 flex items-center gap-1">
                                                <Coffee size={11} /> {t('dashboard.timePaused')}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-[12.5px] text-slate-500 leading-relaxed">
                                        {t('dashboard.notCounting')}<br />
                                        <span className="text-slate-700">{t('dashboard.scanToStart')}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-1.5 flex-wrap">
                                <button
                                    onClick={() => doBreak(true)}
                                    disabled={!isCheckedIn || isOnBreak}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Coffee size={12} /> {t('dashboard.goOnBreak')}
                                </button>
                                <button
                                    onClick={() => doBreak(false)}
                                    disabled={!isCheckedIn || !isOnBreak}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <CheckCircle size={12} /> {t('dashboard.backToWork')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Recent Records */}
                    <div className="bg-white border border-slate-200/70 rounded-md overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CalendarDays size={13} className="text-slate-400" />
                                <h2 className="text-[12.5px] font-semibold text-slate-700">{t('dashboard.recentRecords')}</h2>
                            </div>
                            <span className="text-[11px] text-slate-400">{t('dashboard.recordCount', { count: recentLogs.length })}</span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px] text-left">
                                <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-2 font-semibold">{t('dashboard.colDate')}</th>
                                        <th className="px-4 py-2 font-semibold">{t('dashboard.colCheckIn')}</th>
                                        <th className="px-4 py-2 font-semibold">{t('dashboard.colCheckOut')}</th>
                                        <th className="px-4 py-2 font-semibold">{t('dashboard.colNetTime')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {recentLogs.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-[12.5px]">
                                                {t('dashboard.noRecords')}
                                            </td>
                                        </tr>
                                    )}
                                    {recentLogs.slice(0, 12).map((r) => (
                                        <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                                            <td className="px-4 py-2.5 text-slate-600">
                                                {dayjs(r.logDate).format('DD.MM.YYYY')}
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-700">
                                                {fDt(r.checkInTime)}
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-700">
                                                {fDt(r.checkOutTime)}
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-900 font-medium">
                                                {formatDuration(typeof r.netWorkSeconds === 'number' ? r.netWorkSeconds : null)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Sağ Sütun */}
                <div className="xl:col-span-1">
                    <div className="bg-white border border-slate-200/70 rounded-md">
                        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                            <QrCode size={13} className="text-slate-400" />
                            <h2 className="text-[12.5px] font-semibold text-slate-700">{t('dashboard.station')}</h2>
                        </div>

                        <div className="p-4 space-y-4">
                            {stationQrPayload ? (
                                <div className="flex justify-center p-4 bg-slate-50/60 border border-slate-100 rounded">
                                    <QRCodeSVG value={stationQrPayload} size={128} fgColor="#1e3a8a" />
                                </div>
                            ) : (
                                <div className="p-2.5 rounded text-[11.5px] bg-blue-50 border border-blue-200/60 text-blue-800 leading-relaxed">
                                    {t('dashboard.qrNotDefined')}
                                </div>
                            )}

                            <div>
                                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                    {t('dashboard.codeEntry')}
                                </label>
                                <div className="flex gap-1.5">
                                    <input
                                        type="text"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && scan(code)}
                                        placeholder={t('dashboard.codePlaceholder')}
                                        className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded text-[12.5px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700/10 focus:border-blue-400 transition-colors placeholder:text-slate-400"
                                        maxLength={64}
                                    />
                                    <button
                                        onClick={() => scan(code)}
                                        className="px-3 py-1.5 bg-blue-700 text-white rounded text-[12px] font-medium hover:bg-blue-800 transition-colors"
                                    >
                                        {t('common.confirm')}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                    {t('dashboard.cameraScanner')}
                                </label>
                                <div className="rounded overflow-hidden border border-slate-200">
                                    <QRScanner onScan={scan} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
