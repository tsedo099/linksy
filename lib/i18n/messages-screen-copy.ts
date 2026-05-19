import type { AppLanguage } from "@/lib/language";
import { localeForLanguage } from "@/lib/language";

/** All user-visible strings for the messages / DM screen (all supported app languages). */
export type MessagesScreenStrings = {
  sidebarTitle: string;
  newChatTitle: string;
  searchPh: string;
  noRequests: string;
  noGroups: string;
  noDirects: string;
  tabDirect: string;
  tabGroups: string;
  tabRequests: string;
  emptyTitle: string;
  emptySub: string;
  online: string;
  onlineAria: string;
  membersCount: (n: number) => string;
  activeNow: string;
  lastSeenPrefix: string;
  headMuted: string;
  searchMessagesTitle: string;
  searchInConvoPh: string;
  clearTitle: string;
  searching: string;
  noSearchResults: string;
  reqBanner: string;
  accept: string;
  blockBanner: string;
  unblock: string;
  pinnedMsg: string;
  pinnedVideo: string;
  pinnedPhoto: string;
  convoStartHint: string;
  youPrefix: string;
  msgDeleted: string;
  voiceMsg: string;
  video: string;
  photo: string;
  /** Adult-content gate strings (per-locale). Optional so a fallback English copy renders if a translation hasn't shipped yet. */
  adultContentArrived?: string;
  adultContentTapToShow?: string;
  adultContentRestricted?: string;
  startChat: string;
  mutedDash: string;
  groupFallback: string;
  convoMenuAria: string;
  contextMarkUnread: string;
  contextPin: string;
  contextUnpin: string;
  contextMute: string;
  contextUnmute: string;
  contextDelete: string;
  noticeClose: string;
  deleteChatConfirm: string;
  unsendConfirm: string;
  leaveGroupConfirm: string;
  detailTitle: string;
  nicknameLabel: string;
  nicknamePh: string;
  save: string;
  membersLabel: string;
  detailYou: string;
  roleAdmin: string;
  roleMember: string;
  adminBadge: string;
  demote: string;
  promote: string;
  demoteTitle: string;
  promoteTitle: string;
  muteChat: string;
  unmuteChat: string;
  blockThisChat: string;
  unblockThisChat: string;
  blocking: string;
  blockUserFmt: (username: string) => string;
  blockUserConfirmFmt: (username: string) => string;
  leaveGroup: string;
  leaving: string;
  deleteChatBtn: string;
  deleting: string;
  chatDetailsTitle: string;
  bubbleYouReplied: (name: string) => string;
  bubbleTheyReplied: (name: string) => string;
  bubbleYouUnsent: string;
  bubbleMsgUnsent: string;
  edited: string;
  moreTitle: string;
  replyTitle: string;
  reactTitle: string;
  forward: string;
  pin: string;
  unpin: string;
  edit: string;
  deleteForYou: string;
  unsend: string;
  composeReplyingTo: string;
  composeVideo: string;
  composePhoto: string;
  composeBlockedPh: string;
  composeMessagePh: string;
  recordVoiceTitle: string;
  cancelRecTitle: string;
  finishRecTitle: string;
  discardVoiceTitle: string;
  sendVoiceTitle: string;
  errImageOnly: string;
  errAttachSize: string;
  modalNewChat: string;
  modalCloseComposer: string;
  modalChatType: string;
  modalDirect: string;
  modalGroup: string;
  modalGroupNamePh: string;
  modalSearchUsersPh: string;
  modalNoPeople: string;
  modalCreating: string;
  modalCreateGroupFmt: (n: number) => string;
  couldNotStartChat: string;
  voicePlay: string;
  voicePause: string;
  userBlockedToast: string;
  typingLine: (peers: { displayName: string }[]) => string;
};

type Raw = Omit<
  MessagesScreenStrings,
  | "membersCount"
  | "bubbleYouReplied"
  | "bubbleTheyReplied"
  | "blockUserFmt"
  | "blockUserConfirmFmt"
  | "modalCreateGroupFmt"
  | "typingLine"
>;

function rawEntry(x: Raw): Raw {
  return x;
}

const TYPING = {
  en: {
    one: "{name} is typing…",
    two: "{a} and {b} are typing…",
    many: "{a} and {n} others are typing…",
  },
  mn: {
    one: "{name} бичиж байна…",
    two: "{a}, {b} бичиж байна…",
    many: "{a} болон бусад {n} хүн бичиж байна…",
  },
  zh: {
    one: "{name} 正在输入…",
    two: "{a} 和 {b} 正在输入…",
    many: "{a} 和其他 {n} 人正在输入…",
  },
  ja: {
    one: "{name} が入力しています…",
    two: "{a} と {b} が入力しています…",
    many: "{a} ほか {n} 人が入力しています…",
  },
  ko: {
    one: "{name}님이 입력 중…",
    two: "{a}님, {b}님이 입력 중…",
    many: "{a}님 외 {n}명이 입력 중…",
  },
  de: {
    one: "{name} schreibt…",
    two: "{a} und {b} schreiben…",
    many: "{a} und {n} weitere schreiben…",
  },
  ru: {
    one: "{name} печатает…",
    two: "{a} и {b} печатают…",
    many: "{a} и ещё {n} печатают…",
  },
} as const satisfies Record<AppLanguage, { one: string; two: string; many: string }>;

