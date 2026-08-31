import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import i18n from '@/i18n';
import { personnelHrApi } from '@/lib/api/personnel';
import { useAuthStore } from '@/store/authStore';
import '@/styles/personnel.css';
import type { HolidayCatalogEntry, HolidayYear } from '@/pages/personnel/types/personnel';
import { formatDate } from '@/pages/personnel/utils/format';

/**
 * ── FEIERTAGE (Einstellungen → Module → Personal) ───────────────────────────
 *
 *   «Feiertage, etwa religiöse Feste, sollen erfasst werden; alle amtlichen
 *    Feiertage der Türkei sollen aufgelistet sein, und einer davon lässt sich
 *    auswählen.»
 *
 * ZWEI SPALTEN, EIN VORGANG. Links steht der amtliche KATALOG des gewählten
 * Jahres, rechts das, was das Haus tatsächlich FÜHRT. Ein Tag wandert mit
 * einem Klick von links nach rechts; «Alle übernehmen» holt das ganze Jahr.
 *
 * DER KATALOG IST EIN VORSCHLAG, KEIN BESTAND. Die religiösen Feste (Ramazan,
 * Kurban) folgen dem Mondjahr und wandern; die Tabelle im Code kann irren.
 * Deshalb lässt sich jeder Tag auch von Hand erfassen und jeder übernommene
 * wieder löschen — die Verwaltung hat immer das letzte Wort.
 *
 * WOZU DAS GUT IST: ein Feiertag ist KEIN Arbeitstag. Er zählt weder gegen das
 * Sollpensum der Arbeitszeiterfassung noch als Fehltag, und ein Urlaubsantrag
 * verbraucht ihn nicht. Ohne diese Liste rechnete jeder Rapport den 1. Mai als
 * versäumten Arbeitstag.
 */

/** Die Sprache entscheidet, welcher Name des Katalogs übernommen wird — der
    gespeicherte Name ist danach BESTAND, kein Oberflächentext mehr. */
const catalogName = (entry: HolidayCatalogEntry): string => {
    const language = (i18n.resolvedLanguage || i18n.language || 'de').slice(0, 2);
    if (language === 'tr') return entry.names.tr;
    if (language === 'en') return entry.names.en;
    return entry.names.de;
};

const readError = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

