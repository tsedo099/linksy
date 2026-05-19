export type CreateStrings = {
  headerLoading: string;
  headerEditing: string;
  headerNew: string;
  goBack: string;
  dropMedia: string;
  dropMediaSub: string;
  dropMediaNote: string;
  remove: string;
  addMedia: string;
  addLabel: string;
  captionPlaceholder: string;
  altLabel: (active: number, total: number) => string;
  altOptional: string;
  altPlaceholder: string;
  locPlaceholder: string;
  locAria: string;
  tagPeople: string;
  tagged: string;
  tagSearchPlaceholder: string;
  tagSearchEmpty: string;
  tagSearching: string;
  tagNoResults: string;
  removeUserFmt: (username: string) => string;
  scheduleLabel: string;
  scheduleAria: string;
  scheduleClear: string;
  scheduleHint: string;
  album: string;
  albumAria: string;
  noAlbum: string;
  newAlbum: string;
  albumTitle: string;
  allowComments: string;
  allowCommentsOn: string;
  allowCommentsOff: string;
  reviewComments: string;
  reviewOn: string;
  reviewOff: string;
  reviewNeedComments: string;
  hideLikes: string;
  hideLikesOn: string;
  hideLikesOff: string;
  metaFiles: (n: number, label: string) => string;
  metaTextPost: string;
  metaNoMedia: string;
  savingDraft: string;
  saveDraft: string;
  publishing: string;
  publishPost: string;
  flashCantSelfTag: string;
  flashMaxTags: string;
  flashOnlyMedia: string;
  flashDraftSaved: string;
  flashScheduled: string;
  flashPosted: string;
  flashGeneric: string;
};

