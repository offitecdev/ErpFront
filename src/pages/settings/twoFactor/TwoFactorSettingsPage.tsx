import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCcw01 } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { SearchBox, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { PersonAvatar } from '@/components/ui-shared/PersonAvatar';
import { Chip, GhostButton } from '@/pages/personnel/components/primitives';
import { formatDate } from '@/pages/personnel/utils/format';
import { twoFactorAdminApi, type TwoFactorPerson } from '@/lib/api/twoFactorAdmin';
import { useAuthStore } from '@/store/authStore';

/**
 * ── EINSTELLUNGEN → ZWEI-FAKTOR (AEGIS), 15.09.2026 ─────────────────────────
 *
 * Wer hat Aegis eingerichtet — und «Einrichtung neu starten» für eine Person
 * (neues oder verlorenes Telefon). Die Seite gibt die Rollenzeile
 * «Einstellungen → Zwei-Faktor» frei: Stufe 1 sieht die Liste, Stufe 2 darf
 * neu starten. Neu starten löscht nur die Verbindung zur App und meldet die
 * Person überall ab; bei der nächsten Anmeldung zeigt das Programm wieder den
 * QR-Code zum Einrichten.
 */
export const TwoFactorSettingsPage = () => {
    const permissions = useAuthStore((s) => s.permissions);
    const isSystemAdmin = useAuthStore((s) => s.isSystemAdmin);
    const ownId = useAuthStore((s) => s.user?.id);
    const canReset = isSystemAdmin || permissions.includes('security.mfa.reset');

    const [rows, setRows] = useState<TwoFactorPerson[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [target, setTarget] = useState<TwoFactorPerson | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        twoFactorAdminApi.list()
            .then(setRows)
            .catch(() => toast.error(t('settings.twoFactor.errorLoad')))
            .finally(() => setLoading(false));
    }, []);

    useEffect(load, [load]);

    const visible = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        if (!needle) return rows;
        return rows.filter((row) =>
            row.name.toLocaleLowerCase().includes(needle)
            || (row.email ?? '').toLocaleLowerCase().includes(needle));
    }, [rows, query]);

    const enrolledCount = rows.filter((row) => row.enrolledAt).length;

    const confirmReset = async () => {
        if (!target) return;
        setBusy(true);
        try {
            await twoFactorAdminApi.reset(target.id);
            setRows((prev) => prev.map((row) => (row.id === target.id ? { ...row, enrolledAt: null } : row)));
            toast.success(t('settings.twoFactor.resetDone', { name: target.name }));
            setTarget(null);
        } catch {
            toast.error(t('settings.twoFactor.resetFailed'));
        } finally {
            setBusy(false);
        }
    };

    const colSpan = canReset ? 3 : 2;

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('settings.twoFactor.title')}
                action={<SearchBox value={query} onChange={setQuery} placeholder={t('settings.twoFactor.search')} />}
            />

            <p className="-mt-1 text-[12px] text-slate-500 dark:text-white/55">{t('settings.twoFactor.intro')}</p>

            <SectionCard title={t('settings.twoFactor.sectionTitle', { enrolled: enrolledCount, total: rows.length })}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col />
                        <col style={{ width: 220 }} />
                        {canReset && <col style={{ width: 220 }} />}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('settings.twoFactor.colPerson')}</th>
                            <th className="text-left">{t('settings.twoFactor.colStatus')}</th>
                            {canReset && <th className="text-right">{t('settings.twoFactor.colAction')}</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || visible.length === 0) && (
                            <TableStateRow colSpan={colSpan} loading={loading} emptyText={t('settings.twoFactor.empty')} />
                        )}
                        {!loading && visible.map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <span className="flex min-w-0 items-center gap-2.5">
                                        <PersonAvatar id={row.id} name={row.name} size={28} tone="subtle" />
                                        <span className="min-w-0">
                                            <span className="block truncate font-semibold text-slate-900 dark:text-white">
                                                {row.name || row.email}
                                            </span>
                                            {row.email && (
                                                <span className="block truncate text-[11.5px] text-slate-500 dark:text-white/55">
                                                    {row.email}
                                                </span>
                                            )}
                                        </span>
                                        {!row.isActive && (
                                            <Chip className="bg-slate-100 text-slate-500 ring-slate-200 dark:bg-white/5 dark:text-white/55 dark:ring-white/15">
                                                {t('settings.twoFactor.inactive')}
                                            </Chip>
                                        )}
                                    </span>
                                </td>
                                <td>
                                    {row.enrolledAt ? (
                                        <Chip className="bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30">
                                            {t('settings.twoFactor.enrolledSince', { date: formatDate(row.enrolledAt) })}
                                        </Chip>
                                    ) : (
                                        <Chip className="bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30">
                                            {t('settings.twoFactor.notEnrolled')}
                                        </Chip>
                                    )}
                                </td>
                                {canReset && (
                                    <td className="text-right">
                                        <GhostButton
                                            icon={<RefreshCcw01 size={14} />}
                                            disabled={!row.enrolledAt}
                                            onClick={() => setTarget(row)}
                                        >
                                            {t('settings.twoFactor.restart')}
                                        </GhostButton>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </SectionCard>

            <PopupDialog
                open={Boolean(target)}
                onClose={() => { if (!busy) setTarget(null); }}
                tone="warning"
                icon={<RefreshCcw01 size={18} />}
                title={t('settings.twoFactor.confirmTitle', { name: target?.name ?? '' })}
                subtitle={target?.id === ownId
                    ? t('settings.twoFactor.confirmSelf')
                    : t('settings.twoFactor.confirmText')}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setTarget(null)} disabled={busy}>{t('common.cancel')}</PopupButton>
                        <PopupButton variant="danger" loading={busy} onClick={confirmReset}>
                            {t('settings.twoFactor.restart')}
                        </PopupButton>
                    </PopupActions>
                )}
            />
        </div>
    );
};
