import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { personnelApi, readStaffBulkError } from '@/lib/api/personnel';
import type { StaffDraftRow, WorkLocation } from '../types/personnel';
import { WORK_LOCATIONS } from '../utils/personnel';
import { workLocationLabel } from '../utils/format';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { PersonnelSheet } from './PersonnelSheet';
import { CELL_INPUT_CLASS, GhostButton, PrimaryButton } from './primitives';

/* Das Zellenkleid für die Auswahlfelder — `bg-[#fff]` statt `bg-white`, weil
   index.css jedem `button.bg-white` dunkle Schrift aufzwingt (!important) und
   das Feld im Dunkelmodus unlesbar würde. */
const CELL_SELECT_CLASS = CELL_INPUT_CLASS.replace('bg-white', 'bg-[#fff]');

/**
 * ── PERSONAL ANLEGEN: ZEILE FÜR ZEILE ────────────────────────────────────────
 *
 * Personal wird SELTEN einzeln eingestellt — meistens kommt eine Mannschaft auf
 * einmal. Deshalb ist die Erfassung eine Tabelle und kein Einzelformular
 * (Vorgabe): eine Zeile je Person, unten kommt eine neue dazu.
 *
 * Der Server nimmt die Sendung als GANZES an oder gar nicht. Lehnt er eine Zeile
 * ab, meldet er ihren Index mit — die Zeile wird dann hier rot umrandet, damit
 * niemand in zwanzig Zeilen suchen muss, welche gemeint ist.
 */

let rowCounter = 0;
const emptyRow = (): StaffDraftRow => ({
    key: `row-${++rowCounter}`,
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    workLocation: 'OFFICE',
});

const isBlank = (row: StaffDraftRow) =>
    !row.firstName.trim() && !row.lastName.trim() && !row.email.trim() && !row.password;

