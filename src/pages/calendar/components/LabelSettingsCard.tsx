import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ChevronDown, ChevronLeft, Edit01, EyeOff, Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { FloatingCard } from './FloatingCard';
import {
    CAL_LABEL_ROLES,
    CAL_LABEL_ROLE_DEFAULTS,
    calLabelDisplayName,
    calLabelRoleName,
    labelInk,
    labelSurface,
    type CalLabel,
    type CalLabelRole,
    type FloatAnchor,
} from '../calendarShared';

/**
 * DIE ETIKETTEN VERWALTEN — das Zahnrad neben «Etiketten» (25.08.2026,
 * Vorgabe Samet).
 *
 * EIN Fenster mit zwei Ansichten, nicht zwei gestapelte Fenster:
 *
 *   Liste  — jede Zeile ein Etikett: Farbpunkt, Name, Rolle, Stift, Auge.
 *            Darunter, was WEGGERÄUMT ist, und ganz unten das Plus.
 *   Blatt  — Name, Rolle und Farbe EINES Etiketts, mit der Pille darüber, wie
 *            sie nachher im Raster steht. Der Pfeil oben führt zurück.
 *
 * Zwei Fenster übereinander wären hier falsch: das zweite verdeckte die
 * Liste, aus der man kommt, und der Weg zurück wäre ein Schliessen statt
 * eines Schritts.
 *
 * JEDES ETIKETT HAT EINE ROLLE (Vorgabe 25.08.2026: «ein ‹ohne Rolle› soll es
 * nicht geben — gespeichert werden nur Rollen, damit man Einträge daran
 * hängen kann»). Die Liste IST damit die Liste der Rollen: geplanter Termin,
 * laufender Termin, abgeschlossener Termin, Besprechung — je Rolle genau ein
 * Etikett, benannt und gefärbt, wie der Betrieb es will.
 *
 * Zwei Wege, eines loszuwerden:
 *   Auge        — ausblenden. Es verschwindet aus Leiste und Auswahlfeld, die
 *                 Einträge behalten es, und das Plus holt es zurück, wie es war.
 *   Papierkorb  — endgültig. Fragt zweimal. Die Rolle ist danach frei und wird
 *                 über das Plus neu vergeben — mit Vorgabename und -farbe.
 */

/* Google-Kalenderpalette, dazu das Rot des offenen Termins. Die Reihenfolge
   ist zugleich die, in der ein Etikett OHNE Rolle seine Farbe bekommt. */
const SWATCHES = [
    '#d93025', '#039be5', '#0b8043', '#8e24aa', '#f4511e', '#3f51b5', '#33b679',
    '#f6bf26', '#00838f', '#7986cb', '#e67c73', '#4285f4', '#616161', '#a79b8e',
];

const DEFAULT_COLOR = SWATCHES[0]!;

const roleName = (role: CalLabelRole) => calLabelRoleName(role);

/**
 * Die zweite Zeile einer Listenzeile. Sie steht nur da, wenn sie etwas SAGT:
 * heisst das Etikett wie seine Rolle («Besprechung» / «Besprechung»), stuende
 * zweimal dasselbe untereinander. Nach einer Umbenennung
 * («Kundengespräch» / «Besprechung») trägt sie dagegen die Auskunft, wofür
 * das Etikett vorgeschlagen wird.
 */
const roleNote = (label: CalLabel): string | null => {
    if (!label.role) return null;
    const name = roleName(label.role);
    return name.toLowerCase() === calLabelDisplayName(label).toLowerCase() ? null : name;
};

/** Die Farbe, mit der eine Rolle anfängt — blau, indigo, grün, violett. */
const suggestColor = (role: CalLabelRole): string => CAL_LABEL_ROLE_DEFAULTS[role].color;

/**
 * Der vorgeschlagene Name: der Name der Rolle («Geplanter Termin»). Gibt es
 * ihn schon — ein weggeräumtes Etikett hält ihn fest —, wird durchnummeriert:
 * ein doppelter Name wird vom Server abgelehnt (409), und ein Vorschlag darf
 * nicht in eine Absage laufen.
 */
