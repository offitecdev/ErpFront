import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Plus } from 'lucide-react';

import { t } from '@/i18n/translate';

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();

/**
 * ── NAMEN DIREKT TIPPEN (28.09.2026) ────────────────────────────────────────
 *
 * Bereiche und Stufen einer Vorlage heissen, wie man sie nennt: der Name ist
 * ein Feld, das wie Text aussieht (wie der Titel der Vorlage). Jede gültige
 * Eingabe gilt sofort; leer oder doppelt bleibt das Feld rot stehen und der
 * Entwurf behält den letzten gültigen Namen — beim Verlassen springt es
 * dorthin zurück.
 */
export const NameInput = ({
    value,
    onCommit,
    isTaken,
    maxLength,
    className,
    ariaLabel,
    placeholder,
    autoFocus,
}: {
    value: string;
    onCommit: (name: string) => void;
    isTaken: (name: string) => boolean;
    maxLength: number;
    className: string;
    ariaLabel: string;
    placeholder?: string;
    autoFocus?: boolean;
}) => {
    const [text, setText] = useState(value);
    const taken = Boolean(clean(text)) && isTaken(clean(text));
    const invalid = !clean(text) || taken;

    const change = (next: string) => {
        setText(next);
        if (clean(next) && !isTaken(clean(next))) onCommit(next);
    };

    return (
        <input
            className={`${className} ${invalid ? 'is-invalid' : ''}`}
            value={text}
            maxLength={maxLength}
            spellCheck={false}
            autoFocus={autoFocus}
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            placeholder={placeholder}
            title={taken ? t('productionTasks.template.nameTaken') : undefined}
            onChange={(event) => change(event.target.value)}
            onBlur={() => {
                if (invalid) {
                    setText(value);
                    return;
                }
                if (clean(text) !== text) {
                    setText(clean(text));
                    onCommit(clean(text));
                }
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
            }}
        />
    );
};

/**
 * «+ Bölüm ekle» / «+ Yeni aşama»: ein Knopf, der zum Feld wird. Enter legt
 * an und lässt das Feld offen — der nächste Name folgt gleich («Tasarım ⏎
 * Montaj ⏎ Test ⏎»). Escape oder Verlassen mit leerem Feld schliesst es.
 */
export const InlineCreate = ({
    label,
    placeholder,
    isTaken,
    maxLength,
    onCreate,
    className,
    icon,
    disabledReason,
}: {
    label: string;
    placeholder: string;
    isTaken: (name: string) => boolean;
    maxLength: number;
    onCreate: (name: string) => void;
    className: string;
    icon?: ReactNode;
    /** Steht ein Grund da, ist der Knopf gesperrt und sagt im Tipp, warum. */
    disabledReason?: string;
}) => {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const name = clean(text);
    const taken = Boolean(name) && isTaken(name);

    const submit = () => {
        if (!name || taken) return;
        onCreate(name);
        setText('');
        inputRef.current?.focus();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submit();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setText('');
            setOpen(false);
        }
    };

    if (!open || disabledReason) {
        return (
            <button
                type="button"
                className={`${className} ofi-nosize`}
                disabled={Boolean(disabledReason)}
                title={disabledReason}
                onClick={() => setOpen(true)}
            >
                {icon ?? <Plus aria-hidden />}
                {label}
            </button>
        );
    }

    return (
        <span className={`${className} is-open`}>
            {icon ?? <Plus aria-hidden />}
            <input
                ref={inputRef}
                className={`ofi-ptk-createinput ${taken ? 'is-invalid' : ''}`}
                value={text}
                maxLength={maxLength}
                spellCheck={false}
                autoFocus
                placeholder={placeholder}
                aria-label={label}
                aria-invalid={taken || undefined}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={onKeyDown}
                onBlur={() => { if (!name) setOpen(false); }}
            />
            {taken
                ? <span className="ofi-ptk-createhint is-error" role="alert">{t('productionTasks.template.nameTaken')}</span>
                : name && (
                    // Die Maus hält das Feld offen (kein Blur vor dem Klick).
                    <button
                        type="button"
                        className="ofi-ptk-createbtn ofi-nosize"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={submit}
                    >
                        {t('productionTasks.task.addButton')}
                    </button>
                )}
        </span>
    );
};
