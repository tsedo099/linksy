import type { AppLanguage } from "@/lib/language";

export type NotificationsScreenStrings = {
  kicker: string;
  title: string;
  filtersAria: string;
  filterAll: string;
  filterMentions: string;
  filterReactions: string;
  filterFollows: string;
  filterSystem: string;
  markAllRead: string;
  allCaught: string;
  followActivityTitle: string;
  followActivityCount: (n: number) => string;
  followActivityReview: string;
  emptyTitle: string;
  emptyDesc: string;
  groupToday: string;
  groupThisWeek: string;
  groupEarlier: string;
  timeJustNow: string;
  timeMin: (n: number) => string;
  timeHour: (n: number) => string;
  timeDay: (n: number) => string;
  // actor verbs
  actLike: string;
  actComment: string;
  actFollow: string;
  actMention: string;
  actMentionPost: string;
  actMentionStory: string;
  actStoryUpdate: string;
  actMessage: string;
  actMessageRequest: string;
  actStoryExpiring: string;
  actFriendJoined: string;
  actStoryReaction: string;
  actStoryCollab: string;
  actLikePlus: (others: number) => string;
  actCommentPlus: (others: number) => string;
  followBack: string;
  following: string;
  previewLabel: string;
  markRead: string;
};

const en: NotificationsScreenStrings = {
  kicker: "Activity",
  title: "Notifications",
  filtersAria: "Notification filters",
  filterAll: "All",
  filterMentions: "Mentions",
  filterReactions: "Reactions",
  filterFollows: "Follows",
  filterSystem: "System",
  markAllRead: "Mark all as read",
  allCaught: "All caught up",
  followActivityTitle: "Follow Activity",
  followActivityCount: (n) => `${n} recent follow notification${n === 1 ? "" : "s"}.`,
  followActivityReview: "Review",
  emptyTitle: "No notifications here",
  emptyDesc: "This tab is quiet right now. Try another filter or come back later.",
  groupToday: "Today",
  groupThisWeek: "This week",
  groupEarlier: "Earlier",
  timeJustNow: "Just now",
  timeMin: (n) => `${n}m`,
  timeHour: (n) => `${n}h`,
  timeDay: (n) => `${n}d`,
  actLike: "liked your post",
  actComment: "commented on your post",
  actFollow: "started following you",
  actMention: "mentioned you",
  actMentionPost: "mentioned you in a post",
  actMentionStory: "mentioned you in a story",
  actStoryUpdate: "shared a story update",
  actMessage: "sent you a message",
  actMessageRequest: "sent you a message request",
  actStoryExpiring: "your story expires in about an hour",
  actFriendJoined: "joined Linksy (from your contacts)",
  actStoryReaction: "reacted to your story",
  actStoryCollab: "added you as a collaborator on a story",
  actLikePlus: (o) => `and ${o} other${o === 1 ? "" : "s"} liked your post`,
  actCommentPlus: (o) => `and ${o} other${o === 1 ? "" : "s"} commented on your post`,
  followBack: "Follow back",
  following: "Following",
  previewLabel: "Post",
  markRead: "Mark read",
};

const mn: NotificationsScreenStrings = {
  kicker: "Идэвхжил",
  title: "Мэдэгдлүүд",
  filtersAria: "Мэдэгдлийн шүүлтүүр",
  filterAll: "Бүгд",
  filterMentions: "Дурдсан",
  filterReactions: "Хариу үзүүлсэн",
  filterFollows: "Дагасан",
  filterSystem: "Систем",
  markAllRead: "Бүгдийг уншсан гэж тэмдэглэх",
  allCaught: "Бүгдийг харсан",
  followActivityTitle: "Дагалдагчийн идэвхжил",
  followActivityCount: (n) => `${n} шинэ дагалдагч мэдэгдэл.`,
  followActivityReview: "Үзэх",
  emptyTitle: "Мэдэгдэл байхгүй",
  emptyDesc: "Энэ хэсэгт мэдэгдэл алга. Өөр шүүлтүүр сонгоод үзээрэй.",
  groupToday: "Өнөөдөр",
  groupThisWeek: "Энэ долоо хоног",
  groupEarlier: "Эрт",
  timeJustNow: "Сая",
  timeMin: (n) => `${n} мин`,
  timeHour: (n) => `${n} ц`,
  timeDay: (n) => `${n} хон`,
  actLike: "таны постонд таалагдсан",
  actComment: "таны постонд сэтгэгдэл бичлээ",
  actFollow: "таныг дагаж эхэллээ",
  actMention: "таныг дурдсан",
  actMentionPost: "таныг постдоо дурдсан",
  actMentionStory: "таныг story-доо дурдсан",
  actStoryUpdate: "story шинэчилсэн",
  actMessage: "зурвас илгээсэн",
  actMessageRequest: "зурвасын хүсэлт илгээсэн",
  actStoryExpiring: "таны story 1 цагийн дотор алга болно",
  actFriendJoined: "Linksy-д нэгдсэн (таны харилцагчдаас)",
  actStoryReaction: "таны story-д хариу үзүүлсэн",
  actStoryCollab: "таныг story-д хамтрагчаар нэмлээ",
  actLikePlus: (o) => `мөн өөр ${o} хүн таалагдсан`,
  actCommentPlus: (o) => `мөн өөр ${o} хүн сэтгэгдэл бичсэн`,
  followBack: "Хариу дагах",
  following: "Дагаж байна",
  previewLabel: "Пост",
  markRead: "Уншсан",
};

export function notificationsScreenStrings(language: AppLanguage): NotificationsScreenStrings {
  return language === "mn" ? mn : en;
}
