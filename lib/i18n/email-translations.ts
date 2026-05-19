import type { CopyBundle } from "@/lib/i18n/bundles";

export type WelcomeEmailCopy = {
  subject: string;
  preview: string;
  heading: string;
  greetingHi: string;
  greetingGeneric: string;
  intro: string;
  bullet1: string;
  bullet2: string;
  bullet3: string;
  verifyPrompt: string;
  verifyCta: string;
  openCta: string;
  footer: string;
};

export type VerificationEmailCopy = {
  subject: string;
  preview: string;
  heading: string;
  greetingHi: string;
  greetingGeneric: string;
  body: string;
  cta: string;
  copyUrlLabel: string;
  expiry: (hours: number) => string;
};

export type PasswordResetEmailCopy = {
  subject: string;
  preview: string;
  heading: string;
  hi: string;
  body: string;
  cta: string;
  copyUrlLabel: string;
  expiry: (minutes: number) => string;
};

export type LoginAlertEmailCopy = {
  subject: string;
  preview: string;
  heading: string;
  hi: string;
  intro: string;
  whenLabel: string;
  deviceLabel: string;
  ipLabel: string;
  unknownBrowser: string;
  unknownIp: string;
  actionPrompt: string;
  changePasswordCta: string;
  reviewSessionsPrefix: string;
  reviewSessionsLink: string;
  reviewSessionsSuffix: string;
  textBody: string;
};

const WELCOME: Record<CopyBundle, WelcomeEmailCopy> = {
  en: {
    subject: "Welcome to Linksy",
    preview: "Welcome to Linksy — let's set up your space.",
    heading: "Welcome to Linksy",
    greetingHi: "Hi",
    greetingGeneric: "Hi",
    intro: "Your account is ready. Here is what you can do next:",
    bullet1: "Customize your profile and pick a theme",
    bullet2: "Follow creators that match your interests",
    bullet3: "Share your first post or story",
    verifyPrompt: "Verify your email to unlock notifications and password recovery:",
    verifyCta: "Verify email",
    openCta: "Open Linksy",
    footer: "If you did not sign up, you can ignore this email.",
  },
  mn: {
    subject: "Linksy-д тавтай морил",
    preview: "Linksy-д тавтай морил — өөрийн орон зайг тохируулъя.",
    heading: "Linksy-д тавтай морил",
    greetingHi: "Сайн байна уу",
    greetingGeneric: "Сайн байна уу",
    intro: "Таны бүртгэл бэлэн боллоо. Дараах зүйлсийг хийж болно:",
    bullet1: "Профайл, өнгө загварыг тохируулах",
    bullet2: "Сонирхолтой бүтээгчдийг дагах",
    bullet3: "Эхний пост эсвэл түүхээ хуваалцах",
    verifyPrompt: "Имэйлээ баталгаажуулж мэдэгдэл, нууц үг сэргээхийг идэвхжүүлнэ үү:",
    verifyCta: "Имэйл баталгаажуулах",
    openCta: "Linksy нээх",
    footer: "Хэрэв та бүртгэл үүсгээгүй бол энэ имэйлийг үл тоомсорлож болно.",
  },
};

const VERIFICATION: Record<CopyBundle, VerificationEmailCopy> = {
  en: {
    subject: "Verify your Linksy email",
    preview: "Confirm your email to finish setting up Linksy.",
    heading: "Verify your email",
    greetingHi: "Hi",
    greetingGeneric: "Hi",
    body: "Tap the button below to confirm this email address belongs to you.",
    cta: "Verify email",
    copyUrlLabel: "Or copy this URL into your browser:",
    expiry: (h) =>
      `This link expires in ${h} hours. If you did not request this, you can ignore the email.`,
  },
  mn: {
    subject: "Linksy имэйлээ баталгаажуулна уу",
    preview: "Linksy-д тохируулга дуусгахын тулд имэйлээ баталгаажуулна уу.",
    heading: "Имэйлээ баталгаажуулах",
    greetingHi: "Сайн байна уу",
    greetingGeneric: "Сайн байна уу",
    body: "Дорх товчлуурыг дарж энэ имэйл өөрт чинь хамаарахыг баталгаажуулна уу.",
    cta: "Имэйл баталгаажуулах",
    copyUrlLabel: "Эсвэл энэ холбоосыг хуулж хөтөчид нээнэ үү:",
    expiry: (h) =>
      `Энэ холбоос ${h} цагийн дараа хүчингүй болно. Хүсэлт гаргаагүй бол имэйлийг үл тоомсорлоно уу.`,
  },
};

const PASSWORD_RESET: Record<CopyBundle, PasswordResetEmailCopy> = {
  en: {
    subject: "Reset your Linksy password",
    preview: "Set a new password for your Linksy account.",
    heading: "Reset your password",
    hi: "Hi",
    body: "Tap the button below to choose a new password.",
    cta: "Reset password",
    copyUrlLabel: "Or copy this URL into your browser:",
    expiry: (m) =>
      `This link expires in ${m} minutes. If you did not request this, you can safely ignore the email — your password is still the same.`,
  },
  mn: {
    subject: "Linksy нууц үгээ шинэчилнэ үү",
    preview: "Linksy бүртгэлийн шинэ нууц үг тохируулна уу.",
    heading: "Нууц үг шинэчлэх",
    hi: "Сайн байна уу",
    body: "Шинэ нууц үг сонгохын тулд доорх товчлуурыг дарна уу.",
    cta: "Нууц үг шинэчлэх",
    copyUrlLabel: "Эсвэл энэ холбоосыг хөтөчид хуулж нээнэ үү:",
    expiry: (m) =>
      `Энэ холбоос ${m} минутын дараа хүчингүй болно. Хэрэв та хүсэлт гаргаагүй бол имэйлийг үл тоомсорлож болно — нууц үг өөрчлөгдөөгүй хэвээр.`,
  },
};

