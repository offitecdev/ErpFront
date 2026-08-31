import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { calendarLabelApi, type CalendarLabelDto } from '@/lib/api/calendarLabels';

import { CAL_LABEL_ROLES, type CalLabel, type CalLabelRole } from './calendarShared';

/**
 * DIE ETIKETTEN DES KALENDERS (25.08.2026, Vorgabe Samet).
 *
 * Eine Liste je Mandant, aus der jeder Eintrag seine Farbe bezieht. Sie
 * beginnt LEER — nur ein Plus — und wird über das Zahnrad neben der
 * Überschrift gepflegt: umbenennen, umfärben, Rolle setzen, ausblenden,
 * löschen. Der Haken vor einer Zeile blendet ein Etikett aus dem Raster aus;
 * das ist eine Ansichtssache und bleibt im Browser liegen, nicht am Eintrag.
 *
 * WAS AN DEN SERVER GEHT UND WAS NICHT (26.08.2026, Vorgabe Samet). Anlegen,
 * Umbenennen, Umfärben, die Rolle — das sind Angaben AM ETIKETT und gehören
 * dem Mandanten; sie gehen an den Server. Der Papierkorb auch: er löscht
 * endgültig, für alle. Das AUSBLENDEN dagegen — Auge wie Haken — ist die
 * Ansicht eines Menschen und bleibt im Browser (`MUTED_KEY`/`RETIRED_KEY`).
 *
 * Die Liste wird EINMAL geholt und danach nur noch fortgeschrieben: eine
 * Umbenennung tauscht die Zeile, kein neuer Abruf. Das Raster hängt an ihr —
 * jede Karte sucht ihre Farbe darin —, und ein Abruf je Tastendruck im
 * Namensfeld liesse den ganzen Kalender flackern.
 */

const MUTED_KEY = 'ofi:calendarHiddenLabels';
/**
 * WEGGERÄUMT — IM BROWSER, NICHT IN DER DATENBANK (26.08.2026, Vorgabe Samet:
 * «das Ausblenden soll nicht die Datenbank betreffen, sondern die Oberfläche;
 * der Papierkorb dagegen den Server»).
 *
 * Bis hierher schrieb das Auge die Spalte `hidden` am Etikett: wer ein Etikett
 * wegräumte, räumte es dem GANZEN Mandanten weg. Das ist zu viel für eine
 * Ansichtssache — es ist die Entscheidung EINES Menschen, womit er arbeitet.
 * Sie liegt darum jetzt hier, neben dem Haken der Leiste.
 *
 * Die Spalte am Etikett bleibt bestehen und wird noch GELESEN: was gestern
 * weggeräumt wurde, ist beim ersten Aufschlagen weiterhin weggeräumt. Danach
 * gilt nur noch, was hier steht — geschrieben wird sie nicht mehr.
 *
 * Endgültig ist allein der Papierkorb, und der ist ein DELETE am Server.
 */
const RETIRED_KEY = 'ofi:calendarRetiredLabels';

const toLabel = (dto: CalendarLabelDto): CalLabel => ({
    id: dto.id,
    name: dto.name,
    color: dto.color,
    sortOrder: dto.sortOrder,
    role: dto.role ?? null,
    hidden: dto.hidden === true,
});

/** `null` = noch nie etwas gespeichert (nicht dasselbe wie «nichts gewählt»). */
const readIds = (key: string): string[] | null => {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
    } catch {
        return null;
    }
};

const writeIds = (key: string, ids: Set<string>) => {
    try {
        localStorage.setItem(key, JSON.stringify(Array.from(ids)));
    } catch { /* kein Speicher — dann gilt die Auswahl eben nur für diese Sitzung */ }
};

