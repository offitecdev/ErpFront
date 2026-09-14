import type { SupportedLanguage } from '@/i18n/loadResources';
import { resolveCustomerLanguage } from '@/i18n/reportLanguage';
import { parseDateKey, toDateKey, type WorkPeriod } from './workReportModel';

/**
 * Was die Rapportseite zeigt, steht in der Adresse
 * (`?period=week&date=2026-09-07&person=<id>&lang=de`): die Personenseite
 * verlinkt direkt auf den Wochenrapport einer Person, ein Neuladen behält die
 * Wahl. Der Rapport gilt immer EINER Person; Teammitglieder bekommen sich
 * selbst — die Adresse ändert daran nichts (der Server auch nicht).
 */

export interface ReportQuery {
    period: WorkPeriod;
    /** Ein Tag des Zeitraums (YYYY-MM-DD); die Woche läuft Montag bis Sonntag. */
    date: string;
    /** Die Person; '' = man selbst. */
    person: string;
    /** Sprache nur dieses Rapports/PDFs, unabhängig von der Oberfläche. */
    language: SupportedLanguage;
}

export const readReportQuery = (params: URLSearchParams, isManager: boolean): ReportQuery => {
    const date = params.get('date');
    const lang = params.get('lang');
    return {
        period: params.get('period') === 'day' ? 'day' : 'week',
        date: date && parseDateKey(date) ? date : toDateKey(new Date()),
        person: isManager ? (params.get('person') ?? '').trim() : '',
        language: lang === 'tr' || lang === 'en' || lang === 'de' ? lang : resolveCustomerLanguage(),
    };
};

export const writeReportQuery = (query: ReportQuery): URLSearchParams => {
    const params = new URLSearchParams();
    params.set('period', query.period);
    if (query.date !== toDateKey(new Date())) params.set('date', query.date);
    if (query.person) params.set('person', query.person);
    params.set('lang', query.language);
    return params;
};

/** Adresse des Wochenrapports einer Person (Link aus «Kişiler»). */
export const personReportHref = (personId: string): string =>
    `/tasks/reports?${writeReportQuery({
        period: 'week',
        date: toDateKey(new Date()),
        person: personId,
        language: resolveCustomerLanguage(),
    }).toString()}`;
