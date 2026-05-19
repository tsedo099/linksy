"use client";

import { type RefObject, useEffect } from "react";

/**
 * Roving tabindex: one item in `rootRef` has tabIndex 0, others -1.
 * Arrow keys move focus within the set (WCAG toolbar / tablist pattern).
 */
export function useRovingTabIndex(options: {
  active: boolean;
  rootRef: RefObject<HTMLElement | null>;
  itemSelector: string;
  orientation: "horizontal" | "vertical";
}) {
  const { active, rootRef, itemSelector, orientation } = options;

  useEffect(() => {
    if (!active || !rootRef.current) return;
    const root = rootRef.current;

    function items(): HTMLElement[] {
      return Array.from(root.querySelectorAll<HTMLElement>(itemSelector)).filter((el) => {
        if (el.hasAttribute("disabled") || (el as HTMLButtonElement).disabled) return false;
        if (el.closest("[inert]")) return false;
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
      });
    }

    function applyRoving(focused: HTMLElement) {
      const list = items();
      list.forEach((el) => {
        el.tabIndex = el === focused ? 0 : -1;
      });
    }

    function focusAt(delta: number) {
      const list = items();
      if (!list.length) return;
      const activeEl = document.activeElement;
      let idx = list.indexOf(activeEl as HTMLElement);
      if (idx < 0) idx = 0;
      const next = (idx + delta + list.length) % list.length;
      const target = list[next];
      if (!target) return;
      applyRoving(target);
      target.focus();
    }

    function init() {
      const list = items();
      list.forEach((el, i) => {
        el.tabIndex = i === 0 ? 0 : -1;
      });
    }
    init();

    function onFocusIn(e: FocusEvent) {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (!root.contains(t)) return;
      if (!t.matches(itemSelector)) return;
      applyRoving(t);
    }

    function onKeyDown(e: KeyboardEvent) {
      const list = items();
      if (!list.length) return;
      if (!root.contains(document.activeElement)) return;

      const isHoriz = orientation === "horizontal";
      const prevKey = isHoriz ? "ArrowLeft" : "ArrowUp";
      const nextKey = isHoriz ? "ArrowRight" : "ArrowDown";

      if (e.key === prevKey) {
        e.preventDefault();
        focusAt(-1);
      } else if (e.key === nextKey) {
        e.preventDefault();
        focusAt(1);
      } else if (e.key === "Home") {
        const head = list[0];
        if (!head) return;
        e.preventDefault();
        applyRoving(head);
        head.focus();
      } else if (e.key === "End") {
        const last = list[list.length - 1];
        if (!last) return;
        e.preventDefault();
        applyRoving(last);
        last.focus();
      }
    }

    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [active, itemSelector, orientation, rootRef]);
}
