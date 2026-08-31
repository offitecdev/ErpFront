import { t } from '@/i18n/translate';
import { QuoteDatePicker } from '@/pages/sales/detail/components/common/QuoteDatePicker';
import { TaskStaffFilter, type TaskStaffPick } from './TaskStaffFilter';
import type { TaskRange, TaskScope } from './taskBoardModel';

/**
 * Die Filterzeile über dem Aufgabenbrett (19.08.2026) — EINE schmale Zeile
 * (Vorgabe: sie soll keinen Platz fressen).
 *
 * Der Zeitraum ist ein GEWÖHNLICHER Bereich: Von und Bis, jedes mit seiner
 * EIGENEN Datumsanzeige und seinem eigenen Kalenderfenster — Schnellwahl-Knöpfe
 * gibt es nicht (Vorgabe). Der Zeitraum gilt für BEIDE Spalten des Bretts.
 * Seit dem 11.09.2026 fängt er auch MEHRTÄGIGE Aufgaben: gefragt wird nach
 * Überschneidung, nicht nach dem Endtermin (siehe crmTask.routes.ts).
 *
 * Zwei Sichten, kein "Alle":
 *   • MIT MIR   — ich stehe in den Verantwortlichen (auch selbst zugewiesen)
 *   • OHNE MICH — ich habe sie zugewiesen, bin selbst nicht verantwortlich
 *
 * Daneben steht der MITARBEITERFILTER (19.08.2026): ein Tippfeld im selben
 * weichen Kleid wie die Datumsfelder, das beim Tippen die ersten sieben
 * Personen als Fenster anbietet. Seit dem 11.09.2026 nimmt er MEHRERE
 * Personen — leer heisst weiterhin alle. Er sitzt hier in der Leiste und gilt
 * darum an beiden Orten — auf /crm/tasks und im Aufgabenmodus des Kalenders.
 * Er verschärft die gewählte Sicht: "Mit mir" + Person zeigt, was wir GEMEINSAM
 * tragen, "Ohne mich" + Person, was ich DIESER Person gegeben habe.
 *
 * Der Kundenfilter, den die Seite als `children` hereinreicht, ist DASSELBE
 * Feld (`TaskFilterCombo`) — zwei Filter neben einander sollen nicht zwei
 * Bedienungen haben.
 *
 * Die Zahlen "offen / erledigt" stehen NICHT hier, sondern oben im Kopf des
 * jeweiligen Abschnitts neben seinem Namen (Vorgabe 19.08.2026) — dort, wo man
 * die Liste liest, zu der sie gehören.
 */
export const TaskBoardBar = ({ range, onRange, scope, onScope, staff, onStaff, children }: {
    range: TaskRange;
    onRange: (next: TaskRange) => void;
    scope: TaskScope;
    onScope: (next: TaskScope) => void;
    /** Gewählte Personen — LEER heisst alle (es gibt keinen "Alle …"-Eintrag). */
    staff: TaskStaffPick[];
    onStaff: (next: TaskStaffPick[]) => void;
    /** Weitere Filter der Seite (Kunde). */
    children?: React.ReactNode;
}) => (
    <div className="ofi-taskbar">
        {/* Jedes Feld trägt seine eigene Beschriftung und seinen eigenen
            Kalender — man sieht auf einen Blick, welches Datum wo steht. */}
        <label className="ofi-taskbar__date">
            <span>{t('crm.tasks.rangeFrom')}</span>
            <QuoteDatePicker
                ariaLabel={t('crm.tasks.rangeFrom')}
                value={range.from}
                onChange={(value) => onRange({ ...range, from: value })}
                className="ofi-taskbar__datefield"
            />
        </label>
        <label className="ofi-taskbar__date">
            <span>{t('crm.tasks.rangeTo')}</span>
            <QuoteDatePicker
                ariaLabel={t('crm.tasks.rangeTo')}
                value={range.to}
                onChange={(value) => onRange({ ...range, to: value })}
                className="ofi-taskbar__datefield"
            />
        </label>

        <span className="ofi-taskbar__sep" aria-hidden />

        <div className="ofi-cal-viewgroup">
            {([
                { key: 'me' as const, label: t('crm.tasks.scopeWithMe') },
                { key: 'by' as const, label: t('crm.tasks.scopeWithoutMe') },
            ]).map((item) => (
                <button
                    key={item.key}
                    type="button"
                    onClick={() => onScope(item.key)}
                    className={scope === item.key ? 'is-active' : ''}
                >
                    {item.label}
                </button>
            ))}
        </div>

        {/* Der Mitarbeiterfilter steht VOR den Filtern der Seite (Kunde): er
            gehört wie die zwei Sichten zu der Frage, WESSEN Aufgaben man sieht. */}
        <TaskStaffFilter values={staff} onChange={onStaff} />

        {children}
    </div>
);