const RAW: Record<AppLanguage, Raw> = {
  en: rawEntry({
    sidebarTitle: "Messages",
    newChatTitle: "New chat",
    searchPh: "Search…",
    noRequests: "No requests yet",
    noGroups: "No group chats yet",
    noDirects: "No direct chats yet",
    tabDirect: "Direct",
    tabGroups: "Groups",
    tabRequests: "Requests",
    emptyTitle: "Choose a conversation",
    emptySub: "Pick a chat from the sidebar to start messaging.",
    online: "Online",
    onlineAria: "Online",
    activeNow: "Active now",
    lastSeenPrefix: "Last seen",
    headMuted: "muted",
    searchMessagesTitle: "Search messages",
    searchInConvoPh: "Search in conversation…",
    clearTitle: "Clear",
    searching: "Searching…",
    noSearchResults: "No messages found.",
    reqBanner: "This user sent you a message request.",
    accept: "Accept",
    blockBanner: "You blocked this chat. The other person can't send you new messages.",
    unblock: "Unblock",
    pinnedMsg: "Pinned message",
    pinnedVideo: "Pinned video",
    pinnedPhoto: "Pinned photo",
    convoStartHint: "Linksy · Start the conversation",
    youPrefix: "You: ",
    msgDeleted: "Message deleted",
    voiceMsg: "Voice message",
    video: "Video",
    photo: "Photo",
    startChat: "Start chatting",
    mutedDash: "Muted - ",
    groupFallback: "Group",
    convoMenuAria: "Conversation menu",
    contextMarkUnread: "Mark as unread",
    contextPin: "Pin",
    contextUnpin: "Unpin",
    contextMute: "Mute",
    contextUnmute: "Unmute",
    contextDelete: "Delete",
    noticeClose: "Close",
    deleteChatConfirm: "Delete this chat from your inbox?",
    unsendConfirm: "Unsend this message?",
    leaveGroupConfirm: "Leave this group?",
    detailTitle: "Chat details",
    nicknameLabel: "Nickname",
    nicknamePh: "Nickname",
    save: "Save",
    membersLabel: "Members",
    detailYou: "You",
    roleAdmin: "Admin",
    roleMember: "Member",
    adminBadge: "Admin",
    demote: "Demote",
    promote: "Promote",
    demoteTitle: "Demote to member",
    promoteTitle: "Promote to admin",
    muteChat: "Mute chat",
    unmuteChat: "Unmute chat",
    blockThisChat: "Block this chat",
    unblockThisChat: "Unblock this chat",
    blocking: "Blocking...",
    leaveGroup: "Leave group",
    leaving: "Leaving...",
    deleteChatBtn: "Delete chat",
    deleting: "Deleting...",
    chatDetailsTitle: "Chat details",
    bubbleYouUnsent: "You unsent a message",
    bubbleMsgUnsent: "Message was unsent",
    edited: "· edited",
    moreTitle: "More",
    replyTitle: "Reply",
    reactTitle: "React",
    forward: "Forward",
    pin: "Pin",
    unpin: "Unpin",
    edit: "Edit",
    deleteForYou: "Delete for you",
    unsend: "Unsend",
    composeReplyingTo: "Replying to",
    composeVideo: "Video",
    composePhoto: "Photo",
    composeBlockedPh: "You blocked this chat",
    composeMessagePh: "Message…",
    recordVoiceTitle: "Record a voice message",
    cancelRecTitle: "Cancel recording",
    finishRecTitle: "Finish recording",
    discardVoiceTitle: "Discard voice message",
    sendVoiceTitle: "Send voice message",
    errImageOnly: "Only image or video files are supported.",
    errAttachSize: "Attachment must be 20MB or less.",
    modalNewChat: "New chat",
    modalCloseComposer: "Close chat composer",
    modalChatType: "Chat type",
    modalDirect: "Direct",
    modalGroup: "Group",
    modalGroupNamePh: "Group name (optional)…",
    modalSearchUsersPh: "Search users…",
    modalNoPeople: "No people found",
    modalCreating: "Creating…",
    couldNotStartChat: "Could not start the chat.",
    voicePlay: "Play",
    voicePause: "Pause",
    userBlockedToast: "User blocked.",
  }),
  mn: rawEntry({
    sidebarTitle: "Зурвас",
    newChatTitle: "Шинэ чат",
    searchPh: "Хайх…",
    noRequests: "Хүсэлт алга",
    noGroups: "Бүлгийн чат алга",
    noDirects: "Шууд чат алга",
    tabDirect: "Шууд",
    tabGroups: "Бүлэг",
    tabRequests: "Хүсэлт",
    emptyTitle: "Яриа сонгоно уу",
    emptySub: "Зурвас илгээхийн тулд жагсаалтаас чат сонгоно уу.",
    online: "Идэвхтэй",
    onlineAria: "Онлайн",
    activeNow: "Одоо идэвхтэй",
    lastSeenPrefix: "Сүүлд",
    headMuted: "чимээгүй",
    searchMessagesTitle: "Зурвас хайх",
    searchInConvoPh: "Ярианаас хайх…",
    clearTitle: "Арилгах",
    searching: "Хайж байна…",
    noSearchResults: "Зурвас олдсонгүй.",
    reqBanner: "Энэ хэрэглэгч танд зурвасын хүсэлт илгээсэн.",
    accept: "Зөвшөөрөх",
    blockBanner: "Та энэ чатыг хаасан. Нөгөө тал шинэ зурвас илгээх боломжгүй.",
    unblock: "Хаалтыг авах",
    pinnedMsg: "Тогтмол зурвас",
    pinnedVideo: "Тогтмол видео",
    pinnedPhoto: "Тогтмол зураг",
    convoStartHint: "Linksy · Яриагаа эхлүүлээрэй",
    youPrefix: "Та: ",
    msgDeleted: "Зурвас устгасан",
    voiceMsg: "Дуут зурвас",
    video: "Видео",
    photo: "Зураг",
    adultContentArrived: "Насанд хүрэгчдийн контент ирлээ — үзэхдээ итгэлтэй байна уу?",
    adultContentTapToShow: "Дарж харах",
    adultContentRestricted: "18 нас хүрээгүй учраас энэ зурвасыг харуулах боломжгүй.",
    startChat: "Яриа эхлүүлэх",
    mutedDash: "Чимээгүй - ",
    groupFallback: "Бүлэг",
    convoMenuAria: "Чатын цэс",
    contextMarkUnread: "Уншаагүй гэж тэмдэглэх",
    contextPin: "Тогтоох",
    contextUnpin: "Тогтоолтыг авах",
    contextMute: "Чимээгүй",
    contextUnmute: "Дууг нээх",
    contextDelete: "Устгах",
    noticeClose: "Хаах",
    deleteChatConfirm: "Энэ чатыг жагсаалтаас устгах уу?",
    unsendConfirm: "Энэ зурвасыг буцаах уу?",
    leaveGroupConfirm: "Энэ бүлгээс гарах уу?",
    detailTitle: "Чатын дэлгэрэнгүй",
    nicknameLabel: "Дүрс нэр",
    nicknamePh: "Дүрс нэр",
    save: "Хадгалах",
    membersLabel: "Гишүүд",
    detailYou: "Та",
    roleAdmin: "Админ",
    roleMember: "Гишүүн",
    adminBadge: "Админ",
    demote: "Гишүүн болгох",
    promote: "Админ болгох",
    demoteTitle: "Гишүүн болгох",
    promoteTitle: "Админ болгох",
    muteChat: "Чимээгүй болгох",
    unmuteChat: "Дууг нээх",
    blockThisChat: "Чатыг хаах",
    unblockThisChat: "Хаалтыг авах",
    blocking: "Хааж байна...",
    leaveGroup: "Бүлгээс гарах",
    leaving: "Гарч байна...",
    deleteChatBtn: "Чат устгах",
    deleting: "Устгаж байна...",
    chatDetailsTitle: "Чатын дэлгэрэнгүй",
    bubbleYouUnsent: "Та зурвасаа буцаасан",
    bubbleMsgUnsent: "Зурвас буцаагдсан",
    edited: "· зассан",
    moreTitle: "Бусад",
    replyTitle: "Хариулах",
    reactTitle: "Илэрхийлэл",
    forward: "Дамжуулах",
    pin: "Тогтоох",
    unpin: "Тогтоолтыг авах",
    edit: "Засах",
    deleteForYou: "Зөвхөн надаас устгах",
    unsend: "Буцаах",
    composeReplyingTo: "Хариулж байна",
    composeVideo: "Видео",
    composePhoto: "Зураг",
    composeBlockedPh: "Та энэ чатыг хаасан",
    composeMessagePh: "Зурвас…",
    recordVoiceTitle: "Дуут зурвас бичих",
    cancelRecTitle: "Бичлэгийг цуцлах",
    finishRecTitle: "Бичлэг дуусгах",
    discardVoiceTitle: "Дуут зурвас устгах",
    sendVoiceTitle: "Дуут зурвас илгээх",
    errImageOnly: "Зөвхөн зураг эсвэл видео файл зөвшөөрнө.",
    errAttachSize: "Хавсралтын хэмжээ 20MB-аас ихгүй байх ёстой.",
    modalNewChat: "Шинэ чат",
    modalCloseComposer: "Чат нээх цэсийг хаах",
    modalChatType: "Чатын төрөл",
    modalDirect: "Шууд",
    modalGroup: "Бүлэг",
    modalGroupNamePh: "Бүлгийн нэр (сонголттой)…",
    modalSearchUsersPh: "Хэрэглэгч хайх…",
    modalNoPeople: "Хүн олдсонгүй",
    modalCreating: "Үүсгэж байна…",
    couldNotStartChat: "Чат эхлүүлж чадсангүй.",
    voicePlay: "Тоглуулах",
    voicePause: "Түр зогсоох",
    userBlockedToast: "Хэрэглэгчийг хаасан.",
  }),
  zh: rawEntry({
    sidebarTitle: "消息",
    newChatTitle: "新聊天",
    searchPh: "搜索…",
    noRequests: "暂无请求",
    noGroups: "暂无群聊",
    noDirects: "暂无私聊",
    tabDirect: "私信",
    tabGroups: "群聊",
    tabRequests: "请求",
    emptyTitle: "选择一个会话",
    emptySub: "从侧边栏选择聊天以开始发消息。",
    online: "在线",
    onlineAria: "在线",
    activeNow: "当前活跃",
    lastSeenPrefix: "上次在线",
    headMuted: "已静音",
    searchMessagesTitle: "搜索消息",
    searchInConvoPh: "在会话中搜索…",
    clearTitle: "清除",
    searching: "正在搜索…",
    noSearchResults: "未找到消息。",
    reqBanner: "此用户向你发送了消息请求。",
    accept: "接受",
    blockBanner: "你已屏蔽此聊天，对方无法发送新消息。",
    unblock: "取消屏蔽",
    pinnedMsg: "置顶消息",
    pinnedVideo: "置顶视频",
    pinnedPhoto: "置顶图片",
    convoStartHint: "Linksy · 开始对话",
    youPrefix: "你：",
    msgDeleted: "消息已删除",
    voiceMsg: "语音消息",
    video: "视频",
    photo: "照片",
    startChat: "开始聊天",
    mutedDash: "已静音 - ",
    groupFallback: "群聊",
    convoMenuAria: "会话菜单",
    contextMarkUnread: "标为未读",
    contextPin: "置顶",
    contextUnpin: "取消置顶",
    contextMute: "静音",
    contextUnmute: "取消静音",
    contextDelete: "删除",
    noticeClose: "关闭",
    deleteChatConfirm: "从收件箱删除此聊天？",
    unsendConfirm: "撤回这条消息？",
    leaveGroupConfirm: "退出此群聊？",
    detailTitle: "聊天详情",
    nicknameLabel: "备注名",
    nicknamePh: "备注名",
    save: "保存",
    membersLabel: "成员",
    detailYou: "你",
    roleAdmin: "管理员",
    roleMember: "成员",
    adminBadge: "管理员",
    demote: "降为成员",
    promote: "设为管理员",
    demoteTitle: "降为成员",
    promoteTitle: "设为管理员",
    muteChat: "静音聊天",
    unmuteChat: "取消静音",
    blockThisChat: "屏蔽此聊天",
    unblockThisChat: "取消屏蔽",
    blocking: "正在屏蔽...",
    leaveGroup: "退出群聊",
    leaving: "正在退出...",
    deleteChatBtn: "删除聊天",
    deleting: "正在删除...",
    chatDetailsTitle: "聊天详情",
    bubbleYouUnsent: "你撤回了一条消息",
    bubbleMsgUnsent: "消息已撤回",
    edited: "· 已编辑",
    moreTitle: "更多",
    replyTitle: "回复",
    reactTitle: "表情",
    forward: "转发",
    pin: "置顶",
    unpin: "取消置顶",
    edit: "编辑",
    deleteForYou: "仅为你删除",
    unsend: "撤回",
    composeReplyingTo: "回复",
    composeVideo: "视频",
    composePhoto: "照片",
    composeBlockedPh: "你已屏蔽此聊天",
    composeMessagePh: "消息…",
    recordVoiceTitle: "录制语音消息",
    cancelRecTitle: "取消录音",
    finishRecTitle: "完成录音",
    discardVoiceTitle: "丢弃语音",
    sendVoiceTitle: "发送语音",
    errImageOnly: "仅支持图片或视频文件。",
    errAttachSize: "附件大小不能超过 20MB。",
    modalNewChat: "新聊天",
    modalCloseComposer: "关闭新建聊天",
    modalChatType: "聊天类型",
    modalDirect: "私信",
    modalGroup: "群聊",
    modalGroupNamePh: "群名称（可选）…",
    modalSearchUsersPh: "搜索用户…",
    modalNoPeople: "未找到用户",
    modalCreating: "创建中…",
    couldNotStartChat: "无法开始聊天。",
    voicePlay: "播放",
    voicePause: "暂停",
    userBlockedToast: "已屏蔽用户。",
  }),
  ja: rawEntry({
    sidebarTitle: "メッセージ",
    newChatTitle: "新しいチャット",
    searchPh: "検索…",
    noRequests: "リクエストはありません",
    noGroups: "グループチャットはありません",
    noDirects: "ダイレクトはありません",
    tabDirect: "ダイレクト",
    tabGroups: "グループ",
    tabRequests: "リクエスト",
    emptyTitle: "会話を選択",
    emptySub: "サイドバーからチャットを選んでメッセージを始めましょう。",
    online: "オンライン",
    onlineAria: "オンライン",
    activeNow: "アクティブ",
    lastSeenPrefix: "最終閲覧",
    headMuted: "ミュート中",
    searchMessagesTitle: "メッセージを検索",
    searchInConvoPh: "会話内を検索…",
    clearTitle: "クリア",
    searching: "検索中…",
    noSearchResults: "メッセージが見つかりません。",
    reqBanner: "このユーザーからメッセージリクエストが届きました。",
    accept: "承認",
    blockBanner: "このチャットをブロックしています。相手は新しいメッセージを送れません。",
    unblock: "ブロック解除",
    pinnedMsg: "固定されたメッセージ",
    pinnedVideo: "固定された動画",
    pinnedPhoto: "固定された写真",
    convoStartHint: "Linksy · 会話を始める",
    youPrefix: "あなた: ",
    msgDeleted: "メッセージが削除されました",
    voiceMsg: "ボイスメッセージ",
    video: "動画",
    photo: "写真",
    startChat: "チャットを始める",
    mutedDash: "ミュート - ",
    groupFallback: "グループ",
    convoMenuAria: "会話メニュー",
    contextMarkUnread: "未読にする",
    contextPin: "ピン留め",
    contextUnpin: "ピン留め解除",
    contextMute: "ミュート",
    contextUnmute: "ミュート解除",
    contextDelete: "削除",
    noticeClose: "閉じる",
    deleteChatConfirm: "このチャットを受信箱から削除しますか？",
    unsendConfirm: "このメッセージを取り消しますか？",
    leaveGroupConfirm: "このグループを退出しますか？",
    detailTitle: "チャットの詳細",
    nicknameLabel: "ニックネーム",
    nicknamePh: "ニックネーム",
    save: "保存",
    membersLabel: "メンバー",
    detailYou: "あなた",
    roleAdmin: "管理者",
    roleMember: "メンバー",
    adminBadge: "管理者",
    demote: "メンバーに降格",
    promote: "管理者に昇格",
    demoteTitle: "メンバーに降格",
    promoteTitle: "管理者に昇格",
    muteChat: "チャットをミュート",
    unmuteChat: "ミュート解除",
    blockThisChat: "このチャットをブロック",
    unblockThisChat: "ブロック解除",
    blocking: "ブロック中...",
    leaveGroup: "グループを退出",
    leaving: "退出中...",
    deleteChatBtn: "チャットを削除",
    deleting: "削除中...",
    chatDetailsTitle: "チャットの詳細",
    bubbleYouUnsent: "メッセージを取り消しました",
    bubbleMsgUnsent: "メッセージは取り消されました",
    edited: "· 編集済み",
    moreTitle: "その他",
    replyTitle: "返信",
    reactTitle: "リアクション",
    forward: "転送",
    pin: "ピン留め",
    unpin: "ピン留め解除",
    edit: "編集",
    deleteForYou: "自分側だけ削除",
    unsend: "取り消す",
    composeReplyingTo: "返信先",
    composeVideo: "動画",
    composePhoto: "写真",
    composeBlockedPh: "このチャットをブロックしています",
    composeMessagePh: "メッセージ…",
    recordVoiceTitle: "ボイスメッセージを録音",
    cancelRecTitle: "録音をキャンセル",
    finishRecTitle: "録音を終了",
    discardVoiceTitle: "ボイスを破棄",
    sendVoiceTitle: "ボイスを送信",
    errImageOnly: "画像または動画のみ対応しています。",
    errAttachSize: "添付は 20MB 以下にしてください。",
    modalNewChat: "新しいチャット",
    modalCloseComposer: "作成画面を閉じる",
    modalChatType: "チャットの種類",
    modalDirect: "ダイレクト",
    modalGroup: "グループ",
    modalGroupNamePh: "グループ名（任意）…",
    modalSearchUsersPh: "ユーザーを検索…",
    modalNoPeople: "ユーザーが見つかりません",
    modalCreating: "作成中…",
    couldNotStartChat: "チャットを開始できませんでした。",
    voicePlay: "再生",
    voicePause: "一時停止",
    userBlockedToast: "ユーザーをブロックしました。",
  }),
  ko: rawEntry({
    sidebarTitle: "메시지",
    newChatTitle: "새 채팅",
    searchPh: "검색…",
    noRequests: "요청 없음",
    noGroups: "그룹 채팅 없음",
    noDirects: "다이렉트 없음",
    tabDirect: "다이렉트",
    tabGroups: "그룹",
    tabRequests: "요청",
    emptyTitle: "대화를 선택하세요",
    emptySub: "사이드바에서 채팅을 고르고 메시지를 시작하세요.",
    online: "온라인",
    onlineAria: "온라인",
    activeNow: "활동 중",
    lastSeenPrefix: "마지막 접속",
    headMuted: "음소거됨",
    searchMessagesTitle: "메시지 검색",
    searchInConvoPh: "대화에서 검색…",
    clearTitle: "지우기",
    searching: "검색 중…",
    noSearchResults: "메시지를 찾을 수 없습니다.",
    reqBanner: "이 사용자가 메시지 요청을 보냈습니다.",
    accept: "수락",
    blockBanner: "이 채팅을 차단했습니다. 상대가 새 메시지를 보낼 수 없습니다.",
    unblock: "차단 해제",
    pinnedMsg: "고정된 메시지",
    pinnedVideo: "고정된 동영상",
    pinnedPhoto: "고정된 사진",
    convoStartHint: "Linksy · 대화를 시작하세요",
    youPrefix: "나: ",
    msgDeleted: "메시지가 삭제됨",
    voiceMsg: "음성 메시지",
    video: "동영상",
    photo: "사진",
    startChat: "채팅 시작",
    mutedDash: "음소거 - ",
    groupFallback: "그룹",
    convoMenuAria: "대화 메뉴",
    contextMarkUnread: "읽지 않음으로 표시",
    contextPin: "고정",
    contextUnpin: "고정 해제",
    contextMute: "음소거",
    contextUnmute: "음소거 해제",
    contextDelete: "삭제",
    noticeClose: "닫기",
    deleteChatConfirm: "받은함에서 이 채팅을 삭제할까요?",
    unsendConfirm: "이 메시지를 취소할까요?",
    leaveGroupConfirm: "이 그룹을 나갈까요?",
    detailTitle: "채팅 정보",
    nicknameLabel: "별명",
    nicknamePh: "별명",
    save: "저장",
    membersLabel: "멤버",
    detailYou: "나",
    roleAdmin: "관리자",
    roleMember: "멤버",
    adminBadge: "관리자",
    demote: "멤버로 변경",
    promote: "관리자로 승격",
    demoteTitle: "멤버로 변경",
    promoteTitle: "관리자로 승격",
    muteChat: "채팅 음소거",
    unmuteChat: "음소거 해제",
    blockThisChat: "이 채팅 차단",
    unblockThisChat: "차단 해제",
    blocking: "차단 중...",
    leaveGroup: "그룹 나가기",
    leaving: "나가는 중...",
    deleteChatBtn: "채팅 삭제",
    deleting: "삭제 중...",
    chatDetailsTitle: "채팅 정보",
    bubbleYouUnsent: "메시지를 취소했습니다",
    bubbleMsgUnsent: "메시지가 취소되었습니다",
    edited: "· 수정됨",
    moreTitle: "더보기",
    replyTitle: "답장",
    reactTitle: "반응",
    forward: "전달",
    pin: "고정",
    unpin: "고정 해제",
    edit: "편집",
    deleteForYou: "나에게만 삭제",
    unsend: "취소",
    composeReplyingTo: "답장 대상",
    composeVideo: "동영상",
    composePhoto: "사진",
    composeBlockedPh: "이 채팅을 차단했습니다",
    composeMessagePh: "메시지…",
    recordVoiceTitle: "음성 메시지 녹음",
    cancelRecTitle: "녹음 취소",
    finishRecTitle: "녹음 완료",
    discardVoiceTitle: "음성 삭제",
    sendVoiceTitle: "음성 전송",
    errImageOnly: "이미지 또는 동영상만 지원합니다.",
    errAttachSize: "첨부 파일은 20MB 이하여야 합니다.",
    modalNewChat: "새 채팅",
    modalCloseComposer: "새 채팅 닫기",
    modalChatType: "채팅 유형",
    modalDirect: "다이렉트",
    modalGroup: "그룹",
    modalGroupNamePh: "그룹 이름(선택)…",
    modalSearchUsersPh: "사용자 검색…",
    modalNoPeople: "사용자를 찾을 수 없음",
    modalCreating: "만드는 중…",
    couldNotStartChat: "채팅을 시작할 수 없습니다.",
    voicePlay: "재생",
    voicePause: "일시 정지",
    userBlockedToast: "사용자를 차단했습니다.",
  }),
  de: rawEntry({
    sidebarTitle: "Nachrichten",
    newChatTitle: "Neuer Chat",
    searchPh: "Suche…",
    noRequests: "Noch keine Anfragen",
    noGroups: "Noch keine Gruppenchats",
    noDirects: "Noch keine Direktchats",
    tabDirect: "Direkt",
    tabGroups: "Gruppen",
    tabRequests: "Anfragen",
    emptyTitle: "Unterhaltung wählen",
    emptySub: "Wählen Sie einen Chat in der Seitenleiste, um zu schreiben.",
    online: "Online",
    onlineAria: "Online",
    activeNow: "Gerade aktiv",
    lastSeenPrefix: "Zuletzt online",
    headMuted: "stumm",
    searchMessagesTitle: "Nachrichten durchsuchen",
    searchInConvoPh: "In Unterhaltung suchen…",
    clearTitle: "Leeren",
    searching: "Suche…",
    noSearchResults: "Keine Nachrichten gefunden.",
    reqBanner: "Dieser Benutzer hat eine Nachrichtenanfrage gesendet.",
    accept: "Annehmen",
    blockBanner: "Sie haben diesen Chat blockiert. Die andere Person kann Ihnen keine neuen Nachrichten senden.",
    unblock: "Entblocken",
    pinnedMsg: "Angeheftete Nachricht",
    pinnedVideo: "Angeheftetes Video",
    pinnedPhoto: "Angeheftetes Foto",
    convoStartHint: "Linksy · Unterhaltung starten",
    youPrefix: "Sie: ",
    msgDeleted: "Nachricht gelöscht",
    voiceMsg: "Sprachnachricht",
    video: "Video",
    photo: "Foto",
    startChat: "Chat starten",
    mutedDash: "Stumm - ",
    groupFallback: "Gruppe",
    convoMenuAria: "Chat-Menü",
    contextMarkUnread: "Als ungelesen markieren",
    contextPin: "Anheften",
    contextUnpin: "Lösen",
    contextMute: "Stummschalten",
    contextUnmute: "Stummschaltung aufheben",
    contextDelete: "Löschen",
    noticeClose: "Schließen",
    deleteChatConfirm: "Diesen Chat aus dem Posteingang löschen?",
    unsendConfirm: "Diese Nachricht zurücknehmen?",
    leaveGroupConfirm: "Diese Gruppe verlassen?",
    detailTitle: "Chat-Details",
    nicknameLabel: "Spitzname",
    nicknamePh: "Spitzname",
    save: "Speichern",
    membersLabel: "Mitglieder",
    detailYou: "Sie",
    roleAdmin: "Admin",
    roleMember: "Mitglied",
    adminBadge: "Admin",
    demote: "Zum Mitglied machen",
    promote: "Zum Admin machen",
    demoteTitle: "Zum Mitglied herabstufen",
    promoteTitle: "Zum Admin befördern",
    muteChat: "Chat stummschalten",
    unmuteChat: "Stummschaltung aufheben",
    blockThisChat: "Diesen Chat blockieren",
    unblockThisChat: "Entblocken",
    blocking: "Wird blockiert...",
    leaveGroup: "Gruppe verlassen",
    leaving: "Wird verlassen...",
    deleteChatBtn: "Chat löschen",
    deleting: "Wird gelöscht...",
    chatDetailsTitle: "Chat-Details",
    bubbleYouUnsent: "Sie haben eine Nachricht zurückgenommen",
    bubbleMsgUnsent: "Nachricht wurde zurückgenommen",
    edited: "· bearbeitet",
    moreTitle: "Mehr",
    replyTitle: "Antworten",
    reactTitle: "Reagieren",
    forward: "Weiterleiten",
    pin: "Anheften",
    unpin: "Lösen",
    edit: "Bearbeiten",
    deleteForYou: "Für mich löschen",
    unsend: "Zurücknehmen",
    composeReplyingTo: "Antwort auf",
    composeVideo: "Video",
    composePhoto: "Foto",
    composeBlockedPh: "Sie haben diesen Chat blockiert",
    composeMessagePh: "Nachricht…",
    recordVoiceTitle: "Sprachnachricht aufnehmen",
    cancelRecTitle: "Aufnahme abbrechen",
    finishRecTitle: "Aufnahme beenden",
    discardVoiceTitle: "Sprachnachricht verwerfen",
    sendVoiceTitle: "Sprachnachricht senden",
    errImageOnly: "Nur Bild- oder Videodateien werden unterstützt.",
    errAttachSize: "Anhang darf höchstens 20 MB groß sein.",
    modalNewChat: "Neuer Chat",
    modalCloseComposer: "Chat-Eingabe schließen",
    modalChatType: "Chat-Typ",
    modalDirect: "Direkt",
    modalGroup: "Gruppe",
    modalGroupNamePh: "Gruppenname (optional)…",
    modalSearchUsersPh: "Benutzer suchen…",
    modalNoPeople: "Keine Benutzer gefunden",
    modalCreating: "Wird erstellt…",
    couldNotStartChat: "Chat konnte nicht gestartet werden.",
    voicePlay: "Abspielen",
    voicePause: "Pause",
    userBlockedToast: "Benutzer blockiert.",
  }),
  ru: rawEntry({
    sidebarTitle: "Сообщения",
    newChatTitle: "Новый чат",
    searchPh: "Поиск…",
    noRequests: "Пока нет запросов",
    noGroups: "Пока нет групповых чатов",
    noDirects: "Пока нет личных чатов",
    tabDirect: "Личные",
    tabGroups: "Группы",
    tabRequests: "Запросы",
    emptyTitle: "Выберите беседу",
    emptySub: "Выберите чат в боковой панели, чтобы начать переписку.",
    online: "В сети",
    onlineAria: "В сети",
    activeNow: "Сейчас активен",
    lastSeenPrefix: "Был(а)",
    headMuted: "без звука",
    searchMessagesTitle: "Поиск в сообщениях",
    searchInConvoPh: "Искать в беседе…",
    clearTitle: "Очистить",
    searching: "Поиск…",
    noSearchResults: "Сообщений не найдено.",
    reqBanner: "Этот пользователь отправил запрос на сообщение.",
    accept: "Принять",
    blockBanner: "Вы заблокировали этот чат. Собеседник не может отправлять вам новые сообщения.",
    unblock: "Разблокировать",
    pinnedMsg: "Закреплённое сообщение",
    pinnedVideo: "Закреплённое видео",
    pinnedPhoto: "Закреплённое фото",
    convoStartHint: "Linksy · Начните беседу",
    youPrefix: "Вы: ",
    msgDeleted: "Сообщение удалено",
    voiceMsg: "Голосовое сообщение",
    video: "Видео",
    photo: "Фото",
    startChat: "Начать чат",
    mutedDash: "Без звука - ",
    groupFallback: "Группа",
    convoMenuAria: "Меню чата",
    contextMarkUnread: "Пометить непрочитанным",
    contextPin: "Закрепить",
    contextUnpin: "Открепить",
    contextMute: "Без звука",
    contextUnmute: "Включить звук",
    contextDelete: "Удалить",
    noticeClose: "Закрыть",
    deleteChatConfirm: "Удалить этот чат из входящих?",
    unsendConfirm: "Отозвать это сообщение?",
    leaveGroupConfirm: "Выйти из этой группы?",
    detailTitle: "Сведения о чате",
    nicknameLabel: "Псевдоним",
    nicknamePh: "Псевдоним",
    save: "Сохранить",
    membersLabel: "Участники",
    detailYou: "Вы",
    roleAdmin: "Админ",
    roleMember: "Участник",
    adminBadge: "Админ",
    demote: "Понизить до участника",
    promote: "Сделать админом",
    demoteTitle: "Понизить до участника",
    promoteTitle: "Назначить админом",
    muteChat: "Без звука в чате",
    unmuteChat: "Включить звук",
    blockThisChat: "Заблокировать чат",
    unblockThisChat: "Разблокировать",
    blocking: "Блокировка...",
    leaveGroup: "Покинуть группу",
    leaving: "Выход...",
    deleteChatBtn: "Удалить чат",
    deleting: "Удаление...",
    chatDetailsTitle: "Сведения о чате",
    bubbleYouUnsent: "Вы отозвали сообщение",
    bubbleMsgUnsent: "Сообщение отозвано",
    edited: "· изменено",
    moreTitle: "Ещё",
    replyTitle: "Ответить",
    reactTitle: "Реакция",
    forward: "Переслать",
    pin: "Закрепить",
    unpin: "Открепить",
    edit: "Изменить",
    deleteForYou: "Удалить у меня",
    unsend: "Отозвать",
    composeReplyingTo: "Ответ для",
    composeVideo: "Видео",
    composePhoto: "Фото",
    composeBlockedPh: "Вы заблокировали этот чат",
    composeMessagePh: "Сообщение…",
    recordVoiceTitle: "Записать голосовое",
    cancelRecTitle: "Отменить запись",
    finishRecTitle: "Завершить запись",
    discardVoiceTitle: "Удалить голосовое",
    sendVoiceTitle: "Отправить голосовое",
    errImageOnly: "Поддерживаются только изображения или видео.",
    errAttachSize: "Вложение не больше 20 МБ.",
    modalNewChat: "Новый чат",
    modalCloseComposer: "Закрыть новый чат",
    modalChatType: "Тип чата",
    modalDirect: "Личный",
    modalGroup: "Группа",
    modalGroupNamePh: "Название группы (необязательно)…",
    modalSearchUsersPh: "Поиск пользователей…",
    modalNoPeople: "Пользователи не найдены",
    modalCreating: "Создание…",
    couldNotStartChat: "Не удалось начать чат.",
    voicePlay: "Воспроизвести",
    voicePause: "Пауза",
    userBlockedToast: "Пользователь заблокирован.",
  }),
};

