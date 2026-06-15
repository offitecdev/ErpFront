import type { MouseEvent } from "react";
import { useState } from "react";
import { cx } from "@/lib/utils/cx";
import type { NavItemDividerType, NavItemType } from "../config";
import { NavItemBase } from "./nav-item";

interface NavListProps {
    /** URL of the currently active item. */
    activeUrl?: string;
    /** Additional CSS classes to apply to the list. */
    className?: string;
    /** List of items to display. */
    items: (NavItemType | NavItemDividerType)[];
    /** Called before navigation so apps can route without a full page reload. */
    onNavigate?: (href: string, event: MouseEvent) => void;
    /** Whether the desktop sidebar is pinned open. */
    expanded?: boolean;
}

export const NavList = ({ activeUrl, items, className, onNavigate, expanded = false }: NavListProps) => {
    const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);

    return (
        <ul className={cx("flex flex-col px-4 pt-5", className)}>
            {items.map((item, index) => {
                if (item.divider) {
                    return <li key={index} className="h-1.5" aria-hidden="true" />;
                }

                if (item.items?.length) {
                    const isActiveGroup = item.href === activeUrl || item.items.some((subItem) => subItem.href === activeUrl);
                    const isOpen = isActiveGroup || (expandedItems[item.label] ?? false) || (!expanded && hoveredItem === item.label);

                    return (
                        <li
                            key={item.label}
                            className="py-0.25"
                            onMouseEnter={() => setHoveredItem(item.label)}
                            onMouseLeave={() => setHoveredItem((current) => current === item.label ? null : current)}
                        >
                            <NavItemBase
                                badge={item.badge}
                                icon={item.icon}
                                open={isOpen}
                                type="collapsible"
                                sidebarExpanded={expanded}
                                onClick={() => {
                                    setExpandedItems((prev) => ({ ...prev, [item.label]: !isOpen }));
                                }}
                            >
                                {item.label}
                            </NavItemBase>

                            {isOpen && (
                                <ul className={cx("overflow-hidden pb-1 transition-[max-height,opacity] duration-200 ease-out", expanded ? "max-h-80 opacity-100" : "max-h-80 opacity-100 lg:max-h-0 lg:opacity-0 lg:group-hover/sidebar:max-h-80 lg:group-hover/sidebar:opacity-100")}>
                                    {item.items.map((childItem) => (
                                        <li key={childItem.label} className="py-0.25">
                                            <NavItemBase
                                                href={childItem.href}
                                                badge={childItem.badge}
                                                type="collapsible-child"
                                                current={activeUrl === childItem.href}
                                                sidebarExpanded={expanded}
                                                onClick={(event) => onNavigate?.(childItem.href, event)}
                                            >
                                                {childItem.label}
                                            </NavItemBase>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    );
                }

                return (
                    <li key={item.label} className="py-px">
                        <NavItemBase
                            type="link"
                            badge={item.badge}
                            icon={item.icon}
                            href={item.href}
                            current={activeUrl === item.href}
                            sidebarExpanded={expanded}
                            onClick={(event) => item.href && onNavigate?.(item.href, event)}
                        >
                            {item.label}
                        </NavItemBase>
                    </li>
                );
            })}
        </ul>
    );
};
