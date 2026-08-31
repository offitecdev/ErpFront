import { useState } from 'react';
import { ChevronDown } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import type { CatalogModuleDto, PageLevel } from '@/lib/api/authorization';

/**
 * ── DIE BERECHTIGUNGSTABELLE ─────────────────────────────────────────────────
 *
 * Modul für Modul, Seite für Seite — je Seite EINE Stufe (Vorgabe):
 *
 *   Kein Zugriff · Ansehen · Bearbeiten · Löschen
 *
 * Die Stufen sind aufsteigend: „Bearbeiten" schliesst „Ansehen" ein. Seiten,
 * hinter denen ein Rang gar nicht existiert (eine Auswertung kennt kein
 * Löschen), zeigen dort einen Strich statt eines Knopfes — sonst verspräche die
 * Tabelle etwas, das es nicht gibt.
 *
 * ZUGEKLAPPT (Vorgabe 17.08.2026): beim Öffnen stehen NUR die Module da. Erst
 * ein Klick auf ein Modul zeigt seine Seiten. Die ganze Karte auf einmal war
 * eine Wand aus Punkten, in der niemand die eine Zeile fand, die er suchte.
 *
 * Die Wahlkreise sind von Hand gezeichnet (ein verstecktes `input[type=radio]`
 * unter einem Kreis aus zwei Ringen): das Systemsteuerelement lässt sich nicht
 * zuverlässig vergrössern, und die Kreise sollten deutlich grösser sein als die
 * 14 px, die der Browser vorgibt.
 *
 * Dieselbe Tabelle steht an ZWEI Stellen: im Rolleneditor zum Setzen und auf
 * der Personenseite (Reiter Zugang) als schreibgeschützte Vorschau der Rolle.
 * Deshalb `readOnly` statt einer zweiten Ansicht.
 */

const LEVEL_COLUMNS: Array<{ level: PageLevel; labelKey: string }> = [
    { level: 0, labelKey: 'settings.roles.levelOff' },
    { level: 1, labelKey: 'settings.roles.level1' },
    { level: 2, labelKey: 'settings.roles.level2' },
    { level: 3, labelKey: 'settings.roles.level3' },
];

/** Der Wahlkreis: Ring aussen, Punkt innen — 22 px statt der 14 px des Browsers. */
const LevelRadio = ({
    name,
    active,
    label,
    onSelect,
}: {
    name: string;
    active: boolean;
    label: string;
    onSelect: () => void;
}) => (
    <label className="inline-flex cursor-pointer items-center justify-center rounded-full p-1 focus-within:ring-2 focus-within:ring-[#272f67]/40 dark:focus-within:ring-[#e6cf9e]/40">
        <input
            type="radio"
            name={name}
            checked={active}
            onChange={onSelect}
            aria-label={label}
            className="sr-only"
        />
        <span
            className={`grid size-[22px] place-items-center rounded-full border-2 transition-colors ${active
                ? 'border-[#272f67] dark:border-[#e6cf9e]'
                : 'border-slate-300 hover:border-[#8494c9] dark:border-white/25 dark:hover:border-white/50'}`}
        >
            <span
                className={`size-[11px] rounded-full transition-transform ${active
                    ? 'scale-100 bg-[#272f67] dark:bg-[#e6cf9e]'
                    : 'scale-0 bg-transparent'}`}
            />
        </span>
    </label>
);

/** Dieselbe Grösse, nur ohne Bedienung — die Vorschau auf der Personenseite. */
const LevelDot = ({ active, level }: { active: boolean; level: PageLevel }) => (
    <span
        aria-hidden={!active}
        className={`inline-grid size-[22px] place-items-center rounded-full border-2 ${active
            ? level === 0
                ? 'border-slate-300 dark:border-white/25'
                : 'border-[#272f67] dark:border-[#8fa2ff]'
            : 'border-slate-200 dark:border-white/10'}`}
    >
        <span
            className={`size-[11px] rounded-full ${active
                ? level === 0
                    ? 'bg-slate-300 dark:bg-white/25'
                    : 'bg-[#272f67] dark:bg-[#8fa2ff]'
                : 'bg-transparent'}`}
        />
    </span>
);

