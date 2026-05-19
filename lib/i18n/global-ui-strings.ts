import type { AppLanguage } from "@/lib/language";

/** Chrome / fullpage shell nav `key` → label */
export type ShellNavKey =
  | "home"
  | "msgs"
  | "notifs"
  | "create"
  | "profile"
  | "search"
  | "ranking"
  | "dashboard"
  | "settings"
  | "saved"
  | "drafts"
  | "ai";

const NAV: Record<AppLanguage, Record<ShellNavKey, string>> = {
  en: {
    home: "Home",
    msgs: "Messages",
    notifs: "Notifications",
    create: "Create",
    profile: "Profile",
    search: "Search",
    ranking: "Ranking",
    dashboard: "Dashboard",
    settings: "Settings",
    saved: "Saved",
    drafts: "Drafts",
    ai: "AI",
  },
  mn: {
    home: "Нүүр",
    msgs: "Зурвас",
    notifs: "Мэдэгдэл",
    create: "Үүсгэх",
    profile: "Профайл",
    search: "Хайх",
    ranking: "Эрэмбэ",
    dashboard: "Самбар",
    settings: "Тохиргоо",
    saved: "Хадгалсан",
    drafts: "Ноорог",
    ai: "AI",
  },
  zh: {
    home: "首页",
    msgs: "消息",
    notifs: "通知",
    create: "创建",
    profile: "个人主页",
    search: "搜索",
    ranking: "排行榜",
    dashboard: "控制台",
    settings: "设置",
    saved: "收藏",
    drafts: "草稿",
    ai: "AI",
  },
  ja: {
    home: "ホーム",
    msgs: "メッセージ",
    notifs: "通知",
    create: "作成",
    profile: "プロフィール",
    search: "検索",
    ranking: "ランキング",
    dashboard: "ダッシュボード",
    settings: "設定",
    saved: "保存済み",
    drafts: "下書き",
    ai: "AI",
  },
  ko: {
    home: "홈",
    msgs: "메시지",
    notifs: "알림",
    create: "만들기",
    profile: "프로필",
    search: "검색",
    ranking: "랭킹",
    dashboard: "대시보드",
    settings: "설정",
    saved: "저장됨",
    drafts: "임시보관",
    ai: "AI",
  },
  de: {
    home: "Start",
    msgs: "Nachrichten",
    notifs: "Benachrichtigungen",
    create: "Erstellen",
    profile: "Profil",
    search: "Suche",
    ranking: "Rangliste",
    dashboard: "Dashboard",
    settings: "Einstellungen",
    saved: "Gespeichert",
    drafts: "Entwürfe",
    ai: "KI",
  },
  ru: {
    home: "Главная",
    msgs: "Сообщения",
    notifs: "Уведомления",
    create: "Создать",
    profile: "Профиль",
    search: "Поиск",
    ranking: "Рейтинг",
    dashboard: "Панель",
    settings: "Настройки",
    saved: "Сохранённое",
    drafts: "Черновики",
    ai: "ИИ",
  },
};

export function shellNavLabel(key: string, lang: AppLanguage): string {
  const row = NAV[lang] ?? NAV.en;
  return (row as Record<string, string>)[key] ?? NAV.en[key as ShellNavKey] ?? key;
}

export type AuthUiStrings = {
  oauthState: string;
  oauthGoogle: string;
  oauthEmail: string;
  accountClosed: string;
  oauthMismatch: string;
  googleNotConfigured: string;
  google2fa: string;
  signInFailed: string;
  somethingWrong: string;
  connectionFailed: string;
  totpInvalid: string;
  couldNotVerify: string;
  brandTitle: string;
  tagline1: string;
  tagline2: string;
  tagline3: string;
  tagline4: string;
  welcomeBack: string;
  twoFactorTitle: string;
  twoFactorSub: string;
  authCodeLabel: string;
  authCodePh: string;
  verifying: string;
  verify: string;
  differentAccount: string;
  emailLabel: string;
  emailPh: string;
  passwordLabel: string;
  forgot: string;
  passwordPh: string;
  showPassword: string;
  hidePassword: string;
  signingIn: string;
  signIn: string;
  orContinue: string;
  google: string;
  apple: string;
  newTo: string;
  createAccount: string;
  registerTitle: string;
  displayNameLabel: string;
  displayNamePh: string;
  usernameLabel: string;
  usernamePh: string;
  emailAddressLabel: string;
  creatingAccount: string;
  signUp: string;
  alreadyHave: string;
  signInLink: string;
  /** Sign-up demographic fields (added 2026-05). Optional so older locales fall back to English. */
  birthDateLabel?: string;
  genderLabel?: string;
  genderFemale?: string;
  genderMale?: string;
  genderNonBinary?: string;
  genderUndisclosed?: string;
};

