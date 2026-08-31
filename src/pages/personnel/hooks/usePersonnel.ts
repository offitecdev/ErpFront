/**
 * ── PERSONALMODUL: KANCALAR (HOOKS) ──────────────────────────────────────────
 * Jede Seite bekommt genau einen Datenhaken. Sie halten Ladezustand, Fehler und
 * das Neuladen an einer Stelle, damit die Seiten selbst nur noch zeichnen.
 *
 * Alle Ladevorgänge sind gegen ein Abbruch-Flag geschützt: das Modul lebt auf
 * Tablets, wo ein Seitenwechsel während eines Netzwerkweges normal ist.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import i18n from '@/i18n';
import { personnelApi } from '@/lib/api/personnel';
import { DEFAULT_SHIFT_PLAN } from '../utils/personnel';
import { firstDayOfMonth, lastDayOfMonth } from '../utils/format';
import type {
    AccountingDetail,
    ClockActivity,
    AccountingReport,
    DetailedReport,
    LeaveCounts,
    LeaveKind,
    LeaveRequestRow,
    PersonRef,
    PersonnelMe,
    ReportQuery,
    ShiftPlan,
    StaffRow,
    WeekOverview,
} from '../types/personnel';

/** Die Liste zeigt 15 Zeilen je Seite (Vorgabe). */
export const STAFF_PAGE_SIZE = 15;

const readError = (error: unknown, fallback: string): string =>
    (error as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
    || (error as { message?: string })?.message
    || fallback;

/**
 * `t()` wird imperativ aufgerufen, deshalb zeichnet ein Sprachwechsel die
 * Seiten nicht von selbst neu. Dieser Haken erzwingt es (wie im Lagermodul).
 */
export const useLanguageTick = (): void => {
    const [, force] = useReducer((tick: number) => tick + 1, 0);
    useEffect(() => {
        const handler = () => force();
        i18n.on('languageChanged', handler);
        return () => { i18n.off('languageChanged', handler); };
    }, []);
};

/** Verzögert einen sich schnell ändernden Wert (Suchfeld). */
export const useDebouncedValue = <T,>(value: T, delayMs = 300): T => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(timer);
    }, [value, delayMs]);
    return debounced;
};

// ─────────────────────────────────────────────────────────────────────────────
// Personalliste
// ─────────────────────────────────────────────────────────────────────────────

