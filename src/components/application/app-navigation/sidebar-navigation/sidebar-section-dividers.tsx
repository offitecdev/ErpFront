import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { SearchLg } from "@/components/icons/antIconCompat";
import { Input } from "@/components/base/input/input";
import { MobileNavigationHeader } from "../base-components/mobile-header";
import { NavAccountCard } from "../base-components/nav-account-card";
import { NavList } from "../base-components/nav-list";
import type { NavItemDividerType, NavItemType } from "../config";

interface SidebarNavigationSectionDividersProps {
    /** URL of the currently active item. */
    activeUrl?: string;
    /** List of items to display. */
    items: (NavItemType | NavItemDividerType)[];
    /** Optional app logo. */
    logo?: ReactNode;
    /** Optional mobile header logo. */
    mobileLogo?: ReactNode;
    /** Optional footer/account area. */
    footer?: ReactNode;
    /** Placeholder for both sidebar search inputs. */
    searchPlaceholder?: string;
    /** Called before navigation so apps can route without a full page reload. */
    onNavigate?: (href: string, event: MouseEvent) => void;
    /** Whether the desktop sidebar is pinned open. */
    pinnedOpen?: boolean;
}

export const SidebarNavigationSectionDividers = ({
    activeUrl,
    items,
    logo,
    mobileLogo,
    footer,
    searchPlaceholder = "Search",
    onNavigate,
    pinnedOpen = false,
}: SidebarNavigationSectionDividersProps) => {
    const MAIN_SIDEBAR_WIDTH = 276;
    const COLLAPSED_SIDEBAR_WIDTH = 72;
    const visibleWidth = pinnedOpen ? MAIN_SIDEBAR_WIDTH : COLLAPSED_SIDEBAR_WIDTH;

    const content = (
        <aside
            style={
                {
                    "--width": `${MAIN_SIDEBAR_WIDTH}px`,
                    "--collapsed-width": `${COLLAPSED_SIDEBAR_WIDTH}px`,
                } as CSSProperties
            }
            data-expanded={pinnedOpen ? "true" : undefined}
            className="group/sidebar flex h-full w-full max-w-full flex-col justify-between overflow-auto bg-[#f8fafd] pt-4 transition-[width] duration-200 ease-out lg:w-(--collapsed-width) lg:pt-4 lg:hover:w-(--width) data-[expanded=true]:lg:w-(--width)"
        >
            <div className="flex flex-col gap-4 px-4 transition-[padding] duration-200 ease-out lg:hidden">
                {/* Mobile search input */}
                <Input size="md" aria-label={searchPlaceholder} placeholder={searchPlaceholder} icon={SearchLg} className="md:hidden" />
            </div>

            <NavList activeUrl={activeUrl} items={items} onNavigate={onNavigate} expanded={pinnedOpen} />

            <div className="mt-auto flex flex-col gap-5 px-2 py-4 transition-[padding] duration-200 ease-out lg:gap-6 lg:px-3 lg:py-4 lg:group-hover/sidebar:px-4 lg:group-data-[expanded=true]/sidebar:px-4">
                {footer ?? <NavAccountCard />}
            </div>
        </aside>
    );

    return (
        <>
            {/* Mobile header navigation */}
            <MobileNavigationHeader logo={mobileLogo ?? logo}>{content}</MobileNavigationHeader>

            {/* Desktop sidebar navigation */}
            <div className="hidden lg:fixed lg:top-16 lg:bottom-0 lg:left-0 lg:z-40 lg:flex">{content}</div>

            {/* Placeholder to take up physical space because the real sidebar has `fixed` position. */}
            <div
                style={{
                    paddingLeft: visibleWidth,
                }}
                className="invisible hidden lg:sticky lg:top-0 lg:bottom-0 lg:left-0 lg:block"
            />
        </>
    );
};
