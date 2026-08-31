import { useState } from 'react';

import { Check, Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/**
 * DIE ANLEITUNG EINER AUFGABE — Schritt für Schritt (11.09.2026, Vorgabe
 * Samet: «es soll eine Schritt-für-Schritt-Anleitung geben; freiwillig»).
 *
 * Eine Zeile je Schritt: die Nummer, das Häkchen, der Text, der Papierkorb.
 * Enter am Ende einer Zeile hängt die nächste an — so tippt man eine
 * Anleitung, ohne die Maus anzufassen.
 *
 * DIE ZEILE STEHT AUF DER ACHSE DES FENSTERS (Vorgabe 12.09.2026: «richte
 * alles genau aus — auch die Kreise der Anleitung und ihre Zeilen»). Die
 * NUMMER sitzt in der Beschriftungsspalte, dort wo auf den anderen Blättern
 * «Beginn» oder «Kunde» steht; der KREIS sitzt genau an der Feldkante, auf
 * einer Linie mit dem Kundenfeld und dem Feld der Verantwortlichen. Das
 * Raster dafür kommt aus index.css (`--ofi-newtask-label`), damit es an EINER
 * Stelle steht und nicht in zwei.
 *
 * Es sind bewusst KEINE Unteraufgaben: ein Schritt hat keine Verantwortliche
 * und keinen eigenen Termin. Er ist eine Zeile, die man beim Abarbeiten
 * abhakt — mehr wäre eine zweite Aufgabenverwaltung in der Aufgabe.
 *
 * Das Bauteil ist GESTEUERT und kennt keinen Server: beim Anlegen reist die
 * Liste mit der Aufgabe mit, beim Ändern schickt die Erledigungskarte sie über
 * `saveTaskSteps`. So gibt es EINEN Editor für beide Wege.
 */

export interface TaskStepDraft {
    /** Nur zum Zeichnen — die Reihenfolge der Liste ist die Reihenfolge. */
    key: string;
    /**
     * Die Kennung der GESPEICHERTEN Zeile, falls es sie schon gibt. Sie ist
     * nicht der `key`: der bleibt, solange die Zeile auf dem Blatt steht,
     * während der Server beim Ersetzen der Liste neue Kennungen vergibt.
     * Mit ihr kann ein einzelnes Häkchen seinen eigenen, billigen Weg nehmen.
     */
    id?: string;
    text: string;
    done: boolean;
}

/**
 * WAS sich geändert hat — daran entscheidet der Aufrufer, WIE er speichert
 * (12.09.2026). Ohne diese Auskunft blieb ihm nur «die ganze Liste, bei jedem
 * Tastendruck»: ein Netzweg je Buchstabe, und jede Antwort überschrieb das
 * Häkchen, das inzwischen gesetzt worden war.
 */
export interface TaskStepChange {
    /** Sofort schicken (Häkchen, Zeile weg) statt das Tippen abzuwarten. */
    immediate?: boolean;
    /** Bei einem Häkchen: WELCHE Zeile — sie geht dann allein raus. */
    toggledKey?: string;
}

const newStep = (): TaskStepDraft => ({
    key: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    text: '',
    done: false,
});

export const TaskStepsEditor = ({ steps, onChange, disabled }: {
    steps: TaskStepDraft[];
    onChange: (next: TaskStepDraft[], change?: TaskStepChange) => void;
    disabled?: boolean;
}) => {
    /* Die zuletzt angehängte Zeile bekommt den Fokus — sonst müsste man nach
       jedem «+» ins Feld klicken. Als ZUSTAND und nicht als Ref: `autoFocus`
       wird beim Zeichnen gelesen, und ein Ref darf dabei nicht angefasst
       werden (React liest ihn dann womöglich vor dem Schreiben). */
    const [focusKey, setFocusKey] = useState<string | null>(null);

    const patch = (key: string, next: Partial<TaskStepDraft>, change?: TaskStepChange) =>
        onChange(steps.map((step) => (step.key === key ? { ...step, ...next } : step)), change);

    const remove = (key: string) => onChange(steps.filter((step) => step.key !== key), { immediate: true });

    const append = (afterKey?: string) => {
        const step = newStep();
        setFocusKey(step.key);
        if (!afterKey) { onChange([...steps, step]); return; }
        const index = steps.findIndex((row) => row.key === afterKey);
        onChange([...steps.slice(0, index + 1), step, ...steps.slice(index + 1)]);
    };

    return (
        <div className="ofi-tasksteps">
            {steps.length === 0 && (
                <p className="ofi-tasksteps__empty">{t('crm.tasks.stepsEmpty')}</p>
            )}

            <ol className="ofi-tasksteps__list">
                {steps.map((step, index) => (
                    <li key={step.key} className={`ofi-tasksteps__row ${step.done ? 'is-done' : ''}`}>
                        <span className="ofi-tasksteps__no" aria-hidden>{index + 1}.</span>
                        <button
                            type="button"
                            disabled={disabled}
                            /* Das Häkchen sitzt SOFORT — es fährt die Zeile
                               örtlich um und meldet dem Aufrufer, dass genau
                               diese eine Zeile gemeint ist. */
                            onClick={() => patch(step.key, { done: !step.done }, { immediate: true, toggledKey: step.key })}
                            aria-pressed={step.done}
                            aria-label={t('crm.tasks.stepDone')}
                            title={t('crm.tasks.stepDone')}
                            className={`ofi-taskrow__check ${step.done ? 'is-done' : ''}`}
                        >
                            {step.done && <Check size={11} />}
                        </button>
                        <input
                            value={step.text}
                            disabled={disabled}
                            autoFocus={focusKey === step.key}
                            onChange={(event) => patch(step.key, { text: event.target.value })}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') { event.preventDefault(); append(step.key); }
                                // Rücktaste auf einer LEEREN Zeile nimmt sie weg —
                                // dieselbe Geste wie in jeder Aufzählung.
                                if (event.key === 'Backspace' && !step.text && steps.length > 1) {
                                    event.preventDefault();
                                    remove(step.key);
                                }
                            }}
                            placeholder={t('crm.tasks.stepPlaceholder')}
                            aria-label={t('crm.tasks.stepPlaceholder')}
                            className="ofi-tasksteps__text"
                        />
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => remove(step.key)}
                            aria-label={t('common.delete')}
                            title={t('common.delete')}
                            className="ofi-tasksteps__del"
                        >
                            <Trash01 size={13} />
                        </button>
                    </li>
                ))}
            </ol>

            <button type="button" disabled={disabled} onClick={() => append()} className="ofi-tasksteps__add">
                <Plus size={13} />
                {t('crm.tasks.stepAdd')}
            </button>
        </div>
    );
};
