"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { IcClose, IcPost, IcStory } from "@/components/create/modal-icons";
import { StoryEditor } from "@/components/create/modal-story-editor";
import type { Step } from "@/components/create/modal-types";

export { CreateDropdown } from "@/components/create/modal-dropdown";

export function CreateModal({ onClose, initialStep = "type" }: { onClose: () => void; initialStep?: Step }) {
  const router  = useRouter();
  const [step, setStep] = useState<Step>(initialStep);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, dialogRef);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (step === "story") {
    return (
      <div className="cm-overlay cm-overlay--center" onClick={onClose} role="presentation">
        <div
          ref={dialogRef}
          className="cm-dialog cm-dialog--story"
          role="dialog"
          aria-modal="true"
          aria-label="New story"
          onClick={e => e.stopPropagation()}
        >
          <StoryEditor
            onClose={onClose}
            onBack={initialStep === "story" ? onClose : () => setStep("type")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="cm-overlay cm-overlay--center" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="cm-dialog cm-dialog--type"
        role="dialog"
        aria-modal="true"
        aria-label="Create new"
        onClick={e => e.stopPropagation()}
      >
        <div className="cm-header cm-header--type">
          <span className="cm-title">Create new</span>
          <button type="button" className="cm-close-btn" onClick={onClose} aria-label="Close"><IcClose /></button>
        </div>
        <div className="cm-type-grid">
          <button type="button" className="cm-type-tile" onClick={() => { router.push("/create"); onClose(); }}>
            <div className="cm-tile-icon" style={{ background: "linear-gradient(135deg,#6366F1,#A855F7)" }}>
              <IcPost />
            </div>
            <span className="cm-tile-label">Post</span>
            <span className="cm-tile-desc">Photo, video or text</span>
          </button>
          <button type="button" className="cm-type-tile" onClick={() => setStep("story")}>
            <div className="cm-tile-icon" style={{ background: "linear-gradient(135deg,#EC4899,#F97316)" }}>
              <IcStory />
            </div>
            <span className="cm-tile-label">Story</span>
            <span className="cm-tile-desc">Disappears in 24h</span>
          </button>
        </div>
      </div>
    </div>
  );
}
