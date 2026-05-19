import type { ReactNode } from "react";

function G({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>;
}
export const IcUpload  = () => <G><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></G>;
export const IcX       = () => <G><path d="M18 6 6 18M6 6l12 12"/></G>;
export const IcPin     = () => <G><path d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></G>;
export const IcTag     = () => <G><path d="M20.59 13.41 13.4 20.6a2 2 0 0 1-2.82 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><circle cx="7" cy="7" r="1.4"/></G>;
export const IcSmile   = () => <G><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></G>;
export const IcCheck   = () => <G><polyline points="20 6 9 17 4 12"/></G>;
export const IcLoader  = () => <G><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></G>;
export const IcArrowL  = () => <G><polyline points="15 18 9 12 15 6"/></G>;
export const IcArrowR  = () => <G><polyline points="9 18 15 12 9 6"/></G>;
export const IcHeart   = () => <G><path d="m12 20-1.25-1.14C5.4 13.98 2 10.88 2 7.08A4.48 4.48 0 0 1 6.58 2.5c1.73 0 3.39.8 4.42 2.05A5.93 5.93 0 0 1 15.42 2.5 4.48 4.48 0 0 1 20 7.08c0 3.8-3.4 6.9-8.75 11.79Z"/></G>;
export const IcMsg     = () => <G><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/></G>;
export const IcSave    = () => <G><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></G>;

export type FormatKey = "square" | "portrait" | "landscape";
export type TagUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export const FORMATS: { key: FormatKey; label: string; ratio: string; w: number; h: number }[] = [
  { key: "square",    label: "1:1",   ratio: "1/1",  w: 1,  h: 1 },
  { key: "portrait",  label: "4:5",   ratio: "4/5",  w: 4,  h: 5 },
  { key: "landscape", label: "16:9",  ratio: "16/9", w: 16, h: 9 },
];

export const QUICK_EMOJIS = ["😊","🔥","❤️","✨","🙌","😂","💯","🎉","🌙","💪"];

export const ALBUM_NONE = "__none__";
export const ALBUM_NEW = "__new__";

export function Toggle({
  label,
  desc,
  on,
  onToggle,
  disabled = false,
}: {
  label: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`st-toggle${on ? " st-toggle--on" : ""}${disabled ? " st-toggle--disabled" : ""}`}
      onClick={() => {
        if (!disabled) onToggle();
      }}
    >
      <div className="st-toggle-text">
        <span className="st-toggle-label">{label}</span>
        <span className="st-toggle-desc">{desc}</span>
      </div>
      <div className="st-pill"><div className="st-pill-dot" /></div>
    </button>
  );
}
