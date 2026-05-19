"use client";

import type { ReactNode } from "react";

export type StoryAudienceValue = "PUBLIC" | "FOLLOWERS" | "CLOSE_CIRCLE";
export type PostAudienceValue = "PUBLIC" | "FRIENDS" | "CLOSE_CIRCLE";

function G({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden>
      {children}
    </svg>
  );
}

function IcGlobe() {
  return (
    <G>
      <circle cx="12" cy="12" r="9" />
      <path d="M2.5 12h19" />
      <path d="M12 2.5C9.5 6 8 9 8 12s1.5 6 4 9.5" />
      <path d="M12 2.5C14.5 6 16 9 16 12s-1.5 6-4 9.5" />
    </G>
  );
}

function IcUsers() {
  return (
    <G>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 3.5a3 3 0 0 1 0 6" />
      <path d="M19 20a5 5 0 0 0-5-4.5" />
    </G>
  );
}

function IcLock() {
  return (
    <G>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <circle cx="12" cy="16" r="1.2" fill="currentColor" stroke="none" />
    </G>
  );
}

const STORY_AUD_OPTIONS: ReadonlyArray<{
  value: StoryAudienceValue;
  label: string;
  icon: ReactNode;
}> = [
  { value: "PUBLIC", label: "Everyone", icon: <IcGlobe /> },
  { value: "FOLLOWERS", label: "Followers", icon: <IcUsers /> },
  { value: "CLOSE_CIRCLE", label: "Close Circle", icon: <IcLock /> },
];

const POST_AUD_OPTIONS = [
  { value: "PUBLIC" as const, icon: "🌐", label: "Everyone" },
  { value: "FRIENDS" as const, icon: "👥", label: "Friends" },
  { value: "CLOSE_CIRCLE" as const, icon: "🔒", label: "Close Circle" },
];

type StoryProps = {
  variant: "story";
  layout: "column" | "row";
  value: StoryAudienceValue;
  onChange: (value: StoryAudienceValue) => void;
};

type PostProps = {
  variant: "post";
  value: PostAudienceValue;
  onChange: (value: PostAudienceValue) => void;
};

export type CreateAudiencePickerProps = StoryProps | PostProps;

export function CreateAudiencePicker(props: CreateAudiencePickerProps) {
  if (props.variant === "story") {
    const wrap = props.layout === "column" ? "se-audience-col" : "se-audience-row";
    return (
      <div className={wrap}>
        {STORY_AUD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`se-aud-btn${props.value === opt.value ? " se-aud-btn--on" : ""}`}
            onClick={() => props.onChange(opt.value)}
          >
            <span className="se-aud-icon">{opt.icon}</span>
            <span className="se-aud-label">{opt.label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="st-audience">
      <p className="st-field-label">Audience</p>
      <div className="st-audience-pills">
        {POST_AUD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`st-aud-pill${props.value === opt.value ? " st-aud-pill--on" : ""}`}
            onClick={() => props.onChange(opt.value)}
          >
            <span>{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
