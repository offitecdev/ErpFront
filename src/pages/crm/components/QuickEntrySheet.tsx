import { useEffect, useState } from 'react';

import { CenterModal } from '@/pages/calendar/components/shells';
import { QuickEntryForm, QUICK_ENTRY_ACTIONS, quickEntryActionLabel } from './QuickEntryForm';
import type { QuickEntryAction } from './QuickEntryForm';
import { t } from '@/i18n/translate';

/**
 * Dasselbe Schnellerfassungs-Formular, aber in einem Fenster — für den
 * "+ Neu"-Knopf der Listen (Interaktionsverlauf, Aufgaben, Erinnerungen) und
 * der Kundenakte, wo man die Liste nicht verlassen soll.
 *
 * Die Aktion steht hier immer fest (der Aufrufer weiss, was er anlegt) — es
 * gibt keine Zwischenauswahl im Fenster. Speichern/Abbrechen bringt das
 * Formular selbst mit, darum hat das Fenster keine eigene Fussleiste.
 *
 * Reines Portal + CSS (CenterModal des Kalenders). Ein Klick daneben schliesst
 * NICHT — ein halb ausgefülltes Formular darf nicht weggeworfen werden; das X
 * und "Abbrechen" tun es bewusst.
 *
 * BREITE: index.css zieht Fenster im Portal sonst auf die Bildschirmbreite;
 * `compact` nimmt dieses Fenster davon aus (`.ofi-compact-modal`), damit das
 * schmale Formular auch ein schmales Fenster bekommt statt einer leeren
 * Fläche ringsum.
 */
const SHEET_Z = 130;

export const QuickEntrySheet = ({
    open,
    action,
    onClose,
    onSaved,
}: {
    open: boolean;
    action: QuickEntryAction;
    onClose: () => void;
    onSaved?: (action: QuickEntryAction) => void;
}) => {
    // Jedes Öffnen beginnt mit leeren Feldern.
    const [resetToken, setResetToken] = useState(0);
    useEffect(() => {
        if (open) setResetToken((value) => value + 1);
    }, [open]);

    const hintKey = QUICK_ENTRY_ACTIONS.find((entry) => entry.action === action)?.hintKey;

    return (
        <CenterModal
            open={open}
            onClose={onClose}
            title={quickEntryActionLabel(action)}
            subtitle={hintKey ? t(hintKey) : undefined}
            width={520}
            z={SHEET_Z}
            closeOnBackdrop={false}
            compact
        >
            <div className="p-5">
                <QuickEntryForm
                    action={action}
                    resetToken={resetToken}
                    z={SHEET_Z}
                    onCancel={onClose}
                    onSaved={(saved) => { onSaved?.(saved); onClose(); }}
                />
            </div>
        </CenterModal>
    );
};
