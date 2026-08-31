import { useState } from 'react';

import { t } from '@/i18n/translate';
import type { MailSettingDto, ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { SubTabs } from '../../common/SubTabs';
import { AppointmentList } from './AppointmentList';
import { MailTab } from './MailTab';
import { SignatureRequestTab } from './SignatureRequestTab';

// Overtime is no longer a mode here: it is recorded on the tablet during the
// appointment and reported in the single costs table.
export type BookingMode = 'schedule' | 'mail' | 'signature';

const getBookingSubTabs = (): Array<{ key: BookingMode; label: string }> => [
    { key: 'schedule', label: t('auto.randevu_saat_planlari') },
    { key: 'mail', label: t('auto.randevu_maili') },
    { key: 'signature', label: t('auto.imzaya_gonder') },
];

export const BookingSection = ({
    project,
    order,
    isPrimary,
    materials,
    settings,
    userEmail,
    onSaved,
    onAppointmentChanged,
    leaf,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    isPrimary: boolean;
    materials: ProjectMaterial[];
    settings: MailSettingDto | null;
    userEmail: string;
    onSaved: () => Promise<void>;
    /** Nur der Terminbereich: er lädt seine Liste selbst nach, die Seite muss
        das Projekt nicht neu holen. */
    onAppointmentChanged: () => void;
    // When set, render only this single leaf without the internal sub-tabs.
    // Used by the workflow navigation, which owns section switching itself.
    leaf?: BookingMode;
}) => {
    const [mode, setMode] = useState<BookingMode>(leaf ?? 'schedule');
    const activeMode = leaf ?? mode;
    return (
        <div>
            {!leaf && <SubTabs tabs={getBookingSubTabs()} activeTab={mode} onSelectTab={setMode} />}
            {activeMode === 'schedule' && <AppointmentList project={project} order={order} isPrimary={isPrimary} materials={materials} settings={settings} userEmail={userEmail} onChanged={onAppointmentChanged} />}
            {activeMode === 'mail' && <MailTab project={project} order={order} settings={settings} userEmail={userEmail} />}
            {activeMode === 'signature' && <SignatureRequestTab project={project} order={order} isPrimary={isPrimary} settings={settings} userEmail={userEmail} onSaved={onSaved} />}
        </div>
    );
};
