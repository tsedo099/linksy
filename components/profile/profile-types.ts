export type ProfileData = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  creatorMode: boolean;
  createdAt: string;
  _count: { posts: number; followers: number; following: number };
  followedByMe?: boolean;
  hasActiveStory?: boolean;
  hasUnviewedStory?: boolean;
};

export type ConnectionMode = "followers" | "following";

export type ConnectionUser = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  followedByMe: boolean;
  isSelf: boolean;
};

export type PostItem = {
  id: string;
  mediaUrls: string[];
  caption: string | null;
  _count: { likes: number; comments: number };
  isPinned?: boolean;
  likesHidden?: boolean;
};

export type ProfileTabKey = "posts" | "discussions" | "saved" | "tagged";

export type SavedPostItem = {
  id: string;
  imageUrl: string | null;
  caption: string | null;
  _count: { likes: number; comments: number };
};

export type ProfileHighlight = {
  id: string;
  title: string;
  coverMediaUrl: string | null;
  storyCount: number;
  createdAt?: string;
};

export type HighlightSourceStory = {
  id: string;
  caption: string | null;
  mediaUrl: string;
  createdAt: string;
  audience: "PUBLIC" | "FOLLOWERS" | "CLOSE_CIRCLE";
};

export const BANNER_GRAD = "linear-gradient(135deg, #0f0c29 0%, #1e1b4b 40%, #4c1d95 100%)";

export const HIGHLIGHT_GRADS = [
  "linear-gradient(135deg,#6366F1,#8B5CF6)",
  "linear-gradient(135deg,#EC4899,#EF4444)",
  "linear-gradient(135deg,#06B6D4,#3B82F6)",
  "linear-gradient(135deg,#10B981,#14B8A6)",
];

export const CELL_GRADS = [
  "linear-gradient(135deg,#1a1040,#6d28d9)",
  "linear-gradient(135deg,#0f2027,#134e4a)",
  "linear-gradient(160deg,#0f0c29,#302b63)",
  "linear-gradient(135deg,#1c0000,#dc2626)",
  "linear-gradient(160deg,#000428,#004e92)",
  "linear-gradient(135deg,#071426,#0c3560)",
];

export const SAVED_GRADS = [
  "linear-gradient(135deg,#1f1630,#4c1d95)",
  "linear-gradient(135deg,#111827,#1d4ed8)",
  "linear-gradient(135deg,#1f2937,#0f766e)",
  "linear-gradient(135deg,#2b1627,#be185d)",
];

export type ProfileStrings = {
  posts: string;
  followers: string;
  following: string;
  follow: string;
  saving: string;
  message: string;
  opening: string;
  tabPosts: string;
  tabDiscussions: string;
  tabSaved: string;
  tabTagged: string;
  momentsLoading: string;
  momentsHint: string;
  momentsEmpty: string;
  pinTitle: string;
  unpinTitle: string;
  pinAria: string;
  unpinAria: string;
  pinnedBadge: string;
  pinnedTitle: string;
  noText: string;
  savedFallback: string;
  customize: string;
  customizeDone: string;
  closeLabel: string;
  menuLabel: string;
  pinUpdateFailed: string;
  loadHighlightsFailed: string;
  openHighlightFailed: string;
  followFailed: string;
  openChatFailed: string;
  followRequestFailed: string;
};

export const PROFILE_STRINGS: { en: ProfileStrings; mn: ProfileStrings } = {
  en: {
    posts: "Posts",
    followers: "Followers",
    following: "Following",
    follow: "Follow",
    saving: "Saving...",
    message: "Message",
    opening: "Opening...",
    tabPosts: "Posts",
    tabDiscussions: "Discussions",
    tabSaved: "Saved",
    tabTagged: "Tagged",
    momentsLoading: "Loading moments...",
    momentsHint: "Keep your best stories on your profile.",
    momentsEmpty: "No highlights yet.",
    pinTitle: "Pin",
    unpinTitle: "Unpin",
    pinAria: "Pin to profile",
    unpinAria: "Unpin from profile",
    pinnedBadge: "Pinned",
    pinnedTitle: "Pinned to profile",
    noText: "No text",
    savedFallback: "Saved post",
    customize: "Customize",
    customizeDone: "Done",
    closeLabel: "Close",
    menuLabel: "Menu",
    pinUpdateFailed: "Could not update pin.",
    loadHighlightsFailed: "Could not load highlights.",
    openHighlightFailed: "Could not open highlight.",
    followFailed: "Follow action failed. Please try again.",
    openChatFailed: "Could not open chat.",
    followRequestFailed: "Follow request failed",
  },
  mn: {
    posts: "Постууд",
    followers: "Дагагч",
    following: "Дагадаг",
    follow: "Дагах",
    saving: "Хадгалж байна...",
    message: "Зурвас",
    opening: "Нээж байна...",
    tabPosts: "Постууд",
    tabDiscussions: "Хэлэлцүүлэг",
    tabSaved: "Хадгалсан",
    tabTagged: "Tag-сан",
    momentsLoading: "Highlights ачаалж байна...",
    momentsHint: "Хамгийн сайн story-уудаа профайл дээрээ үлдээх.",
    momentsEmpty: "Highlights алга.",
    pinTitle: "Бэхлэх",
    unpinTitle: "Болих",
    pinAria: "Профайл дээр бэхлэх",
    unpinAria: "Профайлаас болих",
    pinnedBadge: "Бэхэлсэн",
    pinnedTitle: "Профайл дээр бэхэлсэн",
    noText: "Текст алга",
    savedFallback: "Хадгалсан пост",
    customize: "Тохируулах",
    customizeDone: "Болсон",
    closeLabel: "Хаах",
    menuLabel: "Меню",
    pinUpdateFailed: "Pin-г шинэчилж чадсангүй.",
    loadHighlightsFailed: "Highlights ачаалж чадсангүй.",
    openHighlightFailed: "Highlight нээж чадсангүй.",
    followFailed: "Дагах үйлдэл амжилтгүй. Дахин оролдоно уу.",
    openChatFailed: "Чат нээж чадсангүй.",
    followRequestFailed: "Дагах хүсэлт амжилтгүй",
  },
};
