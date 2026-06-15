import type { FC, HTMLAttributes, MouseEventHandler, ReactNode } from "react";
import { ChevronDown, Share04 } from "@/components/icons/antIconCompat";
import { Link as AriaLink } from "react-aria-components";
import { Badge } from "@/components/base/badges/badges";
import { cx, sortCx } from "@/lib/utils/cx";

const styles = sortCx({
    root: "group/item relative flex min-h-9 w-full cursor-pointer items-center rounded-r-full rounded-l-xl bg-transparent outline-focus-ring transition duration-100 ease-linear select-none hover:bg-slate-200/70 hover:text-[#1f2654] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2",
    rootSelected:
        "bg-[#d3e3fd] text-[#1f2654] shadow-none ring-0 outline-0 outline-none hover:bg-[#d3e3fd] focus:outline-none focus-visible:outline-0 focus-visible:outline-none focus-visible:ring-0",
});

interface NavItemBaseProps {
    /** Whether the nav item shows only an icon. */
    iconOnly?: boolean;
    /** Whether the collapsible nav item is open. */
    open?: boolean;
    /** URL to navigate to when the nav item is clicked. */
    href?: string;
    /** Type of the nav item. */
    type: "link" | "collapsible" | "collapsible-child";
    /** Icon component to display. */
    icon?: FC<HTMLAttributes<HTMLOrSVGElement>>;
    /** Badge to display. */
    badge?: ReactNode;
    /** Whether the nav item is currently active. */
    current?: boolean;
    /** Whether to truncate the label text. */
    truncate?: boolean;
    /** Handler for click events. */
    onClick?: MouseEventHandler;
    /** Content to display. */
    children?: ReactNode;
    /** Whether the desktop sidebar is pinned open. */
    sidebarExpanded?: boolean;
}

export const NavItemBase = ({ current, type, badge, href, icon: Icon, children, truncate = true, onClick, open, sidebarExpanded = false }: NavItemBaseProps) => {
    const iconElement = Icon && (
        <Icon
            aria-hidden="true"
            className={cx(
                "mr-2 size-5 shrink-0 text-slate-600 transition-inherit-all group-hover/item:text-[#1f2654]",
                !sidebarExpanded && "lg:mr-0 lg:group-hover/sidebar:mr-2",
                current && "text-[#1f2654]",
            )}
        />
    );

    const badgeElement =
        badge && (typeof badge === "string" || typeof badge === "number") ? (
            <Badge className="ml-3" color="gray" type="pill-color" size="sm">
                {badge}
            </Badge>
        ) : (
            badge
        );

    const labelElement = (
        <span
            className={cx(
                "flex-1 text-sm font-semibold text-slate-700 transition-inherit-all group-hover/item:text-[#1f2654]",
                !sidebarExpanded && "lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:group-hover/sidebar:max-w-48 lg:group-hover/sidebar:opacity-100",
                truncate && "truncate",
                current && "text-[#1f2654]",
            )}
        >
            {children}
        </span>
    );

    const isExternal = href && href.startsWith("http");
    const externalIcon = isExternal && <Share04 className="size-4 stroke-[2.5px] text-fg-quaternary" />;

    if (type === "collapsible") {
        return (
            <button
                type="button"
                className={cx("p-2 text-left", styles.root, current && styles.rootSelected)}
                onClick={onClick}
                aria-expanded={open}
            >
                {iconElement}

                {labelElement}

                {badgeElement}

                <ChevronDown
                    aria-hidden="true"
                    className={cx(
                        "ml-3 size-4 shrink-0 stroke-[2.5px] text-slate-500 transition-all",
                        !sidebarExpanded && "lg:ml-0 lg:w-0 lg:opacity-0 lg:group-hover/sidebar:ml-3 lg:group-hover/sidebar:w-4 lg:group-hover/sidebar:opacity-100",
                        open && "rotate-180",
                    )}
                />
            </button>
        );
    }

    if (type === "collapsible-child") {
        return (
            <AriaLink
                href={href!}
                target={isExternal ? "_blank" : "_self"}
                rel="noopener noreferrer"
                className={cx(
                    "py-2 pr-3 pl-9",
                    styles.root,
                    current && styles.rootSelected,
                    href?.startsWith('#regie') && "opacity-40 pointer-events-none cursor-not-allowed"
                )}
                onClick={onClick}
                aria-current={current ? "page" : undefined}
            >
                {labelElement}
                {externalIcon}
                {badgeElement}
            </AriaLink>
        );
    }

    return (
        <AriaLink
            href={href!}
            target={isExternal ? "_blank" : "_self"}
            rel="noopener noreferrer"
            className={cx("group/item p-2", styles.root, current && styles.rootSelected, href?.startsWith('#regie') && "opacity-40 pointer-events-none cursor-not-allowed")}
            onClick={onClick}
            aria-current={current ? "page" : undefined}
        >
            {iconElement}
            {labelElement}
            {externalIcon}
            {badgeElement}
        </AriaLink>
    );
};