const AUTH: Record<AppLanguage, AuthUiStrings> = {
  en: {
    oauthState: "Sign-in expired. Please try Google again.",
    oauthGoogle: "Google sign-in failed. Try again.",
    oauthEmail: "Google did not share a verified email for this account.",
    accountClosed: "This account is closed.",
    oauthMismatch: "This Google account does not match our records.",
    googleNotConfigured: "Google sign-in is not enabled on this server.",
    google2fa:
      "This account has two-factor authentication. Sign in with your email and password, then enter your authenticator code.",
    signInFailed: "Sign-in failed. Try again.",
    somethingWrong: "Something went wrong.",
    connectionFailed: "Connection failed. Please try again.",
    totpInvalid: "Enter a 6-digit authenticator code or a backup code.",
    couldNotVerify: "Could not verify the code.",
    brandTitle: "Linksy",
    tagline1: "Where you truly belong.",
    tagline2: "Stay close to your people.",
    tagline3: "Feel closer, every day.",
    tagline4: "Your people, your space.",
    welcomeBack: "Welcome back",
    twoFactorTitle: "Two-factor code",
    twoFactorSub: "Enter the 6-digit code from your authenticator app or use a backup code.",
    authCodeLabel: "Authentication code",
    authCodePh: "123456 or ABCDE-FGHIJ",
    verifying: "Verifying...",
    verify: "Verify",
    differentAccount: "Use a different account",
    emailLabel: "Email or username",
    emailPh: "name@example.com or munkh_zul",
    passwordLabel: "Password",
    forgot: "Forgot?",
    passwordPh: "At least 8 characters",
    showPassword: "Show password",
    hidePassword: "Hide password",
    signingIn: "Signing in...",
    signIn: "Sign in",
    orContinue: "Or continue with",
    google: "Google",
    apple: "Apple",
    newTo: "New to Linksy?",
    createAccount: "Create account",
    registerTitle: "Create account",
    displayNameLabel: "Display name",
    displayNamePh: "Bat-Erdene",
    usernameLabel: "Username",
    usernamePh: "bat.erdene",
    emailAddressLabel: "Email address",
    creatingAccount: "Creating account...",
    signUp: "Sign up",
    alreadyHave: "Already have an account?",
    signInLink: "Sign in",
    birthDateLabel: "Date of birth",
    genderLabel: "Gender",
    genderFemale: "Female",
    genderMale: "Male",
    genderNonBinary: "Non-binary",
    genderUndisclosed: "Prefer not to say",
  },
  mn: {
    oauthState: "Нэвтрэх хугацаа дууссан. Google-аа дахин оролдоно уу.",
    oauthGoogle: "Google нэвтрэлт амжилтгүй. Дахин оролдоно уу.",
    oauthEmail: "Google баталгаажсан и-мэйл хуваалцаагүй байна.",
    accountClosed: "Энэ бүртгэл хаагдсан.",
    oauthMismatch: "Энэ Google бүртгэл манай өгөгдөлтэй таарахгүй байна.",
    googleNotConfigured: "Энэ сервер дээр Google нэвтрэлт идэвхгүй.",
    google2fa:
      "Энэ бүртгэлд 2FA идэвхтэй. И-мэйл, нууц үгээр нэвтэрч, дараа нь authenticator кодоо оруулна уу.",
    signInFailed: "Нэвтрэлт амжилтгүй. Дахин оролдоно уу.",
    somethingWrong: "Алдаа гарлаа.",
    connectionFailed: "Холболт амжилтгүй. Дахин оролдоно уу.",
    totpInvalid: "6 оронтой код эсвэл нөөц код оруулна уу.",
    couldNotVerify: "Код баталгаажсангүй.",
    brandTitle: "Linksy",
    tagline1: "Танд үнэхээр зориулсан газар.",
    tagline2: "Хүмүүстэйгээ ойр бай.",
    tagline3: "Өдөр бүр илүү ойр.",
    tagline4: "Таны орон зай, таны хүмүүс.",
    welcomeBack: "Дахин тавтай морил",
    twoFactorTitle: "Хоёр алхамын баталгаа",
    twoFactorSub: "Authenticator аппаас 6 оронтой код эсвэл нөөц код оруулна уу.",
    authCodeLabel: "Баталгаажуулах код",
    authCodePh: "123456 эсвэл нөөц код",
    verifying: "Шалгаж байна...",
    verify: "Баталгаажуулах",
    differentAccount: "Өөр бүртгэл ашиглах",
    emailLabel: "И-мэйл эсвэл хэрэглэгчийн нэр",
    emailPh: "name@example.com эсвэл ner",
    passwordLabel: "Нууц үг",
    forgot: "Мартсан?",
    passwordPh: "Хамгийн багадаа 8 тэмдэгт",
    showPassword: "Нууц үгийг харуулах",
    hidePassword: "Нууц үгийг нуух",
    signingIn: "Нэвтэрч байна...",
    signIn: "Нэвтрэх",
    orContinue: "Эсвэл үргэлжлүүлэх",
    google: "Google",
    apple: "Apple",
    newTo: "Linksy-д шинэ үү?",
    createAccount: "Бүртгэл үүсгэх",
    registerTitle: "Бүртгэл үүсгэх",
    displayNameLabel: "Дэлгэцийн нэр",
    displayNamePh: "Бат-Эрдэнэ",
    usernameLabel: "Хэрэглэгчийн нэр",
    usernamePh: "bat.erdene",
    emailAddressLabel: "И-мэйл хаяг",
    creatingAccount: "Бүртгэл үүсгэж байна...",
    signUp: "Бүртгүүлэх",
    alreadyHave: "Бүртгэлтэй юу?",
    signInLink: "Нэвтрэх",
    birthDateLabel: "Төрсөн өдөр",
    genderLabel: "Хүйс",
    genderFemale: "Эмэгтэй",
    genderMale: "Эрэгтэй",
    genderNonBinary: "Бусад",
    genderUndisclosed: "Хэлэхгүй",
  },
  zh: {
    oauthState: "登录已过期，请重试 Google。",
    oauthGoogle: "Google 登录失败，请重试。",
    oauthEmail: "Google 未提供此账号的已验证邮箱。",
    accountClosed: "此账号已关闭。",
    oauthMismatch: "此 Google 账号与我们的记录不匹配。",
    googleNotConfigured: "此服务器未启用 Google 登录。",
    google2fa: "此账号已开启两步验证。请先用邮箱和密码登录，然后输入验证码。",
    signInFailed: "登录失败，请重试。",
    somethingWrong: "出错了。",
    connectionFailed: "连接失败，请重试。",
    totpInvalid: "请输入 6 位验证码或备用码。",
    couldNotVerify: "无法验证代码。",
    brandTitle: "Linksy",
    tagline1: "真正属于你的地方。",
    tagline2: "与重要的人保持亲密。",
    tagline3: "每天都更贴近。",
    tagline4: "你的空间，你的人。",
    welcomeBack: "欢迎回来",
    twoFactorTitle: "两步验证码",
    twoFactorSub: "请输入身份验证器中的 6 位代码或备用代码。",
    authCodeLabel: "验证码",
    authCodePh: "123456 或备用码",
    verifying: "验证中...",
    verify: "验证",
    differentAccount: "使用其他账号",
    emailLabel: "邮箱或用户名",
    emailPh: "name@example.com 或用户名",
    passwordLabel: "密码",
    forgot: "忘记密码？",
    passwordPh: "至少 8 个字符",
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
    signingIn: "登录中...",
    signIn: "登录",
    orContinue: "或使用以下方式继续",
    google: "Google",
    apple: "Apple",
    newTo: "第一次使用 Linksy？",
    createAccount: "创建账号",
    registerTitle: "创建账号",
    displayNameLabel: "显示名称",
    displayNamePh: "张三",
    usernameLabel: "用户名",
    usernamePh: "zhang.san",
    emailAddressLabel: "电子邮箱",
    creatingAccount: "创建账号中...",
    signUp: "注册",
    alreadyHave: "已有账号？",
    signInLink: "登录",
  },
  ja: {
    oauthState: "ログインの有効期限が切れました。Googleでもう一度お試しください。",
    oauthGoogle: "Googleログインに失敗しました。もう一度お試しください。",
    oauthEmail: "Googleがこのアカウントの確認済みメールを共有しませんでした。",
    accountClosed: "このアカウントは閉鎖されています。",
    oauthMismatch: "このGoogleアカウントは記録と一致しません。",
    googleNotConfigured: "このサーバーではGoogleログインが有効になっていません。",
    google2fa: "このアカウントは二要素認証が有効です。メールとパスワードでサインインし、認証コードを入力してください。",
    signInFailed: "サインインに失敗しました。",
    somethingWrong: "問題が発生しました。",
    connectionFailed: "接続に失敗しました。",
    totpInvalid: "6桁のコードまたはバックアップコードを入力してください。",
    couldNotVerify: "コードを確認できませんでした。",
    brandTitle: "Linksy",
    tagline1: "本当に自分らしい場所。",
    tagline2: "大切な人と近くに。",
    tagline3: "毎日、もっと近くに。",
    tagline4: "あなたの空間、あなたの仲間。",
    welcomeBack: "おかえりなさい",
    twoFactorTitle: "二要素認証コード",
    twoFactorSub: "認証アプリの6桁のコードまたはバックアップコードを入力してください。",
    authCodeLabel: "認証コード",
    authCodePh: "123456 またはバックアップコード",
    verifying: "確認中...",
    verify: "確認",
    differentAccount: "別のアカウントを使う",
    emailLabel: "メールまたはユーザー名",
    emailPh: "name@example.com またはユーザー名",
    passwordLabel: "パスワード",
    forgot: "忘れた場合",
    passwordPh: "8文字以上",
    showPassword: "パスワードを表示",
    hidePassword: "パスワードを非表示",
    signingIn: "サインイン中...",
    signIn: "サインイン",
    orContinue: "または次で続行",
    google: "Google",
    apple: "Apple",
    newTo: "はじめてですか？",
    createAccount: "アカウント作成",
    registerTitle: "アカウント作成",
    displayNameLabel: "表示名",
    displayNamePh: "山田太郎",
    usernameLabel: "ユーザー名",
    usernamePh: "yamada",
    emailAddressLabel: "メールアドレス",
    creatingAccount: "作成中...",
    signUp: "登録",
    alreadyHave: "すでにアカウントをお持ちですか？",
    signInLink: "サインイン",
  },
  ko: {
    oauthState: "로그인이 만료되었습니다. Google로 다시 시도하세요.",
    oauthGoogle: "Google 로그인에 실패했습니다. 다시 시도하세요.",
    oauthEmail: "Google이 이 계정의 확인된 이메일을 제공하지 않았습니다.",
    accountClosed: "이 계정은 종료되었습니다.",
    oauthMismatch: "이 Google 계정은 기록과 일치하지 않습니다.",
    googleNotConfigured: "이 서버에서 Google 로그인이 비활성화되어 있습니다.",
    google2fa: "이 계정은 2단계 인증이 켜져 있습니다. 이메일과 비밀번호로 로그인한 뒤 인증 코드를 입력하세요.",
    signInFailed: "로그인에 실패했습니다.",
    somethingWrong: "문제가 발생했습니다.",
    connectionFailed: "연결에 실패했습니다.",
    totpInvalid: "6자리 코드 또는 백업 코드를 입력하세요.",
    couldNotVerify: "코드를 확인할 수 없습니다.",
    brandTitle: "Linksy",
    tagline1: "당신에게 진짜 맞는 곳.",
    tagline2: "소중한 사람들과 가깝게.",
    tagline3: "매일 더 가까이.",
    tagline4: "당신의 공간, 당신의 사람들.",
    welcomeBack: "다시 오신 것을 환영합니다",
    twoFactorTitle: "2단계 인증 코드",
    twoFactorSub: "인증 앱의 6자리 코드 또는 백업 코드를 입력하세요.",
    authCodeLabel: "인증 코드",
    authCodePh: "123456 또는 백업 코드",
    verifying: "확인 중...",
    verify: "확인",
    differentAccount: "다른 계정 사용",
    emailLabel: "이메일 또는 사용자 이름",
    emailPh: "name@example.com 또는 사용자 이름",
    passwordLabel: "비밀번호",
    forgot: "잊으셨나요?",
    passwordPh: "8자 이상",
    showPassword: "비밀번호 표시",
    hidePassword: "비밀번호 숨기기",
    signingIn: "로그인 중...",
    signIn: "로그인",
    orContinue: "또는 다음으로 계속",
    google: "Google",
    apple: "Apple",
    newTo: "Linksy가 처음이신가요?",
    createAccount: "계정 만들기",
    registerTitle: "계정 만들기",
    displayNameLabel: "표시 이름",
    displayNamePh: "홍길동",
    usernameLabel: "사용자 이름",
    usernamePh: "hong.gildong",
    emailAddressLabel: "이메일",
    creatingAccount: "계정 생성 중...",
    signUp: "가입",
    alreadyHave: "이미 계정이 있나요?",
    signInLink: "로그인",
  },
  de: {
    oauthState: "Anmeldung abgelaufen. Bitte erneut mit Google versuchen.",
    oauthGoogle: "Google-Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
    oauthEmail: "Google hat keine bestätigte E-Mail für dieses Konto geteilt.",
    accountClosed: "Dieses Konto ist geschlossen.",
    oauthMismatch: "Dieses Google-Konto passt nicht zu unseren Daten.",
    googleNotConfigured: "Google-Anmeldung ist auf diesem Server nicht aktiviert.",
    google2fa:
      "Für dieses Konto ist die Zwei-Faktor-Authentifizierung aktiv. Melden Sie sich mit E-Mail und Passwort an und geben Sie dann den Authenticator-Code ein.",
    signInFailed: "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
    somethingWrong: "Etwas ist schiefgelaufen.",
    connectionFailed: "Verbindung fehlgeschlagen. Bitte erneut versuchen.",
    totpInvalid: "Geben Sie einen 6-stelligen Code oder einen Backup-Code ein.",
    couldNotVerify: "Code konnte nicht bestätigt werden.",
    brandTitle: "Linksy",
    tagline1: "Wo Sie wirklich hingehören.",
    tagline2: "Bleiben Sie Ihren Menschen nah.",
    tagline3: "Jeden Tag ein Stück näher.",
    tagline4: "Ihr Raum, Ihre Menschen.",
    welcomeBack: "Willkommen zurück",
    twoFactorTitle: "Zwei-Faktor-Code",
    twoFactorSub: "Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App oder einen Backup-Code ein.",
    authCodeLabel: "Authentifizierungscode",
    authCodePh: "123456 oder Backup-Code",
    verifying: "Wird geprüft...",
    verify: "Bestätigen",
    differentAccount: "Anderes Konto verwenden",
    emailLabel: "E-Mail oder Benutzername",
    emailPh: "name@example.com oder benutzername",
    passwordLabel: "Passwort",
    forgot: "Vergessen?",
    passwordPh: "Mindestens 8 Zeichen",
    showPassword: "Passwort anzeigen",
    hidePassword: "Passwort verbergen",
    signingIn: "Wird angemeldet...",
    signIn: "Anmelden",
    orContinue: "Oder fortfahren mit",
    google: "Google",
    apple: "Apple",
    newTo: "Neu bei Linksy?",
    createAccount: "Konto erstellen",
    registerTitle: "Konto erstellen",
    displayNameLabel: "Anzeigename",
    displayNamePh: "Max Mustermann",
    usernameLabel: "Benutzername",
    usernamePh: "max.mustermann",
    emailAddressLabel: "E-Mail-Adresse",
    creatingAccount: "Konto wird erstellt...",
    signUp: "Registrieren",
    alreadyHave: "Schon ein Konto?",
    signInLink: "Anmelden",
  },
  ru: {
    oauthState: "Вход устарел. Попробуйте снова через Google.",
    oauthGoogle: "Вход через Google не удался. Попробуйте снова.",
    oauthEmail: "Google не предоставил подтверждённую почту для этого аккаунта.",
    accountClosed: "Этот аккаунт закрыт.",
    oauthMismatch: "Этот аккаунт Google не совпадает с нашими данными.",
    googleNotConfigured: "Вход через Google на этом сервере не включён.",
    google2fa:
      "Для аккаунта включена двухфакторная аутентификация. Войдите по почте и паролю, затем введите код приложения.",
    signInFailed: "Не удалось войти. Попробуйте снова.",
    somethingWrong: "Что-то пошло не так.",
    connectionFailed: "Ошибка соединения. Попробуйте снова.",
    totpInvalid: "Введите 6-значный код или резервный код.",
    couldNotVerify: "Не удалось проверить код.",
    brandTitle: "Linksy",
    tagline1: "Место, где вы по-настоящему свои.",
    tagline2: "Будьте ближе к своим людям.",
    tagline3: "Каждый день ближе.",
    tagline4: "Ваше пространство, ваши люди.",
    welcomeBack: "С возвращением",
    twoFactorTitle: "Код двухфакторной защиты",
    twoFactorSub: "Введите 6-значный код из приложения-аутентификатора или резервный код.",
    authCodeLabel: "Код аутентификации",
    authCodePh: "123456 или резервный код",
    verifying: "Проверка...",
    verify: "Подтвердить",
    differentAccount: "Другой аккаунт",
    emailLabel: "Почта или имя пользователя",
    emailPh: "name@example.com или имя",
    passwordLabel: "Пароль",
    forgot: "Забыли?",
    passwordPh: "Не менее 8 символов",
    showPassword: "Показать пароль",
    hidePassword: "Скрыть пароль",
    signingIn: "Вход...",
    signIn: "Войти",
    orContinue: "Или продолжить с",
    google: "Google",
    apple: "Apple",
    newTo: "Впервые в Linksy?",
    createAccount: "Создать аккаунт",
    registerTitle: "Создать аккаунт",
    displayNameLabel: "Отображаемое имя",
    displayNamePh: "Иван Иванов",
    usernameLabel: "Имя пользователя",
    usernamePh: "ivan.ivanov",
    emailAddressLabel: "Адрес почты",
    creatingAccount: "Создание аккаунта...",
    signUp: "Зарегистрироваться",
    alreadyHave: "Уже есть аккаунт?",
    signInLink: "Войти",
  },
};

