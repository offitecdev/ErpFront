import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LuBuilding2, LuChevronDown, LuFolderOpen, LuUser, LuX } from 'react-icons/lu';

import { SearchLg } from '@/components/icons/antIconCompat';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';
import { mailFiltersApi, type MailFilterKind, type MailFilterOption } from '@/lib/api/mail';

/* DIE FILTER NEBEN DER SUCHE (13.09.2026, Vorgabe Samet: «oben Filter für
   Kunden, Personal und Projekte — neben die Suchleiste»).

   Drei Knöpfe, jeder klappt eine Liste auf:

     Kunde     alle Kunden des Firmenbaums
     Personal  alle aktiven Personen
     Projekt   alle Projekte, das jüngste zuoberst

   ES SIND ALLE DATENSÄTZE DES SYSTEMS DRIN, nicht nur die mit Post — wonach
   gesucht wird, muss auffindbar sein, auch wenn im Postfach (noch) nichts dazu
   liegt. Die Liste kommt vollständig herein und wird beim Tippen SERVERSEITIG
   enger; gesucht wird nach Nummer UND Name.

   JEDE ZEILE NENNT BEIDES: links den Namen im Klartext (Firma, Person,
   Projektname), rechts die Nummer des Datensatzes (Projekt-, Personalnummer) —
   Nummern sind das, was auf Papier und in Belegen steht, Namen das, was man
   im Kopf hat. Der Knopf selbst trägt danach den NAMEN, nicht die Nummer.

   Die Filter sind KOMBINIERBAR und stehen neben Ordner, Kategorie und Suche.
   ACHTUNG beim Kleid: die Klappliste hängt im PORTAL an `document.body` — die
   Regeln dafür (index.css, `.ofi-mail-filterpop` …) tragen darum ihren
   `body > :not(#root)`-Zwilling. */

export interface MailFilterValue {
    customerId: string | null;
    employeeId: string | null;
    projectId: string | null;
}

export const EMPTY_MAIL_FILTERS: MailFilterValue = { customerId: null, employeeId: null, projectId: null };

type FilterKey = keyof MailFilterValue;

const FILTERS: Array<{ key: FilterKey; kind: MailFilterKind; icon: ReactNode }> = [
    { key: 'customerId', kind: 'CUSTOMER', icon: <LuBuilding2 size={14} /> },
    { key: 'employeeId', kind: 'STAFF', icon: <LuUser size={14} /> },
    { key: 'projectId', kind: 'PROJECT', icon: <LuFolderOpen size={14} /> },
];

/** Eine aufgeklappte Liste: Suchfeld, Treffer, Fusszeile zum Zurücksetzen. */
const FilterPopup = ({
    anchorEl,
    kind,
    selectedId,
    onPick,
    onClose,
}: {
    anchorEl: HTMLElement | null;
    kind: MailFilterKind;
    selectedId: string | null;
    onPick: (option: MailFilterOption | null) => void;
    onClose: () => void;
}) => {
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [options, setOptions] = useState<MailFilterOption[] | null>(null);

    useEffect(() => {
        const id = window.setTimeout(() => setDebounced(search.trim()), 220);
        return () => window.clearTimeout(id);
    }, [search]);

    useEffect(() => {
        let cancelled = false;
        setOptions(null);
        mailFiltersApi.options(kind, debounced || undefined)
            .then((result) => { if (!cancelled) setOptions(result.options); })
            .catch(() => { if (!cancelled) setOptions([]); });
        return () => { cancelled = true; };
    }, [kind, debounced]);

    return (
        <AnchoredPicker
            anchorEl={anchorEl}
            onClose={onClose}
            width={320}
            maxHeight={420}
            panelClassName="ofi-mail-filterpop"
        >
            <label className="ofi-mail-popsearch">
                <SearchLg size={13} className="ofi-mail-popsearch__icon" />
                <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t(`mail.filters.search_${kind}`)}
                />
            </label>
            <div className="ofi-mail-poplist">
                {options === null && <div className="ofi-mail-popempty">{t('common.loading')}</div>}
                {options?.length === 0 && <div className="ofi-mail-popempty">{t('mail.filters.empty')}</div>}
                {options?.map((option) => {
                    const checked = option.id === selectedId;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            className={`ofi-option-row ofi-mail-opt ${option.sublabel ? 'has-sub' : ''} ${checked ? 'is-checked' : ''}`}
                            /* Zweiter Klick auf die gewählte Zeile nimmt den
                               Filter wieder heraus — kein Weg über die Fusszeile. */
                            onClick={() => onPick(checked ? null : option)}
                        >
                            <i className="ofi-mail-opt__mark is-radio">{checked && <span className="ofi-mail-opt__dot" />}</i>
                            <span className="ofi-mail-opt__label">
                                <span>{option.label}</span>
                                {option.sublabel && <span className="ofi-mail-opt__sub">{option.sublabel}</span>}
                            </span>
                            {option.number && <span className="ofi-mail-opt__hint">{option.number}</span>}
                        </button>
                    );
                })}
            </div>
            {selectedId && (
                <div className="ofi-mail-popfoot">
                    <span className="ofi-mail-popfoot__hint">{t(`mail.filters.hint_${kind}`)}</span>
                    <button type="button" className="ofi-mail-popfoot__clear" onClick={() => onPick(null)}>
                        {t('mail.filters.clearOne')}
                    </button>
                </div>
            )}
        </AnchoredPicker>
    );
};

