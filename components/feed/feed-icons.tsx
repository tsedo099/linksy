"use client";

import {
  BarChart3,
  Bell,
  Bookmark,
  Bot,
  CirclePlus,
  FilePenLine,
  Heart,
  Home,
  LayoutGrid,
  Menu,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  User,
  X,
} from "lucide-react";

const navIconProps = {
  size: 24,
  strokeWidth: 1.75,
  className: "shrink-0",
  "aria-hidden": true as const,
};

export function NavIconHome() {
  return <Home {...navIconProps} />;
}

export function NavIconMessages() {
  return <MessageSquare {...navIconProps} />;
}

export function NavIconBell() {
  return <Bell {...navIconProps} />;
}

export function NavIconCreate() {
  return <CirclePlus {...navIconProps} />;
}

export function NavIconProfile() {
  return <User {...navIconProps} />;
}

export function NavIconSearch() {
  return <Search {...navIconProps} />;
}

export function NavIconDashboard() {
  return <LayoutGrid {...navIconProps} />;
}

export function NavIconSettings() {
  return <SlidersHorizontal {...navIconProps} />;
}

export function NavIconSaved() {
  return <Bookmark {...navIconProps} />;
}

export function NavIconAINav() {
  return <Sparkles {...navIconProps} />;
}

export function NavIconRanking() {
  return <BarChart3 {...navIconProps} />;
}

export function NavIconDrafts() {
  return <FilePenLine {...navIconProps} />;
}

export function NavIconMenu() {
  return <Menu {...navIconProps} />;
}

export function NavIconClose() {
  return <X {...navIconProps} />;
}

const actionProps = {
  size: 18,
  strokeWidth: 1.75,
  className: "shrink-0",
  "aria-hidden": true as const,
};

/** Post card footer (like / comment / share / save) — slightly larger than header “more” */
const postCardActionProps = {
  size: 22,
  strokeWidth: 1.85,
  className: "shrink-0",
  "aria-hidden": true as const,
};

export function IconChat() {
  return <MessageCircle {...postCardActionProps} />;
}

export function IconBookmark({ filled }: { filled: boolean }) {
  return <Bookmark {...postCardActionProps} fill={filled ? "currentColor" : "none"} />;
}

export function IconMore() {
  return <MoreHorizontal {...actionProps} />;
}

export function IconHeart({ filled }: { filled: boolean }) {
  return <Heart {...postCardActionProps} fill={filled ? "currentColor" : "none"} />;
}

export function IconShare() {
  return <Send {...postCardActionProps} />;
}

export function IconAI() {
  return <Bot size={22} className="shrink-0" strokeWidth={1.65} aria-hidden />;
}