const REPLY_EN = "You replied to {name}";
const REPLY_MN = "Та {name}-д хариулсан";
const REPLY_ZH = "你回复了 {name}";
const REPLY_JA = "{name} に返信しました";
const REPLY_KO = "{name}님에게 답장";
const REPLY_DE = "Sie haben {name} geantwortet";
const REPLY_RU = "Вы ответили {name}";

const THEY_EN = "{name} replied to you";
const THEY_MN = "{name} танд хариулсан";
const THEY_ZH = "{name} 回复了你";
const THEY_JA = "{name} があなたに返信しました";
const THEY_KO = "{name}님이 답장함";
const THEY_DE = "{name} hat Ihnen geantwortet";
const THEY_RU = "{name} ответил(а) вам";

const REPLY_TO: Record<AppLanguage, string> = {
  en: REPLY_EN,
  mn: REPLY_MN,
  zh: REPLY_ZH,
  ja: REPLY_JA,
  ko: REPLY_KO,
  de: REPLY_DE,
  ru: REPLY_RU,
};

const THEY_REPLY: Record<AppLanguage, string> = {
  en: THEY_EN,
  mn: THEY_MN,
  zh: THEY_ZH,
  ja: THEY_JA,
  ko: THEY_KO,
  de: THEY_DE,
  ru: THEY_RU,
};

