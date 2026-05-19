import type { NotificationType } from "@/lib/generated/prisma/client";
import type { AppLanguage } from "@/lib/language";
import type { CopyBundle } from "@/lib/i18n/bundles";
import { bundleForLocale } from "@/lib/i18n/bundles";

const LABELS_EN: Partial<Record<NotificationType | string, string>> = {
  like: "liked your post",
  comment: "commented on your post",
  follow: "started following you",
  mention: "mentioned you",
  post_mention: "mentioned you in a post",
  story_mention: "mentioned you in a story",
  story: "viewed your story",
  message: "sent you a message",
  message_request: "sent you a message request",
  story_expiring: "your story expires soon",
  friend_joined: "joined (from your contacts)",
  story_reaction: "reacted to your story",
  story_collab: "added you as a collaborator on a story",
};

const LABELS_MN: Partial<Record<NotificationType | string, string>> = {
  like: "таны постод лайк дарав",
  comment: "таны постод сэтгэгдэл бичив",
  follow: "таныг дагаж эхэллээ",
  mention: "таныг дурдав",
  post_mention: "таныг постонд дурдав",
  story_mention: "таныг түүхэнд дурдав",
  story: "таны түүхийг үзэв",
  message: "танд мессеж илгээлээ",
  message_request: "мессежийн хүсэлт илгээлээ",
  story_expiring: "таны түүх удахгүй дуусна",
  friend_joined: "элссэн (танай харилцагчаас)",
  story_reaction: "таны түүхэд үнэлгээ өглөө",
  story_collab: "таныг түүхийн хамтрагч болгосон",
};

export function digestSnippetLabel(type: NotificationType | string, lang: AppLanguage): string {
  const b = bundleForLocale(lang);
  const map = b === "mn" ? LABELS_MN : LABELS_EN;
  return map[type] ?? (b === "mn" ? "тантай харилцав" : "interacted with you");
}

export type DigestEmailStrings = {
  subjectHasContentWeekly: string;
  subjectHasContentDaily: string;
  subjectEmptyWeekly: string;
  subjectEmptyDaily: string;
  weeklyHeaderWord: string;
  dailyHeaderWord: string;
  periodWeekly: string;
  periodDaily: string;
  introHasContentWeekly: string;
  introHasContentDaily: string;
  introIdle: string;
  totalsFallback: string;
  recentActivity: string;
  openBtn: string;
  footerDontWant: string;
  footerPrefs: string;
  interactionOne: string;
  interactionMany: string;
  textNoBreakdown: string;
  prefsHint: string;
  htmlDigestTitleWeekly: string;
  htmlDigestTitleDaily: string;
  newUpdatesWeekly: string;
  newUpdatesDaily: string;
  newActivityPrefix: string;
  adjustDigestPrefs: string;
};

function englishStrings(): DigestEmailStrings {
  return {
    subjectHasContentWeekly: "Your weekly Linksy digest — ",
    subjectHasContentDaily: "Your daily Linksy digest — ",
    subjectEmptyWeekly: "Your weekly Linksy digest",
    subjectEmptyDaily: "Your daily Linksy digest",
    weeklyHeaderWord: "weekly",
    dailyHeaderWord: "daily",
    periodWeekly: "Past 7 days",
    periodDaily: "Past 24 hours",
    introHasContentWeekly: "Here is what happened on Linksy in the past week.",
    introHasContentDaily: "Here is what happened on Linksy in the past 24 hours.",
    introIdle: "No new activity in this period — but you'll be the first to know when it picks up.",
    totalsFallback: "No new activity in this period.",
    recentActivity: "Recent activity",
    openBtn: "Open Linksy",
    footerDontWant: "Don't want this digest?",
    footerPrefs: "Update your preferences",
    interactionOne: "interaction",
    interactionMany: "interactions",
    textNoBreakdown: "(no breakdown available)",
    prefsHint:
      "You can change the cadence or unsubscribe from the digest at any time from Settings → Notifications.",
    htmlDigestTitleWeekly: "Linksy weekly digest",
    htmlDigestTitleDaily: "Linksy daily digest",
    newUpdatesWeekly: " new updates",
    newUpdatesDaily: " new updates",
    newActivityPrefix: "New activity:",
    adjustDigestPrefs: "Adjust digest preferences",
  };
}

