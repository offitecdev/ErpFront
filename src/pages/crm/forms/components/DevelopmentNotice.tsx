import { AlertTriangle } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';

/**
 * Hinweis unter den Listen der Checklisten und der Formular-Vorlagen: der
 * Bereich ist noch in Arbeit (Vorgabe 15.08.2026). Er hängt darum auch nicht
 * mehr am Angebot — dort wurde der Reiter entfernt.
 *
 * Die Schrift ist ausdrücklich Times New Roman (Nutzerwunsch): der Hinweis
 * soll sich vom übrigen Bildschirm abheben und nicht wie ein fertiger Teil der
 * Oberfläche aussehen. Deshalb steht die Schriftfamilie hier direkt am Element
 * — es gibt (und braucht) keine Serifen-Klasse im Design des Programms.
 */
const TIMES = '"Times New Roman", Times, serif';

export const DevelopmentNotice = () => (
    <div
        role="note"
        className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
    >
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <p className="m-0 text-[14px] italic leading-relaxed" style={{ fontFamily: TIMES }}>
            {t('forms.devNotice')}
        </p>
    </div>
);
