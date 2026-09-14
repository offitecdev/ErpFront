import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { t } from '@/i18n/translate';

/**
 * Beschreibung als ruhiges, mitwachsendes Textfeld (Klartext). Gespeichert wird
 * beim Verlassen; solange das Feld den Fokus hat, bleibt der Entwurf stehen,
 * auch wenn die Seite im Hintergrund nachlädt.
 */
export const DescriptionField = ({
    value,
    editable,
    onSave,
}: {
    value: string | null;
    editable: boolean;
    onSave: (next: string | null) => void;
}) => {
    const [draft, setDraft] = useState(value ?? '');
    const ref = useRef<HTMLTextAreaElement | null>(null);
    /** Esc verwirft: das folgende Verlassen darf den alten Entwurf nicht speichern. */
    const discardRef = useRef(false);

    useEffect(() => {
        if (document.activeElement !== ref.current) setDraft(value ?? '');
    }, [value]);

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        element.style.height = 'auto';
        element.style.height = `${Math.min(element.scrollHeight + 2, 480)}px`;
    }, [draft, editable]);

    if (!editable) {
        return value ? <p className="ofi-gv-detail-desc">{value}</p> : null;
    }

    return (
        <textarea
            ref={ref}
            rows={1}
            value={draft}
            maxLength={10_000}
            placeholder={t('tasksModule.detail.descriptionPlaceholder')}
            aria-label={t('tasksModule.detail.descriptionLabel')}
            className="ofi-gv-detail-desc is-editable"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    discardRef.current = true;
                    setDraft(value ?? '');
                    event.currentTarget.blur();
                }
            }}
            onBlur={() => {
                if (discardRef.current) {
                    discardRef.current = false;
                    return;
                }
                const next = draft.trim();
                if (next !== (value ?? '').trim()) onSave(next || null);
            }}
        />
    );
};
