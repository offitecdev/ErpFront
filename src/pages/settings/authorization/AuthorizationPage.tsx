import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { Chip, PrimaryButton } from '@/pages/personnel/components/primitives';
import { roleTemplateApi, type RoleTemplate } from '@/lib/api/authorization';
import { TOTAL_PAGE_COUNT, countGrantedPages } from '@/lib/pageCatalog';

/**
 * ── EINSTELLUNGEN → BERECHTIGUNGEN: DIE ROLLENLISTE ──────────────────────────
 *
 * Hier werden ROLLEN gebaut, keine Personen eingestellt (Vorgabe 17.08.2026).
 * Wer welche Rolle trägt, steht beim Personal: /personnel/:id → Zugang.
 *
 * Die Administratorrolle steht zuoberst und ist fest — alle Seiten, nicht
 * änderbar, nicht löschbar. Sie legt der Server selbst an.
 */
export const AuthorizationPage = () => {
    const navigate = useNavigate();
    const [rows, setRows] = useState<RoleTemplate[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        roleTemplateApi.list()
            .then(setRows)
            .catch(() => toast.error(t('settings.roles.errorLoad')))
            .finally(() => setLoading(false));
    }, []);

    useEffect(load, [load]);

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('settings.roles.title')}
                action={(
                    <PrimaryButton icon={<Plus size={14} />} onClick={() => navigate('/settings/authorization/new')}>
                        {t('settings.roles.add')}
                    </PrimaryButton>
                )}
            />

            <p className="-mt-1 text-[12px] text-slate-500 dark:text-white/55">{t('settings.roles.intro')}</p>

            <SectionCard title={t('settings.roles.sectionTitle', { count: rows.length })}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col />
                        <col style={{ width: 200 }} />
                        <col style={{ width: 140 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('settings.roles.colRole')}</th>
                            <th className="text-left">{t('settings.roles.colPages')}</th>
                            <th className="text-right">{t('settings.roles.colPeople')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || rows.length === 0) && (
                            <TableStateRow colSpan={3} loading={loading} emptyText={t('settings.roles.empty')} />
                        )}
                        {!loading && rows.map((role) => (
                            <tr
                                key={role.id}
                                className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                onClick={() => navigate(`/settings/authorization/${role.id}`)}
                            >
                                <td>
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span className="truncate font-semibold text-slate-900 dark:text-white">
                                            {role.roleName}
                                        </span>
                                        {role.isSystemAdmin && (
                                            <Chip className="bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30">
                                                {t('settings.roles.fixed')}
                                            </Chip>
                                        )}
                                    </span>
                                </td>
                                <td className="text-[12.5px] text-slate-600 dark:text-white/70">
                                    {t('settings.roles.pagesOf', {
                                        granted: countGrantedPages(role.pageLevels),
                                        total: TOTAL_PAGE_COUNT,
                                    })}
                                </td>
                                <td className="text-right font-mono text-[12.5px] text-slate-600 dark:text-white/70">
                                    {role.userCount}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </SectionCard>
        </div>
    );
};