export function authUiStrings(lang: AppLanguage): AuthUiStrings {
  return AUTH[lang] ?? AUTH.en;
}

export type FeedChromeStrings = {
  ariaHome: string;
  customize: string;
  customizeDone: string;
  openMenu: string;
  closeMenu: string;
  ariaCollapseMenu: string;
  ariaKeepMenuOpen: string;
  eyebrowCreator: string;
  eyebrowFeed: string;
  titleHomeBase: string;
  filterForYou: string;
  filterFollowing: string;
  filterCloseCircle: string;
  filterCreator: string;
  storiesCreator: string;
  storiesDefault: string;
  emptyAllTitle: string;
  emptyAllSub: string;
  explore: string;
  findPeople: string;
  emptyFriendsTitle: string;
  emptyFriendsSub: string;
  emptyCloseTitle: string;
  emptyCloseSub: string;
  suggestedKicker: string;
  suggestedTitle: string;
  seeAll: string;
  loading: string;
  follow: string;
  unfollow: string;
  aiKicker: string;
  aiTitle: string;
  aiDesc: string;
  openAi: string;
  customizeHint: string;
  ariaSearch: string;
  ariaCloseSearch: string;
  ariaThemeSettings: string;
  ariaCloseTheme: string;
  /** Full settings drawer (profile shell) */
  ariaSettingsDrawer: string;
  ariaCloseSettingsDrawer: string;
  loadingComposer: string;
  registerTagline1: string;
  registerTagline2: string;
  registerTagline3: string;
  registerTagline4: string;
  passwordHintRegister: string;
};

