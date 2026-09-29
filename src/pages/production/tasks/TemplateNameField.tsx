import { useId, useState } from 'react';
import { ListChecks, PencilLine } from 'lucide-react';

import { t } from '@/i18n/translate';

import { TASK_LIMITS } from './taskModel';

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();

/**
 * ── DER NAME DER VORLAGE (28.09.2026) ──────────────────────────────────────
 *
 * «Fix the template name input, create a better design for it.» Bisher war
 * der Name ein unsichtbares Feld im Titel: ohne Rand sah er aus wie eine
 * Überschrift, bei einer neuen Vorlage stand ein enger Kasten mit kursivem
 * Platzhalter da, und «Hazır» sprang beim Tippen mit.
 *
 * Jetzt ein richtiges Namensfeld: links das Zeichen der Vorlage (wie in der
 * Liste), rechts ein Stift, feste Breite — der Zustand daneben bleibt stehen.
 * Fokus zeichnet den blauen Ring. Ist der Name schon vergeben oder leer,
 * sagt es das Feld selbst (rechts, rot bzw. orange), statt erst beim
 * Speichern. Enter übernimmt, Escape holt den gespeicherten Namen zurück.
 * Wer nur lesen darf, sieht den Namen als Titel ohne Feld.
 */
export const TemplateNameField = ({
    value,
    savedName,
    canEdit,
    autoFocus,
    isTaken,
    onChange,
}: {
    value: string;
    /** Der gespeicherte Name (null bei einer neuen Vorlage) — Escape kehrt dorthin zurück. */
    savedName: string | null;
    canEdit: boolean;
    autoFocus: boolean;
    isTaken: (name: string) => boolean;
    onChange: (name: string) => void;
}) => {
    const noteId = useId();
    // Leer ist erst ein Fehler, wenn man den Namen einmal angefasst hat.
    const [touched, setTouched] = useState(false);
    const name = clean(value);
    const taken = Boolean(name) && isTaken(name);
    const missing = touched && !name;

    if (!canEdit) {
        return (
            <div className="ofi-ptk-namefield is-readonly">
                <span className="ofi-ptk-namefield__icon" aria-hidden><ListChecks /></span>
                <h2 className="ofi-ptk-namefield__text" title={value}>{value || t('productionTasks.templates.untitled')}</h2>
            </div>
        );
    }

    const note = taken
        ? t('productionTasks.template.nameInUse')
        : missing ? t('productionTasks.template.nameRequired') : '';

    return (
        <label className={`ofi-ptk-namefield ${taken ? 'is-invalid' : missing ? 'is-missing' : ''}`}>
            <span className="ofi-ptk-namefield__icon" aria-hidden><ListChecks /></span>
            <input
                className="ofi-ptk-namefield__input"
                value={value}
                maxLength={TASK_LIMITS.templateName}
                autoFocus={autoFocus}
                spellCheck={false}
                autoComplete="off"
                placeholder={t('productionTasks.template.namePlaceholder')}
                aria-label={t('productionTasks.template.name')}
                aria-invalid={taken || missing || undefined}
                aria-describedby={note ? noteId : undefined}
                title={value || undefined}
                onChange={(event) => {
                    setTouched(true);
                    onChange(event.target.value);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                    } else if (event.key === 'Escape' && savedName !== null && value !== savedName) {
                        // Zurück zum gespeicherten Namen — die übrigen Änderungen bleiben.
                        event.preventDefault();
                        event.stopPropagation();
                        setTouched(false);
                        onChange(savedName);
                    }
                }}
                onBlur={() => {
                    if (name !== value) onChange(name);
                }}
            />
            {note ? (
                <span id={noteId} className="ofi-ptk-namefield__note" role="status">{note}</span>
            ) : (
                <PencilLine className="ofi-ptk-namefield__pencil" aria-hidden />
            )}
        </label>
    );
};
