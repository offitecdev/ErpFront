import type { ReactNode } from 'react';
import { SlidingTopTabs } from '@/components/ui-shared/SlidingTopTabs';

/* Die Tabellen-Bausteine kommen aus dem hausweiten Satz (ui-shared/TableKit) —
   dasselbe Aussehen wie Lager, CRM und Verkauf. Hier stehen nur die Stücke, die
   es sonst nirgends gibt. */
export {
    CELL_INPUT_CLASS,
    ColResizeHandle,
    FILTER_INPUT_CLASS,
    Pager,
    ResizableCols,
    SearchBox,
    SectionCard,
    SortableTh,
    TableStateRow,
    ToggleGroup,
} from '@/components/ui-shared/TableKit';

/** Der Hauptknopf des Moduls (Hausfarbe, gefüllt). */
export const PrimaryButton = ({
    children,
    onClick,
    disabled,
    type = 'button',
    icon,
    className = '',
}: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit';
    icon?: ReactNode;
    className?: string;
}) => (
    <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
        {icon}
        {children}
    </button>
);

/** Nebenknopf: umrandet, hell — Abbrechen, Filter leeren, Zurücksetzen. */
export const GhostButton = ({
    children,
    onClick,
    disabled,
    icon,
    className = '',
}: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    icon?: ReactNode;
    className?: string;
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:bg-transparent dark:text-white/70 dark:hover:text-white ${className}`}
    >
        {icon}
        {children}
    </button>
);

/** Beschriftetes Feld — eine Spalte, Label über der Eingabe. */
export const Labelled = ({
    label,
    hint,
    required,
    children,
    className = '',
}: {
    label: ReactNode;
    hint?: ReactNode;
    required?: boolean;
    children: ReactNode;
    className?: string;
}) => (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
        <span className="text-[12px] font-semibold text-slate-600 dark:text-white/70">
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
        {children}
        {hint && <span className="text-[11px] text-slate-400 dark:text-white/45">{hint}</span>}
    </label>
);

/** Kleiner Zustandschip (Antragsstand, Quelle, Arbeitsort). */
export const Chip = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${className}`}>
        {children}
    </span>
);

export interface TopTabItem {
    key: string;
    label: string;
    /** Zahl offener Vorgänge — steht als Plakette am Reiter. */
    badge?: number;
}

/**
 * Die Reiterleiste des Moduls — dieselbe Optik wie die Angebots-/Projektreiter
 * (`ofi-quote-tab*`), damit der Homeoffice-Antrag „als eigener Reiter oben"
 * genau wie überall sonst im Haus aussieht.
 */
export const PersonnelTopTabs = ({
    items,
    activeKey,
    onChange,
}: {
    items: TopTabItem[];
    activeKey: string;
    onChange: (key: string) => void;
}) => (
    <nav className="ofi-quote-tabs-strip mb-3 min-w-0 overflow-x-auto border-b border-slate-200 px-1 pt-1 dark:border-white/15">
        <SlidingTopTabs activeKey={activeKey} className="flex min-w-max items-stretch gap-1">
            {items.map((item) => {
                const active = item.key === activeKey;
                return (
                    <div key={item.key} data-tab-key={item.key} className="relative -mb-px shrink-0">
                        <button
                            type="button"
                            aria-current={active ? 'page' : undefined}
                            onClick={() => onChange(item.key)}
                            className={`ofi-quote-tab inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-t-md border border-b-0 px-4 py-2.5 text-[12.5px] transition-colors ${
                                active
                                    ? 'ofi-quote-tab-active border-slate-200 bg-[#eef2fb] font-bold text-[#1f2654]'
                                    : 'border-transparent font-medium text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-[#1f2654] dark:text-white/70'
                            }`}
                        >
                            <span>{item.label}</span>
                            {Boolean(item.badge) && (
                                <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-100 px-1.5 py-px text-[10px] font-bold text-red-700">
                                    {item.badge}
                                </span>
                            )}
                        </button>
                    </div>
                );
            })}
        </SlidingTopTabs>
    </nav>
);
