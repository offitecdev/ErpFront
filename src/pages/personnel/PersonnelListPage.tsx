import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, QrCode01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { PersonAvatar } from '@/components/ui-shared/PersonAvatar';
import { t } from '@/i18n/translate';
import { useAuthStore } from '@/store/authStore';
import type { StaffRow } from './types/personnel';
import { STAFF_PAGE_SIZE, useLanguageTick, useStaffList } from './hooks/usePersonnel';
import { StaffCreateSheet } from './components/StaffCreateSheet';
import { StaffQrSheet } from './components/StaffQrSheet';
import { Chip, Pager, SearchBox, SectionCard, TableStateRow } from './components/primitives';
import { formatDate, fullName, staffRoleLabel, workLocationLabel } from './utils/format';

/**
 * ── PERSONALLISTE ────────────────────────────────────────────────────────────
 *
 * Die Liste zeigt, wer da ist, seit wann — und gibt den QR-Ausweis heraus.
 * Ein Klick auf die Zeile öffnet die PERSONENSEITE (Vorgabe 17.08.2026):
 * Kennwort und Rolle, zugewiesene Aufgaben, Termine und Urlaube stehen dort.
 * Angelegt wird weiterhin zeilenweise im Untenfenster.
 *
 * 15 Zeilen je Seite (Vorgabe). Die Seitenrechnung läuft SERVERSEITIG: eine
 * Mannschaft von einigen hundert Personen soll nicht bei jedem Aufruf komplett
 * über die Leitung gehen, nur damit der Browser fünfzehn davon zeigt.
 */
export const PersonnelListPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const list = useStaffList();
    const permissions = useAuthStore((state) => state.permissions);
    const canCreate = permissions.includes('employees.create');

    const [createOpen, setCreateOpen] = useState(false);
    const [qrPerson, setQrPerson] = useState<StaffRow | null>(null);

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('personnel.list.title')}
                action={canCreate && (
                    <button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        className="flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654]"
                    >
                        <Plus size={14} />
                        {t('personnel.list.add')}
                    </button>
                )}
            />

            <SearchBox
                value={list.search}
                onChange={list.setSearch}
                placeholder={t('personnel.list.searchPlaceholder')}
                className="w-72"
            />

            <SectionCard title={t('personnel.list.sectionTitle', { count: list.total })}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col style={{ width: 96 }} />
                        <col />
                        <col style={{ width: '24%' }} />
                        <col style={{ width: 150 }} />
                        <col style={{ width: 150 }} />
                        <col style={{ width: 140 }} />
                        <col style={{ width: 92 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-right">{t('personnel.field.staffNumber')}</th>
                            <th className="text-left">{t('personnel.field.name')}</th>
                            <th className="text-left">{t('personnel.field.email')}</th>
                            <th className="text-left">{t('personnel.field.staffRole')}</th>
                            <th className="text-left">{t('personnel.field.workLocation')}</th>
                            <th className="text-left">{t('personnel.field.createdAt')}</th>
                            <th className="text-right">{t('personnel.field.qr')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(list.loading || list.rows.length === 0) && (
                            <TableStateRow
                                colSpan={7}
                                loading={list.loading}
                                emptyText={list.error ? t('personnel.list.loadFailed') : t('personnel.list.empty')}
                            />
                        )}
                        {!list.loading && list.rows.map((person) => (
                            <tr
                                key={person.id}
                                className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                onClick={() => navigate(`/personnel/${person.id}`)}
                            >
                                <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                    {person.staffNumber ?? '—'}
                                </td>
                                <td>
                                    {/* Bild UND Name: das Profilbild sagt auf einen
                                        Blick, WER das ist, der Name bleibt lesbar
                                        und durchsuchbar. Ohne hinterlegtes Bild
                                        steht dort der Kreis mit den Initialen. */}
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <PersonAvatar id={person.id} name={fullName(person)} size={30} />
                                        <div className="min-w-0">
                                            <span className="block truncate font-semibold text-slate-800 dark:text-white">
                                                {fullName(person)}
                                            </span>
                                            {!person.isActive && (
                                                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                                                    {t('personnel.list.inactive')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="text-[13px] text-slate-500 dark:text-white/60">
                                    <span className="block truncate">{person.email}</span>
                                </td>
                                <td className="text-[12.5px] text-slate-600 dark:text-white/70">
                                    {staffRoleLabel(person.staffRole)}
                                </td>
                                <td>
                                    {person.workLocation === 'REMOTE' ? (
                                        <Chip className="bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/30">
                                            {workLocationLabel(person.workLocation)}
                                        </Chip>
                                    ) : (
                                        <span className="text-[12.5px] text-slate-500 dark:text-white/60">
                                            {workLocationLabel(person.workLocation)}
                                        </span>
                                    )}
                                </td>
                                <td className="font-mono text-[12.5px] text-slate-600 dark:text-white/70">
                                    {formatDate(person.createdAt)}
                                </td>
                                <td className="text-right">
                                    <button
                                        type="button"
                                        aria-label={t('personnel.qr.open', { name: fullName(person) })}
                                        title={t('personnel.qr.title')}
                                        onClick={(event) => {
                                            // Sonst öffnete der Klick zusätzlich die Personenseite.
                                            event.stopPropagation();
                                            setQrPerson(person);
                                        }}
                                        className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#1f2654] dark:hover:bg-white/10 dark:hover:text-white"
                                    >
                                        <QrCode01 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={list.page}
                        totalPages={list.totalPages}
                        total={list.total}
                        pageSize={STAFF_PAGE_SIZE}
                        onPage={list.setPage}
                    />
                </div>
            </SectionCard>

            <StaffCreateSheet
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={list.reload}
            />

            <StaffQrSheet
                open={Boolean(qrPerson)}
                person={qrPerson}
                onClose={() => setQrPerson(null)}
                onRotated={(employeeId, qrToken) => {
                    list.patchRow(employeeId, { qrToken });
                    setQrPerson((current) => (current && current.id === employeeId ? { ...current, qrToken } : current));
                }}
            />
        </div>
    );
};