export const CS_STRINGS: { en: CreateStrings; mn: CreateStrings } = {
  en: {
    headerLoading: "Loading draft…",
    headerEditing: "Edit draft",
    headerNew: "New post",
    goBack: "Go back",
    dropMedia: "Drop media here",
    dropMediaSub: "or click to browse files",
    dropMediaNote: "JPG · PNG · MP4 · up to 20 MB",
    remove: "Remove",
    addMedia: "Add media",
    addLabel: "Add",
    captionPlaceholder: "Write your caption…",
    altLabel: (active: number, total: number) => `Media description ${active} of ${total}`,
    altOptional: "(optional — helps screen readers)",
    altPlaceholder: "Optional: what's in this photo or video…",
    locPlaceholder: "Search location",
    locAria: "Post location",
    tagPeople: "Tag people",
    tagged: "Tagged co-authors",
    tagSearchPlaceholder: "Search by username",
    tagSearchEmpty: "Search people to tag as co-authors.",
    tagSearching: "Searching...",
    tagNoResults: "No available users found.",
    removeUserFmt: (username: string) => `Remove ${username}`,
    scheduleLabel: "Schedule (optional)",
    scheduleAria: "Schedule publish time",
    scheduleClear: "Clear",
    scheduleHint: "Leave empty to publish immediately. Posts publish at the chosen time in your timezone.",
    album: "Album",
    albumAria: "Add to album",
    noAlbum: "No album",
    newAlbum: "New album…",
    albumTitle: "Album title",
    allowComments: "Allow comments",
    allowCommentsOn: "Anyone can comment",
    allowCommentsOff: "Comments off",
    reviewComments: "Review comments first",
    reviewOn: "You approve before they appear publicly",
    reviewOff: "Comments publish immediately",
    reviewNeedComments: "Turn on comments to use moderation",
    hideLikes: "Hide like count",
    hideLikesOn: "Only you see the count",
    hideLikesOff: "Visible to everyone",
    metaFiles: (n: number, label: string) => `${n} file${n > 1 ? "s" : ""} · ${label}`,
    metaTextPost: "Text post",
    metaNoMedia: "No media yet",
    savingDraft: "Saving…",
    saveDraft: "Save draft",
    publishing: "Publishing…",
    publishPost: "Publish post",
    flashCantSelfTag: "You cannot tag yourself as a co-author.",
    flashMaxTags: "You can tag up to 5 co-authors.",
    flashOnlyMedia: "Only image and video files are supported.",
    flashDraftSaved: "Draft saved.",
    flashScheduled: "Scheduled — we'll publish it for you.",
    flashPosted: "Posted! 🎉",
    flashGeneric: "Could not publish this post.",
  },
  mn: {
    headerLoading: "Ноорог ачаалж байна…",
    headerEditing: "Ноорог засах",
    headerNew: "Шинэ пост",
    goBack: "Буцах",
    dropMedia: "Медиаг энд оруулна уу",
    dropMediaSub: "эсвэл дарж файл сонгох",
    dropMediaNote: "JPG · PNG · MP4 · хамгийн ихдээ 20 MB",
    remove: "Хасах",
    addMedia: "Медиа нэмэх",
    addLabel: "Нэмэх",
    captionPlaceholder: "Тайлбар бичих…",
    altLabel: (active: number, total: number) => `Медиа тайлбар ${active} / ${total}`,
    altOptional: "(заавал биш — screen reader-д тус болно)",
    altPlaceholder: "Заавал биш: энэ зураг/видеон дээр юу байна вэ…",
    locPlaceholder: "Байршил хайх",
    locAria: "Постын байршил",
    tagPeople: "Хүн tag хийх",
    tagged: "Tag-сан хамтрагчид",
    tagSearchPlaceholder: "Username-ээр хайх",
    tagSearchEmpty: "Хамтрагчаар tag хийх хүнийг хайна уу.",
    tagSearching: "Хайж байна...",
    tagNoResults: "Тохирох хэрэглэгч олдсонгүй.",
    removeUserFmt: (username: string) => `${username}-ийг хасах`,
    scheduleLabel: "Хуваарь (заавал биш)",
    scheduleAria: "Нийтлэх цаг товлох",
    scheduleClear: "Арилгах",
    scheduleHint: "Хоосон үлдээвэл шууд нийтэлнэ. Сонгосон цагт таны timezone-р нийтэлнэ.",
    album: "Цомог",
    albumAria: "Цомогт нэмэх",
    noAlbum: "Цомоггүй",
    newAlbum: "Шинэ цомог…",
    albumTitle: "Цомгийн нэр",
    allowComments: "Сэтгэгдэл зөвшөөрөх",
    allowCommentsOn: "Хэн ч сэтгэгдэл бичиж болно",
    allowCommentsOff: "Сэтгэгдэл хаалттай",
    reviewComments: "Сэтгэгдэл шалгаад нийтлэх",
    reviewOn: "Та өөрөө зөвшөөрснийх нь дараа л харагдана",
    reviewOff: "Сэтгэгдэл шууд нийтлэгдэнэ",
    reviewNeedComments: "Сэтгэгдлийг асаагаад модерац ашиглана",
    hideLikes: "Likes тоог нуух",
    hideLikesOn: "Зөвхөн та тоог харна",
    hideLikesOff: "Бүгдэд харагдана",
    metaFiles: (n: number, label: string) => `${n} файл · ${label}`,
    metaTextPost: "Текст пост",
    metaNoMedia: "Медиа алга",
    savingDraft: "Хадгалж байна…",
    saveDraft: "Ноорог хадгалах",
    publishing: "Нийтэлж байна…",
    publishPost: "Нийтлэх",
    flashCantSelfTag: "Та өөрийгөө хамтрагчаар tag хийх боломжгүй.",
    flashMaxTags: "Хамгийн ихдээ 5 хамтрагч tag хийнэ.",
    flashOnlyMedia: "Зөвхөн зураг, видео файл дэмжинэ.",
    flashDraftSaved: "Ноорог хадгалагдлаа.",
    flashScheduled: "Товлоо — товлосон цагт нийтлэгдэнэ.",
    flashPosted: "Нийтэллээ! 🎉",
    flashGeneric: "Энэ постыг нийтэлж чадсангүй.",
  },
};
