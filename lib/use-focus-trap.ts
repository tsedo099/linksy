"use client";

import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function listFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.closest("[inert]")) return false;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

/**
 * Keeps keyboard focus inside `rootRef` while `active` (Tab / Shift+Tab wrap).
 * Restores focus to the previously focused element on deactivation.
 */
export function useFocusTrap(active: boolean, rootRef: RefObject<HTMLElement | null>) {
  const prevFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;

    const trapRoot = root;

    prevFocus.current = document.activeElement;

    const focusables = listFocusable(trapRoot);
    const first = focusables[0];
    if (!first) return;
    const activeEl = document.activeElement;
    if (!(activeEl instanceof Node) || !trapRoot.contains(activeEl)) {
      first.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const nodes = listFocusable(trapRoot);
      const f = nodes[0];
      const l = nodes[nodes.length - 1];
      if (!f || !l) return;
      if (e.shiftKey) {
        if (document.activeElement === f) {
          e.preventDefault();
          l.focus();
        }
      } else if (document.activeElement === l) {
        e.preventDefault();
        f.focus();
      }
    }

    trapRoot.addEventListener("keydown", onKeyDown);
    return () => {
      trapRoot.removeEventListener("keydown", onKeyDown);
      const restore = prevFocus.current;
      if (restore instanceof HTMLElement && document.contains(restore)) {
        restore.focus();
      }
    };
  }, [active, rootRef]);
}
