"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useHoverPrefetch } from "@/lib/use-hover-prefetch";

/** Shared rail button for app shell + feed (audit: single NavBtn). */
export function NavBtn({
  icon,
  label,
  active = false,
  right = false,
  ai = false,
  href,
  onClick,
  pressed = false,
  ariaLabel,
  ariaControls,
  ariaExpanded,
  badge,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  right?: boolean;
  ai?: boolean;
  href?: string;
  onClick?: () => void;
  pressed?: boolean;
  ariaLabel?: string;
  ariaControls?: string;
  ariaExpanded?: boolean;
  badge?: number;
}) {
  const className = `nav-icon-btn${active ? " nav-icon-btn--active" : ""}${ai ? " nav-icon-btn--ai" : ""}${right ? " nav-icon-btn--right" : ""}${pressed ? " nav-icon-btn--pressed" : ""}`;
  const hoverPrefetch = useHoverPrefetch(href);
  const iconCore = (
    <span className="nav-icon-core">
      {icon}
      {badge ? <span className="nav-notif-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </span>
  );

  return (
    <div className={`nav-btn-wrap${right ? " nav-btn-wrap--right" : ""}`}>
      {href ? (
        <Link
          href={href}
          aria-label={ariaLabel ?? label}
          aria-current={active ? "page" : undefined}
          className={className}
          prefetch={false}
          {...hoverPrefetch}
        >
          {iconCore}
          <span className={`nav-inline-label${right ? " nav-inline-label--right" : ""}`}>{label}</span>
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={pressed || undefined}
          aria-label={ariaLabel ?? label}
          aria-controls={ariaControls}
          aria-expanded={ariaExpanded}
          className={className}
        >
          {iconCore}
          <span className={`nav-inline-label${right ? " nav-inline-label--right" : ""}`}>{label}</span>
        </button>
      )}
    </div>
  );
}