export const StaffCreateSheet = ({
    open,
    onClose,
    onCreated,
}: {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}) => {
    const [rows, setRows] = useState<StaffDraftRow[]>([emptyRow(), emptyRow(), emptyRow()]);
    const [saving, setSaving] = useState(false);
    const [failedIndex, setFailedIndex] = useState<number | null>(null);

    // Beim Öffnen immer mit einer leeren Tabelle beginnen: eine noch offene
    // Sendung von vorhin wäre beim nächsten Öffnen eine Falle.
    useEffect(() => {
        if (!open) return;
        setRows([emptyRow(), emptyRow(), emptyRow()]);
        setFailedIndex(null);
        setSaving(false);
    }, [open]);

    const filled = useMemo(() => rows.filter((row) => !isBlank(row)), [rows]);

    const patch = (key: string, next: Partial<StaffDraftRow>) => {
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)));
        setFailedIndex(null);
    };

    const removeRow = (key: string) => {
        setRows((current) => (current.length <= 1 ? [emptyRow()] : current.filter((row) => row.key !== key)));
        setFailedIndex(null);
    };

    const save = async () => {
        if (filled.length === 0) {
            toast.error(t('personnel.create.needOneRow'));
            return;
        }
        setSaving(true);
        setFailedIndex(null);
        try {
            const result = await personnelApi.createStaffBulk(filled.map((row) => ({
                firstName: row.firstName.trim(),
                lastName: row.lastName.trim(),
                email: row.email.trim(),
                password: row.password,
                workLocation: row.workLocation,
            })));
            toast.success(t('personnel.create.saved', { count: result.created.length }));
            onCreated();
            onClose();
        } catch (error) {
            const parsed = readStaffBulkError(error, t('personnel.create.failed'));
            setFailedIndex(parsed.index);
            toast.error(parsed.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <PersonnelSheet
            open={open}
            onClose={onClose}
            title={t('personnel.create.title')}
            subtitle={t('personnel.create.subtitle')}
            width={1080}
            height={660}
            flush
            footer={(
                <>
                    <span className="text-[11.5px] text-slate-400 dark:text-white/50">
                        {t('personnel.create.passwordHint')}
                    </span>
                    <div className="flex items-center gap-2">
                        <GhostButton onClick={onClose} disabled={saving}>{t('common.cancel')}</GhostButton>
                        <PrimaryButton onClick={() => void save()} disabled={saving || filled.length === 0}>
                            {saving ? t('common.loading') : t('personnel.create.submit', { count: filled.length })}
                        </PrimaryButton>
                    </div>
                </>
            )}
        >
            <div data-table-scroll>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col style={{ width: 44 }} />
                        <col />
                        <col />
                        <col style={{ width: '22%' }} />
                        <col style={{ width: 190 }} />
                        <col style={{ width: 150 }} />
                        <col style={{ width: 56 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-right">#</th>
                            <th className="text-left">{t('personnel.field.firstName')}</th>
                            <th className="text-left">{t('personnel.field.lastName')}</th>
                            <th className="text-left">{t('personnel.field.email')}</th>
                            <th className="text-left">{t('personnel.field.password')}</th>
                            <th className="text-left">{t('personnel.field.workLocation')}</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => {
                            // Der Server zählt NUR die ausgefüllten Zeilen — der
                            // gemeldete Index muss deshalb auf sie zurückgerechnet
                            // werden, sonst leuchtet die falsche Zeile.
                            const filledIndex = filled.findIndex((candidate) => candidate.key === row.key);
                            const failed = failedIndex !== null && filledIndex === failedIndex;
                            return (
                                <tr key={row.key} className={failed ? 'bg-rose-50/70 dark:bg-rose-500/10' : ''}>
                                    <td className="text-right font-mono text-[12px] text-slate-400">{index + 1}</td>
                                    <td>
                                        <input
                                            value={row.firstName}
                                            onChange={(event) => patch(row.key, { firstName: event.target.value })}
                                            placeholder={t('personnel.create.firstNamePlaceholder')}
                                            className={CELL_INPUT_CLASS}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            value={row.lastName}
                                            onChange={(event) => patch(row.key, { lastName: event.target.value })}
                                            placeholder={t('personnel.create.lastNamePlaceholder')}
                                            className={CELL_INPUT_CLASS}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="email"
                                            autoComplete="off"
                                            value={row.email}
                                            onChange={(event) => patch(row.key, { email: event.target.value })}
                                            placeholder="name@offitec.ch"
                                            className={CELL_INPUT_CLASS}
                                        />
                                    </td>
                                    <td>
                                        {/* `new-password` verhindert, dass der Browser in
                                            jede Zeile dasselbe gespeicherte Kennwort füllt. */}
                                        <input
                                            type="password"
                                            autoComplete="new-password"
                                            value={row.password}
                                            onChange={(event) => patch(row.key, { password: event.target.value })}
                                            className={CELL_INPUT_CLASS}
                                        />
                                    </td>
                                    {/* Die Personalrolle ist abgelöst — Rechte
                                        vergibt die Rollenzuweisung auf der
                                        Personenseite (Vorgabe 27.08.2026). */}
                                    <td>
                                        <SelectMenu
                                            value={row.workLocation}
                                            onChange={(next) => patch(row.key, { workLocation: next as WorkLocation })}
                                            ariaLabel={t('personnel.field.workLocation')}
                                            buttonClassName={CELL_SELECT_CLASS}
                                            listWidth={170}
                                            options={WORK_LOCATIONS.map((location) => ({ value: location, label: workLocationLabel(location) }))}
                                        />
                                    </td>
                                    <td className="text-right">
                                        <button
                                            type="button"
                                            aria-label={t('personnel.create.removeRow')}
                                            title={t('personnel.create.removeRow')}
                                            onClick={() => removeRow(row.key)}
                                            className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-white/10"
                                        >
                                            <Trash01 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3">
                <GhostButton icon={<Plus size={14} />} onClick={() => setRows((current) => [...current, emptyRow()])}>
                    {t('personnel.create.addRow')}
                </GhostButton>
                <span className="text-[11.5px] text-slate-400 dark:text-white/50">
                    {t('personnel.create.qrHint')}
                </span>
            </div>
        </PersonnelSheet>
    );
};