export const useStaffList = () => {
    const [rows, setRows] = useState<StaffRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    const debouncedSearch = useDebouncedValue(search);
    const reload = useCallback(() => setTick((value) => value + 1), []);

    // Eine neue Suche fängt immer auf Seite 1 an — sonst zeigt die Liste eine
    // Seite, die es im gefilterten Bestand gar nicht mehr gibt.
    useEffect(() => { setPage(1); }, [debouncedSearch]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        personnelApi
            .listStaff({ page, pageSize: STAFF_PAGE_SIZE, search: debouncedSearch })
            .then((result) => {
                if (cancelled) return;
                setRows(result.data);
                setTotal(result.total);
            })
            .catch((err) => { if (!cancelled) setError(readError(err, 'load')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [page, debouncedSearch, tick]);

    const totalPages = Math.max(1, Math.ceil(total / STAFF_PAGE_SIZE));

    /** Nach dem Neuausgeben eines QR-Codes nur die eine Zeile auffrischen. */
    const patchRow = useCallback((id: string, patch: Partial<StaffRow>) => {
        setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    }, []);

    return { rows, total, totalPages, page, setPage, search, setSearch, loading, error, reload, patchRow };
};

// ─────────────────────────────────────────────────────────────────────────────
// Eigene Personalangaben + freigebende Personen
// ─────────────────────────────────────────────────────────────────────────────

export const usePersonnelMe = () => {
    const [me, setMe] = useState<PersonnelMe | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        personnelApi
            .me()
            .then((value) => { if (!cancelled) setMe(value); })
            .catch(() => { if (!cancelled) setMe(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    return { me, loading, isAdmin: me?.staffRole === 'ADMIN', isAccountant: me?.staffRole === 'ACCOUNTANT' };
};

export const useApprovers = () => {
    const [approvers, setApprovers] = useState<PersonRef[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        personnelApi
            .approvers()
            .then((rows) => { if (!cancelled) setApprovers(rows); })
            .catch(() => { if (!cancelled) setApprovers([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    return { approvers, loading };
};

// ─────────────────────────────────────────────────────────────────────────────
// Schichtplan
// ─────────────────────────────────────────────────────────────────────────────

export const useShiftPlan = () => {
    const [plan, setPlan] = useState<ShiftPlan>({ ...DEFAULT_SHIFT_PLAN });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        personnelApi
            .shiftPlan()
            .then((value) => { if (!cancelled) setPlan(value); })
            .catch((err) => { if (!cancelled) setError(readError(err, 'load')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const save = useCallback(async (next: ShiftPlan) => {
        setSaving(true);
        setError(null);
        try {
            const saved = await personnelApi.saveShiftPlan(next);
            setPlan(saved);
            return saved;
        } finally {
            setSaving(false);
        }
    }, []);

    return { plan, setPlan, loading, saving, error, save };
};

// ─────────────────────────────────────────────────────────────────────────────
// Berichte
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportFilterState extends ReportQuery {
    publicHolidays: number;
}

/** Startwerte der Berichtsfilter: der laufende Monat, keine Feiertage. */
export const defaultReportFilters = (): ReportFilterState => ({
    startDate: firstDayOfMonth(),
    endDate: lastDayOfMonth(),
    firstName: '',
    lastName: '',
    publicHolidays: 0,
});

/**
 * Berichte laden NICHT bei jedem Tastendruck: der Zeitraum und die Namensfelder
 * gehören zusammen, und ein halb getippter Nachname soll keinen Serverweg
 * kosten. Der Filterzustand ist deshalb ein Entwurf; `apply()` übergibt ihn.
 */
const useAppliedFilters = () => {
    const [draft, setDraft] = useState<ReportFilterState>(defaultReportFilters);
    const [applied, setApplied] = useState<ReportFilterState>(draft);

    const patch = useCallback((next: Partial<ReportFilterState>) => {
        setDraft((current) => ({ ...current, ...next }));
    }, []);
    // IMMER eine neue Objektidentität: `setApplied(draft)` mit demselben Objekt
    // liesse React abbrechen, und ein Druck auf „Filtern" ohne Feldänderung
    // (oder ein Auffrischen von aussen) täte gar nichts.
    const apply = useCallback(() => setApplied({ ...draft }), [draft]);
    const reset = useCallback(() => {
        setDraft(defaultReportFilters());
        setApplied(defaultReportFilters());
    }, []);

    return { draft, applied, patch, apply, reset, setApplied };
};

export const useDetailedReport = () => {
    const filters = useAppliedFilters();
    const [report, setReport] = useState<DetailedReport>({ days: [], flags: [], plan: { ...DEFAULT_SHIFT_PLAN } });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const reload = useCallback(() => setTick((value) => value + 1), []);
    const { applied } = filters;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        personnelApi
            .detailedReport(applied)
            .then((value) => { if (!cancelled) setReport(value); })
            .catch((err) => { if (!cancelled) setError(readError(err, 'load')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [applied, tick]);

    /** Abwesenheiten je Person — das Ausrufezeichen neben dem Namen. */
    const flagsByEmployee = useMemo(() => {
        const map = new Map<string, DetailedReport['flags']>();
        for (const flag of report.flags) {
            const bucket = map.get(flag.employeeId) ?? [];
            bucket.push(flag);
            map.set(flag.employeeId, bucket);
        }
        return map;
    }, [report.flags]);

    /* Die drei Summen der Fusszeile — getrennt gehalten wie die Spalten, damit
       niemand sie im Kopf gegeneinander verrechnen muss. */
    const totals = useMemo(() => report.days.reduce(
        (sum, day) => ({
            gross: sum.gross + day.grossSeconds,
            actual: sum.actual + day.actualWorkSeconds,
            breaks: sum.breaks + day.breakSeconds,
        }),
        { gross: 0, actual: 0, breaks: 0 },
    ), [report.days]);

    return { ...filters, report, flagsByEmployee, totals, loading, error, reload };
};

export const useAccountingReport = () => {
    const filters = useAppliedFilters();
    const [report, setReport] = useState<AccountingReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { applied } = filters;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        personnelApi
            .accountingReport(applied)
            .then((value) => { if (!cancelled) setReport(value); })
            .catch((err) => { if (!cancelled) setError(readError(err, 'load')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [applied]);

    /** „Feiertage zurücksetzen" — nur die Feiertagszahl, nicht der Zeitraum. */
    const resetHolidays = useCallback(() => {
        filters.patch({ publicHolidays: 0 });
        filters.setApplied((current) => ({ ...current, publicHolidays: 0 }));
    }, [filters]);

    return { ...filters, report, loading, error, resetHolidays };
};

export const useAccountingDetail = (employeeId: string | null, query: ReportFilterState) => {
    const [detail, setDetail] = useState<AccountingDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!employeeId) {
            setDetail(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        personnelApi
            .accountingDetail(employeeId, query)
            .then((value) => { if (!cancelled) setDetail(value); })
            .catch((err) => { if (!cancelled) setError(readError(err, 'load')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [employeeId, query]);

    return { detail, loading, error };
};

// ─────────────────────────────────────────────────────────────────────────────
// Anträge
// ─────────────────────────────────────────────────────────────────────────────

export const useLeaveRequests = (scope: 'mine' | 'approver' | 'accounting' | 'all', kind?: LeaveKind) => {
    const [rows, setRows] = useState<LeaveRequestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const reload = useCallback(() => setTick((value) => value + 1), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        personnelApi
            .listLeaves(scope, kind)
            .then((value) => { if (!cancelled) setRows(value); })
            .catch((err) => { if (!cancelled) setError(readError(err, 'load')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [scope, kind, tick]);

    return { rows, loading, error, reload, setRows };
};

export const useLeaveCounts = () => {
    const [counts, setCounts] = useState<LeaveCounts>({ approver: 0, accounting: 0 });
    const [tick, setTick] = useState(0);
    const reload = useCallback(() => setTick((value) => value + 1), []);

    useEffect(() => {
        let cancelled = false;
        personnelApi
            .leaveCounts()
            .then((value) => { if (!cancelled) setCounts(value); })
            .catch(() => { /* Zähler sind Beiwerk — ein Fehler darf die Seite nicht stören. */ });
        return () => { cancelled = true; };
    }, [tick]);

    return { counts, reload };
};

// ─────────────────────────────────────────────────────────────────────────────
// Wochenübersicht der Stempeluhr
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Die Tagesübersicht der Stempeluhr. Sie kommt vom SERVER und nicht aus dem
 * Sitzungsspeicher des Tablets: ein Neuladen (oder ein zweites Tablet) soll
 * denselben Tag zeigen, nicht wieder bei null anfangen.
 */
export const useClockActivity = () => {
    const [activity, setActivity] = useState<ClockActivity>({ date: null, events: [] });
    const [loading, setLoading] = useState(true);
    const [tick, setTick] = useState(0);
    const reload = useCallback(() => setTick((value) => value + 1), []);

    useEffect(() => {
        let cancelled = false;
        personnelApi
            .activity()
            .then((value) => { if (!cancelled) setActivity(value); })
            .catch(() => { if (!cancelled) setActivity({ date: null, events: [] }); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [tick]);

    return { activity, loading, reload };
};

export const useWeekOverview = (enabled: boolean) => {
    const [week, setWeek] = useState<WeekOverview>({ weekStart: null, days: [] });
    const [loading, setLoading] = useState(false);
    const [tick, setTick] = useState(0);
    const reload = useCallback(() => setTick((value) => value + 1), []);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setLoading(true);
        personnelApi
            .week()
            .then((value) => { if (!cancelled) setWeek(value); })
            .catch(() => { if (!cancelled) setWeek({ weekStart: null, days: [] }); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [enabled, tick]);

    return { week, loading, reload };
};

/**
 * Ein Wert, der nach `ms` von selbst wieder verschwindet — die Begrüssung am
 * Tablet ("Willkommen, …" für fünf Sekunden). Der Zeitgeber wird bei jedem
 * neuen Wert neu gestellt, damit zwei Scans kurz hintereinander nicht dazu
 * führen, dass die zweite Begrüssung nach der Restzeit der ersten verschwindet.
 */
export const useTransientValue = <T,>(ms: number): [T | null, (value: T) => void, () => void] => {
    const [value, setValue] = useState<T | null>(null);
    const timerRef = useRef<number | null>(null);

    const clear = useCallback(() => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        setValue(null);
    }, []);

    const show = useCallback((next: T) => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        setValue(next);
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            setValue(null);
        }, ms);
    }, [ms]);

    useEffect(() => () => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    }, []);

    return [value, show, clear];
};
