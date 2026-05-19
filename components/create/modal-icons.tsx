import {
  ChevronLeft,
  Image as ImageIcon,
  Music,
  Pencil,
  Plus,
  Smile,
  Type,
  X,
} from "lucide-react";

const STROKE = 1.8;

export const IcPost  = () => <ImageIcon size={28} strokeWidth={1.7} aria-hidden />;
export const IcClose = () => <X         size={18} strokeWidth={2.2} aria-hidden />;
export const IcBack  = () => <ChevronLeft size={18} strokeWidth={2.2} aria-hidden />;
export const IcText  = () => <Type      size={18} strokeWidth={STROKE} aria-hidden />;
export const IcSmile = () => <Smile     size={18} strokeWidth={STROKE} aria-hidden />;
export const IcDraw  = () => <Pencil    size={18} strokeWidth={STROKE} aria-hidden />;
export const IcMusic = () => <Music     size={16} strokeWidth={STROKE} aria-hidden />;
export const IcImage = () => <ImageIcon size={18} strokeWidth={1.9} aria-hidden />;
export const IcPlus  = () => <Plus      size={16} strokeWidth={2.2} aria-hidden />;

/**
 * Custom "story" silhouette (rounded vertical phone frame with avatar circle and
 * caption lines). lucide does not ship a comparable shape — `Smartphone` is too
 * generic and conveys "device" not "story". Keep inline.
 */
export function IcStory() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
      <rect x="6" y="2" width="12" height="20" rx="3"/>
      <circle cx="12" cy="8" r="2.5"/>
      <path d="M9 14h6M9 17h4"/>
    </svg>
  );
}
