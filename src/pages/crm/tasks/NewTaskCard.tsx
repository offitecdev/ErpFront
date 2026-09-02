import { useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { Clock, Link02, ListChecks, Paperclip, Plus } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { FloatingCard } from '@/pages/calendar/components/FloatingCard';
import { QuoteDatePicker } from '@/pages/sales/detail/components/common/QuoteDatePicker';
import { CustomerContactCombo } from '../components/CustomerContactCombo';
import { StaffMultiCombo } from '../components/StaffMultiCombo';
import { toDateInputValue } from '../utils/crmFormat.utils';
import type { CrmCustomerOption } from '../types/crm.types';
import { TaskFilesPane } from './TaskFilesPane';
import { TaskStepsEditor, type TaskStepDraft } from './TaskStepsEditor';
import { TaskTenderCombo, type TaskTenderPick } from './TaskTenderCombo';
import { spanToIso } from './taskSchedule';

/**
 * "Neue Aufgabe" — ein KLEINES, ruhiges Fenster (Vorgabe 19.08.2026: einfacher
 * und schöner als das allgemeine Schnellerfassungs-Formular).
 *
 * ══ UMGEBAUT AM 11.09.2026 (Vorgabe Samet) ═══════════════════════════════
 *
 * DIE AUFGABE HAT EINEN ANFANG UND EIN ENDE. «Die Startzeit der Aufgabe muss
 * ihre Endzeit haben; sie darf sich über mehrere Tage ziehen und muss nicht
 * im Kalender stehen.» Also zwei Zeilen — Beginn und Ende, je mit Datum und
 * Uhrzeit — statt des einen Termins. «Ganztägig» nimmt die Uhrzeiten weg; das
 * ist der häufige Fall und darum die Vorauswahl.
 *
 * DER REST STEHT HINTER ZEICHEN, NICHT IN ABSCHNITTEN. «Es braucht keinen
 * ‹Schritt-für-Schritt›-Abschnitt oben — lass uns oben Zeichen haben, über die
 * man sie hinzufügt. Beim Klick auf den Knopf ändert sich das Fenster.» Oben
 * steht darum eine Reihe aus drei Zeichen; jedes tauscht den INHALT des
 * Fensters gegen sein Blatt, ein zweiter Klick führt zurück:
 *
 *      ⏱  Termin        — Beginn, Ende, Verantwortliche (das ERSTE Blatt)
 *      🔗  Verknüpfung   — Kunde und Offerte
 *      ☑  Anleitung      — Schritt für Schritt
 *      📎  Anhänge       — Bilder UND PDF
 *
 * DAS ERSTE ZEICHEN IST BEIM ÖFFNEN GEWÄHLT (Vorgabe 12.09.2026). Vorher war
 * das Grundblatt zwar offen, hatte in der Reihe aber kein Zeichen — die drei
 * standen also alle unbenutzt da und man sah nicht, WO man ist. Jetzt trägt
 * jedes Blatt sein Zeichen, und das erste leuchtet von Anfang an.
 *
 * DER TITEL BEGINNT MIT EINEM PLUS (Vorgabe 12.09.2026): «damit man sieht,
 * wozu das Fenster da ist». Ein Fenster, das nur «Neue Aufgabe» heisst, sieht
 * aus wie eines, das eine bestehende zeigt.
 *
 * OHNE ANSPRECHPARTNER (Vorgabe 12.09.2026: «nimm den Ansprechpartner aus dem
 * Fenster»). Eine Aufgabe hängt am KUNDEN, nicht an einer bestimmten Person
 * darin — und das zweite Feld erschien erst nach der Kundenwahl, schob dabei
 * alles darunter nach unten und stand als einziges nicht auf der Achse der
 * anderen. Der Ansprechpartner bleibt an den Erfassungen, die ihn wirklich
 * meinen (Telefon, Notiz): dort ist er der Gesprächspartner.
 *
 * KUNDE UND OFFERTE SIND FREIWILLIG. «Wir sollten auf Kunden und Offerten
 * verweisen können, aber man soll nicht jedes Mal ‹Kunde› tippen müssen.»
 * Vorher stand die Kundenzeile im Grundblatt und wollte bei JEDER Aufgabe
 * ausgefüllt werden — jetzt steht sie hinter dem Kettenzeichen, und wer sie
 * nicht braucht, sieht sie nie. Das Zeichen trägt einen Punkt, sobald etwas
 * daran hängt, damit man es nicht vergisst.
 *
 * DAS FENSTER PASST. Es ist breiter (520 statt 420), sein Körper rollt, und
 * seine Höhe ist auf den Schirm gedeckelt (`.ofi-newtask-card` in index.css) —
 * vorher wuchs es mit den Chips der Verantwortlichen aus dem Bild heraus.
 *
 * UND ES STEHT AUF EINER ACHSE (Vorgabe 12.09.2026: «richte alles genau aus —
 * Beschriftungen, Felder, die Kreise der Anleitung und ihre Zeilen»). EINE
 * Spalte für die Beschriftungen, EINE Kante für alle Felder, auf JEDEM Blatt —
 * auch die Anleitung und die Anhänge beginnen dort, damit beim Umschalten
 * nichts springt. Die Zahlen der Anleitung stehen in der Beschriftungsspalte,
 * ihre Kreise genau an der Feldkante. Wie das gerechnet wird, steht in
 * index.css bei `--ofi-newtask-label`.
 *
 * Ein Klick daneben schliesst NICHT: ein halb getippter Titel darf nicht durch
 * einen Streifschuss verschwinden.
 */

/** Die drei Blätter hinter den Zeichen — `plan` ist das Grundblatt. */
type Sheet = 'plan' | 'link' | 'steps' | 'files';

/** Vorauswahl der Uhrzeiten, sobald jemand «Ganztägig» abwählt. */
const DEFAULT_START_TIME = '08:00';
const DEFAULT_END_TIME = '17:00';

export const NewTaskCard = ({ open, onClose, onSaved }: {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
}) => {
    const today = toDateInputValue(new Date());
    const [sheet, setSheet] = useState<Sheet>('plan');
    const [title, setTitle] = useState('');
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
    const [endTime, setEndTime] = useState(DEFAULT_END_TIME);
    const [allDay, setAllDay] = useState(true);
    const [assignees, setAssignees] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
    const [customer, setCustomer] = useState<CrmCustomerOption | null>(null);
    const [tender, setTender] = useState<TaskTenderPick | null>(null);
    const [steps, setSteps] = useState<TaskStepDraft[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [saving, setSaving] = useState(false);

    const reset = () => {
        setSheet('plan');
        setTitle('');
        setStartDate(today);
        setEndDate(today);
        setStartTime(DEFAULT_START_TIME);
        setEndTime(DEFAULT_END_TIME);
        setAllDay(true);
        setAssignees([]);
        setCustomer(null);
        setTender(null);
        setSteps([]);
        setFiles([]);
    };

    const close = () => { reset(); onClose(); };

    /* ══ KUNDE UND OFFERTE ZIEHEN EINANDER NACH (13.09.2026, Vorgabe Samet) ══
     *
     * «Man wählt die Offertennummer und sie verschwindet.» So war es: hier
     * stand die Regel «wechselt der Kunde, fällt die Offerte weg», und sie
     * traf JEDEN Kundenwechsel — auch den von NICHTS auf einen Kunden. Wer
     * also zuerst die Offerte griff (man kennt ja die Nummer) und danach den
     * Kunden eintrug, sah die eben gewählte Nummer im selben Moment lautlos
     * verschwinden; dasselbe beim blossen Tippen im Kundenfeld, denn Tippen
     * löst die Kundenbindung und meldet einen «Wechsel» auf null.
     *
     * Jetzt gilt die eine Frage, um die es wirklich geht: GEHÖRT DIE OFFERTE
     * DIESEM KUNDEN? Nur wenn der neu gewählte Kunde ein ANDERER ist als der
     * Kunde der Offerte, wird sie gelöst — der Rest bleibt stehen.
     */
    const pickCustomer = (nextCustomer: CrmCustomerOption | null) => {
        setCustomer(nextCustomer);
        const quoteOwner = tender?.customerId ?? null;
        if (tender && nextCustomer && quoteOwner && quoteOwner !== nextCustomer.id) setTender(null);
    };

    /* Umgekehrt: eine Offerte bringt ihren Kunden MIT. Ist noch keiner
       eingetragen, trägt die Wahl ihn ein — die Aufgabe hängt damit an
       beidem, ohne dass jemand denselben Namen ein zweites Mal sucht. */
    const pickTender = (next: TaskTenderPick | null) => {
        setTender(next);
        if (next?.customerId && next.customerName && !customer) {
            setCustomer({ id: next.customerId, companyName: next.customerName });
        }
    };

    /* Ein zweiter Klick auf dasselbe Zeichen führt zurück aufs Grundblatt —
       sonst müsste man den Weg zurück suchen, und es gibt keinen anderen. */
    const goTo = (next: Sheet) => setSheet((current) => (current === next ? 'plan' : next));

    const save = async () => {
        if (!title.trim()) return;
        setSaving(true);
        try {
            const span = spanToIso({ startDate, endDate, startTime, endTime, allDay });
            const created = await crmApi.createTask({
                kind: 'TASK',
                title: title.trim(),
                customerId: customer?.id || null,
                tenderId: tender?.id || null,
                assigneeEmployeeIds: assignees.map((person) => person.id),
                startAt: span.startAt,
                dueDate: span.dueDate,
                allDay,
                steps: steps
                    .map((step) => ({ text: step.text.trim(), done: step.done }))
                    .filter((step) => step.text),
            });
            /* Die Anhänge reisen NACH der Anlage: vorher gibt es keine Aufgabe,
               an die sie gehen könnten. Scheitert nur diese zweite Sendung,
               steht die Aufgabe trotzdem — sie geht nicht mit den Dateien
               verloren, und man kann sie im Fenster nachtragen. */
            if (files.length) {
                try {
                    await crmApi.addTaskDocuments(created.id, files);
                } catch {
                    toast.error(t('crm.tasks.fileSaveError'));
                }
            }
            reset();
            onSaved();
            onClose();
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
            toast.error(typeof message === 'string' && message ? message : t('crm.quick.saveError'));
        } finally {
            setSaving(false);
        }
    };

    /* Die Zeichenreihe. Das ERSTE Zeichen ist das Grundblatt und beim Öffnen
       gewählt (Vorgabe 12.09.2026). Der Punkt an einem Zeichen sagt, dass
       hinter ihm etwas steht — ohne ihn müsste man jedes Blatt aufschlagen,
       um zu sehen, was man schon erfasst hat; das Grundblatt trägt keinen, es
       ist nie leer. */
    const marks: Array<{ key: Sheet; icon: React.ReactNode; label: string; count: number }> = [
        {
            key: 'plan',
            icon: <Clock size={16} />,
            label: t('crm.tasks.sheetPlan'),
            count: 0,
        },
        {
            key: 'link',
            icon: <Link02 size={16} />,
            label: t('crm.tasks.sheetLink'),
            count: (customer ? 1 : 0) + (tender ? 1 : 0),
        },
        {
            key: 'steps',
            icon: <ListChecks size={16} />,
            label: t('crm.tasks.sheetSteps'),
            count: steps.filter((step) => step.text.trim()).length,
        },
        {
            key: 'files',
            icon: <Paperclip size={16} />,
            label: t('crm.tasks.sheetFiles'),
            count: files.length,
        },
    ];

    return (
        <FloatingCard
            open={open}
            onClose={close}
            centered
            closeOnBack
            width={520}
            className="ofi-newtask-card"
            /* Das Plus sagt, was das Fenster tut (Vorgabe 12.09.2026) — ohne
               es sieht «Neue Aufgabe» aus wie die Überschrift einer
               bestehenden. */
            title={(
                <span className="ofi-newtask__cardtitle">
                    <Plus size={15} aria-hidden />
                    {t('crm.tasks.newTask')}
                </span>
            )}
            footer={(
                <div className="ofi-newtask__foot">
                    <button type="button" onClick={close}>{t('common.cancel')}</button>
                    <button
                        type="button"
                        disabled={saving || !title.trim()}
                        onClick={() => void save()}
                        className="is-primary"
                    >
                        {saving ? t('common.saving') : t('common.save')}
                    </button>
                </div>
            )}
        >
            <div className="ofi-newtask">
                {/* Der Titel ist die Aufgabe — er steht gross, bekommt den Fokus
                    und BLEIBT stehen, welches Blatt auch offen ist. */}
                <input
                    autoFocus
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter' && title.trim()) void save(); }}
                    placeholder={t('crm.tasks.titlePlaceholder')}
                    aria-label={t('crm.tasks.colTask')}
                    className="ofi-newtask__title"
                />

                {/* ── Die Zeichenreihe ─────────────────────────────────────── */}
                <div className="ofi-newtask__marks" role="tablist" aria-label={t('crm.tasks.sheetsLabel')}>
                    {marks.map((mark) => (
                        <button
                            key={mark.key}
                            type="button"
                            role="tab"
                            aria-selected={sheet === mark.key}
                            onClick={() => goTo(mark.key)}
                            title={mark.label}
                            aria-label={mark.label}
                            className={`ofi-newtask__mark ${sheet === mark.key ? 'is-active' : ''}`}
                        >
                            {mark.icon}
                            {mark.count > 0 && <span className="ofi-newtask__markdot">{mark.count}</span>}
                        </button>
                    ))}
                    {/* Der Name des offenen Blattes steht daneben, nicht als
                        Beschriftung an jedem Zeichen: drei Wörter in einer
                        Reihe machen aus den Zeichen wieder Abschnitte. */}
                    <span className="ofi-newtask__marklabel">
                        {marks.find((mark) => mark.key === sheet)?.label}
                    </span>
                </div>

                {/* ── Grundblatt: wann und wer ─────────────────────────────── */}
                {sheet === 'plan' && (
                    <>
                        <label className="ofi-newtask__row">
                            <span>{t('crm.tasks.spanStart')}</span>
                            <div className="ofi-newtask__when">
                                <QuoteDatePicker
                                    ariaLabel={t('crm.tasks.spanStart')}
                                    value={startDate}
                                    onChange={(value) => {
                                        setStartDate(value);
                                        // Das Ende folgt mit, solange es davor läge —
                                        // eine Aufgabe, die endet, bevor sie anfängt,
                                        // ist keine Eingabe, sondern ein Versehen.
                                        if (value && endDate && dayjs(endDate).isBefore(dayjs(value))) setEndDate(value);
                                    }}
                                    className="ofi-newtask__control"
                                />
                                {!allDay && (
                                    <input
                                        type="time"
                                        value={startTime}
                                        onChange={(event) => setStartTime(event.target.value)}
                                        aria-label={t('crm.tasks.spanStart')}
                                        className="ofi-cal-input ofi-newtask__time"
                                    />
                                )}
                            </div>
                        </label>

                        <label className="ofi-newtask__row">
                            <span>{t('crm.tasks.spanEnd')}</span>
                            <div className="ofi-newtask__when">
                                <QuoteDatePicker
                                    ariaLabel={t('crm.tasks.spanEnd')}
                                    value={endDate}
                                    min={startDate || undefined}
                                    onChange={setEndDate}
                                    className="ofi-newtask__control"
                                />
                                {!allDay && (
                                    <input
                                        type="time"
                                        value={endTime}
                                        onChange={(event) => setEndTime(event.target.value)}
                                        aria-label={t('crm.tasks.spanEnd')}
                                        className="ofi-cal-input ofi-newtask__time"
                                    />
                                )}
                            </div>
                        </label>

                        <label className="ofi-newtask__row is-check">
                            <span>{t('crm.tasks.allDay')}</span>
                            <span className="ofi-newtask__allday">
                                <input
                                    type="checkbox"
                                    checked={allDay}
                                    onChange={(event) => setAllDay(event.target.checked)}
                                />
                                <span>{allDay ? t('crm.tasks.allDayOn') : t('crm.tasks.allDayOff')}</span>
                            </span>
                        </label>

                        <label className="ofi-newtask__row is-tall">
                            <span>{t('crm.tasks.colAssignee')}</span>
                            <StaffMultiCombo
                                value={assignees}
                                onChange={setAssignees}
                                placeholder={t('crm.tasks.assigneesPlaceholder')}
                                z={130}
                                compact
                            />
                        </label>
                    </>
                )}

                {/* ── Verknüpfung: Kunde und Offerte, beide freiwillig ─────── */}
                {sheet === 'link' && (
                    <>
                        <p className="ofi-newtask__note">{t('crm.tasks.linkHint')}</p>
                        <label className="ofi-newtask__row is-tall">
                            <span>{t('crm.tasks.colCustomer')}</span>
                            <CustomerContactCombo
                                customer={customer}
                                contact={null}
                                withContact={false}
                                z={130}
                                onChange={pickCustomer}
                            />
                        </label>
                        <label className="ofi-newtask__row is-tall">
                            <span>{t('crm.tasks.colQuote')}</span>
                            <TaskTenderCombo
                                value={tender}
                                onChange={pickTender}
                                customerId={customer?.id ?? null}
                                z={130}
                            />
                        </label>
                    </>
                )}

                {/* Anleitung und Anhänge stehen in DERSELBEN Spalte wie die
                    Felder darüber (`__pane`) — beim Umschalten springt darum
                    keine Kante. */}
                {sheet === 'steps' && (
                    <div className="ofi-newtask__pane">
                        <TaskStepsEditor steps={steps} onChange={setSteps} />
                    </div>
                )}

                {sheet === 'files' && (
                    <div className="ofi-newtask__pane">
                        <TaskFilesPane staged={files} onStaged={setFiles} />
                    </div>
                )}
            </div>
        </FloatingCard>
    );
};
