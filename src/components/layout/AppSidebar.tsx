import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ChevronDown,
    DotsVertical,
    XClose as CloseOutlined,
} from '../icons/antIconCompat';
import { hrefFor, isModifiedClick } from '../../lib/navLink';

/* ── Shared menu types (also consumed by MainLayout) ── */
export type MenuLeaf = {
    key: string;
    label: string;
    permission?: string;
    module?: string;
    /** Eigenes Zeichen vor dem Namen — z. B. das Outlook-Zeichen bei E-Mail. */
    icon?: (props: { size?: number; className?: string }) => React.JSX.Element;
};
export type MenuIcon = React.ComponentType<any>;
export type MenuSection =
    | { type: 'single'; key: string; path: string; label: string; icon: MenuIcon; feature?: 'projects' }
    | { type: 'group'; key: string; label: string; icon: MenuIcon; items: MenuLeaf[]; feature?: 'projects' };

export type QuickCreateItem = {
    id: string;
    label: string;
    icon: MenuIcon;
    iconClassName?: string;
};

/* The shell card geometry — MainLayout derives `--app-shell-inset` and the
   content spacer from these, keep them in sync with its comments.
   Der Inhalt richtet sich IMMER an der schmalen Leiste aus: das Untermenü
   legt sich beim Zeigen darüber, es schiebt die Seite nie zur Seite. */
export const SIDEBAR_RAIL_WIDTH = 84;
export const SIDEBAR_PANEL_WIDTH = 232;
/* Wo das Untermenü oben ansetzt. NICHT als Zahl: die Kopfleiste ist `h-16`
   = 4rem, und `html` steht auf 14px — das sind 56px, nicht 64. Die feste 64
   liess einen 8px breiten Streifen Seitengrund zwischen Kopf und Klappfeld
   stehen («keine Lücke, die beiden gehören zusammen», Samet 02.09.2026).
   MainLayout setzt `--app-header-height` auf genau dieselben 4rem, also
   folgt das Feld der Kopfleiste jetzt von selbst. */
const HEADER_OFFSET = 'var(--app-header-height, 4rem)';

/* Hover intent: the submenu panel opens/switches only after the pointer rests
   on a module for a moment, and survives short gaps on the way into the panel —
   grazing the rail must not flip menus around. */
const PANEL_OPEN_DELAY = 200;
const PANEL_CLOSE_DELAY = 320;

/* ── Mobile (drawer) row palette — unchanged from the previous accordion ── */
/* Die Ruhefarben stehen bewusst kräftiger als früher: bei 85 % Schwarz auf
   #FBFBFA verlor die Beschriftung gegen den Untergrund. */
const ROW_IDLE = 'text-black hover:bg-[#eef1fa] hover:text-black dark:text-white/92 dark:hover:bg-white/8 dark:hover:text-white';
const ROW_ACTIVE = 'bg-black/8 text-black dark:bg-white/10 dark:text-white dark:ring-1 dark:ring-inset dark:ring-white/10';
const DOT_IDLE = 'bg-black/40 dark:bg-white/45';
const DOT_ACTIVE = 'bg-transparent';
/* Icons tragen im Hellmodus das Markennavy statt der geerbten Textfarbe —
   das ist der „kräftiger“-Teil: ein farbiges Icon liest sich neben grauem
   Text sofort als das, was es ist. */
const ICON_IDLE = 'text-[#272f67] dark:text-[#e6cf9e]/85';
const ICON_ACTIVE = 'text-[#272f67] dark:text-[#e6cf9e]';
const PANEL_BG = 'bg-[#FBFBFA] dark:bg-[#151616]';

/* Desktop rail module button (large icon + caption). */
const RAIL_BTN_IDLE = 'text-black/75 hover:bg-black/4 hover:text-[#1f2654] dark:text-white/75 dark:hover:bg-white/6 dark:hover:text-white';
/* Seit die Leiste WEISS ist (Vorgabe 28.08.2026), kann der gewählte Modul
   nicht mehr als weisser Chip aus ihr heraustreten — er trägt denselben
   blauen Auswahlton, den die Kopfleiste für ihre Knöpfe benutzt. */