const MEMBERS: Record<AppLanguage, (n: number) => string> = {
  en: (n) => `${n} members`,
  mn: (n) => `${n} гишүүн`,
  zh: (n) => `${n} 位成员`,
  ja: (n) => `${n} 人のメンバー`,
  ko: (n) => `멤버 ${n}명`,
  de: (n) => `${n} Mitglieder`,
  ru: (n) => `${n} участников`,
};

const BLOCK_FMT: Record<AppLanguage, (u: string) => string> = {
  en: (u) => `Block @${u}`,
  mn: (u) => `@${u}-г хаах`,
  zh: (u) => `屏蔽 @${u}`,
  ja: (u) => `@${u} をブロック`,
  ko: (u) => `@${u} 차단`,
  de: (u) => `@${u} blockieren`,
  ru: (u) => `Заблокировать @${u}`,
};

const BLOCK_CONFIRM: Record<AppLanguage, (u: string) => string> = {
  en: (u) => `Block @${u}?`,
  mn: (u) => `@${u}-г хаах уу?`,
  zh: (u) => `屏蔽 @${u}？`,
  ja: (u) => `@${u} をブロックしますか？`,
  ko: (u) => `@${u}님을 차단할까요?`,
  de: (u) => `@${u} blockieren?`,
  ru: (u) => `Заблокировать @${u}?`,
};

