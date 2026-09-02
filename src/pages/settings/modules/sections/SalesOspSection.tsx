import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Check } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { ospApi, type OspSettingsDto } from '@/lib/api/osp';
import { useAuthStore } from '@/store/authStore';

/**
 * VERKAUF → OSP: die Anbindung an die Offitec Selection Platform.
 *
 *  • MANDANTEN — welche Firmen des eigenen Firmenbaums die OSP-Seite
 *    (/sales/osp) sehen und bearbeiten (die Wurzel sieht sie immer).
 *  • EINGANG  — der gemeinsame Schlüssel, mit dem die OSP bei uns anklopft,
 *    und die VIER Adressen, die ihr dafür zu nennen sind: neue Anfrage (§1),
 *    geänderte Anfrage (§1a), Rückzug (§1b) und der Aktivitätsstrom (§1c).
 *    Vier statt einer, damit drüben auf die Adresse geroutet werden kann statt
 *    auf den Inhalt. Die ersten drei sind Anfragen einer Person; die vierte ist
 *    ausdrücklich KEINE — sie meldet nur, was gerechnet wird.
 *
 *    Was hier nicht eingetragen ist, schickt die OSP gar nicht erst: eine leere
 *    Adresse schaltet den Aufruf drüben ab.
 *  • AUSGANG  — Basisadresse + Schlüssel für unsere Statusmeldungen an die
 *    OSP (under review / offer has been sent).
 *
 * Der Ausgangs-Schlüssel verhält sich wie das Mailkennwort: leer lassen =
 * behalten, Löschen ist ein eigener Knopf.
 */

const errorText = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

