"use client";

import React from "react";
import Image from "next/image";
import { AVATAR_PLACEHOLDER_GRADIENT } from "@/lib/avatar-placeholder";
import { displayMediaSrc } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import { initialsOf } from "./types";
import { IcUsers } from "./icons";

export function Av({ name, avatarUrl, size = 40, isGroup = false }: {
  name: string;
  /** Historical: palette colour was derived from this id. Kept for backwards compat at call sites, accept and ignore. */
  uid?: string;
  avatarUrl?: string | null;
  size?: number;
  isGroup?: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    position: "relative", flexShrink: 0,
    width: size, height: size,
    borderRadius: isGroup ? "30%" : "50%",
    background: AVATAR_PLACEHOLDER_GRADIENT,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 800, fontSize: size * .36, color: "#fff", letterSpacing: 0,
  };

  if (!isGroup && avatarUrl) {
    const src = displayMediaSrc(avatarUrl) ?? avatarUrl;
    return (
      <Image
        src={src}
        alt={`${name} avatar`}
        width={Math.max(96, size * 2)}
        height={Math.max(96, size * 2)}
        sizes={`${size}px`}
        style={{ ...baseStyle, objectFit: "cover", background: "var(--app-card-soft)" }}
        unoptimized={shouldUnoptimizeNextImageSrc(src)}
      />
    );
  }

  return (
    <div style={baseStyle}>
      {isGroup
        ? <IcUsers />
        : initialsOf(name)
      }
    </div>
  );
}