const CREATE_GROUP: Record<AppLanguage, (n: number) => string> = {
  en: (n) => `Create group (${n})`,
  mn: (n) => `Бүлэг үүсгэх (${n})`,
  zh: (n) => `创建群组 (${n})`,
  ja: (n) => `グループを作成 (${n})`,
  ko: (n) => `그룹 만들기 (${n})`,
  de: (n) => `Gruppe erstellen (${n})`,
  ru: (n) => `Создать группу (${n})`,
};

export function messagesScreenStrings(lang: AppLanguage): MessagesScreenStrings {
  const raw = RAW[lang];
  const ty = TYPING[lang];
  return {
    ...raw,
    membersCount: MEMBERS[lang],
    blockUserFmt: BLOCK_FMT[lang],
    blockUserConfirmFmt: BLOCK_CONFIRM[lang],
    modalCreateGroupFmt: CREATE_GROUP[lang],
    bubbleYouReplied: (name: string) => REPLY_TO[lang].replace("{name}", name),
    bubbleTheyReplied: (name: string) => THEY_REPLY[lang].replace("{name}", name),
    typingLine: (peers) => {
      const first = peers[0];
      const second = peers[1];
      if (!first) return "";
      if (peers.length === 1) return ty.one.replace("{name}", first.displayName);
      if (peers.length === 2 && second) {
        return ty.two.replace("{a}", first.displayName).replace("{b}", second.displayName);
      }
      return ty.many.replace("{a}", first.displayName).replace("{n}", String(peers.length - 1));
    },
  };
}