const FEED: Record<AppLanguage, FeedChromeStrings> = {
  en: {
    ariaHome: "Home",
    customize: "Customize",
    customizeDone: "Done",
    openMenu: "Open Menu",
    closeMenu: "Close Menu",
    ariaCollapseMenu: "Collapse left menu",
    ariaKeepMenuOpen: "Keep left menu open",
    eyebrowCreator: "⚡ CREATOR MODE",
    eyebrowFeed: "ARCHITECT FEED",
    titleHomeBase: "HOME BASE",
    filterForYou: "FOR YOU",
    filterFollowing: "FOLLOWING",
    filterCloseCircle: "CLOSE CIRCLE",
    filterCreator: "⚡ CREATOR",
    storiesCreator: "⚡ Active stories",
    storiesDefault: "Stories",
    emptyAllTitle: "Your feed is quiet",
    emptyAllSub: "Follow people, post your first update, or explore trending content to fill your feed.",
    explore: "Explore",
    findPeople: "Find people to follow",
    emptyFriendsTitle: "Nothing here yet",
    emptyFriendsSub: "Follow people to see their posts here.",
    emptyCloseTitle: "Close Circle is empty",
    emptyCloseSub: "Add close friends to your circle to see their posts here.",
    suggestedKicker: "Suggested",
    suggestedTitle: "Architects",
    seeAll: "See all",
    loading: "Loading…",
    follow: "Follow",
    unfollow: "Unfollow",
    aiKicker: "AI Agent",
    aiTitle: "Quest Buddy",
    aiDesc: "Analyze your feed, draft replies, and surface mission-critical intel.",
    openAi: "Open AI Assistant",
    customizeHint: "Drag icons to rearrange or move between sidebars",
    ariaSearch: "Search",
    ariaCloseSearch: "Close search",
    ariaThemeSettings: "Theme settings",
    ariaCloseTheme: "Close theme settings",
    ariaSettingsDrawer: "Settings",
    ariaCloseSettingsDrawer: "Close settings",
    loadingComposer: "Loading composer",
    registerTagline1: "Stay close to your people.",
    registerTagline2: "Bring your circle together.",
    registerTagline3: "Feel closer every day.",
    registerTagline4: "Your space, your people.",
    passwordHintRegister: "8+ chars: upper, lower, number & symbol",
  },
  mn: {
    ariaHome: "Нүүр",
    customize: "Тохируулах",
    customizeDone: "Болсон",
    openMenu: "Цэс нээх",
    closeMenu: "Цэс хаах",
    ariaCollapseMenu: "Зүүн цэсийг хураах",
    ariaKeepMenuOpen: "Зүүн цэсийг нээлттэй байлгах",
    eyebrowCreator: "⚡ БҮТЭЭГЧ ГОРИМ",
    eyebrowFeed: "FEED",
    titleHomeBase: "ТАВ ТУЙЛ",
    filterForYou: "ТАНД",
    filterFollowing: "ДАГАСАН",
    filterCloseCircle: "ОЙРЫН ТҮҮВЭР",
    filterCreator: "⚡ БҮТЭЭГЧ",
    storiesCreator: "⚡ Идэвхтэй урсгал",
    storiesDefault: "Түүвэр",
    emptyAllTitle: "Таны тэнгэр тав тайван байна",
    emptyAllSub: "Хүмүүсийг дагаад, эхний постоо хийгээрэй эсвэл трендийг судлаарай.",
    explore: "Судлах",
    findPeople: "Дагах хүмүүс олох",
    emptyFriendsTitle: "Одоогоор хоосон",
    emptyFriendsSub: "Хүмүүсийг дагаад тэдний постыг энд харна.",
    emptyCloseTitle: "Ойрын тойрог хоосон",
    emptyCloseSub: "Ойрын найз нэмээд тэдний постыг энд харна.",
    suggestedKicker: "Санал болгох",
    suggestedTitle: "Хэрэглэгчид",
    seeAll: "Бүгдийг харах",
    loading: "Ачааллаж байна…",
    follow: "Дагах",
    unfollow: "Дагахаа болих",
    aiKicker: "AI агент",
    aiTitle: "Туслах",
    aiDesc: "Түгжээгээ шинжилж, хариулт бичих санаа өгнө.",
    openAi: "AI нээх",
    customizeHint: "Чирж байрлалыг өөрчилнө үү",
    ariaSearch: "Хайх",
    ariaCloseSearch: "Хайлт хаах",
    ariaThemeSettings: "Дүрэм тохиргоо",
    ariaCloseTheme: "Хаах",
    ariaSettingsDrawer: "Тохиргоо",
    ariaCloseSettingsDrawer: "Тохиргоог хаах",
    loadingComposer: "Бичигч ачаалж байна",
    registerTagline1: "Хүмүүстэйгээ ойр бай.",
    registerTagline2: "Тойргоо нэгтгэ.",
    registerTagline3: "Өдөр бүр ойрхон.",
    registerTagline4: "Таны зай, таны хүмүүс.",
    passwordHintRegister: "8+ тэмдэгт: том, жижиг, тоо & тэмдэг",
  },
  zh: {
    ariaHome: "首页",
    customize: "自定义",
    customizeDone: "完成",
    openMenu: "打开菜单",
    closeMenu: "关闭菜单",
    ariaCollapseMenu: "收起左侧菜单",
    ariaKeepMenuOpen: "保持左侧菜单展开",
    eyebrowCreator: "⚡ 创作者模式",
    eyebrowFeed: "动态",
    titleHomeBase: "主页",
    filterForYou: "推荐",
    filterFollowing: "关注",
    filterCloseCircle: "密友圈",
    filterCreator: "⚡ 创作者",
    storiesCreator: "⚡ 动态流",
    storiesDefault: "精选故事",
    emptyAllTitle: "动态还很安静",
    emptyAllSub: "关注用户、发布第一条动态或去探索热门内容。",
    explore: "探索",
    findPeople: "找人关注",
    emptyFriendsTitle: "这里还没有内容",
    emptyFriendsSub: "关注用户后即可在此查看他们的帖子。",
    emptyCloseTitle: "密友圈为空",
    emptyCloseSub: "添加密友后即可在此查看他们的帖子。",
    suggestedKicker: "推荐",
    suggestedTitle: "用户",
    seeAll: "查看全部",
    loading: "加载中…",
    follow: "关注",
    unfollow: "取消关注",
    aiKicker: "AI 助手",
    aiTitle: "任务伙伴",
    aiDesc: "分析动态、起草回复、提取关键信息。",
    openAi: "打开 AI 助手",
    customizeHint: "拖动图标以重新排列或在侧栏间移动",
    ariaSearch: "搜索",
    ariaCloseSearch: "关闭搜索",
    ariaThemeSettings: "主题设置",
    ariaCloseTheme: "关闭主题设置",
    ariaSettingsDrawer: "设置",
    ariaCloseSettingsDrawer: "关闭设置",
    loadingComposer: "加载编辑器",
    registerTagline1: "与重要的人保持亲密。",
    registerTagline2: "把圈子聚在一起。",
    registerTagline3: "每天都更贴近。",
    registerTagline4: "你的空间，你的人。",
    passwordHintRegister: "8 位以上：大小写、数字和符号",
  },
  ja: {
    ariaHome: "ホーム",
    customize: "カスタマイズ",
    customizeDone: "完了",
    openMenu: "メニューを開く",
    closeMenu: "メニューを閉じる",
    ariaCollapseMenu: "左メニューを折りたたむ",
    ariaKeepMenuOpen: "左メニューを開いたままにする",
    eyebrowCreator: "⚡ クリエイターモード",
    eyebrowFeed: "フィード",
    titleHomeBase: "ホーム",
    filterForYou: "おすすめ",
    filterFollowing: "フォロー中",
    filterCloseCircle: "親しい友人",
    filterCreator: "⚡ クリエイター",
    storiesCreator: "⚡ アクティブ",
    storiesDefault: "ストーリー",
    emptyAllTitle: "フィードが静かです",
    emptyAllSub: "フォローしたり投稿したり、トレンドを探してみましょう。",
    explore: "探索",
    findPeople: "フォローする人を見つける",
    emptyFriendsTitle: "まだ何もありません",
    emptyFriendsSub: "フォローすると投稿がここに表示されます。",
    emptyCloseTitle: "親しい友人が空です",
    emptyCloseSub: "親しい友人を追加すると投稿が表示されます。",
    suggestedKicker: "おすすめ",
    suggestedTitle: "ユーザー",
    seeAll: "すべて表示",
    loading: "読み込み中…",
    follow: "フォロー",
    unfollow: "フォロー解除",
    aiKicker: "AI エージェント",
    aiTitle: "クエストバディ",
    aiDesc: "フィードを分析し、返信案や重要情報を提示します。",
    openAi: "AI アシスタントを開く",
    customizeHint: "アイコンをドラッグして並べ替えまたはサイドバー間で移動",
    ariaSearch: "検索",
    ariaCloseSearch: "検索を閉じる",
    ariaThemeSettings: "テーマ設定",
    ariaCloseTheme: "テーマ設定を閉じる",
    ariaSettingsDrawer: "設定",
    ariaCloseSettingsDrawer: "設定を閉じる",
    loadingComposer: "作成ツールを読み込み中",
    registerTagline1: "大切な人と近くに。",
    registerTagline2: "仲間をつなぐ。",
    registerTagline3: "毎日、もっと近く。",
    registerTagline4: "あなたの空間、あなたの仲間。",
    passwordHintRegister: "8文字以上：大文字・小文字・数字・記号",
  },
  ko: {
    ariaHome: "홈",
    customize: "사용자 지정",
    customizeDone: "완료",
    openMenu: "메뉴 열기",
    closeMenu: "메뉴 닫기",
    ariaCollapseMenu: "왼쪽 메뉴 접기",
    ariaKeepMenuOpen: "왼쪽 메뉴 열어두기",
    eyebrowCreator: "⚡ 크리에이터 모드",
    eyebrowFeed: "피드",
    titleHomeBase: "홈",
    filterForYou: "추천",
    filterFollowing: "팔로잉",
    filterCloseCircle: "친한 친구",
    filterCreator: "⚡ 크리에이터",
    storiesCreator: "⚡ 활성 스트림",
    storiesDefault: "스토리",
    emptyAllTitle: "피드가 조용해요",
    emptyAllSub: "사람을 팔로우하거나 첫 게시물을 올리거나 탐색해 보세요.",
    explore: "탐색",
    findPeople: "팔로우할 사람 찾기",
    emptyFriendsTitle: "아직 없습니다",
    emptyFriendsSub: "팔로우하면 게시물이 여기에 표시됩니다.",
    emptyCloseTitle: "친한 친구가 비어 있습니다",
    emptyCloseSub: "친한 친구를 추가하면 게시물이 표시됩니다.",
    suggestedKicker: "추천",
    suggestedTitle: "사용자",
    seeAll: "모두 보기",
    loading: "로딩 중…",
    follow: "팔로우",
    unfollow: "언팔로우",
    aiKicker: "AI 에이전트",
    aiTitle: "퀘스트 버디",
    aiDesc: "피드를 분석하고 답장 초안과 중요 정보를 제공합니다.",
    openAi: "AI 어시스턴트 열기",
    customizeHint: "아이콘을 끌어 순서를 바꾸거나 사이드바 간 이동",
    ariaSearch: "검색",
    ariaCloseSearch: "검색 닫기",
    ariaThemeSettings: "테마 설정",
    ariaCloseTheme: "테마 설정 닫기",
    ariaSettingsDrawer: "설정",
    ariaCloseSettingsDrawer: "설정 닫기",
    loadingComposer: "작성기 로딩 중",
    registerTagline1: "소중한 사람들과 가깝게.",
    registerTagline2: "서클을 모으세요.",
    registerTagline3: "매일 더 가까이.",
    registerTagline4: "당신의 공간, 당신의 사람들.",
    passwordHintRegister: "8자 이상: 대소문자, 숫자, 기호",
  },
  de: {
    ariaHome: "Start",
    customize: "Anpassen",
    customizeDone: "Fertig",
    openMenu: "Menü öffnen",
    closeMenu: "Menü schließen",
    ariaCollapseMenu: "Linkes Menü einklappen",
    ariaKeepMenuOpen: "Linkes Menü offen lassen",
    eyebrowCreator: "⚡ CREATOR-MODUS",
    eyebrowFeed: "FEED",
    titleHomeBase: "START",
    filterForYou: "FÜR DICH",
    filterFollowing: "FOLGE ICH",
    filterCloseCircle: "ENGER KREIS",
    filterCreator: "⚡ CREATOR",
    storiesCreator: "⚡ Aktive Streams",
    storiesDefault: "Stories",
    emptyAllTitle: "Dein Feed ist noch ruhig",
    emptyAllSub: "Folge Personen, schreib den ersten Beitrag oder entdecke Trends.",
    explore: "Entdecken",
    findPeople: "Personen zum Folgen finden",
    emptyFriendsTitle: "Noch nichts hier",
    emptyFriendsSub: "Folge Personen, um ihre Beiträge hier zu sehen.",
    emptyCloseTitle: "Enger Kreis ist leer",
    emptyCloseSub: "Füge enge Freunde hinzu, um ihre Beiträge hier zu sehen.",
    suggestedKicker: "Vorschläge",
    suggestedTitle: "Profile",
    seeAll: "Alle anzeigen",
    loading: "Wird geladen…",
    follow: "Folgen",
    unfollow: "Entfolgen",
    aiKicker: "KI-Agent",
    aiTitle: "Quest-Buddy",
    aiDesc: "Feed analysieren, Antworten entwerfen, wichtige Infos hervorheben.",
    openAi: "KI-Assistent öffnen",
    customizeHint: "Symbole ziehen, um sie zu sortieren oder zwischen Seitenleisten zu verschieben",
    ariaSearch: "Suche",
    ariaCloseSearch: "Suche schließen",
    ariaThemeSettings: "Design-Einstellungen",
    ariaCloseTheme: "Design schließen",
    ariaSettingsDrawer: "Einstellungen",
    ariaCloseSettingsDrawer: "Einstellungen schließen",
    loadingComposer: "Editor wird geladen",
    registerTagline1: "Bleib nah bei deinen Menschen.",
    registerTagline2: "Bring deinen Kreis zusammen.",
    registerTagline3: "Jeden Tag ein Stück näher.",
    registerTagline4: "Dein Raum, deine Menschen.",
    passwordHintRegister: "8+ Zeichen: Groß-, Kleinbuchstaben, Zahl & Symbol",
  },
  ru: {
    ariaHome: "Главная",
    customize: "Настроить",
    customizeDone: "Готово",
    openMenu: "Открыть меню",
    closeMenu: "Закрыть меню",
    ariaCollapseMenu: "Свернуть левое меню",
    ariaKeepMenuOpen: "Держать левое меню открытым",
    eyebrowCreator: "⚡ РЕЖИМ АВТОРА",
    eyebrowFeed: "ЛЕНТА",
    titleHomeBase: "ГЛАВНАЯ",
    filterForYou: "ДЛЯ ВАС",
    filterFollowing: "ПОДПИСКИ",
    filterCloseCircle: "БЛИЗКИЙ КРУГ",
    filterCreator: "⚡ АВТОР",
    storiesCreator: "⚡ Активные трансляции",
    storiesDefault: "Сторис",
    emptyAllTitle: "В ленте пока тихо",
    emptyAllSub: "Подпишитесь на людей, опубликуйте пост или посмотрите тренды.",
    explore: "Обзор",
    findPeople: "Кого подписать",
    emptyFriendsTitle: "Пока пусто",
    emptyFriendsSub: "Подпишитесь на людей, чтобы видеть их посты здесь.",
    emptyCloseTitle: "Близкий круг пуст",
    emptyCloseSub: "Добавьте близких друзей, чтобы видеть их посты здесь.",
    suggestedKicker: "Рекомендации",
    suggestedTitle: "Люди",
    seeAll: "Показать все",
    loading: "Загрузка…",
    follow: "Подписаться",
    unfollow: "Отписаться",
    aiKicker: "ИИ-агент",
    aiTitle: "Помощник",
    aiDesc: "Анализ ленты, черновики ответов и важные сведения.",
    openAi: "Открыть ИИ-помощника",
    customizeHint: "Перетаскивайте значки, чтобы менять порядок или панели",
    ariaSearch: "Поиск",
    ariaCloseSearch: "Закрыть поиск",
    ariaThemeSettings: "Тема оформления",
    ariaCloseTheme: "Закрыть настройки темы",
    ariaSettingsDrawer: "Настройки",
    ariaCloseSettingsDrawer: "Закрыть настройки",
    loadingComposer: "Загрузка редактора",
    registerTagline1: "Будьте ближе к своим людям.",
    registerTagline2: "Соберите круг вместе.",
    registerTagline3: "Каждый день ближе.",
    registerTagline4: "Ваше пространство, ваши люди.",
    passwordHintRegister: "От 8 символов: буквы разного регистра, цифра и знак",
  },
};

