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
}

export const NavList = ({ activeUrl, items, className, onNavigate }: NavListProps) => {
    const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

    return (
        <ul className={cx("flex flex-col px-4 pt-5", className)}>
            {items.map((item, index) => {
                if (item.divider) {
                    return (
                        <li key={index} className="w-full px-0.5 py-2">
                            <hr className="h-px w-full border-none bg-border-secondary" />
                        </li>
                    );
                }

                if (item.items?.length) {
                    const isActiveGroup = item.href === activeUrl || item.items.some((subItem) => subItem.href === activeUrl);
                    const isOpen = isActiveGroup || (expandedItems[item.label] ?? false);

                    return (
                        <li key={item.label} className="py-0.25">
                            <NavItemBase
                                badge={item.badge}
                                icon={item.icon}
                                open={isOpen}
                                type="collapsible"
                                onClick={() => {
                                    setExpandedItems((prev) => ({ ...prev, [item.label]: !isOpen }));
                                }}
                            >
                                {item.label}
                            </NavItemBase>

                            {isOpen && (
                                <ul className="pb-1">
                                    {item.items.map((childItem) => (
                                        <li key={childItem.label} className="py-0.25">
                                            <NavItemBase
                                                href={childItem.href}
                                                badge={childItem.badge}
                                                type="collapsible-child"
                                                current={activeUrl === childItem.href}
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