const RAIL_BTN_ACTIVE = 'bg-[#d3e3fd] text-[#1f2654] dark:!bg-white/10 dark:text-[#e6cf9e] dark:shadow-none';

type AppSidebarProps = {
    /** Pre-filtered by MainLayout: company-category / personal module package
        and feature flags are already applied; only permissions remain here. */
    sections: MenuSection[];
    activeUrl: string;
    permissions: string[];
    projectModuleEnabled: boolean;
    onNavigate: (path: string) => void;
    /** Rail KİLİTLİ dar kalır (takvim + ana sayfa): hover paneli hiç açılmaz. */
    quickCreateItems: QuickCreateItem[];
    onQuickCreate: (item: QuickCreateItem) => void;
    /** Mobile drawer renders the always-expanded accordion (no rail / panel). */
    variant?: 'desktop' | 'mobile';
};

/**
 * The sidebar half of the white shell card. Desktop is a full-height narrow
 * rail — the fav icon on top, then one large icon + caption per module.
 * Hovering a module slides out a flush submenu panel beside the rail; that
 * panel is ALWAYS an overlay — it floats over the page and disappears again
 * when the pointer leaves. Es gibt kein Anheften mehr (Nutzerwunsch
 * 16.08.2026): die Seite wird nie zur Seite geschoben, die Leiste bleibt
 * immer schmal. Clicking a module icon jumps straight to its first submenu
 * page.
 */
