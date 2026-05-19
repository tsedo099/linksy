import {
  Archive,
  Bookmark,
  Heart,
  LayoutGrid,
  MessageSquare,
  Play,
  SquarePen,
  Tag,
} from "lucide-react";

const STROKE = 1.9;
const SMALL_STROKE = 1.8;

export const IcGrid    = () => <LayoutGrid    size={17} strokeWidth={STROKE} aria-hidden />;
export const IcSaved   = () => <Bookmark      size={17} strokeWidth={STROKE} aria-hidden />;
export const IcTag     = () => <Tag           size={17} strokeWidth={STROKE} aria-hidden />;
export const IcHeart   = ({ filled }: { filled: boolean }) => (
  <Heart size={17} strokeWidth={2} aria-hidden fill={filled ? "currentColor" : "none"} />
);
export const IcComment = () => <MessageSquare size={17} strokeWidth={2} aria-hidden />;
export const IcPlay    = () => <Play          size={13} fill="currentColor" strokeWidth={0} aria-hidden />;
export const IcEdit    = () => <SquarePen     size={14} strokeWidth={STROKE} aria-hidden />;
export const IcArchive = () => <Archive       size={14} strokeWidth={STROKE} aria-hidden />;

/**
 * Custom map-pin shape repurposed as the "pinned to profile" indicator. lucide's
 * `Pin` is a thumbtack (semantically correct) but visually a different glyph;
 * the existing UX uses the map-pin so we keep it inline pending design review.
 */
export const IcPin     = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={SMALL_STROKE}
    strokeLinecap="round"
    strokeLinejoin="round"
    width="12"
    height="12"
  >
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);
