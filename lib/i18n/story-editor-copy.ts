import type { AppLanguage } from "@/lib/language";
import { bundleForLocale, type CopyBundle } from "@/lib/i18n/bundles";

export type StoryEditorStrings = {
  // Media validation
  errMediaType: string;
  errEmptyFile: string;
  errFileTooLargeFmt: (limit: string) => string;
  errMaxStickersFmt: (max: number) => string;
  errMaxStrokesFmt: (max: number) => string;
  errAddMedia: string;
  errCaptionTooLongFmt: (max: number) => string;
  errCouldNotShare: string;
  errSelfCollaborator: string;
  errAlreadyCollaboratorFmt: (username: string) => string;
  errMaxCollaboratorsFmt: (max: number) => string;
  okCollaboratorInvitedFmt: (username: string) => string;
  defaultMediaAlt: string;

  // Toolbar buttons
  back: string;
  addPhotoVideo: string;
  changeMedia: string;
  addPhotoVideoFull: string;
  remove: string;
  addText: string;
  mention: string;
  mentionAria: string;
  draw: string;
  addEmoji: string;
  addEmojiFmt: (emoji: string) => string;
  musicComingSoon: string;
  storyEmojiPicker: string;

  // Mention picker
  mentionDone: string;
  closeMentionPicker: string;
  mentionUsername: string;
  mentionPlaceholder: string;
  mentionSearchHint: string;
  mentionSearching: string;
  mentionNoUsers: string;
  mentionAlreadyAdded: string;
  mentionAddedSuffix: string;

  // Sticker style bar
  selectedStickerStyle: string;
  styleLabel: string;
  toggleStickerBg: string;
  bgLabel: string;
  textColor: string;
  setTextColorFmt: (color: string) => string;

  // Draw tools
  drawTools: string;
  drawColor: string;
  setDrawColorFmt: (color: string) => string;
  undo: string;
  done: string;

  // Stickers
  storyMention: string;
  storyText: string;
  writeSomething: string;
  deleteSticker: string;
  deleteTitle: string;
  resizeText: string;
  resizeTitle: string;

  // Bottom (mobile) + sidebar
  describeMediaA11y: string;
  describeMediaPh: string;
  mediaLabel: string;
  accessibilityLabel: string;
  describeSidebar: string;
  altAria: string;
  backgroundLabel: string;
  backgroundSwatchFmt: (i: number) => string;
  audienceLabel: string;
  pollLabel: string;
  playbackLabel: string;
  playbackNormal: string;
  playbackLoop: string;
  playbackBoomerang: string;

  // Co-authors
  coAuthorsLabel: string;
  selectedCoAuthors: string;
  noCoAuthors: string;
  searchInvitePh: string;
  enterToAddHint: string;
  coAuthorResultsAria: string;
  searchingDots: string;
  noPeopleFound: string;
  alreadyAddedOrUnavailable: string;
  invite: string;
  maxCoAuthorsReached: string;
  removeUserFmt: (username: string) => string;

  // Share button
  shareStory: string;
  uploading: string;
  sharing: string;
  shared: string;
};

