"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLanguagePreferences } from "@/components/language-provider";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useRovingTabIndex } from "@/lib/use-roving-tabindex";
import { IcPlus, IcPost, IcStory } from "./modal-icons";

const CD_DROP_STRINGS = {
  en: { create: "Create", post: "Post", story: "Story" },
  mn: { create: "Үүсгэх", post: "Пост", story: "Story" },
};

export function CreateDropdown({
  anchorEl,
  onClose,
  onPost,
  onStory,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onPost: () => void;
  onStory: () => void;
}) {
  const { language } = useLanguagePreferences();
  const cd = language === "mn" ? CD_DROP_STRINGS.mn : CD_DROP_STRINGS.en;
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  useFocusTrap(Boolean(anchorEl), menuRef);
  useRovingTabIndex({
    active: Boolean(anchorEl),
    rootRef: menuRef,
    itemSelector: ".cdrop-item",
    orientation: "vertical",
  });

  useEffect(() => {
    if (!anchorEl) return;
    const navEl = anchorEl.closest(".feed-sidenav") as HTMLElement | null;

    const computePos = () => {
      const rect = anchorEl.getBoundingClientRect();
      const navRect = navEl?.getBoundingClientRect() ?? null;
      const isRight = rect.left > window.innerWidth / 2;
      const top = Math.max(8, Math.min(rect.top, window.innerHeight - 200));
      setStyle(isRight
        ? {
            position: "fixed",
            top,
            right: window.innerWidth - (navRect?.left ?? rect.left) + 10,
            visibility: "visible",
          }
        : {
            position: "fixed",
            top,
            left: (navRect?.right ?? rect.right) + 10,
            visibility: "visible",
          });
    };

    computePos();

    // Navbar expands on hover; track its rect so the dropdown sticks to
    // the moving right (or left) edge.
    const observer = navEl ? new ResizeObserver(computePos) : null;
    if (navEl && observer) observer.observe(navEl);
    window.addEventListener("resize", computePos);

    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", computePos);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [anchorEl, onClose]);

  return (
    <div ref={ref} className="cdrop" style={style}>
      <div ref={menuRef} className="cdrop-menu" role="menu" aria-label={cd.create}>
        <div className="cdrop-header" aria-hidden="true">
          <IcPlus />
          <span>{cd.create}</span>
        </div>
        <button type="button" className="cdrop-item" role="menuitem" onClick={() => { onPost(); onClose(); }}>
          <span>{cd.post}</span>
          <span className="cdrop-item-icon"><IcPost /></span>
        </button>
        <button type="button" className="cdrop-item" role="menuitem" onClick={() => { onStory(); onClose(); }}>
          <span>{cd.story}</span>
          <span className="cdrop-item-icon"><IcStory /></span>
        </button>
      </div>
    </div>
  );
}
