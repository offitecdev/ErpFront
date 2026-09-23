import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Check, Minus } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { productionApi, productionErrorOf } from '@/lib/api/production';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { fmtDateTime } from '@/pages/inventory/utils/format';
import type { ProductionSettings, ProductionTransferCompany } from '@/types/production';
import '@/styles/modules/production.css';

/**
 * ── EINSTELLUNGEN → FIRMENÜBERTRAGUNGEN (19.09.2026, Vorgabe Samet) ─────────
 * Aus welchen Firmen (Mandantengruppen) liest die Produktion ihre Projekte und
 * Aufträge? Ohne Auswahl liest sie die eigene Firma. Speichern gleicht sofort
 * ab — die Produktionsaufträge zeigen danach die gewählten Firmen.
 */

type Group = { id: string; name: string; companies: ProductionTransferCompany[] };

const groupsOf = (companies: ProductionTransferCompany[]): Group[] => {
    const groups = new Map<string, Group>();
    for (const company of companies) {
        const group = groups.get(company.groupId) ?? { id: company.groupId, name: company.groupName, companies: [] };
        group.companies.push(company);
        groups.set(company.groupId, group);
    }
    // Die Hauptfirma zuerst, dann alphabetisch.
    return [...groups.values()].map((group) => ({
        ...group,
        companies: [...group.companies].sort((a, b) => Number(b.isRoot) - Number(a.isRoot) || a.name.localeCompare(b.name)),
    }));
};

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((id) => b.has(id));

export const CompanyTransfersPage = () => {
    useLanguageTick();
    const [settings, setSettings] = useState<ProductionSettings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let alive = true;
        productionApi.settings().then(
            (value) => {
                if (!alive) return;
                setSettings(value);
                setSelected(new Set(value.sourceTenantIds.length ? value.sourceTenantIds : value.effectiveSourceTenantIds));
            },
            (failure) => { if (alive) setError(productionErrorOf(failure).message || t('production.loadFailed')); },
        );
        return () => { alive = false; };
    }, []);

    const groups = useMemo(() => groupsOf(settings?.companies ?? []), [settings]);
    const saved = useMemo(
        () => new Set(settings ? (settings.sourceTenantIds.length ? settings.sourceTenantIds : settings.effectiveSourceTenantIds) : []),
        [settings],
    );
    const dirty = Boolean(settings) && !sameSet(selected, saved);

    const toggle = (id: string) => setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    const toggleGroup = (group: Group) => setSelected((current) => {
        const next = new Set(current);
        const all = group.companies.every((company) => next.has(company.id));
        group.companies.forEach((company) => (all ? next.delete(company.id) : next.add(company.id)));
        return next;
    });

    const save = async () => {
        if (!selected.size) {
            toast.error(t('settings.transfers.chooseOne'));
            return;
        }
        setSaving(true);
        try {
            const result = await productionApi.saveSettings([...selected]);
            setSettings(result.settings);
            setSelected(new Set(result.settings.sourceTenantIds.length ? result.settings.sourceTenantIds : result.settings.effectiveSourceTenantIds));
            toast.success(t('settings.transfers.saved', { projects: result.sync.projects ?? 0 }));
        } catch (failure) {
            toast.error(productionErrorOf(failure).message || t('settings.transfers.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="ofi-prod-page">
            <InventoryListHeader title={t('nav.companyTransfers')} />

            <div className="ofi-prod-transfer">
                <p className="-mt-3 text-[13px] text-slate-500">{t('settings.transfers.intro')}</p>

                {error && <div className="ofi-prod-note is-warn">{error}</div>}

                {settings && (
                    <div className={`ofi-prod-note ${settings.enabled ? '' : 'is-warn'}`}>
                        <span className={`ofi-prod-status ${settings.enabled ? 'is-on' : ''}`}>
                            {settings.enabled ? t('settings.transfers.moduleOn') : t('settings.transfers.moduleOff')}
                        </span>
                    </div>
                )}

                <SectionCard title={t('settings.transfers.companies')}>
                    {!settings && !error && <div className="ofi-prod-empty">{t('common.loading')}</div>}
                    {settings && (
                        <div className="ofi-prod-groups">
                            {groups.map((group) => {
                                const count = group.companies.filter((company) => selected.has(company.id)).length;
                                const all = count === group.companies.length;
                                return (
                                    <div key={group.id} className="ofi-prod-group">
                                        <button
                                            type="button"
                                            role="checkbox"
                                            aria-checked={all ? true : count ? 'mixed' : false}
                                            className="ofi-prod-group__head"
                                            onClick={() => toggleGroup(group)}
                                        >
                                            <span className={`ofi-prod-check ${all ? 'is-on' : count ? 'is-mixed' : ''}`} aria-hidden>
                                                {all ? <Check /> : count ? <Minus /> : null}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate">{group.name}</span>
                                            <small className="text-[11.5px] font-normal text-slate-500">
                                                {t('settings.transfers.groupCount', { count, total: group.companies.length })}
                                            </small>
                                        </button>
                                        {group.companies.map((company) => {
                                            const on = selected.has(company.id);
                                            return (
                                                <button
                                                    key={company.id}
                                                    type="button"
                                                    role="checkbox"
                                                    aria-checked={on}
                                                    className="ofi-prod-group__row"
                                                    onClick={() => toggle(company.id)}
                                                >
                                                    <span className={`ofi-prod-check ${on ? 'is-on' : ''}`} aria-hidden>{on ? <Check /> : null}</span>
                                                    <span className="min-w-0 truncate">{company.name}</span>
                                                    {company.isRoot && <small>{t('settings.transfers.mainCompany')}</small>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {settings && (
                        <div className="ofi-prod-savebar">
                            <span className="text-[12.5px] text-slate-500">
                                {settings.lastSyncedAt
                                    ? t('production.syncedAt', { time: fmtDateTime(settings.lastSyncedAt) })
                                    : t('settings.transfers.neverSynced')}
                                {!settings.sourceTenantIds.length && ` · ${t('settings.transfers.defaultOwn')}`}
                            </span>
                            <button
                                type="button"
                                className="ofi-prod-primary"
                                disabled={saving || !dirty || !selected.size}
                                onClick={() => void save()}
                            >
                                {saving ? t('settings.transfers.saving') : t('settings.transfers.save')}
                            </button>
                        </div>
                    )}
                </SectionCard>
            </div>
        </div>
    );
};