const EN: StoryEditorStrings = {
  errMediaType: "Only JPG, PNG, WebP, GIF, MP4, MOV, and WebM files are supported.",
  errEmptyFile: "File cannot be empty.",
  errFileTooLargeFmt: (limit) => `File size must be ${limit} or less.`,
  errMaxStickersFmt: (max) => `You can add up to ${max} story stickers.`,
  errMaxStrokesFmt: (max) => `You can add up to ${max} draw strokes.`,
  errAddMedia: "Add a caption or photo/video to your story.",
  errCaptionTooLongFmt: (max) => `Caption must be ${max} characters or less.`,
  errCouldNotShare: "Could not share story.",
  errSelfCollaborator: "You cannot add yourself as a story co-author.",
  errAlreadyCollaboratorFmt: (username) => `@${username} is already a co-author.`,
  errMaxCollaboratorsFmt: (max) => `You can add up to ${max} story co-authors.`,
  okCollaboratorInvitedFmt: (username) => `@${username} will be invited as a story co-author.`,
  defaultMediaAlt: "Story media",

  back: "Back",
  addPhotoVideo: "Add photo or video",
  changeMedia: "Change media",
  addPhotoVideoFull: "Add photo/video",
  remove: "Remove",
  addText: "Add text",
  mention: "Mention",
  mentionAria: "Mention someone",
  draw: "Draw",
  addEmoji: "Add emoji",
  addEmojiFmt: (emoji) => `Add ${emoji}`,
  musicComingSoon: "Music stickers coming soon",
  storyEmojiPicker: "Story emoji picker",

  mentionDone: "Done",
  closeMentionPicker: "Close mention picker",
  mentionUsername: "Mention user",
  mentionPlaceholder: "@username",
  mentionSearchHint: "Search people to mention",
  mentionSearching: "Searching...",
  mentionNoUsers: "No users found",
  mentionAlreadyAdded: "Already added",
  mentionAddedSuffix: " · added",

  selectedStickerStyle: "Selected sticker style",
  styleLabel: "Style",
  toggleStickerBg: "Toggle sticker background",
  bgLabel: "BG",
  textColor: "Text color",
  setTextColorFmt: (color) => `Set text color ${color}`,

  drawTools: "Draw tools",
  drawColor: "Draw color",
  setDrawColorFmt: (color) => `Set draw color ${color}`,
  undo: "Undo",
  done: "Done",

  storyMention: "Story mention",
  storyText: "Story text",
  writeSomething: "Write something...",
  deleteSticker: "Delete sticker",
  deleteTitle: "Delete",
  resizeText: "Resize text",
  resizeTitle: "Resize",

  describeMediaA11y: "Describe media for screen readers",
  describeMediaPh: "Optional. Used by screen readers.",
  mediaLabel: "Media",
  accessibilityLabel: "Accessibility",
  describeSidebar: "Describe this photo or video for screen readers",
  altAria: "Alt text for story media",
  backgroundLabel: "Background",
  backgroundSwatchFmt: (i) => `Background ${i}`,
  audienceLabel: "Audience",
  pollLabel: "Poll",
  playbackLabel: "Playback",
  playbackNormal: "Normal",
  playbackLoop: "Loop",
  playbackBoomerang: "Boomerang",

  coAuthorsLabel: "Story co-authors",
  selectedCoAuthors: "Selected story co-authors",
  noCoAuthors: "No co-authors added. Your story will only publish under your account.",
  searchInvitePh: "Search people to invite…",
  enterToAddHint: "Press Enter to add the first result.",
  coAuthorResultsAria: "Co-author search results",
  searchingDots: "Searching…",
  noPeopleFound: "No people found",
  alreadyAddedOrUnavailable: "Already added or unavailable",
  invite: "Invite",
  maxCoAuthorsReached: "Maximum co-authors reached.",
  removeUserFmt: (username) => `Remove ${username}`,

  shareStory: "Share story",
  uploading: "Uploading...",
  sharing: "Sharing...",
  shared: "Shared!",
};

