import type { ReactNode } from 'react';
import { FileDownload02, FilterLines, RefreshCcw01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { ReportFilterState } from '../hooks/usePersonnel';
import { CELL_INPUT_CLASS, GhostButton, Labelled, PrimaryButton } from './primitives';

/**
 * ── FILTERLEISTE DER BEIDEN BERICHTE ─────────────────────────────────────────
 *
 * Detailbericht und Buchhaltungsbericht teilen dieselben vier Felder (Von, Bis,
 * Vorname, Nachname). Der Buchhaltungsbericht hat zusätzlich die Feiertagszahl
 * mit ihrem eigenen Rücksetzknopf — deshalb ist sie hier eine Zuschaltung
 * (`showHolidays`) und keine zweite Leiste: zwei fast gleiche Leisten würden
 * beim nächsten Feld auseinanderlaufen.
 *
 * Die Felder ändern nur den ENTWURF; erst „Filtern" (oder die Eingabetaste)
 * schickt ihn los. Sonst kostete jeder getippte Buchstabe des Nachnamens einen
 * Serverweg über den ganzen Monatsbestand.
 */
export const ReportFilterBar = ({
    draft,
    onPatch,
    onApply,
    onReset,
    onExport,
    exporting = false,
    showHolidays = false,
    onResetHolidays,
    extra,
}: {
    draft: ReportFilterState;
    onPatch: (patch: Partial<ReportFilterState>) => void;
    onApply: () => void;
    onReset: () => void;
    onExport: () => void;
    exporting?: boolean;
    showHolidays?: boolean;
    onResetHolidays?: () => void;
    extra?: ReactNode;
}) => (
    <form
        onSubmit={(event) => { event.preventDefault(); onApply(); }}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-white/15 dark:bg-transparent dark:shadow-none"
    >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <Labelled label={t('personnel.filter.startDate')}>
                <input
                    type="date"
                    value={draft.startDate}
                    onChange={(event) => onPatch({ startDate: event.target.value })}
                    className={CELL_INPUT_CLASS}
                />
            </Labelled>
            <Labelled label={t('personnel.filter.endDate')}>
                <input
                    type="date"
                    value={draft.endDate}
                    onChange={(event) => onPatch({ endDate: event.target.value })}
                    className={CELL_INPUT_CLASS}
                />
            </Labelled>
            <Labelled label={t('personnel.field.firstName')}>
                <input
                    value={draft.firstName ?? ''}
                    onChange={(event) => onPatch({ firstName: event.target.value })}
                    placeholder={t('personnel.create.firstNamePlaceholder')}
                    className={CELL_INPUT_CLASS}
                />
            </Labelled>
            <Labelled label={t('personnel.field.lastName')}>
                <input
                    value={draft.lastName ?? ''}
                    onChange={(event) => onPatch({ lastName: event.target.value })}
                    placeholder={t('personnel.create.lastNamePlaceholder')}
                    className={CELL_INPUT_CLASS}
                />
            </Labelled>
            {showHolidays && (
                <Labelled label={t('personnel.filter.publicHolidays')} hint={t('personnel.filter.publicHolidaysHint')}>
                    <input
                        type="number"
                        min={0}
                        value={draft.publicHolidays}
                        onChange={(event) => onPatch({ publicHolidays: Math.max(0, Number(event.target.value) || 0) })}
                        className={CELL_INPUT_CLASS}
                    />
                </Labelled>
            )}
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <PrimaryButton type="submit" icon={<FilterLines size={14} />}>{t('personnel.filter.apply')}</PrimaryButton>
            <GhostButton onClick={onReset}>{t('personnel.filter.clear')}</GhostButton>
            {showHolidays && onResetHolidays && (
                <GhostButton icon={<RefreshCcw01 size={14} />} onClick={onResetHolidays}>
                    {t('personnel.filter.resetHolidays')}
                </GhostButton>
            )}
            <div className="grow" />
            {extra}
            <PrimaryButton icon={<FileDownload02 size={14} />} onClick={onExport} disabled={exporting}>
                {exporting ? t('common.loading') : t('personnel.filter.generatePdf')}
            </PrimaryButton>
        </div>
    </form>
);
