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
import { PersonOverviewTab } from './tabs/PersonOverviewTab';
import { PersonAccessTab } from './tabs/PersonAccessTab';
import { PersonTasksTab } from './tabs/PersonTasksTab';
import { PersonAppointmentsTab } from './tabs/PersonAppointmentsTab';
import { PersonMeetingsTab } from './tabs/PersonMeetingsTab';
import { PersonLeavesTab } from './tabs/PersonLeavesTab';

/**
 * ── DIE PERSONENSEITE ────────────────────────────────────────────────────────
 *
 * Ein Klick auf eine Zeile der Personalliste führt hierher (Vorgabe
 * 17.08.2026): „für jede angestellte Person eine Seite — Kennwort und Rolle,
 * zugewiesene Aufgaben, Termine und Urlaub (Anträge, Freigaben)".
 *
 * DIESELBE Seite ist das eigene Profil (`self`): dann steht sie unter /profile,
 * zeigt die Rolle nur an und bietet statt des direkten Kennwortwechsels den
 * Antrag. Zwei Adressen, ein Bauteil — sonst liefen die beiden Ansichten
 * auseinander.
 *
 * ALLE Reiter kommen aus EINEM Serveraufruf; das Umschalten kostet danach
 * keinen Rundgang mehr.
 */

type TabKey = 'overview' | 'access' | 'tasks' | 'appointments' | 'meetings' | 'leaves';

export const PersonPage = ({ self = false }: { self?: boolean }) => {
    useLanguageTick();
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const currentUserId = useAuthStore((state) => state.user?.id ?? '');
    const permissions = useAuthStore((state) => state.permissions);
    const employeeId = self ? currentUserId : id;

    const [tab, setTab] = useState<TabKey>('overview');
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
                if (!self) navigate('/personnel', { replace: true });
            })
            .finally(() => setLoading(false));
    }, [employeeId, navigate, self]);

    useEffect(load, [load]);

    if (loading && !data) return <PageSkeleton />;
    if (!data) {
        // Der Fehlerfall der EIGENEN Seite: dort wird nicht zurückgeworfen
        // (es gibt keine Liste, auf die man zurückfiele), also braucht es hier
        // etwas Sichtbares statt einer weissen Fläche.
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
        { key: 'overview', label: t('personnel.person.tabOverview') },
        { key: 'access', label: t('personnel.person.tabAccess'), badge: data.pendingPasswordRequest ? 1 : undefined },
        { key: 'tasks', label: t('personnel.person.tabTasks') },
        { key: 'appointments', label: t('personnel.person.tabAppointments') },
        { key: 'meetings', label: t('personnel.person.tabMeetings') },
        { key: 'leaves', label: t('personnel.person.tabLeaves'), badge: data.approvals.length || undefined },
    ];

    return (
        <div className="ofi-person flex w-full flex-col gap-4">
            {!self && (
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => navigate('/personnel')}
                        className="text-[12.5px] font-semibold text-slate-500 underline-offset-2 hover:underline dark:text-white/60"
                    >
                        ← {t('personnel.person.backToList')}
                    </button>
                </div>
            )}

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

            {tab === 'overview' && <PersonOverviewTab data={data} />}
            {tab === 'access' && (
                <PersonAccessTab
                    person={data.person}
                    isSelf={isSelf}
                    pendingRequest={data.pendingPasswordRequest}
                    onChanged={load}
                />
            )}
            {tab === 'tasks' && <PersonTasksTab tasks={data.tasks} />}
            {tab === 'appointments' && <PersonAppointmentsTab appointments={data.appointments ?? []} />}
            {tab === 'meetings' && <PersonMeetingsTab meetings={data.meetings} />}
            {tab === 'leaves' && <PersonLeavesTab leaves={data.leaves} approvals={data.approvals} />}
        </div>
    );
};

/** Das eigene Profil (/profile) — dieselbe Seite, auf die angemeldete Person
    gerichtet. Eigener Ausgang, weil die Routen-Hilfe `page()` keine Eigenschaften
    durchreicht (RouteComponent nimmt bewusst keine). */
export const ProfilePage = () => <PersonPage self />;
