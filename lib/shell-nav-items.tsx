"use client";

import type { ReactNode } from "react";

import {
  NavIconAINav,
  NavIconBell,
  NavIconCreate,
  NavIconDashboard,
  NavIconDrafts,
  NavIconHome,
  NavIconMessages,
  NavIconProfile,
  NavIconRanking,
  NavIconSaved,
  NavIconSearch,
  NavIconSettings,
} from "@/components/feed/feed-icons";

/** Chrome rail (feed + app-shell): preview dropdown / drawers use `special`. */
export type ShellNavSpecialChrome =
  | "settings"
  | "notifs"
  | "create"
  | "search"
  | undefined;

export type ChromeShellNavItem = {
  key: string;
  label: string;
  href: string | undefined;
  ai: boolean;
  special: ShellNavSpecialChrome;
  Icon: () => ReactNode;
};

/** Profile / notifications / other full-page rails: Notifications is a plain link to `/notifications`. */
export type FullpageShellNavSpecial = "create" | "search" | undefined;

export type FullpageShellNavItem = {
  key: string;
  label: string;
  href: string | undefined;
  ai: boolean;
  special: FullpageShellNavSpecial;
  Icon: () => ReactNode;
};

export function shellNavPathActive(pathname: string, href?: string) {
  if (!href) return false;
  const path = href.split("?")[0] ?? "";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export const CHROME_SHELL_NAV_ITEMS: ReadonlyArray<ChromeShellNavItem> = [
  { key: "home", label: "Home", href: "/home", ai: false, special: undefined, Icon: NavIconHome },
  { key: "msgs", label: "Messages", href: "/messages", ai: false, special: undefined, Icon: NavIconMessages },
  { key: "notifs", label: "Notifications", href: undefined, ai: false, special: "notifs", Icon: NavIconBell },
  { key: "create", label: "Create", href: undefined, ai: false, special: "create", Icon: NavIconCreate },
  { key: "profile", label: "Profile", href: "/profile", ai: false, special: undefined, Icon: NavIconProfile },
  { key: "search", label: "Search", href: undefined, ai: false, special: "search", Icon: NavIconSearch },
  { key: "ranking", label: "Ranking", href: "/ranking", ai: false, special: undefined, Icon: NavIconRanking },
  { key: "dashboard", label: "Dashboard", href: "/dashboard", ai: false, special: undefined, Icon: NavIconDashboard },
  { key: "settings", label: "Settings", href: "/settings", ai: false, special: undefined, Icon: NavIconSettings },
  { key: "saved", label: "Saved", href: "/profile?tab=saved", ai: false, special: undefined, Icon: NavIconSaved },
  { key: "drafts", label: "Drafts", href: "/drafts", ai: false, special: undefined, Icon: NavIconDrafts },
  { key: "ai", label: "AI", href: "/ai", ai: true, special: undefined, Icon: NavIconAINav },
];

export const FULLPAGE_SHELL_NAV_ITEMS: ReadonlyArray<FullpageShellNavItem> = [
  { key: "home", label: "Home", href: "/home", ai: false, special: undefined, Icon: NavIconHome },
  { key: "msgs", label: "Messages", href: "/messages", ai: false, special: undefined, Icon: NavIconMessages },
  { key: "notifs", label: "Notifications", href: "/notifications", ai: false, special: undefined, Icon: NavIconBell },
  { key: "create", label: "Create", href: undefined, ai: false, special: "create", Icon: NavIconCreate },
  { key: "profile", label: "Profile", href: "/profile", ai: false, special: undefined, Icon: NavIconProfile },
  { key: "search", label: "Search", href: undefined, ai: false, special: "search", Icon: NavIconSearch },
  { key: "ranking", label: "Ranking", href: "/ranking", ai: false, special: undefined, Icon: NavIconRanking },
  { key: "dashboard", label: "Dashboard", href: "/dashboard", ai: false, special: undefined, Icon: NavIconDashboard },
  { key: "settings", label: "Settings", href: "/settings", ai: false, special: undefined, Icon: NavIconSettings },
  { key: "saved", label: "Saved", href: "/profile?tab=saved", ai: false, special: undefined, Icon: NavIconSaved },
  { key: "drafts", label: "Drafts", href: "/drafts", ai: false, special: undefined, Icon: NavIconDrafts },
  { key: "ai", label: "AI", href: "/ai", ai: true, special: undefined, Icon: NavIconAINav },
];

export const APP_SHELL_LEFT_KEYS = ["home", "msgs", "notifs", "create", "profile", "search"] as const;
export const APP_SHELL_RIGHT_KEYS = ["dashboard", "settings", "saved", "drafts", "ai"] as const;
