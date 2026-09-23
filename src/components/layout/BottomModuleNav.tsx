import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Check } from '../icons/antIconCompat';
import { hrefFor, isModifiedClick } from '../../lib/navLink';
import type { MenuLeaf, MenuSection } from './AppSidebar';

type BottomModuleNavProps = {
    sections: MenuSection[];
    activeUrl: string;
    permissions: string[];
    projectModuleEnabled: boolean;
    onNavigate: (path: string) => void;
    /**
     * Der Blitz ⇄ Zurück-Knopf. Er steht ganz vorn wie in der Kopfleiste —
     * im Dock ist links dieselbe Stelle wie dort.
     */
    lead?: ReactNode;
    /**
     * Anträge, Firma, Glocke, Sprache, Profil. In dieser Ansicht gibt es
     * KEINE Kopfleiste mehr (Vorgabe Samet, 21.09.2026), also wohnen die
     * Werkzeuge hinter dem Trennstrich rechts im Dock.
     */
    tools?: ReactNode;
};

type OpenMenu = {
    key: string;
    left: number;
    bottom: number;
};

const MENU_WIDTH = 228;
const VIEWPORT_GUTTER = 8;

/**
 * DAS DOCK — die untere Navigation der sidebar-freien Desktopansicht.
 *
 * Vorbild ist das Dock von macOS (Bild `mactab.png`, Vorgabe Samet
 * 21.09.2026): eine grosse, mittig schwebende Glaskapsel mit quadratischen
 * Symbolfeldern, kein zweites schmales Band am unteren Rand. Weil die
 * Kopfleiste in dieser Ansicht ganz wegfällt, trägt das Dock ALLES:
 *
 *      [Blitz/Zurück] │ Module … │ Anträge Firma Glocke Sprache Profil
 *
 * Die Gruppenmenüs klappen nach OBEN auf und hängen bewusst ausserhalb der
 * Kapsel (`position: fixed`), damit sie über dem Dock stehen können.
 */
export const BottomModuleNav = ({
    sections,
    activeUrl,
    permissions,
    projectModuleEnabled,
    onNavigate,
    lead,
    tools,
}: BottomModuleNavProps) => {
    const { t } = useTranslation();
    const dockRef = useRef<HTMLElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [openMenu, setOpenMenu] = useState<OpenMenu | null>(null);

    const canSee = useMemo(() => (item: MenuLeaf) => (
        !item.permission || permissions.includes(item.permission)
    ), [permissions]);

    const items = useMemo(() => sections
        .filter((section) => section.feature !== 'projects' || projectModuleEnabled)
        .map((section) => {
            if (section.type === 'single') return { section, children: [] as MenuLeaf[] };
            const children = section.items.filter(canSee);
            return children.length ? { section, children } : null;
        })
        .filter(Boolean) as Array<{ section: MenuSection; children: MenuLeaf[] }>,
    [sections, projectModuleEnabled, canSee]);

    const activeGroup = useMemo(() => items.find(({ section, children }) => (
        section.type === 'group' && children.some((child) => child.key === activeUrl)
    ))?.section.key, [activeUrl, items]);

    const openData = openMenu
        ? items.find(({ section }) => section.key === openMenu.key)
        : undefined;

    useEffect(() => {
        if (!openMenu) return undefined;
        const closeOnOutsideClick = (event: PointerEvent) => {
            const target = event.target as Node;
            if (dockRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            setOpenMenu(null);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenMenu(null);
        };
        const closeOnViewportChange = () => setOpenMenu(null);

        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        window.addEventListener('resize', closeOnViewportChange);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
            window.removeEventListener('resize', closeOnViewportChange);
        };
    }, [openMenu]);

    const openGroup = (key: string, button: HTMLButtonElement) => {
        if (openMenu?.key === key) {
            setOpenMenu(null);
            return;
        }
        const rect = button.getBoundingClientRect();
        const preferredLeft = rect.left + rect.width / 2 - MENU_WIDTH / 2;
        const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER);
        setOpenMenu({
            key,
            left: Math.min(Math.max(VIEWPORT_GUTTER, preferredLeft), maxLeft),
            bottom: Math.max(64, window.innerHeight - rect.top + 10),
        });
    };

    const go = (path: string) => {
        setOpenMenu(null);
        onNavigate(path);
    };

    return (
        <>
            <nav ref={dockRef} className="ofi-mac-dock" aria-label={t('nav.modules')}>
                {lead && <>
                    <div className="ofi-mac-dock__lead">{lead}</div>
                    <span className="ofi-mac-dock__sep" aria-hidden="true" />
                </>}

                <div className="ofi-mac-dock__modules">
                    {items.map(({ section }) => {
                        const Icon = section.icon;
                        const label = t(section.label);
                        const active = section.type === 'single'
                            ? section.path === activeUrl
                            : activeGroup === section.key;

                        if (section.type === 'single') {
                            return (
                                <a
                                    key={section.key}
                                    href={hrefFor(section.path)}
                                    title={label}
                                    aria-label={label}
                                    aria-current={active ? 'page' : undefined}
                                    className={`ofi-mac-dock__item${active ? ' is-active' : ''}`}
                                    onClick={(event) => {
                                        if (isModifiedClick(event)) return;
                                        event.preventDefault();
                                        go(section.path);
                                    }}
                                >
                                    <Icon size={20} />
                                </a>
                            );
                        }

                        const expanded = openMenu?.key === section.key;
                        return (
                            <button
                                key={section.key}
                                type="button"
                                title={label}
                                aria-label={label}
                                aria-haspopup="menu"
                                aria-expanded={expanded}
                                className={`ofi-mac-dock__item${active ? ' is-active' : ''}${expanded ? ' is-open' : ''}`}
                                onClick={(event) => openGroup(section.key, event.currentTarget)}
                            >
                                <Icon size={20} />
                            </button>
                        );
                    })}
                </div>

                {tools && <>
                    <span className="ofi-mac-dock__sep" aria-hidden="true" />
                    <div className="ofi-mac-dock__tools">{tools}</div>
                </>}
            </nav>

            {openMenu && openData?.section.type === 'group' && (
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label={t(openData.section.label)}
                    className="ofi-mac-module-menu ofi-mac-bottom-menu"
                    style={{ left: openMenu.left, bottom: openMenu.bottom, width: MENU_WIDTH }}
                >
                    <div className="ofi-mac-module-menu__items">
                        {openData.children.map((child) => {
                            const active = child.key === activeUrl;
                            return (
                                <a
                                    key={child.key}
                                    href={hrefFor(child.key)}
                                    role="menuitem"
                                    aria-current={active ? 'page' : undefined}
                                    className={`ofi-mac-module-menu__item${active ? ' is-active' : ''}`}
                                    onClick={(event) => {
                                        if (isModifiedClick(event)) return;
                                        event.preventDefault();
                                        go(child.key);
                                    }}
                                >
                                    <span className="ofi-mac-module-menu__check" aria-hidden>
                                        {active && <Check size={12} />}
                                    </span>
                                    <span>{t(child.label)}</span>
                                </a>
                            );
                        })}
                    </div>
                </div>
            )}
        </>
    );
};