export function feedChromeStrings(lang: AppLanguage): FeedChromeStrings {
  return FEED[lang] ?? FEED.en;
}

export type SettingsSidebarStrings = {
  title: string;
  searchPh: string;
  yourAccount: string;
  loading: string;
  accountSub: string;
  results: string;
  logOut: string;
  secHowYouUse: string;
  secWhoCanSee: string;
  secCreator: string;
  secMore: string;
  itemEditProfile: string;
  itemNotifications: string;
  itemPrivacy: string;
  itemBlocked: string;
  itemStory: string;
  itemMessages: string;
  itemTags: string;
  itemComments: string;
  itemMuted: string;
  itemCreatorMode: string;
  itemBilling: string;
  itemAppearance: string;
  itemLanguage: string;
  itemHelp: string;
  languagePageTitle: string;
  languageSaved: string;
  couldNotSaveLanguage: string;
  nestedPrivacy: string;
  nestedHelp: string;
};

const SETTINGS_SIDEBAR: Record<AppLanguage, SettingsSidebarStrings> = {
  en: {
    title: "Settings",
    searchPh: "Search",
    yourAccount: "Your account",
    loading: "Loading...",
    accountSub: "Password, profile, privacy",
    results: "Results",
    logOut: "Log out",
    secHowYouUse: "How you use Linksy",
    secWhoCanSee: "Who can see your content",
    secCreator: "Creator Program",
    secMore: "More",
    itemEditProfile: "Edit profile",
    itemNotifications: "Notifications",
    itemPrivacy: "Account privacy",
    itemBlocked: "Blocked",
    itemStory: "Stories and location",
    itemMessages: "Messages and replies",
    itemTags: "Tags and mentions",
    itemComments: "Comments",
    itemMuted: "Muted accounts",
    itemCreatorMode: "Creator Mode",
    itemBilling: "Billing",
    itemAppearance: "Appearance",
    itemLanguage: "Language",
    itemHelp: "Help",
    languagePageTitle: "Language",
    languageSaved: "Language saved.",
    couldNotSaveLanguage: "Could not save language.",
    nestedPrivacy: "Privacy",
    nestedHelp: "Help",
  },
  mn: {
    title: "Тохиргоо",
    searchPh: "Хайх",
    yourAccount: "Таны бүртгэл",
    loading: "Ачааллаж байна...",
    accountSub: "Нууц үг, профайл, нууцлал",
    results: "Илэрц",
    logOut: "Гарах",
    secHowYouUse: "Linksy-г хэрхэн ашиглах",
    secWhoCanSee: "Контентоо хэн харж чадах вэ",
    secCreator: "Бүтээгчийн хөтөлбөр",
    secMore: "Бусад",
    itemEditProfile: "Профайл засах",
    itemNotifications: "Мэдэгдэл",
    itemPrivacy: "Нууцлал",
    itemBlocked: "Хаасан",
    itemStory: "Түүвэр ба байршил",
    itemMessages: "Зурвас ба хариулт",
    itemTags: "Шошго ба дурдлага",
    itemComments: "Сэтгэгдэл",
    itemMuted: "Чимээгүй болгосон",
    itemCreatorMode: "Бүтээгчийн горим",
    itemBilling: "Төлбөр",
    itemAppearance: "Харагдах байдал",
    itemLanguage: "Хэл",
    itemHelp: "Тусламж",
    languagePageTitle: "Хэл",
    languageSaved: "Хэл хадгалагдлаа.",
    couldNotSaveLanguage: "Хэл хадгалж чадсангүй.",
    nestedPrivacy: "Нууцлал",
    nestedHelp: "Тусламж",
  },
  zh: {
    title: "设置",
    searchPh: "搜索",
    yourAccount: "你的账户",
    loading: "加载中...",
    accountSub: "密码、个人资料、隐私",
    results: "结果",
    logOut: "退出登录",
    secHowYouUse: "如何使用 Linksy",
    secWhoCanSee: "谁可以看到你的内容",
    secCreator: "创作者计划",
    secMore: "更多",
    itemEditProfile: "编辑资料",
    itemNotifications: "通知",
    itemPrivacy: "账户隐私",
    itemBlocked: "已屏蔽",
    itemStory: "故事与位置",
    itemMessages: "消息与回复",
    itemTags: "标签与提及",
    itemComments: "评论",
    itemMuted: "已静音的账户",
    itemCreatorMode: "创作者模式",
    itemBilling: "账单",
    itemAppearance: "外观",
    itemLanguage: "语言",
    itemHelp: "帮助",
    languagePageTitle: "语言",
    languageSaved: "语言已保存。",
    couldNotSaveLanguage: "无法保存语言。",
    nestedPrivacy: "隐私",
    nestedHelp: "帮助",
  },
  ja: {
    title: "設定",
    searchPh: "検索",
    yourAccount: "アカウント",
    loading: "読み込み中...",
    accountSub: "パスワード、プロフィール、プライバシー",
    results: "結果",
    logOut: "ログアウト",
    secHowYouUse: "Linksy の使い方",
    secWhoCanSee: "コンテンツの公開範囲",
    secCreator: "クリエイタープログラム",
    secMore: "その他",
    itemEditProfile: "プロフィールを編集",
    itemNotifications: "通知",
    itemPrivacy: "アカウントのプライバシー",
    itemBlocked: "ブロック",
    itemStory: "ストーリーと位置情報",
    itemMessages: "メッセージと返信",
    itemTags: "タグとメンション",
    itemComments: "コメント",
    itemMuted: "ミュートしたアカウント",
    itemCreatorMode: "クリエイターモード",
    itemBilling: "請求",
    itemAppearance: "外観",
    itemLanguage: "言語",
    itemHelp: "ヘルプ",
    languagePageTitle: "言語",
    languageSaved: "言語を保存しました。",
    couldNotSaveLanguage: "言語を保存できませんでした。",
    nestedPrivacy: "プライバシー",
    nestedHelp: "ヘルプ",
  },
  ko: {
    title: "설정",
    searchPh: "검색",
    yourAccount: "계정",
    loading: "로딩 중...",
    accountSub: "비밀번호, 프로필, 개인정보",
    results: "결과",
    logOut: "로그아웃",
    secHowYouUse: "Linksy 사용 방법",
    secWhoCanSee: "콘텐츠 공개 범위",
    secCreator: "크리에이터 프로그램",
    secMore: "더보기",
    itemEditProfile: "프로필 편집",
    itemNotifications: "알림",
    itemPrivacy: "계정 개인정보",
    itemBlocked: "차단됨",
    itemStory: "스토리 및 위치",
    itemMessages: "메시지 및 답장",
    itemTags: "태그 및 멘션",
    itemComments: "댓글",
    itemMuted: "음소거한 계정",
    itemCreatorMode: "크리에이터 모드",
    itemBilling: "결제",
    itemAppearance: "모양",
    itemLanguage: "언어",
    itemHelp: "도움말",
    languagePageTitle: "언어",
    languageSaved: "언어가 저장되었습니다.",
    couldNotSaveLanguage: "언어를 저장할 수 없습니다.",
    nestedPrivacy: "개인정보",
    nestedHelp: "도움말",
  },
  de: {
    title: "Einstellungen",
    searchPh: "Suche",
    yourAccount: "Dein Konto",
    loading: "Wird geladen...",
    accountSub: "Passwort, Profil, Datenschutz",
    results: "Ergebnisse",
    logOut: "Abmelden",
    secHowYouUse: "So nutzt du Linksy",
    secWhoCanSee: "Wer deine Inhalte sieht",
    secCreator: "Creator-Programm",
    secMore: "Mehr",
    itemEditProfile: "Profil bearbeiten",
    itemNotifications: "Benachrichtigungen",
    itemPrivacy: "Kontodatenschutz",
    itemBlocked: "Blockiert",
    itemStory: "Stories und Standort",
    itemMessages: "Nachrichten und Antworten",
    itemTags: "Tags und Erwähnungen",
    itemComments: "Kommentare",
    itemMuted: "Stummgeschaltete Konten",
    itemCreatorMode: "Creator-Modus",
    itemBilling: "Abrechnung",
    itemAppearance: "Erscheinungsbild",
    itemLanguage: "Sprache",
    itemHelp: "Hilfe",
    languagePageTitle: "Sprache",
    languageSaved: "Sprache gespeichert.",
    couldNotSaveLanguage: "Sprache konnte nicht gespeichert werden.",
    nestedPrivacy: "Datenschutz",
    nestedHelp: "Hilfe",
  },
  ru: {
    title: "Настройки",
    searchPh: "Поиск",
    yourAccount: "Ваш аккаунт",
    loading: "Загрузка...",
    accountSub: "Пароль, профиль, конфиденциальность",
    results: "Результаты",
    logOut: "Выйти",
    secHowYouUse: "Как вы пользуетесь Linksy",
    secWhoCanSee: "Кто видит ваш контент",
    secCreator: "Программа для авторов",
    secMore: "Ещё",
    itemEditProfile: "Редактировать профиль",
    itemNotifications: "Уведомления",
    itemPrivacy: "Конфиденциальность аккаунта",
    itemBlocked: "Заблокированные",
    itemStory: "Сторис и геолокация",
    itemMessages: "Сообщения и ответы",
    itemTags: "Теги и упоминания",
    itemComments: "Комментарии",
    itemMuted: "Скрытые аккаунты",
    itemCreatorMode: "Режим автора",
    itemBilling: "Оплата",
    itemAppearance: "Оформление",
    itemLanguage: "Язык",
    itemHelp: "Справка",
    languagePageTitle: "Язык",
    languageSaved: "Язык сохранён.",
    couldNotSaveLanguage: "Не удалось сохранить язык.",
    nestedPrivacy: "Конфиденциальность",
    nestedHelp: "Справка",
  },
};