const suggestName = (labels: ReadonlyArray<CalLabel>, role: CalLabelRole): string => {
    /* Belegt ist ein Name in ZWEI Fassungen: so, wie er gespeichert ist (daran
       misst der Server seine Absage), und so, wie er dasteht — sonst stuenden
       zwei Zeilen mit demselben Wort untereinander. */
    const taken = new Set(labels.flatMap((label) => [
        label.name.trim().toLowerCase(),
        calLabelDisplayName(label).toLowerCase(),
    ]));
    const base = roleName(role);
    if (!taken.has(base.toLowerCase())) return base;
    for (let index = 2; index <= labels.length + 2; index += 1) {
        const candidate = `${base} ${index}`;
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base} ${labels.length + 2}`;
};

/* ── Die Rolle wählen ────────────────────────────────────────────────────── */

/**
 * EINE AUFKLAPPENDE LISTE, KEIN KNOPFBAND (26.08.2026, Vorgabe Samet: «die
 * Rollen sollen eine Liste sein — nicht nebeneinander stehende Knöpfe und
 * nicht drei plus zwei umgebrochen»).
 *
 * Vier Rollen nebeneinander sprengen die 380 Pixel der Karte: sie brachen um,
 * und wie sie umbrachen, hing an der Sprache — «Abgeschlossener Termin» ist
 * dreimal so lang wie «Meeting». Dieselbe Wahl sah damit auf Deutsch anders
 * aus als auf Türkisch.
 *
 * Der Aufklapper zeigt statt dessen genau die EINE, die gilt, und darunter
 * stehen die vier untereinander — eine Zeile je Rolle, immer gleich breit,
 * mit dem Farbpunkt, den die Rolle mitbringt.
 *
 * Die Liste hängt am Körper (Portal) und steht `fixed`: das Blatt der Karte
 * scrollt, eine im Feld aufklappende Liste wäre an seiner Kante abgeschnitten.
 * Es ist dieselbe Bauart, mit der ein EINTRAG sein Etikett bekommt
 * (`LabelPicker`) — die Verwaltung bringt keine zweite mit.
 */
const RoleSelect = ({ value, taken, onPick }: {
    value: CalLabelRole;
    /* Rollen, die schon ein sichtbares Etikett tragen. */
    taken: ReadonlySet<CalLabelRole>;
    onPick: (role: CalLabelRole) => void;
}) => {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);

    /**
     * WAS VERGEBEN IST, STEHT NICHT IN DER LISTE (26.08.2026, Vorgabe Samet:
     * «schon zugeordnete Rollen sollen im Aufklapper nicht erscheinen»).
     *
     * Vorher standen sie ausgegraut da — im Bild waren drei von vier Zeilen
     * blass und nur eine anwählbar. Eine Liste, die überwiegend aus
     * Unwählbarem besteht, ist keine Wahl; sie zeigt nur, was man nicht darf.
     *
     * Die EIGENE Rolle bleibt in jedem Fall stehen: sie ist die Antwort, die
     * das Feld gerade gibt, und ein Aufklapper, der seinen eigenen Wert nicht
     * führt, sähe leer aus.
     */
    const options = CAL_LABEL_ROLES.filter((role) => role === value || !taken.has(role));

    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-role-menu]') || target?.closest('[data-role-trigger]')) return;
            setOpen(false);
        };
        /* Escape schliesst die LISTE, nicht das Fenster darunter — sonst wäre
           das Aufklappen ein Weg, aus dem man nur ganz hinausfällt. */
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
        };
        window.addEventListener('pointerdown', close);
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener('pointerdown', close);
            window.removeEventListener('keydown', onKey, true);
        };
    }, [open]);

    /* Bleibt nach dem Aussortieren nur die eigene Rolle übrig, gibt es nichts
       aufzuklappen: das Feld sagt dann, was gilt, und warum es dabei bleibt —
       eine Liste, die einen einzigen, schon gewählten Eintrag zeigt, wäre ein
       Knopf, der nichts tut. */
    const canPick = options.length > 1;

    const toggle = () => {
        if (!canPick) return;
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) {
            /* Nach unten, solange darunter Platz ist — sonst nach oben. Die
               Breite ist die des Feldes: die Liste soll unter ihm stehen und
               nicht daneben hinausragen. */
            const height = options.length * 34 + 12;
            const below = window.innerHeight - rect.bottom;
            setBox({
                left: rect.left,
                top: below > height + 12 ? rect.bottom + 4 : Math.max(8, rect.top - height - 4),
                width: rect.width,
            });
        }
        setOpen((current) => !current);
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                data-role-trigger
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={!canPick}
                title={canPick ? undefined : t('calendar.labels.roleTaken')}
                onClick={toggle}
                className={`ofi-cal-labelpick ${canPick ? '' : 'is-disabled'}`}
            >
                <span className="ofi-cal-rolepick__value">
                    <span className="ofi-ucal-dot" style={{ background: CAL_LABEL_ROLE_DEFAULTS[value].color }} />
                    <span className="truncate">{roleName(value)}</span>
                </span>
                {canPick && <ChevronDown size={13} className="shrink-0 opacity-60" />}
            </button>

            {open && box && createPortal(
                <div
                    data-role-menu
                    role="listbox"
                    className="ofi-cal-labelmenu"
                    style={{ left: box.left, top: box.top, width: box.width }}
                >
                    {options.map((role) => (
                        <button
                            key={role}
                            type="button"
                            role="option"
                            aria-selected={role === value}
                            onClick={() => { onPick(role); setOpen(false); }}
                            className={`ofi-cal-labelmenu__row ${role === value ? 'is-on' : ''}`}
                        >
                            <span className="ofi-ucal-dot" style={{ background: CAL_LABEL_ROLE_DEFAULTS[role].color }} />
                            <span className="truncate">{roleName(role)}</span>
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    );
};

/* ── Blatt: ein Etikett ──────────────────────────────────────────────────── */

const LabelSheet = ({ label, labels, startRole, busy, onCancel, onSave }: {
    /* null = ein neues Etikett anlegen. */
    label: CalLabel | null;
    /* Alle Etiketten — für den Vorschlag und um belegte Rollen zu sperren. */
    labels: ReadonlyArray<CalLabel>;
    /* Die Rolle, mit der ein neues Etikett aufgemacht wird (aus dem Plus).
       Sie ist PFLICHT — ein Etikett ohne Rolle gibt es nicht mehr. */
    startRole: CalLabelRole;
    busy: boolean;
    onCancel: () => void;
    onSave: (input: { name: string; color: string; role: CalLabelRole }) => void;
}) => {
    const [role, setRole] = useState<CalLabelRole>(label?.role ?? startRole);
    /* Im Feld steht, was auch in der Leiste steht: der vorgegebene Name in der
       Sprache des Benutzers. Wer ihn ungeändert speichert, schreibt ihn damit
       in seiner Sprache fest — und der Kollege in der anderen liest ihn
       trotzdem wieder in seiner (calLabelName kennt alle drei Vorgaben). */
    const [name, setName] = useState(label ? calLabelDisplayName(label) : suggestName(labels, startRole));
    const [color, setColor] = useState(label?.color ?? suggestColor(startRole));

    /* Eine Rolle, die schon ein SICHTBARES Etikett trägt, steht nicht zur
       Wahl: es soll je Rolle genau einen Vorschlag geben. Die eigene bleibt
       natürlich wählbar. */
    const takenRoles = new Set(
        labels
            .filter((row) => !row.hidden && row.role && row.id !== label?.id)
            .map((row) => row.role as CalLabelRole),
    );

    /**
     * DIE ROLLE ZIEHT NAME UND FARBE MIT — aber nur, solange beide noch auf
     * dem Vorschlag stehen. Wer «Besprechung» in «Kundengespräch» umbenannt
     * oder eine eigene Farbe gewählt hat, behält beides beim Umschalten.
     */
    const pickRole = (next: CalLabelRole) => {
        if (!name.trim() || name === suggestName(labels, role)) setName(suggestName(labels, next));
        if (color === suggestColor(role)) setColor(suggestColor(next));
        setRole(next);
    };

    const trimmed = name.trim();
    const canSave = trimmed.length > 0 && !busy;
    const submit = () => { if (canSave) onSave({ name: trimmed, color, role }); };

    return (
        <div className="ofi-cal-labelcard__body">
            {/* Die Pille, wie sie im Raster stehen wird — die Farbe wird an dem
                beurteilt, was nachher dasteht, nicht an einem Kästchen. */}
            <div className="ofi-cal-labelcard__preview">
                <span className="ofi-ucal-chip ofi-ucal-chip--labelled ofi-cal-labelcard__pill" style={labelSurface(color)}>
                    <span className="ofi-ucal-chip__line">
                        <span className="ofi-ucal-chip__title truncate">{trimmed || t('calendar.labels.namePlaceholder')}</span>
                    </span>
                </span>
            </div>

            <label className="ofi-cal-field">
                <span className="ofi-cal-field__label">{t('calendar.labels.nameField')}</span>
                <input
                    autoFocus
                    value={name}
                    maxLength={60}
                    /* Beim Anlegen steht der Vorschlag MARKIERT da: wer einen
                       eigenen Namen hat, tippt ihn einfach darüber; wer keinen
                       hat, drückt Speichern. */
                    onFocus={(event) => { if (!label) event.target.select(); }}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }}
                    placeholder={t('calendar.labels.namePlaceholder')}
                    className="ofi-cal-input"
                />
            </label>

            <div className="ofi-cal-field">
                <span className="ofi-cal-field__label">
                    {t('calendar.labels.roleField')}
                    <span className="ofi-cal-field__hint"> · {t('calendar.labels.roleHint')}</span>
                </span>
                <RoleSelect value={role} taken={takenRoles} onPick={pickRole} />
            </div>

            <div className="ofi-cal-field">
                <span className="ofi-cal-field__label">{t('calendar.labels.colorField')}</span>
                <div className="ofi-cal-swatches">
                    {SWATCHES.map((swatch) => (
                        <button
                            key={swatch}
                            type="button"
                            title={swatch}
                            aria-label={swatch}
                            aria-pressed={swatch === color}
                            onClick={() => setColor(swatch)}
                            className={`ofi-cal-swatch ${swatch === color ? 'is-on' : ''}`}
                            style={{ background: swatch, color: labelInk(swatch) }}
                        >
                            {swatch === color && (
                                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                    <path d="M4.2 8.3 L6.8 10.9 L11.9 5.5" />
                                </svg>
                            )}
                        </button>
                    ))}
                </div>
                <input
                    value={color}
                    maxLength={7}
                    spellCheck={false}
                    onChange={(event) => {
                        const next = event.target.value.trim().toLowerCase();
                        setColor(next.startsWith('#') || next === '' ? next : `#${next}`);
                    }}
                    onBlur={() => { if (!/^#[0-9a-f]{6}$/.test(color)) setColor(label?.color ?? suggestColor(role)); }}
                    placeholder={DEFAULT_COLOR}
                    className="ofi-cal-input ofi-cal-hexinput"
                />
            </div>

            <div className="ofi-cal-labelcard__foot">
                <button type="button" onClick={onCancel} className="ofi-cal-btn">{t('common.cancel')}</button>
                <button type="button" disabled={!canSave} onClick={submit} className="ofi-cal-btn is-primary">
                    {t('common.save')}
                </button>
            </div>
        </div>
    );
};

/* ── Liste ───────────────────────────────────────────────────────────────── */

export const LabelSettingsCard = ({ open, anchor, labels, freeRoles, busy = false, startNew = false, onClose, onSetHidden, onSave, onDelete }: {
    open: boolean;
    anchor: FloatAnchor | null;
    /* ALLE, ausgeblendete eingeschlossen — hier werden sie gepflegt. */
    labels: CalLabel[];
    /* Rollen ohne sichtbares Etikett — das Plus bietet sie an. */
    freeRoles: CalLabelRole[];
    busy?: boolean;
    /* Gleich auf dem Blatt eines NEUEN Etiketts aufmachen — das Plus in der
       Leiste soll nicht erst die Liste zeigen, aus der man dann noch einmal
       auf ein Plus drücken müsste. */
    startNew?: boolean;
    onClose: () => void;
    /* Wegräumen und zurückholen — der gewöhnliche Weg statt Löschen. */
    onSetHidden: (label: CalLabel, hidden: boolean) => Promise<boolean>;
    /* `label` null = anlegen. */
    onSave: (label: CalLabel | null, input: { name: string; color: string; role: CalLabelRole }) => Promise<boolean>;
    /* ENDGÜLTIG — an jeder Zeile, nach zweimaligem Drücken. */
    onDelete: (label: CalLabel) => Promise<boolean>;
}) => {
    /* Welche Ansicht: die Liste, oder das Blatt eines Etiketts
       (`{ label: null }` = ein neues, `role` seine Startrolle). */
    const [sheet, setSheet] = useState<{ label: CalLabel | null; role: CalLabelRole } | null>(null);
    /* Der Papierkorb fragt an seiner eigenen Zeile nach: erst der zweite Druck
       löscht. Kein Kasten des Browsers (Vorgabe 02.08.2026). */
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    /* Das Plus klappt die freien Rollen auf, statt gleich ein rollenloses
       Etikett anzulegen — «wieder hinzufügen, wenn die Rolle frei ist». */
    const [addOpen, setAddOpen] = useState(false);

    useEffect(() => {
        setConfirmDelete(null);
        /* Das Plus in der LEISTE macht das Fenster gleich mit den freien
           Rollen auf — von dort geht es weiter, ohne noch einmal zu drücken. */
        setAddOpen(open && startNew);
        setSheet(null);
    }, [open, startNew]);

    const visible = labels.filter((label) => !label.hidden);
    const retired = labels.filter((label) => label.hidden);

    const startSheet = (label: CalLabel | null, role: CalLabelRole) => {
        setAddOpen(false);
        setSheet({ label, role });
    };

    /**
     * EINE ROLLE AUS DEM PLUS.
     *
     * Liegt sie noch weggeräumt herum, wird GENAU DIESES Etikett wieder
     * eingeblendet — mit seinem Namen, seiner Farbe und an allen Einträgen,
     * die es tragen. Das ist der Sinn des Wegräumens: es kommt zurück, wie es
     * war, und nicht als zweites Etikett daneben (das hiesse auch noch gleich
     * und würde vom Server abgelehnt). Nur wenn es die Rolle wirklich nicht
     * mehr gibt, wird ein neues Etikett angelegt.
     */
    const addRole = (role: CalLabelRole) => {
        const waiting = retired.find((label) => label.role === role);
        setAddOpen(false);
        if (waiting) { void onSetHidden(waiting, false); return; }
        startSheet(null, role);
    };

    return (
        <FloatingCard
            open={open}
            onClose={onClose}
            closeOnBack
            anchor={anchor}
            width={380}
            className="ofi-cal-labelcard"
            title={sheet ? (sheet.label ? t('calendar.labels.editTitle') : t('calendar.labels.newTitle')) : t('calendar.labels.settingsTitle')}
            subtitle={sheet ? t('calendar.labels.cardHint') : t('calendar.labels.settingsHint')}
            /* Der Weg zurück ist ein SCHRITT, kein Schliessen: der Pfeil sitzt
               darum vorn in der Kopfzeile, wo die Karte ihn ohnehin anbietet. */
            leading={sheet ? (
                <button
                    type="button"
                    onClick={() => setSheet(null)}
                    aria-label={t('common.back')}
                    title={t('common.back')}
                    className="ofi-float-card__iconbtn"
                >
                    <ChevronLeft size={16} />
                </button>
            ) : undefined}
        >
            {sheet ? (
                <LabelSheet
                    /* Ein NEUES Etikett fängt jedes Mal frisch an: ohne eigenen
                       Schlüssel bliebe der halb getippte Name des letzten
                       Versuchs stehen (der Zurücksetzer hängt an der Kennung,
                       und die ist beim Anlegen keine). */
                    key={sheet.label?.id ?? `new-${sheet.role ?? 'plain'}-${labels.length}`}
                    label={sheet.label}
                    labels={labels}
                    startRole={sheet.role}
                    busy={busy}
                    onCancel={() => setSheet(null)}
                    onSave={async (input) => { if (await onSave(sheet.label, input)) setSheet(null); }}
                />
            ) : (
                <div className="ofi-cal-labellist">
                    {visible.map((label) => {
                        const asking = confirmDelete === label.id;
                        return (
                            <div key={label.id} className={`ofi-cal-labelitem ${asking ? 'is-asking' : ''}`}>
                                <span className="ofi-ucal-dot" style={{ background: label.color }} />
                                <span className="ofi-cal-labelitem__text">
                                    <span className="ofi-cal-labelitem__name" title={calLabelDisplayName(label)}>{calLabelDisplayName(label)}</span>
                                    {roleNote(label) && <span className="ofi-cal-labelitem__role">{roleNote(label)}</span>}
                                </span>
                                {asking ? (
                                    <button
                                        type="button"
                                        onClick={async () => { if (await onDelete(label)) setConfirmDelete(null); }}
                                        className="ofi-cal-btn is-danger ofi-cal-labelitem__confirm"
                                    >
                                        {t('calendar.labels.deleteAgainShort')}
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => startSheet(label, label.role ?? CAL_LABEL_ROLES[0]!)}
                                            aria-label={t('calendar.labels.edit', { name: calLabelDisplayName(label) })}
                                            title={t('calendar.labels.edit', { name: calLabelDisplayName(label) })}
                                            className="ofi-cal-labelitem__act"
                                        >
                                            <Edit01 size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { void onSetHidden(label, true); }}
                                            aria-label={t('calendar.labels.hide')}
                                            title={t('calendar.labels.hide')}
                                            className="ofi-cal-labelitem__act"
                                        >
                                            <EyeOff size={13} />
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setConfirmDelete(asking ? null : label.id)}
                                    aria-label={asking ? t('common.cancel') : t('calendar.labels.deleteForGood')}
                                    title={asking ? t('common.cancel') : t('calendar.labels.deleteForGood')}
                                    className={`ofi-cal-labelitem__act ${asking ? 'is-danger' : ''}`}
                                >
                                    <Trash01 size={13} />
                                </button>
                            </div>
                        );
                    })}

                    {visible.length === 0 && (
                        <p className="ofi-cal-labellist__empty">{t('calendar.labels.emptyHint')}</p>
                    )}

                    {/* WEGGERÄUMT — nicht weggeworfen. Von hier holt das Plus sie
                        zurück; der Papierkorb steht NUR hier, und er fragt noch
                        einmal nach. */}
                    {retired.length > 0 && (
                        <>
                            <div className="ofi-cal-labellist__head">{t('calendar.labels.retired')}</div>
                            {retired.map((label) => {
                                const asking = confirmDelete === label.id;
                                return (
                                    <div key={label.id} className={`ofi-cal-labelitem is-retired ${asking ? 'is-asking' : ''}`}>
                                        <span className="ofi-ucal-dot" style={{ background: label.color }} />
                                        <span className="ofi-cal-labelitem__text">
                                            <span className="ofi-cal-labelitem__name" title={calLabelDisplayName(label)}>{calLabelDisplayName(label)}</span>
                                            {roleNote(label) && <span className="ofi-cal-labelitem__role">{roleNote(label)}</span>}
                                        </span>
                                        {asking ? (
                                            <button
                                                type="button"
                                                onClick={async () => { if (await onDelete(label)) setConfirmDelete(null); }}
                                                className="ofi-cal-btn is-danger ofi-cal-labelitem__confirm"
                                            >
                                                {t('calendar.labels.deleteAgainShort')}
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                /* Solange ein ANDERES Etikett seine Rolle
                                                   trägt, kann es nicht zurück — je Rolle
                                                   steht genau eines. */
                                                disabled={Boolean(label.role) && !freeRoles.includes(label.role as CalLabelRole)}
                                                onClick={() => { void onSetHidden(label, false); }}
                                                aria-label={t('calendar.labels.show')}
                                                title={Boolean(label.role) && !freeRoles.includes(label.role as CalLabelRole)
                                                    ? t('calendar.labels.roleTaken')
                                                    : t('calendar.labels.show')}
                                                className="ofi-cal-labelitem__act"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDelete(asking ? null : label.id)}
                                            aria-label={asking ? t('common.cancel') : t('calendar.labels.deleteForGood')}
                                            title={asking ? t('common.cancel') : t('calendar.labels.deleteForGood')}
                                            className={`ofi-cal-labelitem__act ${asking ? 'is-danger' : ''}`}
                                        >
                                            <Trash01 size={13} />
                                        </button>
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {/* DAS PLUS. Es bietet zuerst die Rollen an, die gerade KEIN
                        Etikett tragen — das ist der Weg zurück für alles, was
                        weggeräumt wurde —, und darunter ein freies Farbetikett. */}
                    {/* DAS PLUS führt zu den freien ROLLEN. Sind alle vergeben,
                        gibt es nichts hinzuzufügen — dann sagt der Knopf das,
                        statt ins Leere zu klappen. */}
                    <button
                        type="button"
                        disabled={freeRoles.length === 0}
                        title={freeRoles.length === 0 ? t('calendar.labels.allTaken') : undefined}
                        onClick={() => setAddOpen((current) => !current)}
                        className="ofi-cal-labeladd is-wide"
                    >
                        <Plus size={14} />
                        <span className="truncate">
                            {freeRoles.length === 0 ? t('calendar.labels.allTaken') : t('calendar.labels.add')}
                        </span>
                    </button>
                    {addOpen && freeRoles.length > 0 && (
                        <div className="ofi-cal-addmenu">
                            {freeRoles.map((role) => (
                                <button key={role} type="button" onClick={() => addRole(role)}>
                                    <span className="ofi-ucal-dot" style={{ background: CAL_LABEL_ROLE_DEFAULTS[role].color }} />
                                    <span className="truncate">{roleName(role)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </FloatingCard>
    );
};
