import type { NotificationKind } from "@/lib/notifications";
import { bundleForLocale, type CopyBundle } from "@/lib/i18n/bundles";
import type { AppLanguage } from "@/lib/language";

const SOMEONE: Record<CopyBundle, string> = {
  en: "Someone",
  mn: "Хэн нэгэн",
};

export function localizedPushPreview(
  kind: NotificationKind,
  from: string,
  lang: AppLanguage,
): { title: string; body: string } {
  const b = bundleForLocale(lang);
  const f = from.trim() || SOMEONE[b];
  return PREVIEW[b][kind](f);
}

/** Push copy when multiple actors are merged (same post like/comment). */
export function localizedGroupedReactionPushPreview(
  kind: "like" | "comment",
  primaryName: string,
  groupCount: number,
  lang: AppLanguage,
): { title: string; body: string } {
  const b = bundleForLocale(lang);
  const name = primaryName.trim() || SOMEONE[b];
  const others = groupCount - 1;
  if (others <= 0) {
    return PREVIEW[b][kind](name);
  }
  if (b === "mn") {
    return kind === "like"
      ? {
          title: "Шинэ лайкууд",
          body: `${name} болон бусад ${others} хүн таны постод лайк дарав.`,
        }
      : {
          title: "Шинэ сэтгэгдлүүд",
          body: `${name} болон бусад ${others} хүн таны постод сэтгэгдэл бичив.`,
        };
  }
  return kind === "like"
    ? {
        title: "New likes",
        body: `${name} and ${others} others liked your post.`,
      }
    : {
        title: "New comments",
        body: `${name} and ${others} others commented on your post.`,
      };
}

type Row = Record<NotificationKind, (from: string) => { title: string; body: string }>;

const EN: Row = {
  like: (from) => ({ title: "New like", body: `${from} liked your post.` }),
  comment: (from) => ({ title: "New comment", body: `${from} commented on your post.` }),
  follow: (from) => ({ title: "New follower", body: `${from} started following you.` }),
  mention: (from) => ({ title: "Mention", body: `${from} mentioned you.` }),
  post_mention: (from) => ({ title: "Mention", body: `${from} mentioned you in a post.` }),
  story_mention: (from) => ({ title: "Mention", body: `${from} mentioned you in a story.` }),
  story: (from) => ({ title: "Story", body: `${from} shared a story update.` }),
  message: (from) => ({ title: "Message", body: `${from} sent you a message.` }),
  message_request: (from) => ({ title: "Message request", body: `${from} sent you a message request.` }),
  story_expiring: (_from) => ({
    title: "Story expiring",
    body: "Your story expires in about an hour.",
  }),
  friend_joined: (from) => ({
    title: "Contact joined",
    body: `${from} joined Linksy (from your contacts).`,
  }),
  story_reaction: (from) => ({ title: "Story reaction", body: `${from} reacted to your story.` }),
  story_collab: (from) => ({
    title: "Story collaborator",
    body: `${from} added you to a story.`,
  }),
};

const MN: Row = {
  like: (from) => ({ title: "Шинэ лайк", body: `${from} таны постод лайк дарав.` }),
  comment: (from) => ({ title: "Шинэ сэтгэгдэл", body: `${from} таны постод сэтгэгдэл бичив.` }),
  follow: (from) => ({ title: "Шинэ дагагч", body: `${from} таныг дагаж эхэллээ.` }),
  mention: (from) => ({ title: "Дурдсан", body: `${from} таныг дурдав.` }),
  post_mention: (from) => ({ title: "Дурдсан", body: `${from} таныг постонд дурдав.` }),
  story_mention: (from) => ({ title: "Дурдсан", body: `${from} таныг түүхэнд дурдав.` }),
  story: (from) => ({ title: "Түүх", body: `${from} түүх шинэчиллээ.` }),
  message: (from) => ({ title: "Мессеж", body: `${from} танд мессеж илгээлээ.` }),
  message_request: (from) => ({ title: "Мессежийн хүсэлт", body: `${from} мессежийн хүсэлт илгээлээ.` }),
  story_expiring: (_from) => ({
    title: "Түүх дуусах гэж байна",
    body: "Таны түүх ойролцоогоор нэг цагийн дараа дуусна.",
  }),
  friend_joined: (from) => ({
    title: "Харилцагч элссэн",
    body: `${from} Linksy-д элссэн (танай харилцагчаас).`,
  }),
  story_reaction: (from) => ({ title: "Түүхэд үнэлгээ", body: `${from} таны түүхэд үнэлгээ өглөө.` }),
  story_collab: (from) => ({ title: "Түүхийн хамтран ажиллагч", body: `${from} таныг түүхэнд нэмлээ.` }),
};

const PREVIEW: Record<CopyBundle, Row> = { en: EN, mn: MN };
