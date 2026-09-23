import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ArrowLeft, Check } from '../icons/antIconCompat';
import { useBackTarget } from '../../lib/backNav';
import { hrefFor, isModifiedClick } from '../../lib/navLink';
import { useNavGuardStore } from '../../store/navGuardStore';
import type { MenuLeaf, MenuSection } from './AppSidebar';

type TopModuleNavProps = {
    sections: MenuSection[];
    activeUrl: string;
    permissions: string[];
    projectModuleEnabled: boolean;
    onNavigate: (path: string) => void;
};

type OpenMenu = {
    key: string;
    left: number;
    top: number;
};

const MENU_WIDTH = 228;
const VIEWPORT_GUTTER = 8;

/**
 * Compact, text-first module navigation for the sidebar-free desktop layout.
 *
 * The dropdown is fixed to the viewport instead of being nested in the
 * horizontally scrollable strip. This keeps every module on one line without
 * clipping its menu at the strip's edge.
 */
export const TopModuleNav = ({
    sections,
    activeUrl,
    permissions,
    projectModuleEnabled,
    onNavigate,
}: TopModuleNavProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const back = useBackTarget();
    const stripRef = useRef<HTMLDivElement>(null);
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
            if (stripRef.current?.contains(target) || menuRef.current?.contains(target)) return;
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
        const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER);
        setOpenMenu({
            key,
            left: Math.min(Math.max(VIEWPORT_GUTTER, rect.left), maxLeft),
            top: rect.bottom + 5,
        });
    };

    const go = (path: string) => {
        setOpenMenu(null);
        onNavigate(path);
    };

    const goBack = () => {
        if (!back) return;
        setOpenMenu(null);
        const proceed = () => {
            const { historyPinned } = useNavGuardStore.getState();
            if (back.historyStep && !historyPinned) navigate(-1);
            else onNavigate(back.to);
        };
        const { attempt } = useNavGuardStore.getState();
        if (attempt) attempt(proceed);
        else proceed();
    };

    return (
        <>
            <div
                ref={stripRef}
                className="ofi-mac-module-strip"
                role="navigation"
                aria-label={t('nav.modules')}
                onScroll={() => setOpenMenu(null)}
            >
                {items.map(({ section }) => {
                    if (section.type === 'single') {
                        const active = section.path === activeUrl;
                        return (
                            <Fragment key={section.key}>
                                <a
                                    href={hrefFor(section.path)}
                                    aria-current={active ? 'page' : undefined}
                                    className={`ofi-mac-module-tab${active ? ' is-active' : ''}`}
                                    onClick={(event) => {
                                        if (isModifiedClick(event)) return;
                                        event.preventDefault();
                                        go(section.path);
                                    }}
                                >
                                    {t(section.label)}
                                </a>
                                {section.path === '/' && back && (
                                    <button
                                        type="button"
                                        title={t('common.back')}
                                        aria-label={t('common.back')}
                                        className="ofi-mac-module-back"
                                        onClick={goBack}
                                    >
                                        <ArrowLeft size={14} />
                                    </button>
                                )}
                            </Fragment>
                        );
                    }

                    const active = activeGroup === section.key;
                    const expanded = openMenu?.key === section.key;
                    return (
                        <button
                            key={section.key}
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={expanded}
                            className={`ofi-mac-module-tab${active ? ' is-active' : ''}${expanded ? ' is-open' : ''}`}
                            onClick={(event) => openGroup(section.key, event.currentTarget)}
                        >
                            <span>{t(section.label)}</span>
                        </button>
                    );
                })}
            </div>

            {openMenu && openData?.section.type === 'group' && (
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label={t(openData.section.label)}
                    className="ofi-mac-module-menu"
                    style={{ left: openMenu.left, top: openMenu.top, width: MENU_WIDTH }}
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