export const PersonnelHolidaysSection = () => {
    const permissions = useAuthStore((state) => state.permissions);
    const canEdit = permissions.includes('employees.update') || permissions.includes('roles.manage');

    const [year, setYear] = useState(() => new Date().getFullYear());
    const [data, setData] = useState<HolidayYear | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    // Eigener Tag (Betriebsferien, Brückentag) — der Katalog kennt ihn nicht.
    const [ownDate, setOwnDate] = useState('');
    const [ownName, setOwnName] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        personnelHrApi.holidays(year)
            .then(setData)
            .catch((error) => toast.error(readError(error, t('personnel.holidays.loadFailed'))))
            .finally(() => setLoading(false));
    }, [year]);

    useEffect(load, [load]);

    /** Schon geführte Katalogtage: sie stehen links durchgestrichen, nicht
        doppelt zum Anklicken. Erkannt am Schlüssel ODER am Datum — ein Tag,
        der von Hand mit demselben Datum erfasst wurde, ist derselbe Tag. */
    const taken = useMemo(() => {
        const keys = new Set<string>();
        for (const holiday of data?.holidays ?? []) {
            if (holiday.catalogKey) keys.add(holiday.catalogKey);
            keys.add(`date:${holiday.date}`);
        }
        return keys;
    }, [data]);

    /* Bewusst aus `taken` gebaut und nicht aus einer Hilfsfunktion darüber:
       so hängt der Merker an genau dem, woraus er entsteht, und React muss
       nicht raten, wann er neu zu rechnen ist. */
    const isTaken = useCallback(
        (entry: HolidayCatalogEntry) => taken.has(entry.key) || taken.has(`date:${entry.date}`),
        [taken],
    );

    const missing = useMemo(
        () => (data?.catalog ?? []).filter((entry) => !isTaken(entry)),
        [data, isTaken],
    );

    const add = async (entry: HolidayCatalogEntry) => {
        setBusy(true);
        try {
            await personnelHrApi.addHoliday({
                date: entry.date,
                name: catalogName(entry),
                catalogKey: entry.key,
                countryCode: data?.country ?? 'TR',
                religious: entry.religious,
                halfDay: entry.halfDay,
            });
            load();
        } catch (error) {
            toast.error(readError(error, t('personnel.holidays.saveFailed')));
        } finally {
            setBusy(false);
        }
    };

    const addAll = async () => {
        if (missing.length === 0) return;
        setBusy(true);
        try {
            await personnelHrApi.addHolidays(missing.map((entry) => ({
                date: entry.date,
                name: catalogName(entry),
                catalogKey: entry.key,
                countryCode: data?.country ?? 'TR',
                religious: entry.religious,
                halfDay: entry.halfDay,
            })));
            toast.success(t('personnel.holidays.addedAll', { count: missing.length }));
            load();
        } catch (error) {
            toast.error(readError(error, t('personnel.holidays.saveFailed')));
        } finally {
            setBusy(false);
        }
    };

    const addOwn = async () => {
        if (!ownDate || !ownName.trim()) {
            toast.error(t('personnel.holidays.ownIncomplete'));
            return;
        }
        setBusy(true);
        try {
            await personnelHrApi.addHoliday({
                date: ownDate,
                name: ownName.trim(),
                countryCode: data?.country ?? 'TR',
            });
            setOwnName('');
            load();
        } catch (error) {
            toast.error(readError(error, t('personnel.holidays.saveFailed')));
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: string) => {
        setBusy(true);
        try {
            await personnelHrApi.deleteHoliday(id);
            load();
        } catch (error) {
            toast.error(readError(error, t('personnel.holidays.deleteFailed')));
        } finally {
            setBusy(false);
        }
    };

    const years = data?.catalogYears?.length
        ? data.catalogYears
        : [year - 1, year, year + 1];

    return (
        <div className="ofi-mset-card ofi-hol">
            <header className="ofi-hol-head">
                <div>
                    <h2 className="ofi-mset-cardtitle">{t('personnel.holidays.title')}</h2>
                    <p className="ofi-mset-cardhint">{t('personnel.holidays.hint')}</p>
                </div>
                <label className="ofi-hol-year">
                    <span>{t('personnel.leaveYear.year')}</span>
                    <select
                        value={year}
                        onChange={(event) => setYear(Number(event.target.value))}
                        className="ofi-cal-input"
                    >
                        {years.map((value) => (
                            <option key={value} value={value}>{value}</option>
                        ))}
                    </select>
                </label>
            </header>

            <div className="ofi-hol-grid">
                {/* ── LINKS: der amtliche Katalog ──────────────────────────── */}
                <section className="ofi-hol-col">
                    <div className="ofi-hol-colhead">
                        <span>{t('personnel.holidays.catalogTitle')}</span>
                        {canEdit && missing.length > 0 && (
                            <button type="button" className="ofi-hol-addall" onClick={() => void addAll()} disabled={busy}>
                                {t('personnel.holidays.addAll', { count: missing.length })}
                            </button>
                        )}
                    </div>
                    <ul className="ofi-hol-list">
                        {loading && <li className="ofi-hol-empty">{t('common.loading')}</li>}
                        {!loading && (data?.catalog.length ?? 0) === 0 && (
                            <li className="ofi-hol-empty">{t('personnel.holidays.catalogEmpty')}</li>
                        )}
                        {!loading && (data?.catalog ?? []).map((entry) => {
                            const already = isTaken(entry);
                            return (
                                <li key={entry.key} className={`ofi-hol-row ${already ? 'is-taken' : ''}`}>
                                    <span className="ofi-hol-date">{formatDate(entry.date)}</span>
                                    <span className="ofi-hol-name">
                                        {catalogName(entry)}
                                        <span className="ofi-hol-tag">
                                            {entry.religious
                                                ? t('personnel.holidays.religious')
                                                : t('personnel.holidays.official')}
                                            {entry.halfDay && ` · ${t('personnel.holidays.halfDay')}`}
                                        </span>
                                    </span>
                                    {canEdit && !already && (
                                        <button
                                            type="button"
                                            className="ofi-hol-btn"
                                            onClick={() => void add(entry)}
                                            disabled={busy}
                                            aria-label={t('personnel.holidays.add')}
                                            title={t('personnel.holidays.add')}
                                        >
                                            <Plus size={14} />
                                        </button>
                                    )}
                                    {already && <span className="ofi-hol-takenmark">{t('personnel.holidays.taken')}</span>}
                                </li>
                            );
                        })}
                    </ul>
                </section>

                {/* ── RECHTS: was das Haus führt ───────────────────────────── */}
                <section className="ofi-hol-col">
                    <div className="ofi-hol-colhead">
                        <span>{t('personnel.holidays.ownTitle', { count: data?.holidays.length ?? 0 })}</span>
                    </div>
                    <ul className="ofi-hol-list">
                        {!loading && (data?.holidays.length ?? 0) === 0 && (
                            <li className="ofi-hol-empty">{t('personnel.holidays.empty')}</li>
                        )}
                        {(data?.holidays ?? []).map((holiday) => (
                            <li key={holiday.id} className="ofi-hol-row">
                                <span className="ofi-hol-date">{formatDate(holiday.date)}</span>
                                <span className="ofi-hol-name">
                                    {holiday.name}
                                    <span className="ofi-hol-tag">
                                        {holiday.religious
                                            ? t('personnel.holidays.religious')
                                            : t('personnel.holidays.official')}
                                        {holiday.halfDay && ` · ${t('personnel.holidays.halfDay')}`}
                                    </span>
                                </span>
                                {canEdit && (
                                    <button
                                        type="button"
                                        className="ofi-hol-btn is-danger"
                                        onClick={() => void remove(holiday.id)}
                                        disabled={busy}
                                        aria-label={t('common.delete')}
                                        title={t('common.delete')}
                                    >
                                        <Trash01 size={14} />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>

                    {canEdit && (
                        <div className="ofi-hol-own">
                            <span className="ofi-hol-ownhead">{t('personnel.holidays.ownAdd')}</span>
                            <div className="ofi-hol-ownrow">
                                <input
                                    type="date"
                                    value={ownDate}
                                    onChange={(event) => setOwnDate(event.target.value)}
                                    className="ofi-cal-input"
                                />
                                <input
                                    value={ownName}
                                    onChange={(event) => setOwnName(event.target.value)}
                                    placeholder={t('personnel.holidays.ownPlaceholder')}
                                    maxLength={120}
                                    className="ofi-cal-input"
                                />
                                <button
                                    type="button"
                                    className="ofi-hol-btn"
                                    onClick={() => void addOwn()}
                                    disabled={busy}
                                    aria-label={t('personnel.holidays.add')}
                                    title={t('personnel.holidays.add')}
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};