const LOGIN_ALERT: Record<CopyBundle, LoginAlertEmailCopy> = {
  en: {
    subject: "New sign-in to your Linksy account",
    preview: "We detected a sign-in from a new device.",
    heading: "New sign-in detected",
    hi: "Hi",
    intro: "We noticed a sign-in to your Linksy account from a device or browser we have not seen before.",
    whenLabel: "When:",
    deviceLabel: "Device:",
    ipLabel: "IP:",
    unknownBrowser: "Unknown browser",
    unknownIp: "Unknown location",
    actionPrompt: "If this was you, no action is needed. If not, secure your account now:",
    changePasswordCta: "Change password",
    reviewSessionsPrefix: "You can also",
    reviewSessionsLink: "review active sessions",
    reviewSessionsSuffix: "in Settings.",
    textBody:
      "We noticed a sign-in to your Linksy account from a device or browser we have not seen before.",
  },
  mn: {
    subject: "Таны Linksy бүртгэлд шинэ нэвтрэлт илэрлээ",
    preview: "Шинэ төхөөрөмжөөс нэвтэрсэн гэж илэрлээ.",
    heading: "Шинэ нэвтрэлт илэрлээ",
    hi: "Сайн байна уу",
    intro:
      "Таны Linksy бүртгэлд өмнө нь хараагүй төхөөрөмж эсвэл хөтөчөөс нэвтэрсэн байна.",
    whenLabel: "Хэзээ:",
    deviceLabel: "Төхөөрөмж:",
    ipLabel: "IP:",
    unknownBrowser: "Тодорхойгүй хөтөч",
    unknownIp: "Тодорхойгүй байршил",
    actionPrompt:
      "Хэрэв та өөрөө бол юу ч хийх шаардлагагүй. Биш бол одоо бүртгэлээ хамгаална уу:",
    changePasswordCta: "Нууц үг солих",
    reviewSessionsPrefix: "Та мөн",
    reviewSessionsLink: "идэвхтэй сешнүүдийг шалгах",
    reviewSessionsSuffix: "боломжтой (Тохиргоо).",
    textBody:
      "Таны Linksy бүртгэлд өмнө нь хараагүй төхөөрөмж эсвэл хөтөчөөс нэвтэрсэн байна.",
  },
};

export function welcomeEmailCopy(b: CopyBundle): WelcomeEmailCopy {
  return WELCOME[b];
}
export function verificationEmailCopy(b: CopyBundle): VerificationEmailCopy {
  return VERIFICATION[b];
}
export function passwordResetEmailCopy(b: CopyBundle): PasswordResetEmailCopy {
  return PASSWORD_RESET[b];
}
export function loginAlertEmailCopy(b: CopyBundle): LoginAlertEmailCopy {
  return LOGIN_ALERT[b];
}

export type BillingReceiptEmailCopy = {
  subject: string;
  preview: string;
  heading: string;
  greetingHi: string;
  intro: string;
  itemLabel: string;
  paidAtLabel: string;
  referenceLabel: string;
  totalLabel: string;
  viewReceiptCta: string;
  manageCta: string;
  support: string;
};

const BILLING_RECEIPT: Record<CopyBundle, BillingReceiptEmailCopy> = {
  en: {
    subject: "Your Linksy receipt",
    preview: "Thanks for your payment — receipt inside.",
    heading: "Receipt",
    greetingHi: "Hi",
    intro: "Thanks for your payment. Here are the details for your records.",
    itemLabel: "Item",
    paidAtLabel: "Paid",
    referenceLabel: "Reference",
    totalLabel: "Total",
    viewReceiptCta: "View full receipt",
    manageCta: "Manage billing",
    support: "Questions? Reply to this email or visit Settings → Billing.",
  },
  mn: {
    subject: "Linksy төлбөрийн баримт",
    preview: "Таны төлбөрийн баримт.",
    heading: "Төлбөрийн баримт",
    greetingHi: "Сайн уу",
    intro: "Төлбөр хийсэнд баярлалаа. Энд бүртгэлд хэрэгтэй мэдээллүүд байна.",
    itemLabel: "Үнэт зүйл",
    paidAtLabel: "Төлсөн өдөр",
    referenceLabel: "Лавлагаа",
    totalLabel: "Нийт",
    viewReceiptCta: "Дэлгэрэнгүй баримт",
    manageCta: "Захиалга удирдах",
    support: "Асуултай юу? Энэ имэйлд хариу бичих эсвэл Settings → Billing руу орно уу.",
  },
};

export function billingReceiptEmailCopy(b: CopyBundle): BillingReceiptEmailCopy {
  return BILLING_RECEIPT[b];
}