export const SalesOspSection = () => {
    const tenants = useAuthStore((s) => s.tenants);

    const [settings, setSettings] = useState<OspSettingsDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [selected, setSelected] = useState<string[]>([]);
    const [webhookKey, setWebhookKey] = useState('');
    const [ospBaseUrl, setOspBaseUrl] = useState('');
    const [ospApiKey, setOspApiKey] = useState('');
    const [clearApiKey, setClearApiKey] = useState(false);

    useEffect(() => {
        let cancelled = false;
        ospApi.getSettings()
            .then((data) => {
                if (cancelled) return;
                setSettings(data);
                setSelected(data.tenantIds);
                setWebhookKey(data.webhookKey);
                setOspBaseUrl(data.ospBaseUrl);
            })
            .catch((error) => { if (!cancelled) toast.error(errorText(error, t('osp.settings.loadError'))); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    /* Die Adressen, die der OSP zu nennen sind. `changeWebhookPath` ist die
       der zweiten Vertragsfassung (DOCUMENT_CHANGE_WEBHOOK_URL) und wird nur
       noch gezeigt, solange sie drüben eingetragen ist — sie nimmt dieselben
       Überarbeitungen an wie die neue Revisionsadresse. */
    const inboundUrls = useMemo(() => {
        if (!settings) return [];
        const origin = window.location.origin;
        return ([
            ['webhookUrl', settings.webhookPath],
            ['revisionWebhookUrl', settings.revisionWebhookPath],
            ['withdrawalWebhookUrl', settings.withdrawalWebhookPath],
            ['projectWebhookUrl', settings.projectWebhookPath],
            ['changeWebhookUrl', settings.changeWebhookPath],
        ] as const)
            .filter(([, path]) => Boolean(path))
            .map(([key, path]) => ({ key, url: `${origin}${path}` }));
    }, [settings]);

    const toggleTenant = (id: string) => {
        setSelected((current) => (current.includes(id)
            ? current.filter((entry) => entry !== id)
            : [...current, id]));
    };

    const save = async () => {
        setSaving(true);
        try {
            const next = await ospApi.saveSettings({
                tenantIds: selected,
                webhookKey: webhookKey.trim() || null,
                ospBaseUrl: ospBaseUrl.trim() || null,
                ospApiKey: clearApiKey ? null : (ospApiKey.trim() || undefined),
            });
            setSettings(next);
            setSelected(next.tenantIds);
            setOspApiKey('');
            setClearApiKey(false);
            toast.success(t('osp.settings.saved'));
        } catch (error) {
            toast.error(errorText(error, t('osp.settings.saveError')));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="ofi-mset-card">
                <p className="ofi-mset-empty">{t('common.loading')}</p>
            </div>
        );
    }

    return (
        <div className="ofi-osp-settings">
            {/* ── Teilnehmende Mandanten ── */}
            <section className="ofi-mset-card">
                <div className="ofi-mset-card__head">
                    <h3 className="ofi-mset-card__title">{t('osp.settings.tenantsTitle')}</h3>
                </div>
                <div className="ofi-mset-card__body">
                    <p className="ofi-mset-cardhint">{t('osp.settings.tenantsHint')}</p>
                    <div className="ofi-osp-settings__tenants">
                        {tenants.map((tenant) => {
                            const isRoot = settings?.rootTenantId === tenant.id;
                            const active = isRoot || selected.includes(tenant.id);
                            return (
                                <button
                                    key={tenant.id}
                                    type="button"
                                    disabled={isRoot}
                                    aria-pressed={active}
                                    className={`ofi-osp-settings__tenant ${active ? 'is-on' : ''}`}
                                    title={isRoot ? t('osp.settings.rootAlways') : undefined}
                                    onClick={() => toggleTenant(tenant.id)}
                                >
                                    <span className={`ofi-osp-settings__check ${active ? 'is-on' : ''}`}>
                                        {active && <Check size={12} />}
                                    </span>
                                    {tenant.tenantName}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── Eingang (OSP → wir) ── */}
            <section className="ofi-mset-card">
                <div className="ofi-mset-card__head">
                    <h3 className="ofi-mset-card__title">{t('osp.settings.inboundTitle')}</h3>
                </div>
                <div className="ofi-mset-card__body">
                    <p className="ofi-mset-cardhint">{t('osp.settings.inboundHint')}</p>
                    {inboundUrls.map((row) => (
                        <label key={row.key} className="ofi-osp-settings__field">
                            <span>{t(`osp.settings.${row.key}`)}</span>
                            <input value={row.url} readOnly onFocus={(e) => e.currentTarget.select()} />
                        </label>
                    ))}
                    <label className="ofi-osp-settings__field">
                        <span>{t('osp.settings.webhookKey')}</span>
                        <input
                            value={webhookKey}
                            onChange={(e) => setWebhookKey(e.target.value)}
                            placeholder={t('osp.settings.webhookKeyPlaceholder')}
                            autoComplete="off"
                        />
                    </label>
                </div>
            </section>

            {/* ── Ausgang (wir → OSP) ── */}
            <section className="ofi-mset-card">
                <div className="ofi-mset-card__head">
                    <h3 className="ofi-mset-card__title">{t('osp.settings.outboundTitle')}</h3>
                </div>
                <div className="ofi-mset-card__body">
                    <p className="ofi-mset-cardhint">{t('osp.settings.outboundHint')}</p>
                    <label className="ofi-osp-settings__field">
                        <span>{t('osp.settings.ospBaseUrl')}</span>
                        <input
                            value={ospBaseUrl}
                            onChange={(e) => setOspBaseUrl(e.target.value)}
                            placeholder="https://api.osp.offitec.ch"
                            autoComplete="off"
                        />
                    </label>
                    <label className="ofi-osp-settings__field">
                        <span>{t('osp.settings.ospApiKey')}</span>
                        <input
                            type="password"
                            value={ospApiKey}
                            onChange={(e) => { setOspApiKey(e.target.value); setClearApiKey(false); }}
                            placeholder={settings?.hasApiKey ? t('osp.settings.keyStored') : t('osp.settings.keyEmpty')}
                            autoComplete="new-password"
                        />
                    </label>
                    {settings?.hasApiKey && (
                        <label className="ofi-osp-settings__clear">
                            <input
                                type="checkbox"
                                checked={clearApiKey}
                                onChange={(e) => setClearApiKey(e.target.checked)}
                            />
                            {t('osp.settings.clearKey')}
                        </label>
                    )}
                </div>
            </section>

            <div className="ofi-osp-settings__actions">
                <button type="button" className="ofi-cal-btn is-primary" disabled={saving} onClick={() => void save()}>
                    {t('common.save')}
                </button>
            </div>
        </div>
    );
};
