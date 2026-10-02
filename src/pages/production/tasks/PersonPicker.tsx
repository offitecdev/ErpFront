import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { MacSelectionCheck } from '@/components/ui-shared/MacSelectionParts';
import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import { readTaskWorkload } from '@/lib/api/productionTasks';
import type { TaskWorkload } from '@/types/productionTasks';

import { sectionLabel, staffName, stageLabel } from './taskModel';

/** So viele offene Unteraufgaben zeigt die Vorschau einer Person; der Rest als «+N». */
const WORKLOAD_SHOWN = 6;

/**
 * ── KİŞİ ATA (26.09.2026) ───────────────────────────────────────────────────
 *
 * «Sadece kişi atamaları … kişilere özel atandığında gelmesi lazım.»
 * Die gläserne macOS-Auswahl der Anwendung (styles/macSelection.css) am
 * Auslöser: Suchfeld, Häkchenkästchen, jede zweite Zeile grau. Mehrfach —
 * ein Klick hakt an oder ab, ohne zu schliessen; «Tamam» oder ein Klick
 * daneben schliesst. Die Leute kommen aus dem Personalverzeichnis der
 * GEWÄHLTEN Firma (/employees/directory) — genau die, die der Server annimmt.
 */
export const PersonPicker = ({
    anchorEl,
    staff,
    loading,
    selected,
    onChange,
    onClose,
}: {
    anchorEl: HTMLElement | null;
    staff: StaffDirectoryRow[];
    loading: boolean;
    selected: readonly string[];
    onChange: (next: string[]) => void;
    onClose: () => void;
}) => {
    const [query, setQuery] = useState('');
    /* Wer schon woran arbeitet (02.10.2026: «when admins assign people show which tasks that
       employee has on which projects and devices»): je Zeile die Zahl der offenen Unteraufgaben,
       unten die der Person unter der Maus (oder im Fokus). Nur die Verwaltung bekommt sie. */
    const [workload, setWorkload] = useState<TaskWorkload | null>(null);
    const [previewId, setPreviewId] = useState<string | null>(null);
    const open = Boolean(anchorEl);
    useEffect(() => (open ? readTaskWorkload((value) => setWorkload(value), () => undefined) : undefined), [open]);
    const itemsOf = (id: string) => workload?.people[id] ?? [];
    const preview = previewId ? itemsOf(previewId) : [];
    const previewRow = previewId ? staff.find((row) => row.id === previewId) ?? null : null;
    const previewName = previewRow ? staffName(previewRow) || previewRow.email || '' : '';

    const rows = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('tr-TR');
        return staff
            .map((row) => ({ row, name: staffName(row) }))
            .filter(({ row, name }) => !needle
                || name.toLocaleLowerCase('tr-TR').includes(needle)
                || (row.roleName ?? '').toLocaleLowerCase('tr-TR').includes(needle)
                || (row.title ?? '').toLocaleLowerCase('tr-TR').includes(needle))
            .sort((left, right) => left.name.localeCompare(right.name, 'tr'));
    }, [staff, query]);

    const toggle = (id: string) =>
        onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);

    return (
        <AnchoredPicker
            anchorEl={anchorEl}
            onClose={onClose}
            width={300}
            maxHeight={340}
            exactWidth
            arrow
            ariaLabel={t('productionTasks.people.pick')}
            panelClassName="ofi-gv-picker ofi-mac-selection ofi-ptk-picker"
            footer={(
                <div className="ofi-mac-selection__footer">
                    <button type="button" disabled={!selected.length} onClick={() => onChange([])}>
                        {t('productionTasks.people.clear')}
                    </button>
                    <button type="button" onClick={() => { anchorEl?.focus(); onClose(); }}>
                        {t('productionTasks.people.done')}
                    </button>
                </div>
            )}
        >
            <div className="ofi-gv-picker__search">
                <Search size={15} aria-hidden />
                <input
                    className="ofi-cal-input"
                    value={query}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('productionTasks.people.search')}
                    aria-label={t('productionTasks.people.search')}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        // Enter übernimmt den einzigen Treffer — schnell per Tastatur.
                        if (event.key === 'Enter' && rows.length === 1) {
                            event.preventDefault();
                            toggle(rows[0].row.id);
                        }
                    }}
                />
            </div>
            <div className="ofi-gv-picker__list" role="listbox" aria-multiselectable="true" aria-label={t('productionTasks.people.pick')}>
                {loading && !staff.length && <div className="ofi-ptk-picker__state">{t('productionTasks.people.loading')}</div>}
                {!loading && !rows.length && <div className="ofi-ptk-picker__state">{t('productionTasks.people.noneFound')}</div>}
                {rows.map(({ row, name }) => {
                    const active = selected.includes(row.id);
                    const count = itemsOf(row.id).length;
                    return (
                        <button
                            key={row.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            className="ofi-gv-picker__row"
                            onClick={() => toggle(row.id)}
                            onMouseEnter={() => setPreviewId(row.id)}
                            onFocus={() => setPreviewId(row.id)}
                        >
                            <MacSelectionCheck selected={active} />
                            <span className="ofi-gv-picker__name">{name || row.email || row.id}</span>
                            {(row.roleName || row.title) && <span className="ofi-gv-picker__hint">{row.roleName || row.title}</span>}
                            {workload && (
                                <span
                                    className={`ofi-ptk-workcount ${count ? '' : 'is-free'}`}
                                    title={t('productionTasks.workload.count', { count })}
                                >
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
            {workload && previewId && (
                <div className="ofi-ptk-workload" aria-live="polite">
                    <b className="ofi-ptk-workload__title">
                        {preview.length
                            ? t('productionTasks.workload.title', { name: previewName, count: preview.length })
                            : t('productionTasks.workload.free', { name: previewName })}
                    </b>
                    {preview.length > 0 && (
                        <ul className="ofi-ptk-workload__list">
                            {preview.slice(0, WORKLOAD_SHOWN).map((item, index) => (
                                <li key={`${item.deviceId}-${item.taskCode}-${index}`}>
                                    <span className="ofi-ptk-workload__where">
                                        {item.projectNumber} · {item.positionNumber ? `${item.positionNumber} · ` : ''}{item.deviceName}
                                    </span>
                                    <span className="ofi-ptk-workload__what">
                                        {sectionLabel({ key: item.area, name: item.sectionName })} › {stageLabel({ key: item.stage, name: item.stageName, weight: 0 })} · {item.taskCode} {item.subtaskName}
                                    </span>
                                    <span className="ofi-ptk-workload__meta">
                                        {t(`productionTasks.status.${item.status}`)}
                                        {item.dueDate ? ` · ${t('productionTasks.workload.due', { date: item.dueDate.split('-').reverse().join('.') })}` : ''}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {preview.length > WORKLOAD_SHOWN && (
                        <small className="ofi-ptk-workload__more">{t('productionTasks.workload.more', { count: preview.length - WORKLOAD_SHOWN })}</small>
                    )}
                </div>
            )}
        </AnchoredPicker>
    );
};