export function settingsSidebarStrings(lang: AppLanguage): SettingsSidebarStrings {
  return SETTINGS_SIDEBAR[lang] ?? SETTINGS_SIDEBAR.en;
}

const NOTIF_VERBS_EN: Record<string, string> = {
  like: "liked your post",
  comment: "commented on your post",
  follow: "started following you",
  mention: "mentioned you",
  post_mention: "mentioned you in a post",
  story_mention: "mentioned you in a story",
  story: "shared a story update",
  message: "sent you a message",
  message_request: "sent you a message request",
  story_expiring: "your story expires in about an hour",
  friend_joined: "joined Linksy from your contacts",
  story_reaction: "reacted to your story",
  story_collab: "added you as a collaborator on a story",
};

const NOTIF_VERBS_MN: Record<string, string> = {
  like: "таны постонд дуртай",
  comment: "таны постонд сэтгэгдэл бичсэн",
  follow: "таныг дагаж эхэлсэн",
  mention: "таныг дурдсан",
  post_mention: "постонд таныг дурдсан",
  story_mention: "түүвэрт таныг дурдсан",
  story: "түүвэр шинэчилсэн",
  message: "зурвас илгээсэн",
  message_request: "зурвасын хүсэлт илгээсэн",
  story_expiring: "түүвэр 1 цагийн дараа дуусна",
  friend_joined: "харилцаанаас Linksy-д нэгдсэн",
  story_reaction: "түүвэртээ илэрхийлсэн",
  story_collab: "түүвэрт хамтрагч болгосон",
};

export type ShellNotifUiStrings = {
  previewAria: string;
  title: string;
  markAllRead: string;
  empty: string;
  seeAll: string;
  generic: string;
  justNow: string;
  verbs: Record<string, string>;
};

const SHELL_NOTIF_UI: Record<AppLanguage, ShellNotifUiStrings> = {
  en: {
    previewAria: "Notifications preview",
    title: "Notifications",
    markAllRead: "Mark all read",
    empty: "No notifications yet",
    seeAll: "See all notifications",
    generic: "notification",
    justNow: "Just now",
    verbs: NOTIF_VERBS_EN,
  },
  mn: {
    previewAria: "Мэдэгдлийн урьдчилан харах",
    title: "Мэдэгдэл",
    markAllRead: "Бүгдийг уншсан",
    empty: "Мэдэгдэл алга",
    seeAll: "Бүх мэдэгдлийг харах",
    generic: "мэдэгдэл",
    justNow: "Сая",
    verbs: { ...NOTIF_VERBS_EN, ...NOTIF_VERBS_MN },
  },
  zh: {
    previewAria: "通知预览",
    title: "通知",
    markAllRead: "全部标为已读",
    empty: "暂无通知",
    seeAll: "查看全部通知",
    generic: "通知",
    justNow: "刚刚",
    verbs: NOTIF_VERBS_EN,
  },
  ja: {
    previewAria: "通知プレビュー",
    title: "通知",
    markAllRead: "すべて既読にする",
    empty: "通知はまだありません",
    seeAll: "すべての通知を見る",
    generic: "通知",
    justNow: "たった今",
    verbs: NOTIF_VERBS_EN,
  },
  ko: {
    previewAria: "알림 미리보기",
    title: "알림",
    markAllRead: "모두 읽음",
    empty: "알림이 없습니다",
    seeAll: "모든 알림 보기",
    generic: "알림",
    justNow: "방금",
    verbs: NOTIF_VERBS_EN,
  },
  de: {
    previewAria: "Benachrichtigungsvorschau",
    title: "Benachrichtigungen",
    markAllRead: "Alle als gelesen",
    empty: "Noch keine Benachrichtigungen",
    seeAll: "Alle Benachrichtigungen",
    generic: "Benachrichtigung",
    justNow: "Gerade eben",
    verbs: NOTIF_VERBS_EN,
  },
  ru: {
    previewAria: "Просмотр уведомлений",
    title: "Уведомления",
    markAllRead: "Отметить все прочитанными",
    empty: "Пока нет уведомлений",
    seeAll: "Все уведомления",
    generic: "уведомление",
    justNow: "Только что",
    verbs: NOTIF_VERBS_EN,
  },
};

export function shellNotifUi(lang: AppLanguage): ShellNotifUiStrings {
  return SHELL_NOTIF_UI[lang] ?? SHELL_NOTIF_UI.en;
}

export function shellNotifVerb(type: string, lang: AppLanguage): string {
  const u = shellNotifUi(lang);
  return u.verbs[type] ?? u.generic;
}

