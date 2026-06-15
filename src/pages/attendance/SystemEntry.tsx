import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LogOut01 as LogOut } from '@/components/icons/antIconCompat';
import { QRScanner } from '../../components/QRScanner';
import { useAttendanceStore } from '../../store/attendanceStore';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../../components/ui-shared/Button';
import { Spin } from 'antd';

export const SystemEntry: React.FC = () => {
    const { t } = useTranslation();
    const { processCheckIn } = useAttendanceStore();
    const { user, logout } = useAuthStore();
    const [loading, setLoading] = useState(false);

    const handleScan = async (data: string) => {
        if (loading) return;
        try {
            setLoading(true);
            await processCheckIn(data.trim());
            toast.success(t('attendance.systemEntry.successCheckin'));
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('attendance.systemEntry.errorCheckin'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-4">
            <div className="text-center mb-8 max-w-2xl">
                <h1 className="text-[28px] font-bold tracking-wide">{t('attendance.systemEntry.title')}</h1>
                <p className="text-slate-400 text-[14px] mt-2">
                    {t('attendance.systemEntry.greeting', { firstName: user?.firstName ?? '' })}
                </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-2xl">
                <QRScanner onScan={handleScan} />
            </div>

            {loading && (
                <div className="mt-5 text-[13px] font-medium text-blue-300 flex items-center gap-2">
                    <Spin size="small" />
                    {t('attendance.systemEntry.verifying')}
                </div>
            )}

            <Button variant="ghost" icon={<LogOut size={13} />} onClick={logout} className="mt-8 text-slate-400 hover:text-white hover:bg-slate-900">
                {t('attendance.systemEntry.switchAccount')}
            </Button>
        </div>
    );
};