function mongolianStrings(): DigestEmailStrings {
  return {
    subjectHasContentWeekly: "7 хоногийн Linksy имэйл — ",
    subjectHasContentDaily: "Өдрийн Linksy имэйл — ",
    subjectEmptyWeekly: "7 хоногийн Linksy имэйл",
    subjectEmptyDaily: "Өдрийн Linksy имэйл",
    weeklyHeaderWord: "7 хоногийн",
    dailyHeaderWord: "өдрийн",
    periodWeekly: "Сүүлийн 7 хоног",
    periodDaily: "Сүүлийн 24 цаг",
    introHasContentWeekly: "Сүүлийн 7 хоногт Linksy дээр дараах зүйл болсон.",
    introHasContentDaily: "Сүүлийн 24 цагт Linksy дээр дараах зүйл болсон.",
    introIdle: "Энэ үеийн туршид шинэ үйл идэвхгүй — идэвхжүүлэгдэхэд танд мэдэгдэнэ.",
    totalsFallback: "Энэ хугацаанд шинэ үйл идэвхгүй.",
    recentActivity: "Сүүлийн үйл явдал",
    openBtn: "Linksy нээх",
    footerDontWant: "Ийм имэйл хүсэхгүй юу?",
    footerPrefs: "Тохируулгыг засах",
    interactionOne: "үйлдэл",
    interactionMany: "үйлдэл",
    textNoBreakdown: "(нарийвчилгаа байхгүй)",
    prefsHint:
      "Хүрээ эсвэл устгалыг тохируулгыг дамжуулах бол Зохион байгуулах → Мэдэгдэлээс солиорой.",
    htmlDigestTitleWeekly: "Linksy — 7 хоногийн хураангуй",
    htmlDigestTitleDaily: "Linksy — өдрийн хураангуй",
    newUpdatesWeekly: " шинэ мэдээ",
    newUpdatesDaily: " шинэ мэдээ",
    newActivityPrefix: "Шинэ үйл:",
    adjustDigestPrefs: "Имэйлийн тохируулгыг засах",
  };
}

export function digestEmailTranslation(lang: AppLanguage): DigestEmailStrings {
  return bundleForLocale(lang) === "mn" ? mongolianStrings() : englishStrings();
}

export type DigestTotalsInput = {
  likes: number;
  comments: number;
  follows: number;
  mentions: number;
  stories: number;
  messages: number;
};

export function digestTotalsLines(totals: DigestTotalsInput, lang: AppLanguage): string[] {
  const b = bundleForLocale(lang);
  if (b === "mn") {
    return [
      totals.likes ? `${totals.likes} лайк` : null,
      totals.comments ? `${totals.comments} сэтгэгдэл` : null,
      totals.follows ? `${totals.follows} шинэ дагагч` : null,
      totals.mentions ? `${totals.mentions} дурдлага` : null,
      totals.stories ? `${totals.stories} түүхийн үйлчлэл` : null,
      totals.messages ? `${totals.messages} мессеж` : null,
    ].filter((v): v is string => Boolean(v));
  }

  return [
    totals.likes ? `${totals.likes} likes` : null,
    totals.comments ? `${totals.comments} comments` : null,
    totals.follows ? `${totals.follows} new followers` : null,
    totals.mentions ? `${totals.mentions} mentions` : null,
    totals.stories ? `${totals.stories} story views` : null,
    totals.messages ? `${totals.messages} messages` : null,
  ].filter((v): v is string => Boolean(v));
}

export function formatDigestSubject(
  lang: AppLanguage,
  cadence: "weekly" | "daily",
  hasContent: boolean,
  notificationAndMessageTotal: number,
): string {
  const t = digestEmailTranslation(lang);
  const weekly = cadence === "weekly";
  if (!hasContent) {
    return weekly ? t.subjectEmptyWeekly : t.subjectEmptyDaily;
  }
  const prefix = weekly ? t.subjectHasContentWeekly : t.subjectHasContentDaily;
  const suffix = weekly ? t.newUpdatesWeekly : t.newUpdatesDaily;
  return `${prefix}${notificationAndMessageTotal}${suffix}`;
}

export function digestSomeoneDisplay(lang: AppLanguage): string {
  return bundleForLocale(lang) === "mn" ? "Хэн нэгэн" : "Someone";
}

export function digestGreeting(lang: AppLanguage, recipientDisplay: string): string {
  const b = bundleForLocale(lang);
  const name = recipientDisplay.trim() || digestSomeoneDisplay(lang);
  return b === "mn" ? `Сайн байна уу, ${name},` : `Hi ${name},`;
}

/** Plain-text period line for the digest (avoids mixing EN “since” into MN). */
export function digestPlainPeriodLine(
  lang: AppLanguage,
  cadence: "weekly" | "daily",
  sinceUtc: string,
): string {
  if (bundleForLocale(lang) === "mn") {
    return cadence === "weekly"
      ? `Сүүлийн 7 хоногийн хураангуй (${sinceUtc} UTC-аас).`
      : `Сүүлийн 24 цагийн хураангуй (${sinceUtc} UTC-аас).`;
  }
  return cadence === "weekly"
    ? `Here is your weekly Linksy summary (Past 7 days, since ${sinceUtc}).`
    : `Here is your daily Linksy summary (Past 24 hours, since ${sinceUtc}).`;
}
