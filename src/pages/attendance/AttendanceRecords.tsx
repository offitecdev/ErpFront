import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { FilterLines as Filter } from '@/components/icons/antIconCompat';
import { apiClient } from '../../lib/axios';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusBadge } from '../../components/ui-shared/StatusBadge';

export const AttendanceRecords: React.FC = () => {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [employeeId, setEmployeeId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const fetchEmployees = async () => {
        try {
            const res = await apiClient.get('/employees');
            setEmployees(res.data || []);
        } catch {
            toast.error(t('attendance.records.errorLoadStaff'));
        }
    };

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const params: Record<string, string> = {};
            if (employeeId) params.employeeId = employeeId;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            const res = await apiClient.get('/attendance', { params });
            setLogs(res.data || []);
        } catch {
            toast.error(t('attendance.records.errorLoadRecords'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEmployees();
        fetchLogs();
    }, []);

    const formatDuration = (seconds: number | null) => {
        if (seconds == null) return t('common.none');
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? t('common.hm', { h, m }) : t('common.mOnly', { m });
    };

    return (
        <div>
            <PageHeader
                breadcrumb={t('attendance.breadcrumb')}
                title={t('attendance.records.title')}
                description={t('attendance.records.description')}
            />

            <Card className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <Field label={t('attendance.records.colStaff')}>
                        <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                            <option value="">{t('attendance.records.allStaff')}</option>
                            {employees.map((e) => (
                                <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                            ))}
                        </Select>
                    </Field>
                    <Field label={t('attendance.records.startDate')}>
                        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </Field>
                    <Field label={t('attendance.records.endDate')}>
                        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </Field>
                    <Button variant="primary" icon={<Filter size={13} />} loading={loading} onClick={fetchLogs}>
                        {t('attendance.records.filter')}
                    </Button>
                </div>
            </Card>

            <Card title={t('attendance.records.tableTitle')} noPadding>
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-2.5 text-left font-semibold">{t('attendance.records.colStaff')}</th>
                                <th className="px-4 py-2.5 text-left font-semibold">{t('attendance.records.colDate')}</th>
                                <th className="px-4 py-2.5 text-left font-semibold">{t('attendance.records.colCheckIn')}</th>
                                <th className="px-4 py-2.5 text-left font-semibold">{t('attendance.records.colCheckOut')}</th>
                                <th className="px-4 py-2.5 text-left font-semibold">{t('attendance.records.colNetTime')}</th>
                                <th className="px-4 py-2.5 text-left font-semibold">{t('attendance.records.colStatus')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && <tr><td colSpan={6} className="px-4 py-10"><div className="h-3 bg-slate-100 rounded animate-pulse" /></td></tr>}
                            {!loading && logs.length === 0 && <tr><td colSpan={6}><EmptyState title={t('attendance.records.noRecords')} description={t('attendance.records.noRecordsDesc')} /></td></tr>}
                            {!loading && logs.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50/60">
                                    <td className="px-4 py-2.5 font-semibold text-slate-900">{r.employee?.firstName} {r.employee?.lastName}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{dayjs(r.logDate).format('DD.MM.YYYY')}</td>
                                    <td className="px-4 py-2.5 text-slate-700">{r.checkInTime ? dayjs(r.checkInTime).format('HH:mm') : t('common.none')}</td>
                                    <td className="px-4 py-2.5 text-slate-700">{r.checkOutTime ? dayjs(r.checkOutTime).format('HH:mm') : t('common.none')}</td>
                                    <td className="px-4 py-2.5 font-medium text-slate-900">{formatDuration(r.netWorkSeconds)}</td>
                                    <td className="px-4 py-2.5">
                                        <StatusBadge variant={r.checkOutTime ? 'passive' : 'info'}>
                                            {r.checkOutTime ? t('attendance.records.completed') : t('attendance.records.inProgress')}
                                        </StatusBadge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