const TIME_UNITS: Record<AppLanguage, { now: string; min: string; hr: string; day: string }> = {
  en: { now: "Now", min: "m", hr: "h", day: "d" },
  mn: { now: "Одоо", min: "м", hr: "ц", day: "ө" },
  zh: { now: "刚刚", min: "分", hr: "小时", day: "天" },
  ja: { now: "たった今", min: "分", hr: "時間", day: "日" },
  ko: { now: "방금", min: "분", hr: "시간", day: "일" },
  de: { now: "Jetzt", min: "m", hr: "Std", day: "T" },
  ru: { now: "Сейчас", min: "м", hr: "ч", day: "д" },
};

/** Compact time for sidebar list (e.g. 3m, 2ч). */
export function messagesScreenTimeAgo(iso: string, lang: AppLanguage): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const u = TIME_UNITS[lang];
  if (!Number.isFinite(s) || s < 0) return u.now;
  if (s < 60) return u.now;
  if (s < 3600) return `${Math.floor(s / 60)}${u.min}`;
  if (s < 86400) return `${Math.floor(s / 3600)}${u.hr}`;
  return `${Math.floor(s / 86400)}${u.day}`;
}

const LAST_SEEN: Record<
  AppLanguage,
  { recent: string; justNow: string; minAgo: (m: number) => string; hrAgo: (h: number) => string; dayAgo: (d: number) => string }