const MN: StoryEditorStrings = {
  errMediaType: "Зөвхөн JPG, PNG, WebP, GIF, MP4, MOV, WebM файл дэмжинэ.",
  errEmptyFile: "Файл хоосон байж болохгүй.",
  errFileTooLargeFmt: (limit) => `Файл ${limit}-аас бага байх ёстой.`,
  errMaxStickersFmt: (max) => `Хамгийн ихдээ ${max} story sticker нэмэх боломжтой.`,
  errMaxStrokesFmt: (max) => `Хамгийн ихдээ ${max} draw зураас нэмэх боломжтой.`,
  errAddMedia: "Story-доо тайлбар эсвэл зураг/видео нэмнэ үү.",
  errCaptionTooLongFmt: (max) => `Тайлбар ${max} тэмдэгтээс хэтрэхгүй байх ёстой.`,
  errCouldNotShare: "Story илгээж чадсангүй.",
  errSelfCollaborator: "Өөрийгөө хамтрагчаар нэмж болохгүй.",
  errAlreadyCollaboratorFmt: (username) => `@${username} аль хэдийн хамтрагчаар нэмэгдсэн.`,
  errMaxCollaboratorsFmt: (max) => `Хамгийн ихдээ ${max} хамтрагч нэмэх боломжтой.`,
  okCollaboratorInvitedFmt: (username) => `@${username}-г story-ийн хамтрагчаар урих болно.`,
  defaultMediaAlt: "Story медиа",

  back: "Буцах",
  addPhotoVideo: "Зураг эсвэл видео нэмэх",
  changeMedia: "Медиаг солих",
  addPhotoVideoFull: "Зураг/видео нэмэх",
  remove: "Хасах",
  addText: "Текст нэмэх",
  mention: "Mention",
  mentionAria: "Хэн нэгнийг mention хийх",
  draw: "Зурах",
  addEmoji: "Emoji нэмэх",
  addEmojiFmt: (emoji) => `${emoji} нэмэх`,
  musicComingSoon: "Хөгжмийн sticker удахгүй ирнэ",
  storyEmojiPicker: "Story emoji сонгох",

  mentionDone: "Болсон",
  closeMentionPicker: "Mention-г хаах",
  mentionUsername: "Хэрэглэгчийг дурдах",
  mentionPlaceholder: "@username",
  mentionSearchHint: "Mention хийх хүнийг хайх",
  mentionSearching: "Хайж байна...",
  mentionNoUsers: "Хэрэглэгч олдсонгүй",
  mentionAlreadyAdded: "Аль хэдийн нэмэгдсэн",
  mentionAddedSuffix: " · нэмэгдсэн",

  selectedStickerStyle: "Сонгосон sticker-ийн style",
  styleLabel: "Style",
  toggleStickerBg: "Sticker-ийн backgroundыг асаах/унтраах",
  bgLabel: "BG",
  textColor: "Текстийн өнгө",
  setTextColorFmt: (color) => `Текстийн өнгийг ${color} болгох`,

  drawTools: "Зурах хэрэгсэл",
  drawColor: "Зурах өнгө",
  setDrawColorFmt: (color) => `Зурах өнгийг ${color} болгох`,
  undo: "Буцаах",
  done: "Болсон",

  storyMention: "Story-н mention",
  storyText: "Story-н текст",
  writeSomething: "Бичих...",
  deleteSticker: "Sticker-г устгах",
  deleteTitle: "Устгах",
  resizeText: "Текстийг хэмжээ солих",
  resizeTitle: "Хэмжээ",

  describeMediaA11y: "Screen reader-д зориулсан тайлбар",
  describeMediaPh: "Заавал биш. Screen reader-д хэрэглэгдэнэ.",
  mediaLabel: "Медиа",
  accessibilityLabel: "Accessibility",
  describeSidebar: "Энэ зураг/видеоны screen reader тайлбар",
  altAria: "Story медианы alt текст",
  backgroundLabel: "Дэвсгэр",
  backgroundSwatchFmt: (i) => `Дэвсгэр ${i}`,
  audienceLabel: "Үзэгчид",
  pollLabel: "Санал асуулга",
  playbackLabel: "Тоглуулалт",
  playbackNormal: "Энгийн",
  playbackLoop: "Давталт",
  playbackBoomerang: "Boomerang",

  coAuthorsLabel: "Story-ийн хамтрагчид",
  selectedCoAuthors: "Сонгосон хамтрагчид",
  noCoAuthors: "Хамтрагч нэмэгдээгүй. Story зөвхөн таны нэрээр нийтлэгдэнэ.",
  searchInvitePh: "Урих хүнийг хайх…",
  enterToAddHint: "Enter дарж эхний үр дүнг нэмнэ.",
  coAuthorResultsAria: "Хамтрагч хайх үр дүн",
  searchingDots: "Хайж байна…",
  noPeopleFound: "Хэн ч олдсонгүй",
  alreadyAddedOrUnavailable: "Аль хэдийн нэмэгдсэн эсвэл боломжгүй",
  invite: "Урих",
  maxCoAuthorsReached: "Дээд хязгаарт хүрсэн.",
  removeUserFmt: (username) => `${username}-г хасах`,

  shareStory: "Story нийтлэх",
  uploading: "Илгээж байна...",
  sharing: "Нийтэлж байна...",
  shared: "Нийтэллээ!",
};

const BUNDLES: Record<CopyBundle, StoryEditorStrings> = {
  en: EN,
  mn: MN,
};

export function storyEditorStrings(lang: AppLanguage): StoryEditorStrings {
  return BUNDLES[bundleForLocale(lang)];
}
