import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { personnelApi } from '@/lib/api/personnel';
import { useAuthStore } from '@/store/authStore';
import { PageSkeleton } from '@/components/ui-shared/PageSkeleton';
import '@/styles/person.css';

import type { PersonOverview } from '../types/personnel';
import { useLanguageTick } from '../hooks/usePersonnel';
import { PersonHero, type PersonTab } from './PersonHero';
import { PersonPhotoSheet } from './PersonPhotoSheet';
import { PersonProfileTab } from './tabs/PersonProfileTab';
import { PersonLeaveYearTab } from './tabs/PersonLeaveYearTab';
import { PersonAbsencesTab } from './tabs/PersonAbsencesTab';
import { PersonTimeTab } from './tabs/PersonTimeTab';

/**
 * ── DIE PERSONALDETAILSEITE ──────────────────────────────────────────────────
 *
 * Ein Klick auf eine Zeile der Personalliste führt hierher. SEIT DEM
 * 27.08.2026 VIER REITER (Vorgabe: «die allgemeinen Reiter entfernen; den
 * Zugang auflösen; Urlaub und Abwesenheiten sind GETRENNTE Seiten»):
 *
 *   Profil          Grunddaten, Rolle/Kennwort/Firmen, Vertrag, Unterlagen
 *   Arbeitszeiten   der Arbeitszeitnachweis der Person (max. ein Monat)
 *   Urlaub          Anspruch (jahresweise ab EINTRITT), Feiertage, Anträge
 *   Abwesenheiten   die Fehltage (max. ein Monat) samt Nachtrag ab Eintritt
 *
 * Aufgaben, Erinnerungen, Termine und Besprechungen stehen im EIGENEN Profil
 * (/profile) — sie sind Arbeitsvorrat der Person, keine Akte der Verwaltung.
 *
 * ALLE Reiter kommen aus EINEM Serveraufruf; das Umschalten kostet danach
 * keinen Rundgang mehr.
 */

type TabKey = 'profile' | 'time' | 'leaves' | 'absences';

export const PersonPage = () => {
    useLanguageTick();
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const currentUserId = useAuthStore((state) => state.user?.id ?? '');
    const permissions = useAuthStore((state) => state.permissions);
    const employeeId = id;

    const [tab, setTab] = useState<TabKey>('profile');
    const [data, setData] = useState<PersonOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [photoOpen, setPhotoOpen] = useState(false);

    const load = useCallback(() => {
        if (!employeeId) return;
        setLoading(true);
        personnelApi.staffOverview(employeeId)
            .then(setData)
            .catch((error: unknown) => {
                const status = (error as { response?: { status?: number } })?.response?.status;
                toast.error(status === 403
                    ? t('personnel.person.forbidden')
                    : t('personnel.person.loadFailed'));
                navigate('/personnel', { replace: true });
            })
            .finally(() => setLoading(false));
    }, [employeeId, navigate]);

    useEffect(load, [load]);

    if (loading && !data) return <PageSkeleton />;
    if (!data) {
        // Zwischen Abweisung und Rücksprung: etwas Sichtbares statt einer
        // weissen Fläche.
        return (
            <div className="flex w-full flex-col items-center gap-3 py-16">
                <p className="text-[13px] text-slate-500 dark:text-white/60">{t('personnel.person.loadFailed')}</p>
                <button
                    type="button"
                    onClick={load}
                    className="rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654]"
                >
                    {t('common.retry')}
                </button>
            </div>
        );
    }

    const isSelf = data.person.id === currentUserId;
    // Das eigene Bild darf jede Person tauschen; ein fremdes braucht dieselbe
    // Berechtigung, die der Server für den Aufruf verlangt.
    const canEditPhoto = isSelf || permissions.includes('employees.update');
    const tabs: PersonTab[] = [
        { key: 'profile', label: t('personnel.person.tabProfile'), badge: data.pendingPasswordRequest ? 1 : undefined },
        { key: 'time', label: t('personnel.person.tabTime') },
        { key: 'leaves', label: t('personnel.person.tabLeaves'), badge: data.approvals.length || undefined },
        { key: 'absences', label: t('personnel.leaveYear.absencesTile') },
    ];

    return (
        <div className="ofi-person flex w-full flex-col gap-4">
            {/* Der Rückweg in die Personalliste steht im Blitz ganz vorn in
                der Kopfleiste (QuickBackButton) — die Seite beginnt sofort. */}
            <PersonHero
                person={data.person}
                tabs={tabs}
                activeKey={tab}
                onTab={(key) => setTab(key as TabKey)}
                canEditPhoto={canEditPhoto}
                onEditPhoto={() => setPhotoOpen(true)}
            />

            <PersonPhotoSheet
                open={photoOpen}
                employeeId={data.person.id}
                name={`${data.person.firstName} ${data.person.lastName}`.trim() || data.person.email}
                initials={`${data.person.firstName.charAt(0)}${data.person.lastName.charAt(0)}`.toUpperCase()}
                current={data.person.profilePictureUrl}
                onClose={() => setPhotoOpen(false)}
                onSaved={(photo) => setData((current) => (
                    current ? { ...current, person: { ...current.person, profilePictureUrl: photo } } : current
                ))}
            />

            {tab === 'profile' && (
                <PersonProfileTab
                    employeeId={data.person.id}
                    isSelf={isSelf}
                    pendingRequest={data.pendingPasswordRequest}
                    onChanged={load}
                />
            )}
            {tab === 'time' && <PersonTimeTab employeeId={data.person.id} />}
            {tab === 'leaves' && (
                <PersonLeaveYearTab
                    employeeId={data.person.id}
                    hireDate={data.person.hireDate}
                    leaves={data.leaves}
                    approvals={data.approvals}
                />
            )}
            {tab === 'absences' && (
                <PersonAbsencesTab employeeId={data.person.id} hireDate={data.person.hireDate} />
            )}
        </div>
    );
};