> = {
  en: {
    recent: "recently",
    justNow: "just now",
    minAgo: (m) => `${m}m ago`,
    hrAgo: (h) => `${h}h ago`,
    dayAgo: (d) => `${d}d ago`,
  },
  mn: {
    recent: "саяхан",
    justNow: "сая",
    minAgo: (m) => `${m} мин өмнө`,
    hrAgo: (h) => `${h} ц өмнө`,
    dayAgo: (d) => `${d} ө өмнө`,
  },
  zh: {
    recent: "最近",
    justNow: "刚刚",
    minAgo: (m) => `${m} 分钟前`,
    hrAgo: (h) => `${h} 小时前`,
    dayAgo: (d) => `${d} 天前`,
  },
  ja: {
    recent: "最近",
    justNow: "たった今",
    minAgo: (m) => `${m} 分前`,
    hrAgo: (h) => `${h} 時間前`,
    dayAgo: (d) => `${d} 日前`,
  },
  ko: {
    recent: "최근",
    justNow: "방금",
    minAgo: (m) => `${m}분 전`,
    hrAgo: (h) => `${h}시간 전`,
    dayAgo: (d) => `${d}일 전`,
  },
  de: {
    recent: "kürzlich",
    justNow: "gerade eben",
    minAgo: (m) => `vor ${m} Min`,
    hrAgo: (h) => `vor ${h} Std`,
    dayAgo: (d) => `vor ${d} T`,
  },
  ru: {
    recent: "недавно",
    justNow: "только что",
    minAgo: (m) => `${m} мин назад`,
    hrAgo: (h) => `${h} ч назад`,
    dayAgo: (d) => `${d} дн назад`,
  },
};

/** Relative time under chat header (last seen). */
export function messagesScreenLastSeen(iso: string, lang: AppLanguage): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  const L = LAST_SEEN[lang];
  if (!Number.isFinite(elapsed) || elapsed < 0) return L.recent;
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return L.justNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return L.minAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return L.hrAgo(hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return L.dayAgo(days);
  return new Date(iso).toLocaleDateString(localeForLanguage(lang));
}