export type CalendarLabels = {
    /** ALLE, ausgeblendete eingeschlossen — das Verwaltungsfenster zeigt sie. */
    list: CalLabel[];
    /** Nur die sichtbaren — Leiste, Auswahlfeld und Vorschläge. */
    visible: CalLabel[];
    byId: Map<string, CalLabel>;
    /** Das SICHTBARE Etikett einer Rolle; `null`, solange keines sie trägt. */
    byRole: (role: CalLabelRole) => CalLabel | null;
    /** Rollen, die gerade KEIN sichtbares Etikett tragen — das «+» bietet sie an. */
    freeRoles: CalLabelRole[];
    loading: boolean;
    /**
     * Im EIGENEN Raster weggeklickt (der Haken in der Leiste) — eine reine
     * Ansichtssache, im Browser gemerkt. Nicht zu verwechseln mit `hidden` am
     * Etikett selbst: das gilt für alle und wird im Zahnrad gesetzt.
     */
    muted: Set<string>;
    toggleMuted: (id: string) => void;
    create: (input: { name: string; color: string; role: CalLabelRole | null }) => Promise<CalLabel | null>;
    update: (id: string, patch: { name?: string; color?: string; role?: CalLabelRole | null; hidden?: boolean }) => Promise<CalLabel | null>;
    /**
     * Wegräumen ohne wegzuwerfen — der gewöhnliche Weg statt `remove`. Das
     * geschieht NUR IM BROWSER (siehe RETIRED_KEY): es ist die Ansicht dieses
     * einen Menschen, kein Eingriff am Etikett des Mandanten. Darum gibt es
     * hier auch nichts, was scheitern könnte — das Versprechen bleibt allein
     * der aufrufenden Seite zuliebe stehen.
     */
    retire: (id: string, hidden: boolean) => Promise<boolean>;
    /** ENDGÜLTIG. `inUse` = das Etikett klebt noch an Einträgen; erst `force` löscht es. */
    remove: (id: string, options?: { force?: boolean }) => Promise<'ok' | 'inUse' | 'failed'>;
    reload: () => Promise<void>;
};