export const AppSidebar: React.FC<AppSidebarProps> = ({
    sections,
    activeUrl,
    permissions,
    projectModuleEnabled,
    onNavigate,
    quickCreateItems,
    onQuickCreate,
    variant = 'desktop',
}) => {
    const { t } = useTranslation();
    const isMobile = variant === 'mobile';

    /** Which group's submenu the desktop panel shows (hover/click intent). */
    const [panelKey, setPanelKey] = useState<string | null>(null);
    const [openGroups, setOpenGroups] = useState<string[]>([]);
    const [quickCreateOpen, setQuickCreateOpen] = useState(false);
    /* Tablets run the desktop rail (≥1024px) but have no pointer to hover with:
       there the submenu panel opens on TAP instead of hover-intent, and the
       edge handles grow to a finger-sized target. */
    const [isTouch, setIsTouch] = useState(() => typeof window !== 'undefined' && (
        navigator.maxTouchPoints > 0
        || window.matchMedia('(hover: none)').matches
        || window.matchMedia('(any-pointer: coarse)').matches
    ));
    // Some Elo Android panels advertise a hover-capable pointer even though the
    // user is touching the screen. Keep the latest real pointer type in a ref so
    // the very first tap already follows the tablet path (before React rerenders).
    const touchInputRef = useRef(isTouch);

    const asideRef = useRef<HTMLElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const quickCreateRef = useRef<HTMLDivElement>(null);
    const openTimer = useRef<number | null>(null);
    const closeTimer = useRef<number | null>(null);

    const canSee = useMemo(() => (item: MenuLeaf) => {
        return !item.permission || permissions.includes(item.permission);
    }, [permissions]);

    // Visible sections, with their visible children resolved once.
    const items = useMemo(() => {
        return sections
            .filter((section) => section.feature !== 'projects' || projectModuleEnabled)
            .map((section) => {
                if (section.type === 'single') {
                    return { section, children: [] as MenuLeaf[] };
                }
                const children = section.items.filter(canSee);
                if (!children.length) return null;
                return { section, children };
            })
            .filter(Boolean) as Array<{ section: MenuSection; children: MenuLeaf[] }>;
    }, [sections, projectModuleEnabled, canSee]);

    const activeGroupKey = useMemo(() => {
        for (const { section, children } of items) {
            if (section.type === 'group' && children.some((c) => c.key === activeUrl)) return section.key;
        }
        return null;
    }, [items, activeUrl]);

    /* ── Hover-intent timers ── */
    const cancelOpen = () => {
        if (openTimer.current !== null) { window.clearTimeout(openTimer.current); openTimer.current = null; }
    };
    const cancelClose = () => {
        if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    };
    const scheduleOpen = (key: string) => {
        cancelClose();
        cancelOpen();
        openTimer.current = window.setTimeout(() => setPanelKey(key), PANEL_OPEN_DELAY);
    };
    const scheduleClose = () => {
        cancelOpen();
        cancelClose();
        closeTimer.current = window.setTimeout(() => setPanelKey(null), PANEL_CLOSE_DELAY);
    };
    useEffect(() => () => { cancelOpen(); cancelClose(); }, []);

    // A tablet can be docked to a mouse (and back) mid-session. Pointer events
    // are authoritative; media queries are only the initial/fallback signal.
    useEffect(() => {
        const hoverMql = window.matchMedia('(hover: none)');
        const coarseMql = window.matchMedia('(any-pointer: coarse)');
        const syncCapabilities = () => {
            const next = navigator.maxTouchPoints > 0 || hoverMql.matches || coarseMql.matches;
            touchInputRef.current = next;
            setIsTouch(next);
        };
        const onPointerDown = (event: PointerEvent) => {
            const next = event.pointerType === 'touch' || event.pointerType === 'pen';
            touchInputRef.current = next;
            setIsTouch(next);
            if (next) {
                // Cancel a synthetic mouseenter timer fired immediately before
                // pointerdown by Android WebView.
                cancelOpen();
                cancelClose();
            }
        };

        hoverMql.addEventListener('change', syncCapabilities);
        coarseMql.addEventListener('change', syncCapabilities);
        window.addEventListener('pointerdown', onPointerDown, true);
        return () => {
            hoverMql.removeEventListener('change', syncCapabilities);
            coarseMql.removeEventListener('change', syncCapabilities);
            window.removeEventListener('pointerdown', onPointerDown, true);
        };
    }, []);

    // Mobile drawer: keep the active module's accordion open.
    useEffect(() => {
        if (isMobile && activeGroupKey) {
            setOpenGroups((prev) => (prev.includes(activeGroupKey) ? prev : [...prev, activeGroupKey]));
        }
    }, [isMobile, activeGroupKey]);

    // Dismiss the quick-create card on outside click / Escape (mobile drawer).
    useEffect(() => {
        if (!quickCreateOpen) return;
        const onDown = (e: PointerEvent) => {
            if (quickCreateRef.current && !quickCreateRef.current.contains(e.target as Node)) setQuickCreateOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setQuickCreateOpen(false); };
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
    }, [quickCreateOpen]);

    // The flyout is an overlay: an outside click / Escape dismisses it.
    useEffect(() => {
        if (!panelKey) return;
        const onDown = (e: PointerEvent) => {
            const target = e.target as Node;
            const inside = asideRef.current?.contains(target) || panelRef.current?.contains(target);
            if (!inside) setPanelKey(null);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanelKey(null); };
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
    }, [panelKey]);

    // Navigation clears transient panels; the pinned panel then follows the route.
    const go = (path: string) => {
        cancelOpen(); cancelClose();
        setPanelKey(null);
        setQuickCreateOpen(false);
        onNavigate(path);
    };

    /* Nur was gerade gezeigt wird, steht offen — ohne Zeiger kein Untermenü.
       DAS UNTERMENÜ HÄNGT AM EINTRAG, NICHT AN DER SEITE (Vorgabe
       28.08.2026): «für Startseite und Kalender soll es nicht aufgehen, für
       die anderen schon». Startseite und Kalender sind `single`-Einträge und
       haben ohnehin kein Untermenü — gesperrt war bis dahin die ganze SEITE
       (`lockCollapsed`, 07.08.2026), sodass dort auch CRM oder Verkauf stumm
       blieben. Diese Sperre ist weg. */
    const resolvedPanelKey = panelKey;
    const panelData = resolvedPanelKey ? items.find((i) => i.section.key === resolvedPanelKey) : null;
    const panelVisible = !isMobile && !!panelData && panelData.section.type === 'group';

    /* ══════════ Mobile drawer — unchanged accordion layout ══════════ */
    if (isMobile) {
        const topSection = (
            <div className="px-2 pt-2 pb-1.5">
                {/* Die Lupe stand hier (11.09.2026, Vorgabe Samet: «Entfernt die
                    Lupe aus dem Kopf»). Sie öffnete ein Suchfeld über der
                    ganzen Seite, das nur die MODULE durchsuchte — dasselbe, was
                    die Schublade darunter ohnehin auflistet. Geblieben ist der
                    Schnellzugriff; die Programme stehen im Apps-Feld im Kopf. */}
                {/* Quick-access bar: three-dot opens the quick-create card */}
                <div ref={quickCreateRef} className="relative">
                    <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={quickCreateOpen}
                        title={t('nav.quickCreate', { defaultValue: 'Hızlı oluştur' })}
                        onClick={() => setQuickCreateOpen((v) => !v)}
                        className={`flex h-11 w-full items-center gap-2 rounded-lg px-3 transition-colors ${quickCreateOpen ? ROW_ACTIVE : ROW_IDLE}`}
                    >
                        <DotsVertical size={19} className={`shrink-0 rotate-90 ${quickCreateOpen ? ICON_ACTIVE : ICON_IDLE}`} />
                        <span className="text-[14px] font-semibold">{t('nav.quickCreate', { defaultValue: 'Hızlı oluştur' })}</span>
                    </button>

                    {quickCreateOpen && quickCreateItems.length > 0 && (
                        <div
                            role="menu"
                            className={`absolute left-0 z-[70] mt-1.5 w-60 overflow-hidden rounded-xl border border-[#EAEAEC] ${PANEL_BG} p-1.5 shadow-[0_12px_40px_rgba(16,24,40,0.14)] dark:border-white/10 dark:shadow-black/50`}
                        >
                            <p className="px-2.5 pb-1.5 pt-1 text-[14px] font-semibold uppercase tracking-wider text-[#6b7280] dark:text-[#a6acb8]">
                                {t('nav.quickCreate', { defaultValue: 'Hızlı oluştur' })}
                            </p>
                            <div className="flex flex-col gap-0.5">
                                {quickCreateItems.map((qi) => {
                                    const QIcon = qi.icon;
                                    return (
                                        <button
                                            key={qi.id}
                                            type="button"
                                            role="menuitem"
                                            onClick={() => { onQuickCreate(qi); setQuickCreateOpen(false); }}
                                            className="flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#eef1fa] dark:hover:bg-[#232326]"
                                        >
                                            <QIcon size={19} className={`shrink-0 dark:!text-[#e6cf9e]/85 ${qi.iconClassName || 'text-[#272f67]'}`} />
                                            <span className="truncate text-[14px] font-medium text-black dark:text-white">{qi.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );

        return (
            <div className="flex h-full flex-col">
                {topSection}
                <div className="my-1.5 h-px bg-black/8 dark:bg-white/10" />
                <nav className="flex-1 overflow-y-auto pb-3">
                    <div className="flex flex-col gap-0.5 px-2">
                        {items.map(({ section, children }) => {
                            const Icon = section.icon;
                            if (section.type === 'single') {
                                const active = section.path === activeUrl;
                                return (
                                    <a
                                        key={section.path}
                                        href={hrefFor(section.path)}
                                        onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); go(section.path); }}
                                        className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-100 ${active ? `${ROW_ACTIVE} font-semibold` : `${ROW_IDLE} font-medium`}`}
                                    >
                                        <Icon size={20} className={`shrink-0 ${active ? ICON_ACTIVE : ICON_IDLE}`} />
                                        <span className="truncate text-[14px]">{t(section.label)}</span>
                                    </a>
                                );
                            }

                            const groupOpen = openGroups.includes(section.key);
                            return (
                                <div key={section.key}>
                                    <button
                                        type="button"
                                        onClick={() => setOpenGroups((prev) => (prev.includes(section.key) ? prev.filter((k) => k !== section.key) : [...prev, section.key]))}
                                        className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-100 ${ROW_IDLE} font-medium`}
                                    >
                                        <Icon size={20} className={`shrink-0 ${ICON_IDLE}`} />
                                        <span className="flex-1 truncate text-[14px]">{t(section.label)}</span>
                                        <ChevronDown size={16} className={`shrink-0 opacity-70 transition-transform duration-150 ${groupOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {groupOpen && (
                                        <div className="mt-0.5 mb-1 flex flex-col gap-0.5 pl-4">
                                            {children.map((child) => {
                                                const active = child.key === activeUrl;
                                                return (
                                                    <a
                                                        key={child.key}
                                                        href={hrefFor(child.key)}
                                                        onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); go(child.key); }}
                                                        className={`flex min-h-10 items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 text-left text-[14px] transition-colors duration-100 ${active ? `${ROW_ACTIVE} font-semibold` : `${ROW_IDLE} font-medium`}`}
                                                    >
                                                        {child.icon
                                                            ? <child.icon size={16} className="shrink-0" />
                                                            : <span className={`size-1.5 shrink-0 rounded-full ${active ? DOT_ACTIVE : DOT_IDLE}`} />}
                                                        <span className="truncate">{t(child.label)}</span>
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </nav>
            </div>
        );
    }

    /* ══════════ Desktop — icon rail + flush submenu panel ══════════ */
    /* Hover-intent timers belong to a pointer. On touch the tap opens the
       panel and an outside tap (or the close button) dismisses it — letting
       the emulated mouseleave run would snatch the panel away mid-tap. */
    const hoverProps = isTouch ? {} : { onMouseEnter: cancelClose, onMouseLeave: scheduleClose };

    return (
        <>
            {/* The rail — full-height slice of the shell, on the same canvas
                colour as the header and the content column. */}
            <aside
                ref={asideRef}
                {...hoverProps}
                /* `ofi-fade`: die Leiste blendet beim Start einmal ein — der
                   ruhige Auftakt der Anmeldeseite, weitergetragen. */
                className="ofi-fade ofi-shell-white hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-[84px] lg:flex-col"
            >
                {/* Brand icon — same height as the header so the card corner is
                    seamless. Das Zeichen bleibt das Zeichen (Vorgabe 28.08.2026):
                    den Rückweg trägt der Blitz gleich rechts daneben in der
                    Kopfleiste, nicht die Marke (siehe QuickBackButton). */}
                <a
                    href={hrefFor('/')}
                    aria-label="Offitec"
                    onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); go('/'); }}
                    className="flex h-16 shrink-0 items-center justify-center"
                >
                    <img src="/fav4.svg" alt="Offitec" width={36} height={36} decoding="async" fetchPriority="high" className="size-9" />
                </a>

                <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4 pt-1">
                    <div className="flex flex-col gap-1">
                        {items.map(({ section, children }) => {
                            const Icon = section.icon;
                            const isSingle = section.type === 'single';
                            const active = isSingle
                                ? section.path === activeUrl
                                : activeGroupKey === section.key || (!!panelKey && panelKey === section.key);
                            // A module icon opens its first (permission-filtered)
                            // submenu page; singles are their own page.
                            const target = isSingle ? section.path : children[0]?.key;
                            if (!target) return null;
                            return (
                                <a
                                    key={section.key}
                                    href={hrefFor(target)}
                                    onClick={(e) => {
                                        if (isModifiedClick(e)) return;
                                        e.preventDefault();
                                        // No hover on a tablet: a tap on a module opens
                                        // its submenu (tapping again closes it), so the
                                        // flyout stays reachable by finger. Single pages
                                        // have no submenu and navigate straight away.
                                        // Kilitli rail'de dokunuş da panel açmaz — direkt gider.
                                        if (touchInputRef.current && !isSingle) {
                                            cancelOpen();
                                            cancelClose();
                                            setPanelKey((current) => (current === section.key ? null : section.key));
                                            return;
                                        }
                                        go(target);
                                    }}
                                    onMouseEnter={() => { if (touchInputRef.current) return; if (!isSingle) scheduleOpen(section.key); else cancelOpen(); }}
                                    onMouseLeave={cancelOpen}
                                    className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-center transition-colors duration-150 ${active ? RAIL_BTN_ACTIVE : RAIL_BTN_IDLE}`}
                                >
                                    <Icon size={23} className="shrink-0" />
                                    {/* Nicht 14px: die Beschriftung sitzt in einer 84px breiten
                                        Leiste, dort schneidet schon „Buchhaltung“ bei 12px an. */}
                                    <span className="w-full truncate text-[12px] font-semibold leading-tight">{t(section.label)}</span>
                                </a>
                            );
                        })}
                    </div>
                </nav>
            </aside>

            {/* The submenu panel — the "second box", flush against the rail. */}
            {panelVisible && panelData && panelData.section.type === 'group' && (
                <div
                    ref={panelRef}
                    id="oi-sidebar-panel"
                    style={{ left: SIDEBAR_RAIL_WIDTH, top: HEADER_OFFSET, width: SIDEBAR_PANEL_WIDTH }}
                    {...hoverProps}
                    /* Immer schwebend: Schatten + Einblenden, weil die Seite
                       darunter stehen bleibt. */
                    className="ofi-shell-white fixed bottom-0 z-[45] hidden flex-col border-l border-black/5 shadow-[28px_0_56px_-28px_rgba(16,24,40,0.25)] animate-in fade-in slide-in-from-left-2 duration-150 dark:border-white/8 dark:shadow-[28px_0_56px_-28px_rgba(0,0,0,0.8)] lg:flex"
                >
                    {/* The panel butts straight against the header (top =
                        --app-header-height), so the title starts tight — extra
                        top padding read as a gap. */}
                    <div className="flex items-center justify-between pb-1 pl-5 pr-3 pt-2">
                        <h2 className="ofi-serif truncate text-[15px] font-bold tracking-tight text-black dark:text-white">
                            {t(panelData.section.label)}
                        </h2>
                        <button
                            type="button"
                            aria-label={t('common.close')}
                            onClick={() => setPanelKey(null)}
                            className="flex size-7 items-center justify-center rounded-lg text-black/45 transition-colors hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/8 dark:hover:text-white"
                        >
                            <CloseOutlined size={15} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
                        <div className="flex flex-col gap-1">
                            {panelData.children.map((child) => {
                                const active = child.key === activeUrl;
                                return (
                                    <a
                                        key={child.key}
                                        href={hrefFor(child.key)}
                                        onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); go(child.key); }}
                                        className={`group flex items-center rounded-xl px-3.5 py-2.5 text-left text-[14px] font-semibold transition-all duration-150 ${active
                                            ? 'bg-[#272f67] text-white shadow-[0_10px_24px_-12px_rgba(39,47,103,0.55)]'
                                            : 'text-black/80 hover:translate-x-[3px] hover:bg-[#eef1fa] hover:text-[#1f2654] dark:text-white/80 dark:hover:bg-white/8 dark:hover:text-white'}`}
                                    >
                                        {child.icon && <child.icon size={16} className="mr-2.5 shrink-0" />}
                                        <span className="truncate">{t(child.label)}</span>
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Kein Anheft-Griff mehr (16.08.2026): das Untermenü öffnet nur
                beim Zeigen und legt sich über die Seite — sie rückt nie zur
                Seite. */}
        </>
    );
};

export default AppSidebar;
