import { useState } from 'react';

import { t } from '@/i18n/translate';
import type { MailSettingDto, ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { SubTabs } from '../../common/SubTabs';
import { AppointmentList } from './AppointmentList';
import { MailTab } from './MailTab';
import { OvertimeTab } from './OvertimeTab';
import { SignatureRequestTab } from './SignatureRequestTab';

export type BookingMode = 'schedule' | 'mail' | 'signature' | 'overtime';

const getBookingSubTabs = (): Array<{ key: BookingMode; label: string }> => [
    { key: 'schedule', label: t('auto.randevu_saat_planlari') },
    { key: 'mail', label: t('auto.randevu_maili') },
    { key: 'signature', label: t('auto.imzaya_gonder') },
    { key: 'overtime', label: t('auto.15_uzeri_fazla_calisma') },
];

export const BookingSection = ({
    project,
    order,
    isPrimary,
    materials,
    settings,
    userEmail,
    onSaved,
    leaf,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    isPrimary: boolean;
    materials: ProjectMaterial[];
    settings: MailSettingDto | null;
    userEmail: string;
    onSaved: () => Promise<void>;
    // When set, render only this single leaf without the internal sub-tabs.
    // Used by the workflow navigation, which owns section switching itself.
    leaf?: BookingMode;
}) => {
    const [mode, setMode] = useState<BookingMode>(leaf ?? 'schedule');
    const activeMode = leaf ?? mode;
    return (
        <div>
            {!leaf && <SubTabs tabs={getBookingSubTabs()} activeTab={mode} onSelectTab={setMode} />}
            {activeMode === 'schedule' && <AppointmentList project={project} order={order} isPrimary={isPrimary} materials={materials} onSaved={onSaved} />}
            {activeMode === 'mail' && <MailTab project={project} order={order} settings={settings} userEmail={userEmail} />}
            {activeMode === 'signature' && <SignatureRequestTab project={project} order={order} isPrimary={isPrimary} settings={settings} userEmail={userEmail} onSaved={onSaved} />}
            {activeMode === 'overtime' && <OvertimeTab project={project} order={order} isPrimary={isPrimary} onSaved={onSaved} />}
        </div>
    );
};
