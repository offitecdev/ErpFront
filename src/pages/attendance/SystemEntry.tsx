import React, { useState } from 'react';
import { toast } from 'sonner';
import { LogOut01 as LogOut } from '@untitledui/icons';
import { QRScanner } from '../../components/QRScanner';
import { useAttendanceStore } from '../../store/attendanceStore';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../../components/ui-shared/Button';
import { LoadingIndicator } from '@/components/application/loading-indicator/loading-indicator';

export const SystemEntry: React.FC = () => {
    const { processCheckIn } = useAttendanceStore();
    const { user, logout } = useAuthStore();
    const [loading, setLoading] = useState(false);

    const handleScan = async (data: string) => {
        if (loading) return;
        try {
            setLoading(true);
            await processCheckIn(data.trim());
            toast.success('Giriş QR onaylandı. Mesai sayacı başladı.');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Giriş işlemi başarısız. Lütfen tekrar deneyin.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-4">
            <div className="text-center mb-8 max-w-2xl">
                <h1 className="text-[28px] font-bold tracking-wide">OFFITEC ERP</h1>
                <p className="text-slate-400 text-[14px] mt-2">
                    Hoş geldin, <strong className="text-white">{user?.firstName}</strong>. Mesaiye başlamak için giriş QR kodunu okutun.
                </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-2xl">
                <QRScanner onScan={handleScan} />
            </div>

            {loading && (
                <div className="mt-5 text-[13px] font-medium text-blue-300 flex items-center gap-2">
                    <LoadingIndicator type="line-simple" size="sm" />
                    Sistem doğrulanıyor...
                </div>
            )}

            <Button variant="ghost" icon={<LogOut size={13} />} onClick={logout} className="mt-8 text-slate-400 hover:text-white hover:bg-slate-900">
                Farklı bir hesapla giriş yap
            </Button>
        </div>
    );
};