export function shellNotifTimeShort(iso: string, lang: AppLanguage): string {
  const u = shellNotifUi(lang);
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return u.justNow;
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

/** Settings main-panel copy (Help, legal text pages, toggles, creator blurb). */
export type SettingsContentStrings = {
  helpRowHelpCenter: string;
  helpRowPrivacyPolicy: string;
  helpRowTerms: string;
  helpRowCookiePolicy: string;
  helpRowContactSupport: string;
  textHelpCenterTitle: string;
  textHelpCenterH1: string;
  textHelpCenterB1: string;
  textHelpCenterH2: string;
  textHelpCenterB2: string;
  textPrivacyPolicyTitle: string;
  textPrivacyPolicyH1: string;
  textPrivacyPolicyB1: string;
  textPrivacyPolicyH2: string;
  textPrivacyPolicyB2: string;
  textCookiePolicyTitle: string;
  textCookiePolicyH1: string;
  textCookiePolicyB1: string;
  textCookiePolicyH2: string;
  textCookiePolicyB2: string;
  contactSupportTitle: string;
  contactEmailRow: string;
  contactEmailDesc: string;
  contactSupportHint: string;
  storyLocShow: string;
  storyLocShowDesc: string;
  storyAutoArchive: string;
  storyNearby: string;
  tagsAllowPost: string;
  tagsApproveFirst: string;
  tagsAllowMentions: string;
  commentsAllow: string;
  commentsEveryone: string;
  commentsFilter: string;
  creatorUnlockLabel: string;
  creatorBody: string;
};

const SETTINGS_CONTENT_BASE_EN: SettingsContentStrings = {
  helpRowHelpCenter: "Help Center",
  helpRowPrivacyPolicy: "Privacy Policy",
  helpRowTerms: "Terms of Service",
  helpRowCookiePolicy: "Cookie Policy",
  helpRowContactSupport: "Contact support",
  textHelpCenterTitle: "Help Center",
  textHelpCenterH1: "Using Linksy",
  textHelpCenterB1:
    "Create posts, manage your profile, and adjust your experience from the settings sidebar. Most changes apply immediately and stay saved on this device.",
  textHelpCenterH2: "Common fixes",
  textHelpCenterB2:
    "If something looks off, refresh the page first. If the problem continues, sign out and back in, then contact support with the page name and a screenshot.",
  textPrivacyPolicyTitle: "Privacy Policy",
  textPrivacyPolicyH1: "What we store",
  textPrivacyPolicyB1:
    "This build stores your account profile, posts, comments, follows, and app preferences needed to personalize the interface.",
  textPrivacyPolicyH2: "Local preferences",
  textPrivacyPolicyB2:
    "Theme, language, and several settings toggles are also saved in your browser so your interface stays consistent after refresh.",
  textCookiePolicyTitle: "Cookie Policy",
  textCookiePolicyH1: "Authentication cookies",
  textCookiePolicyB1:
    "Linksy keeps you signed in with a secure auth cookie so protected routes and settings can load your account information.",
  textCookiePolicyH2: "Preference storage",
  textCookiePolicyB2:
    "Visual preferences and several settings use browser storage so the app can remember your choices between visits.",
  contactSupportTitle: "Contact support",
  contactEmailRow: "Email support",
  contactEmailDesc: "support@linksy.app",
  contactSupportHint:
    "Share the page you were using, what you expected to happen, and a screenshot if you have one. That gives support enough context to reproduce the issue quickly.",
  storyLocShow: "Show location",
  storyLocShowDesc: "Share your location in stories",
  storyAutoArchive: "Auto-save to archive",
  storyNearby: "Show to nearby people",
  tagsAllowPost: "Allow post tags",
  tagsApproveFirst: "Approve tags first",
  tagsAllowMentions: "Allow mentions",
  commentsAllow: "Allow comments",
  commentsEveryone: "Allow from everyone",
  commentsFilter: "Filter offensive language",
  creatorUnlockLabel: "Unlock & manage",
  creatorBody:
    "Creator Mode lets you earn XP for likes, comments, and follows you receive. Unlock it by publishing 2 posts or reaching 10 total interactions from others.",
};

const SETTINGS_CONTENT: Record<AppLanguage, SettingsContentStrings> = {
  en: SETTINGS_CONTENT_BASE_EN,
  mn: {
    ...SETTINGS_CONTENT_BASE_EN,
    helpRowHelpCenter: "Тусламжийн төв",
    helpRowPrivacyPolicy: "Нууцлалын бодлого",
    helpRowTerms: "Үйлчилгээний нөхцөл",
    helpRowCookiePolicy: "Cookie бодлого",
    helpRowContactSupport: "Дэмжлэгт холбогдох",
    textHelpCenterTitle: "Тусламжийн төв",
    textHelpCenterH1: "Linksy ашиглах",
    textHelpCenterB1:
      "Пост үүсгэж, профайлаа удирдаж, тохиргооны самбараас туршлагаа тохируулна. Ихэнх өөрчлөлт шууд хэрэгжиж, энэ төхөөрөмжид хадгалагдана.",
    textHelpCenterH2: "Энгийн засварууд",
    textHelpCenterB2:
      "Алдаатай харагдав эхлээд хуудсыг дахин ачаална уу. Үргэлжилбэл гарч, дахин нэвтэрч, дэмжлэгт хуудасны нэр, дэлгэцийн зураг илгээнэ үү.",
    textPrivacyPolicyTitle: "Нууцлалын бодлого",
    textPrivacyPolicyH1: "Юу хадгалдаг вэ",
    textPrivacyPolicyB1:
      "Энэ хувилбар дансны профайл, пост, сэтгэгдэл, дагалт болон интерфейсийг тохируулах тохиргоог хадгална.",
    textPrivacyPolicyH2: "Төхөөрөмжийн тохиргоо",
    textPrivacyPolicyB2:
      "Дүрэм, хэл болон зарим товчлуурууд хөтөчид хадгалагдаж, дахин ачаалсны дараа ижил харагдана.",
    textCookiePolicyTitle: "Cookie бодлого",
    textCookiePolicyH1: "Нэвтрэх cookie",
    textCookiePolicyB1:
      "Linksy нэвтрэлтийг аюулгүй cookie-аар хадгална, ингэснээр хамгаалагдсан замууд тохиргоог ачаална.",
    textCookiePolicyH2: "Сонголтын хадгалалт",
    textCookiePolicyB2:
      "Харагдах байдал болон зарим тохиргоо хөтөчийн санах ойд хадгалагдаж, дараагийн зочлолд санаж байна.",
    contactSupportTitle: "Дэмжлэгт холбогдох",
    contactEmailRow: "И-мэйлээр дэмжлэг",
    contactSupportHint:
      "Ашиглаж байсан хуудас, юу болох ёстой байсан, боломжтой бол дэлгэцийн зураг хуваалцана уу.",
    storyLocShow: "Байршил харуулах",
    storyLocShowDesc: "Түүвэрт байршлаа хуваалцах",
    storyAutoArchive: "Архивт автоматаар хадгалах",
    storyNearby: "Ойрын хүмүүст харуулах",
    tagsAllowPost: "Постын шошго зөвшөөрөх",
    tagsApproveFirst: "Эхлээд шошгыг батлах",
    tagsAllowMentions: "Дурдлагыг зөвшөөрөх",
    commentsAllow: "Сэтгэгдэл зөвшөөрөх",
    commentsEveryone: "Хүн бүрээс зөвшөөрөх",
    commentsFilter: "Хортой хэл шүүх",
    creatorUnlockLabel: "Нээх ба удирдах",
    creatorBody:
      "Бүтээгчийн горимд та дуртай, сэтгэгдэл, дагалтаар XP цуглуулна. 2 пост эсвэл бусдаас 10 үйлдлээр нээгдэнэ.",
  },
  zh: {
    ...SETTINGS_CONTENT_BASE_EN,
    helpRowHelpCenter: "帮助中心",
    helpRowPrivacyPolicy: "隐私政策",
    helpRowTerms: "服务条款",
    helpRowCookiePolicy: "Cookie 政策",
    helpRowContactSupport: "联系支持",
    textHelpCenterTitle: "帮助中心",
    textHelpCenterH1: "使用 Linksy",
    textHelpCenterB1: "在设置侧栏创建帖子、管理个人资料并调整体验。大多数更改会立即生效并保存在此设备上。",
    textHelpCenterH2: "常见问题",
    textHelpCenterB2: "若显示异常，请先刷新页面。若仍如此，请退出并重新登录，然后联系支持并附上页面名称和截图。",
    textPrivacyPolicyTitle: "隐私政策",
    textPrivacyPolicyH1: "我们存储的内容",
    textPrivacyPolicyB1: "此版本会存储您的账户资料、帖子、评论、关注和个性化界面所需的应用偏好。",
    textPrivacyPolicyH2: "本地偏好",
    textPrivacyPolicyB2: "主题、语言和部分开关也会保存在浏览器中，以便刷新后界面保持一致。",
    textCookiePolicyTitle: "Cookie 政策",
    textCookiePolicyH1: "身份验证 Cookie",
    textCookiePolicyB1: "Linksy 使用安全的身份验证 Cookie 保持登录，以便受保护的路由和设置可加载您的账户信息。",
    textCookiePolicyH2: "偏好存储",
    textCookiePolicyB2: "视觉偏好和部分设置使用浏览器存储，以便应用在访问之间记住您的选择。",
    contactSupportTitle: "联系支持",
    contactEmailRow: "邮件支持",
    contactSupportHint: "请说明您使用的页面、预期行为，如有请附上截图，以便支持快速复现问题。",
    storyLocShow: "显示位置",
    storyLocShowDesc: "在故事中分享您的位置",
    storyAutoArchive: "自动保存到归档",
    storyNearby: "向附近的人显示",
    tagsAllowPost: "允许帖子标签",
    tagsApproveFirst: "先批准标签",
    tagsAllowMentions: "允许提及",
    commentsAllow: "允许评论",
    commentsEveryone: "允许所有人",
    commentsFilter: "过滤不当用语",
    creatorUnlockLabel: "解锁与管理",
    creatorBody: "创作者模式可通过点赞、评论和关注获得经验值。发布 2 条帖子或获得他人共 10 次互动即可解锁。",
  },
  ja: {
    ...SETTINGS_CONTENT_BASE_EN,
    helpRowHelpCenter: "ヘルプセンター",
    helpRowPrivacyPolicy: "プライバシーポリシー",
    helpRowTerms: "利用規約",
    helpRowCookiePolicy: "Cookie ポリシー",
    helpRowContactSupport: "サポートに連絡",
    textHelpCenterTitle: "ヘルプセンター",
    textHelpCenterH1: "Linksy の使い方",
    textHelpCenterB1: "投稿の作成、プロフィール管理、設定サイドバーからの体験調整ができます。多くの変更はすぐに反映され、この端末に保存されます。",
    textHelpCenterH2: "よくある対処",
    textHelpCenterB2: "表示がおかしい場合はまず更新してください。続く場合は一度ログアウトして再ログインし、ページ名とスクリーンショットを添えてサポートへ。",
    textPrivacyPolicyTitle: "プライバシーポリシー",
    textPrivacyPolicyH1: "保存する情報",
    textPrivacyPolicyB1: "このビルドは、アカウントプロフィール、投稿、コメント、フォロー、界面パーソナライズに必要な設定を保存します。",
    textPrivacyPolicyH2: "端末内の設定",
    textPrivacyPolicyB2: "テーマ、言語、いくつかのトグルはブラウザにも保存され、更新後も一貫して表示されます。",
    textCookiePolicyTitle: "Cookie ポリシー",
    textCookiePolicyH1: "認証 Cookie",
    textCookiePolicyB1: "Linksy は安全な認証 Cookie でログイン状態を保ち、保護されたルートと設定でアカウント情報を読み込みます。",
    textCookiePolicyH2: "設定の保存",
    textCookiePolicyB2: "表示設定と一部の設定はブラウザストレージに保存され、訪問間でも選択を覚えます。",
    contactSupportTitle: "サポートに連絡",
    contactEmailRow: "メールサポート",
    contactSupportHint: "利用していたページ、期待した動作、可能ならスクリーンショットを共有してください。",
    storyLocShow: "位置情報を表示",
    storyLocShowDesc: "ストーリーで位置を共有",
    storyAutoArchive: "アーカイブに自動保存",
    storyNearby: "近くの人に表示",
    tagsAllowPost: "投稿タグを許可",
    tagsApproveFirst: "先にタグを承認",
    tagsAllowMentions: "メンションを許可",
    commentsAllow: "コメントを許可",
    commentsEveryone: "全員から許可",
    commentsFilter: "不適切な表現をフィルター",
    creatorUnlockLabel: "解除と管理",
    creatorBody: "クリエイターモードでは、いいね・コメント・フォローで XP を獲得できます。投稿 2 件、または他者からの合計 10 インタラクションで解除されます。",
  },
  ko: {
    ...SETTINGS_CONTENT_BASE_EN,
    helpRowHelpCenter: "고객센터",
    helpRowPrivacyPolicy: "개인정보 처리방침",
    helpRowTerms: "서비스 약관",
    helpRowCookiePolicy: "쿠키 정책",
    helpRowContactSupport: "고객 지원 문의",
    textHelpCenterTitle: "고객센터",
    textHelpCenterH1: "Linksy 사용하기",
    textHelpCenterB1: "게시물 작성, 프로필 관리, 설정 사이드바에서 경험을 조정하세요. 대부분의 변경은 즉시 적용되며 이 기기에 저장됩니다.",
    textHelpCenterH2: "일반적인 해결",
    textHelpCenterB2: "화면이 이상하면 먼저 새로고침하세요. 계속되면 로그아웃 후 다시 로그인하고, 페이지 이름과 스크린샷과 함께 지원팀에 문의하세요.",
    textPrivacyPolicyTitle: "개인정보 처리방침",
    textPrivacyPolicyH1: "저장하는 정보",
    textPrivacyPolicyB1: "이 빌드는 계정 프로필, 게시물, 댓글, 팔로우 및 인터페이스 개인화에 필요한 설정을 저장합니다.",
    textPrivacyPolicyH2: "로컬 기본 설정",
    textPrivacyPolicyB2: "테마, 언어 및 일부 토글은 브라우저에도 저장되어 새로고침 후에도 일관되게 표시됩니다.",
    textCookiePolicyTitle: "쿠키 정책",
    textCookiePolicyH1: "인증 쿠키",
    textCookiePolicyB1: "Linksy는 안전한 인증 쿠키로 로그인 상태를 유지하여 보호된 경로와 설정에서 계정 정보를 불러올 수 있습니다.",
    textCookiePolicyH2: "기본 설정 저장",
    textCookiePolicyB2: "시각적 기본 설정과 일부 설정은 브라우저 저장소를 사용하여 방문 간 선택을 기억합니다.",
    contactSupportTitle: "고객 지원 문의",
    contactEmailRow: "이메일 지원",
    contactSupportHint: "사용 중이던 페이지, 기대한 동작, 가능하면 스크린샷을 알려 주세요.",
    storyLocShow: "위치 표시",
    storyLocShowDesc: "스토리에서 위치 공유",
    storyAutoArchive: "보관함에 자동 저장",
    storyNearby: "주변 사람에게 표시",
    tagsAllowPost: "게시 태그 허용",
    tagsApproveFirst: "태그 먼저 승인",
    tagsAllowMentions: "멘션 허용",
    commentsAllow: "댓글 허용",
    commentsEveryone: "모두에게 허용",
    commentsFilter: "부적절한 언어 필터",
    creatorUnlockLabel: "잠금 해제 및 관리",
    creatorBody: "크리에이터 모드에서는 받은 좋아요, 댓글, 팔로우로 XP를 얻습니다. 게시물 2개를 게시하거나 타인의 총 10회 상호작용에 도달하면 잠금 해제됩니다.",
  },
  de: {
    ...SETTINGS_CONTENT_BASE_EN,
    helpRowHelpCenter: "Hilfe-Center",
    helpRowPrivacyPolicy: "Datenschutzerklärung",
    helpRowTerms: "Nutzungsbedingungen",
    helpRowCookiePolicy: "Cookie-Richtlinie",
    helpRowContactSupport: "Support kontaktieren",
    textHelpCenterTitle: "Hilfe-Center",
    textHelpCenterH1: "Linksy nutzen",
    textHelpCenterB1:
      "Erstellen Sie Beiträge, verwalten Sie Ihr Profil und passen Sie Ihre Erfahrung in der Einstellungsleiste an. Die meisten Änderungen gelten sofort und bleiben auf diesem Gerät gespeichert.",
    textHelpCenterH2: "Häufige Lösungen",
    textHelpCenterB2:
      "Wenn etwas nicht stimmt, laden Sie die Seite zuerst neu. Wenn es weitergeht, melden Sie sich ab und wieder an und kontaktieren Sie den Support mit Seitenname und Screenshot.",
    textPrivacyPolicyTitle: "Datenschutzerklärung",
    textPrivacyPolicyH1: "Was wir speichern",
    textPrivacyPolicyB1:
      "Diese Version speichert Ihr Kontoprofil, Beiträge, Kommentare, Follows und App-Einstellungen zur Personalisierung der Oberfläche.",
    textPrivacyPolicyH2: "Lokale Einstellungen",
    textPrivacyPolicyB2:
      "Design, Sprache und mehrere Schalter werden auch im Browser gespeichert, damit die Oberfläche nach dem Aktualisieren konsistent bleibt.",
    textCookiePolicyTitle: "Cookie-Richtlinie",
    textCookiePolicyH1: "Authentifizierungs-Cookies",
    textCookiePolicyB1:
      "Linksy hält Sie mit einem sicheren Auth-Cookie angemeldet, damit geschützte Bereiche und Einstellungen Ihre Kontodaten laden können.",
    textCookiePolicyH2: "Speicherung von Einstellungen",
    textCookiePolicyB2:
      "Visuelle Einstellungen und mehrere Optionen nutzen den Browserspeicher, damit die App Ihre Auswahl zwischen Besuchen merkt.",
    contactSupportTitle: "Support kontaktieren",
    contactEmailRow: "E-Mail-Support",
    contactSupportHint:
      "Nennen Sie die Seite, Ihre Erwartung und falls möglich einen Screenshot – so kann der Support das Problem schneller nachvollziehen.",
    storyLocShow: "Standort anzeigen",
    storyLocShowDesc: "Standort in Stories teilen",
    storyAutoArchive: "Automatisch im Archiv speichern",
    storyNearby: "Personen in der Nähe anzeigen",
    tagsAllowPost: "Beitrags-Tags erlauben",
    tagsApproveFirst: "Tags zuerst genehmigen",
    tagsAllowMentions: "Erwähnungen erlauben",
    commentsAllow: "Kommentare erlauben",
    commentsEveryone: "Von allen erlauben",
    commentsFilter: "Beleidigende Sprache filtern",
    creatorUnlockLabel: "Freischalten & verwalten",
    creatorBody:
      "Im Creator-Modus sammeln Sie XP für Likes, Kommentare und Follows. Schalten Sie ihn frei mit 2 Beiträgen oder 10 Interaktionen von anderen.",
  },
  ru: {
    ...SETTINGS_CONTENT_BASE_EN,
    helpRowHelpCenter: "Справочный центр",
    helpRowPrivacyPolicy: "Политика конфиденциальности",
    helpRowTerms: "Условия использования",
    helpRowCookiePolicy: "Политика cookie",
    helpRowContactSupport: "Связаться с поддержкой",
    textHelpCenterTitle: "Справочный центр",
    textHelpCenterH1: "Как пользоваться Linksy",
    textHelpCenterB1:
      "Создавайте посты, управляйте профилем и настраивайте интерфейс в боковой панели настроек. Большинство изменений применяются сразу и сохраняются на этом устройстве.",
    textHelpCenterH2: "Частые решения",
    textHelpCenterB2:
      "Если что-то отображается неверно, сначала обновите страницу. Если не помогло — выйдите и войдите снова и напишите в поддержку с названием страницы и скриншотом.",
    textPrivacyPolicyTitle: "Политика конфиденциальности",
    textPrivacyPolicyH1: "Что мы храним",
    textPrivacyPolicyB1:
      "В этой сборке хранятся профиль аккаунта, посты, комментарии, подписки и настройки приложения для персонализации интерфейса.",
    textPrivacyPolicyH2: "Локальные настройки",
    textPrivacyPolicyB2:
      "Тема, язык и часть переключателей также сохраняются в браузере, чтобы интерфейс оставался одинаковым после обновления.",
    textCookiePolicyTitle: "Политика cookie",
    textCookiePolicyH1: "Cookie для входа",
    textCookiePolicyB1:
      "Linksy поддерживает вход с помощью защищённого cookie, чтобы защищённые разделы и настройки могли загрузить данные аккаунта.",
    textCookiePolicyH2: "Хранение настроек",
    textCookiePolicyB2:
      "Визуальные настрой и часть параметров используют хранилище браузера, чтобы приложение помнило выбор между визитами.",
    contactSupportTitle: "Связаться с поддержкой",
    contactEmailRow: "Почта поддержки",
    contactSupportHint:
      "Укажите страницу, на которой были, что ожидали и по возможности приложите скриншот — так быстрее воспроизвести проблему.",
    storyLocShow: "Показывать местоположение",
    storyLocShowDesc: "Делиться геолокацией в сторис",
    storyAutoArchive: "Автосохранение в архив",
    storyNearby: "Показывать людям рядом",
    tagsAllowPost: "Разрешить теги в постах",
    tagsApproveFirst: "Сначала одобрять теги",
    tagsAllowMentions: "Разрешить упоминания",
    commentsAllow: "Разрешить комментарии",
    commentsEveryone: "Разрешить от всех",
    commentsFilter: "Фильтровать оскорбительную лексику",
    creatorUnlockLabel: "Разблокировать и управлять",
    creatorBody:
      "В режиме автора вы получаете XP за лайки, комментарии и подписки. Разблокируйте его, опубликовав 2 поста или набрав 10 взаимодействий от других.",
  },
};

export function settingsContentStrings(lang: AppLanguage): SettingsContentStrings {
  return SETTINGS_CONTENT[lang] ?? SETTINGS_CONTENT.en;
}