export const MailFilters = ({
    value,
    onChange,
}: {
    value: MailFilterValue;
    onChange: (next: MailFilterValue) => void;
}) => {
    const [open, setOpen] = useState<FilterKey | null>(null);
    const anchors = useRef(new Map<FilterKey, HTMLButtonElement>());
    /* Der NAME des Gewählten steht auf dem Knopf. Er kommt aus der Liste und
       wird hier behalten: die Liste ist beim nächsten Öffnen eine andere
       (Suche), der Knopf soll trotzdem nicht zur Beschriftung «Kunde»
       zurückfallen. */
    const [labels, setLabels] = useState<Partial<Record<FilterKey, string>>>({});

    const active = useMemo(() => FILTERS.filter((filter) => value[filter.key]).length, [value]);

    const pick = (key: FilterKey, option: MailFilterOption | null) => {
        setLabels((current) => ({ ...current, [key]: option?.label }));
        onChange({ ...value, [key]: option?.id ?? null });
        setOpen(null);
    };

    return (
        <div className="ofi-mail-filterbar">
            {FILTERS.map((filter) => {
                const selectedId = value[filter.key];
                const label = (selectedId && labels[filter.key]) || t(`mail.filters.kind_${filter.kind}`);
                return (
                    <button
                        key={filter.key}
                        type="button"
                        ref={(element) => { if (element) anchors.current.set(filter.key, element); }}
                        className={`ofi-mail-filterchip ${selectedId ? 'is-active' : ''} ${open === filter.key ? 'is-open' : ''}`}
                        title={label}
                        onClick={() => setOpen((current) => (current === filter.key ? null : filter.key))}
                    >
                        <span className="ofi-mail-filterchip__icon">{filter.icon}</span>
                        <span className="ofi-mail-filterchip__label">{label}</span>
                        <LuChevronDown size={13} className="ofi-mail-filterchip__caret" />
                    </button>
                );
            })}

            {active > 0 && (
                <button type="button" className="ofi-mail-filterreset" onClick={() => { setLabels({}); onChange(EMPTY_MAIL_FILTERS); }}>
                    <LuX size={13} />
                    {t('mail.filters.clearAll')}
                </button>
            )}

            {open && (
                <FilterPopup
                    anchorEl={anchors.current.get(open) ?? null}
                    kind={FILTERS.find((filter) => filter.key === open)!.kind}
                    selectedId={value[open]}
                    onPick={(option) => pick(open, option)}
                    onClose={() => setOpen(null)}
                />
            )}
        </div>
    );
};
