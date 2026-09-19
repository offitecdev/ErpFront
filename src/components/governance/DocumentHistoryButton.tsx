import { useEffect, useState } from 'react';

import { ClockRewind } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { documentEventsApi } from '@/lib/api/documentEvents';
import { afterPageSettled } from '@/lib/utils/onIdle';

import { DocumentHistoryPopup } from './DocumentHistoryPopup';
import type { DocumentEntityType } from './governance';
import './governance.css';

/**
 * ── KNOPF «VERLAUF» (16.09.2026, Schritt 4 / D1) ─────────────────────────────
 *
 * Ein kleiner Mac-Knopf für die Kopfzeile jedes Belegs. Er zählt die Einträge
 * und trägt einen roten Punkt, sobald die Systemverwaltung eingegriffen hat —
 * das ist das bleibende Zeichen am Beleg. Die Zahl wird erst geholt, wenn die
 * Seite ihre eigenen Daten hat (`afterPageSettled`), sie verlangsamt den
 * Seitenaufbau also nicht.
 *
 * `variant="action"` legt ihn in eine bestehende Knopfreihe (Rechnungsblatt):
 * dann trägt er deren Klasse statt seiner eigenen. `variant="glyph"` ist das
 * runde Symbol der Projektkopfzeile — nur das Zeichen, der Punkt bleibt.
 */
export const DocumentHistoryButton = ({
    entityType,
    entityId,
    documentNumber,
    className,
    variant = 'toolbar',
    refreshKey,
}: {
    entityType: DocumentEntityType;
    entityId: string;
    documentNumber?: string | null;
    className?: string;
    variant?: 'toolbar' | 'action' | 'glyph';
    /** Ändert sich der Wert, wird die Zahl neu geholt (nach einer Rücknahme). */
    refreshKey?: unknown;
}) => {
    const [open, setOpen] = useState(false);
    const [summary, setSummary] = useState<{ count: number; overrides: number } | null>(null);

    useEffect(() => {
        let cancelled = false;
        const cancel = afterPageSettled(() => {
            documentEventsApi.summary(entityType, entityId)
                .then((value) => { if (!cancelled) setSummary(value); })
                .catch(() => { if (!cancelled) setSummary(null); });
        }, { minMs: 600 });
        return () => { cancelled = true; cancel(); };
    }, [entityType, entityId, refreshKey]);

    const overrides = summary?.overrides ?? 0;
    const label = overrides > 0
        ? t('governance.historyButtonOverride', { count: overrides })
        : t('governance.historyButton');

    return (
        <>
            <button
                type="button"
                className={variant === 'toolbar' ? `gov-history-btn ${className ?? ''}` : className}
                title={label}
                aria-label={label}
                onClick={() => setOpen(true)}
                style={variant === 'toolbar' ? undefined : { position: 'relative' }}
            >
                <ClockRewind size={variant === 'glyph' ? 16 : 14} />
                {variant !== 'glyph' && <span>{t('governance.historyShort')}</span>}
                {variant === 'toolbar' && summary && summary.count > 0 && (
                    <span className="gov-history-btn__count">{summary.count}</span>
                )}
                {overrides > 0 && <span className="gov-history-btn__dot" aria-hidden />}
            </button>
            {open && (
                <DocumentHistoryPopup
                    open
                    entityType={entityType}
                    entityId={entityId}
                    documentNumber={documentNumber}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
};