export const useCalendarLabels = (): CalendarLabels => {
    /* Die Zeilen, wie sie vom Server kommen. Was davon WEGGERÄUMT ist, steht
       nicht darin, sondern in `retired` — siehe unten. */
    const [rows, setRows] = useState<CalLabel[]>([]);
    const [loading, setLoading] = useState(true);
    const [muted, setMuted] = useState<Set<string>>(() => new Set(readIds(MUTED_KEY) ?? []));
    const [retired, setRetired] = useState<Set<string>>(() => new Set(readIds(RETIRED_KEY) ?? []));
    /* Die Liste kommt einmal. Ein zweiter Aufruf desselben Effekts (React im
       strengen Modus, ein Sprachwechsel) soll sie nicht noch einmal holen. */
    const started = useRef(false);

    const load = useCallback(async () => {
        try {
            const dtos = await calendarLabelApi.list();
            const fetched = dtos.map(toLabel);
            setRows(fetched);
            /* EINMALIG ÜBERNEHMEN: was noch aus der Zeit der Serverspalte
               weggeräumt ist, bleibt es auch hier — aber nur, solange dieser
               Browser noch gar nichts gespeichert hat. Danach gilt allein
               seine eigene Auswahl, sonst käme die alte Spalte bei jedem
               Laden zurück und liesse sich nie wieder aufklappen. */
            if (readIds(RETIRED_KEY) === null) {
                const carried = new Set(fetched.filter((label) => label.hidden).map((label) => label.id));
                writeIds(RETIRED_KEY, carried);
                setRetired(carried);
            }
        } catch {
            /* Ohne Liste bleibt der Kalender bedienbar: die Karten fallen auf
               ihre alten Farben zurück, die Leiste zeigt keine Etiketten. */
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        void load();
    }, [load]);

    /**
     * DIE LISTE, WIE SIE DIE OBERFLÄCHE SIEHT. `hidden` heisst ab hier
     * «weggeräumt IN DIESEM BROWSER» und kommt aus `retired`, nicht mehr aus
     * der Spalte am Etikett. Alles, was daran hängt — die Leiste, das
     * Auswahlfeld, die freien Rollen, das Verwaltungsfenster —, bleibt damit
     * unverändert: es liest weiter `hidden`, nur steht jetzt etwas anderes
     * dahinter.
     */
    const list = useMemo(
        () => rows.map((label) => (label.hidden === retired.has(label.id)
            ? label
            : { ...label, hidden: retired.has(label.id) })),
        [rows, retired],
    );

    const byId = useMemo(() => new Map(list.map((label) => [label.id, label])), [list]);
    const visible = useMemo(() => list.filter((label) => !label.hidden), [list]);

    const byRole = useCallback(
        (role: CalLabelRole) => visible.find((label) => label.role === role) ?? null,
        [visible],
    );

    const freeRoles = useMemo(
        () => CAL_LABEL_ROLES.filter((role) => !visible.some((label) => label.role === role)),
        [visible],
    );

    const toggleMuted = useCallback((id: string) => {
        setMuted((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            writeIds(MUTED_KEY, next);
            return next;
        });
    }, []);

    const sortRows = (rows: CalLabel[]) =>
        [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    const create = useCallback(async (input: { name: string; color: string; role: CalLabelRole | null }) => {
        try {
            const created = toLabel(await calendarLabelApi.create(input));
            setRows((current) => sortRows([...current, created]));
            return created;
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('calendar.labels.saveFailed'));
            return null;
        }
    }, []);

    const update = useCallback(async (id: string, patch: { name?: string; color?: string; role?: CalLabelRole | null; hidden?: boolean }) => {
        try {
            const saved = toLabel(await calendarLabelApi.update(id, patch));
            setRows((current) => sortRows(current.map((label) => (label.id === id ? saved : label))));
            return saved;
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('calendar.labels.saveFailed'));
            return null;
        }
    }, []);

    /**
     * WEGRÄUMEN, OHNE WEGZUWERFEN (Vorgabe 25.08.2026: «lieber unsichtbar
     * machen als endgültig löschen»). Das Etikett verschwindet aus der Leiste
     * und aus dem Auswahlfeld; die Einträge behalten es, und weil seine Rolle
     * damit wieder frei ist, holt das «+» es zurück.
     *
     * Das geschieht seit dem 26.08.2026 NUR IN DIESEM BROWSER — kein Aufruf
     * am Server, keine Spalte am Etikett: was einer wegräumt, räumt er sich
     * weg und nicht seinen Kollegen. Es kann darum nicht scheitern und muss
     * auf nichts warten; die Zeile springt sofort.
     */
    const retire = useCallback(async (id: string, hidden: boolean) => {
        setRetired((current) => {
            if (current.has(id) === hidden) return current;
            const next = new Set(current);
            if (hidden) next.add(id);
            else next.delete(id);
            writeIds(RETIRED_KEY, next);
            return next;
        });
        return true;
    }, []);

    /**
     * ENDGÜLTIG löschen. Klebt das Etikett noch an Einträgen, antwortet der Server mit
     * 409 und der Anzahl; der Aufruf meldet dann `inUse` zurück und die
     * Leiste fragt an ihrer eigenen Zeile nach («noch einmal drücken»). Ein
     * Kasten des BROWSERS kommt hier nicht vor — die Anwendung fragt selbst
     * (Vorgabe 02.08.2026). Die Einträge bleiben in jedem Fall stehen; sie
     * sind danach ohne Etikett und tragen wieder ihre Notnagel-Farbe.
     */
    const remove = useCallback(async (id: string, options: { force?: boolean } = {}) => {
        try {
            await calendarLabelApi.remove(id, { force: options.force === true });
            setRows((current) => current.filter((label) => label.id !== id));
            /* Die Kennung ist weg — sie darf in keiner der beiden Merklisten
               des Browsers liegen bleiben, sonst wächst dort ewig Schutt an. */
            setMuted((current) => {
                if (!current.has(id)) return current;
                const next = new Set(current);
                next.delete(id);
                writeIds(MUTED_KEY, next);
                return next;
            });
            setRetired((current) => {
                if (!current.has(id)) return current;
                const next = new Set(current);
                next.delete(id);
                writeIds(RETIRED_KEY, next);
                return next;
            });
            return 'ok' as const;
        } catch (error: any) {
            if (error?.response?.status === 409 && Number(error?.response?.data?.inUse ?? 0) > 0) return 'inUse' as const;
            toast.error(error?.response?.data?.error || t('calendar.labels.deleteFailed'));
            return 'failed' as const;
        }
    }, []);

    return { list, visible, byId, byRole, freeRoles, loading, muted, toggleMuted, create, update, retire, remove, reload: load };
};
