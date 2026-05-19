"use client";

import type { CSSProperties, HTMLAttributes } from "react";
import styles from "./ui.module.css";

export type UiAvatarProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  gradient?: string;
  size?: "sm" | "md" | "lg";
};

const sizePx: Record<NonNullable<UiAvatarProps["size"]>, number> = { sm: 32, md: 40, lg: 56 };

/** Энгийн avatar bubble — сурталчилгаа / жагсаалтын дахин ашиглахад. */
export function UiAvatar({ label, gradient, size = "md", className = "", style, ...rest }: UiAvatarProps) {
  const px = sizePx[size];
  const initials = label.trim().slice(0, 2).toUpperCase() || "?";
  const merged: CSSProperties = {
    width: px,
    height: px,
    ...style,
    ...(gradient ? { background: gradient } : {}),
  };
  return (
    <div
      className={[styles.uiAvatarBubble, className].filter(Boolean).join(" ")}
      style={merged}
      aria-hidden
      {...rest}
    >
      <span>{initials}</span>
    </div>
  );
}
