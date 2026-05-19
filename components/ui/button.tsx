"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

export type UiButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Анхдагч: `primary-button` (globals.css). */
  variant?: "primary" | "ghost" | "unstyled";
};

export const UiButton = forwardRef<HTMLButtonElement, UiButtonProps>(function UiButton(
  { className = "", variant = "primary", type = "button", ...props },
  ref,
) {
  const base =
    variant === "primary"
      ? "primary-button"
      : variant === "ghost"
        ? "ghost-link"
        : "";
  return <button ref={ref} type={type} className={[base, className].filter(Boolean).join(" ")} {...props} />;
});
