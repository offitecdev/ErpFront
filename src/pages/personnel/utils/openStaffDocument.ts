import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { personnelHrApi } from '@/lib/api/personnel';
import type { StaffDocumentRow } from '../types/personnel';

/**
 * Eine Personalunterlage öffnen: der Inhalt kommt erst jetzt, als Daten-URL.
 * Ein neues Fenster mit der Daten-URL ist der einzige Weg, der ohne einen
 * Server-Downloadpfad auskommt UND sowohl PDF (im Betrachter des Browsers)
 * als auch Word (Speichern-Dialog) richtig behandelt.
 *
 * Geteilt zwischen der Personalakte (/personnel/:id → Profil) und dem eigenen
 * Profil (/profile) — zwei Kopien desselben Fenstertricks liefen auseinander.
 */
export const openStaffDocument = async (document_: StaffDocumentRow): Promise<void> => {
    try {
        const full = await personnelHrApi.document(document_.id);
        const win = window.open();
        if (!win) {
            toast.error(t('personnel.doc.popupBlocked'));
            return;
        }
        win.document.write(
            `<iframe src="${full.data}" style="border:0;width:100%;height:100%"></iframe>`,
        );
        win.document.title = full.fileName;
    } catch (error) {
        const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
        toast.error(typeof message === 'string' && message ? message : t('personnel.doc.openFailed'));
    }
};