export const PageLevelTable = ({
    modules,
    levels,
    onChange,
    readOnly = false,
}: {
    modules: CatalogModuleDto[];
    levels: Record<string, PageLevel>;
    onChange?: (pageKey: string, level: PageLevel) => void;
    readOnly?: boolean;
}) => {
    /** Welche Module offen stehen. Leer = alle zu, so beginnt die Tabelle. */
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const toggle = (moduleKey: string) =>
        setExpanded((current) => ({ ...current, [moduleKey]: !current[moduleKey] }));

    /** Ein ganzes Modul auf eine Stufe setzen — je Seite gedeckelt auf ihr Maximum. */
    const setModule = (moduleDef: CatalogModuleDto, level: PageLevel) => {
        if (!onChange) return;
        for (const page of moduleDef.pages) {
            onChange(page.key, (level > page.maxLevel ? page.maxLevel : level) as PageLevel);
        }
    };

    return (
        <div className="overflow-x-auto">
            <table data-inv-table data-grid-lines data-unstyled-table className="w-full min-w-[660px]">
                <colgroup>
                    <col />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 116 }} />
                </colgroup>
                <thead>
                    <tr>
                        <th className="text-left">{t('settings.roles.colPage')}</th>
                        {LEVEL_COLUMNS.map((column) => (
                            <th key={column.level} className="text-center">{t(column.labelKey)}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {modules.map((moduleDef) => {
                        const granted = moduleDef.pages.filter((page) => (levels[page.key] ?? 0) > 0).length;
                        const open = Boolean(expanded[moduleDef.key]);
                        return [
                            /* Modulzeile: der Klickbereich, der die Seiten zeigt —
                               dazu die Anzahl freigegebener Seiten und, im Editor,
                               die Abkürzung „ganzes Modul auf …". */
                            <tr key={moduleDef.key} className="bg-slate-50/80 dark:bg-white/5">
                                <td className="font-semibold text-slate-800 dark:text-white">
                                    <button
                                        type="button"
                                        onClick={() => toggle(moduleDef.key)}
                                        aria-expanded={open}
                                        title={open ? t('common.collapse') : t('common.expand')}
                                        className="flex w-full min-w-0 items-center gap-2 text-left"
                                    >
                                        <ChevronDown
                                            size={14}
                                            className={`shrink-0 text-slate-400 transition-transform dark:text-white/50 ${open ? '' : '-rotate-90'}`}
                                        />
                                        <span className="truncate">{t(moduleDef.labelKey)}</span>
                                        <span className="shrink-0 text-[11px] font-medium text-slate-400 dark:text-white/40">
                                            {t('settings.roles.pagesOf', { granted, total: moduleDef.pages.length })}
                                        </span>
                                    </button>
                                </td>
                                {LEVEL_COLUMNS.map((column) => (
                                    <td key={column.level} className="text-center">
                                        {!readOnly && (
                                            <button
                                                type="button"
                                                onClick={() => setModule(moduleDef, column.level)}
                                                title={t('settings.roles.applyToModule', { level: t(column.labelKey) })}
                                                className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 transition-colors hover:bg-white hover:text-[#272f67] dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
                                            >
                                                {t('settings.roles.applyAll')}
                                            </button>
                                        )}
                                    </td>
                                ))}
                            </tr>,
                            ...(open ? moduleDef.pages : []).map((page) => {
                                const value = levels[page.key] ?? 0;
                                return (
                                    <tr key={page.key} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-white/5">
                                        <td className="pl-8 text-[12.5px] text-slate-700 dark:text-white/80">
                                            {t(page.labelKey)}
                                            <span className="ml-2 font-mono text-[10.5px] text-slate-300 dark:text-white/25">
                                                {page.path}
                                            </span>
                                        </td>
                                        {LEVEL_COLUMNS.map((column) => {
                                            const offered = column.level === 0 || column.level <= page.maxLevel;
                                            const active = value === column.level;
                                            if (!offered) {
                                                return (
                                                    <td key={column.level} className="text-center text-slate-200 dark:text-white/15">
                                                        –
                                                    </td>
                                                );
                                            }
                                            return (
                                                <td key={column.level} className="text-center">
                                                    {readOnly
                                                        ? <LevelDot active={active} level={column.level} />
                                                        : (
                                                            <LevelRadio
                                                                name={`page-${page.key}`}
                                                                active={active}
                                                                label={`${t(page.labelKey)} — ${t(column.labelKey)}`}
                                                                onSelect={() => onChange?.(page.key, column.level)}
                                                            />
                                                        )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            }),
                        ];
                    })}
                </tbody>
            </table>
        </div>
    );
};
