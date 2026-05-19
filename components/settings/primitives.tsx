"use client";

import { displayMediaSrc } from "@/lib/media";
import type { ReactNode } from "react";

export function Ic({ p, size = 18 }: { p: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={p} />
    </svg>
  );
}

export const IcUser = () => <Ic p="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />;
export const IcBell = () => <Ic p="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />;
export const IcLock = () => <Ic p="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2ZM7 11V7a5 5 0 0 1 10 0v4" />;
export const IcBan = () => <Ic p="M18.364 18.364A9 9 0 1 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />;
export const IcCamera = () => <Ic p="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />;
export const IcMsg = () => <Ic p="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />;
export const IcTag = () => <Ic p="M20.59 13.41 13.4 20.6a2 2 0 0 1-2.82 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82ZM7 7h.01" />;
export const IcMute = () => <Ic p="M11 5 6 9H2v6h4l5 4V5ZM23 9l-6 6M17 9l6 6" />;
export const IcGlobe = () => <Ic p="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2Z" />;
export const IcHelp = () => <Ic p="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />;
export const IcPalette = () => <Ic p="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />;
export const IcLogout = () => <Ic p="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />;
export const IcChevron = () => <Ic p="m9 18 6-6-6-6" size={15} />;
export const IcBack = () => <Ic p="m15 18-6-6 6-6" size={17} />;
export const IcCheck = () => <Ic p="M20 6 9 17l-5-5" size={14} />;
export const IcSearch = () => <Ic p="M21 21l-4.35-4.35M17 11A6 6 0 1 0 5 11a6 6 0 0 0 12 0z" size={16} />;
export const IcShield = () => <Ic p="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3Z" />;
export const IcTrash = () => <Ic p="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />;
export const IcImage = () => <Ic p="M5 5h14v14H5zM8 13l2.5-3 3 4 2-2.5 2.5 3.5" />;
export const IcMail = () => <Ic p="M4 6h16v12H4zM4 7l8 6 8-6" />;
export const IcInfo = () => <Ic p="M12 8h.01M11 12h2v5h-2zM12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" />;
export const IcZap  = () => <Ic p="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />;
export const IcCard = () => <Ic p="M4 9h16M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />;

export function Toggle({ disabled, on, onChange }: { disabled?: boolean; on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      className={`sg-tog${on ? " sg-tog--on" : ""}`}
      onClick={onChange}
      aria-pressed={on}
      disabled={disabled}
    >
      <span className="sg-tog-dot" />
    </button>
  );
}

export function Row({
  icon,
  label,
  desc,
  right,
  onClick,
  danger = false,
}: {
  icon?: () => ReactNode;
  label: string;
  desc?: string;
  right?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      className={`sg-row${onClick ? " sg-row--btn" : ""}${danger ? " sg-row--danger" : ""}`}
      onClick={onClick}
    >
      {icon ? <span className={`sg-row-ic${danger ? " sg-row-ic--danger" : ""}`}>{icon()}</span> : null}
      <div className="sg-row-body">
        <span className="sg-row-label">{label}</span>
        {desc ? <span className="sg-row-desc">{desc}</span> : null}
      </div>
      {right ? <span className="sg-row-right">{right}</span> : null}
      {onClick && !right ? <span className="sg-row-chev"><IcChevron /></span> : null}
    </Tag>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="sg-card">{children}</div>;
}

export function CardLabel({ label }: { label: string }) {
  return <p className="sg-card-label">{label}</p>;
}

export function Page({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sg-page">
      <div className="sg-page-head">
        {onBack ? (
          <button type="button" className="sg-back-btn" onClick={onBack} aria-label="Back">
            <IcBack />
          </button>
        ) : null}
        <h2 className="sg-page-title">{title}</h2>
      </div>
      <div className="sg-page-body">{children}</div>
    </div>
  );
}

export function AvatarPreview({
  avatarUrl,
  displayName,
  className,
}: {
  avatarUrl: string | null;
  displayName: string;
  className: string;
}) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={displayMediaSrc(avatarUrl) ?? avatarUrl} alt={`${displayName} avatar`} className={`${className} ${className}--image`} />;
  }

  return <div className={className}>{displayName.slice(0, 2).toUpperCase() || "ME"}</div>;
}

export function EmptyStateCard({
  icon,
  title,
  copy,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <Card>
      <div className="sg-empty">
        <span className="sg-empty-icon">{icon}</span>
        <p className="sg-empty-title">{title}</p>
        <p className="sg-empty-copy">{copy}</p>
      </div>
    </Card>
  );
}
