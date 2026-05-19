import { render } from "@react-email/render";
import { bundleForLocale } from "@/lib/i18n/bundles";
import {
  loginAlertEmailCopy,
  passwordResetEmailCopy,
  verificationEmailCopy,
  welcomeEmailCopy,
} from "@/lib/i18n/email-translations";
import { parseAppLanguage, type AppLanguage } from "@/lib/language";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/email";
import { enqueueEmailJob } from "@/lib/email-queue";
import {
  LoginAlertEmail,
  type LoginAlertEmailProps,
  loginAlertText,
} from "@/lib/emails/login-alert";
import {
  PasswordResetEmail,
  type PasswordResetEmailProps,
  passwordResetText,
} from "@/lib/emails/password-reset";
import {
  VerificationEmail,
  type VerificationEmailProps,
  verificationText,
} from "@/lib/emails/verification";
import { WelcomeEmail, type WelcomeEmailProps, welcomeText } from "@/lib/emails/welcome";
import {
  BillingReceiptEmail,
  type BillingReceiptEmailProps,
  billingReceiptText,
} from "@/lib/emails/billing-receipt";
import { billingReceiptEmailCopy } from "@/lib/i18n/email-translations";

/**
 * Transactional email facade. Templates are React components rendered to HTML
 * via @react-email/render; delivery goes through `enqueueEmailJob` which uses
 * BullMQ when REDIS_URL + EMAIL_QUEUE_ENABLED are set, otherwise falls back to
 * the inline `sendTransactionalEmail`.
 *
 * Locale: pass `locale` (User.preferredLanguage) on each send; `notifyOnNewDeviceLogin`
 * loads it from the database.
 */

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

export type WelcomeEmailInput = Omit<WelcomeEmailProps, "copy"> & {
  locale?: AppLanguage | string | null;
};

export type VerificationEmailInput = Omit<VerificationEmailProps, "copy"> & {
  locale?: AppLanguage | string | null;
};

export type PasswordResetEmailInput = Omit<PasswordResetEmailProps, "copy"> & {
  locale?: AppLanguage | string | null;
};

export type LoginAlertEmailInput = Omit<LoginAlertEmailProps, "copy"> & {
  locale?: AppLanguage | string | null;
};

async function renderHtml(element: React.ReactElement): Promise<string> {
  return await render(element, { pretty: false });
}

/* ---------- Welcome ---------- */

export async function renderWelcomeEmail(input: WelcomeEmailInput): Promise<RenderedEmail> {
  const { locale, ...content } = input;
  const bundle = bundleForLocale(parseAppLanguage(locale));
  const copy = welcomeEmailCopy(bundle);
  const props: WelcomeEmailProps = { ...content, copy };
  const html = await renderHtml(WelcomeEmail(props));
  return {
    subject: copy.subject,
    text: welcomeText(props, copy),
    html,
  };
}

/* ---------- Verification ---------- */

export async function renderVerificationEmail(input: VerificationEmailInput): Promise<RenderedEmail> {
  const { locale, ...content } = input;
  const bundle = bundleForLocale(parseAppLanguage(locale));
  const copy = verificationEmailCopy(bundle);
  const props: VerificationEmailProps = { ...content, copy };
  const html = await renderHtml(VerificationEmail(props));
  return {
    subject: copy.subject,
    text: verificationText(props, copy),
    html,
  };
}

/* ---------- Password reset ---------- */

export async function renderPasswordResetEmail(input: PasswordResetEmailInput): Promise<RenderedEmail> {
  const { locale, ...content } = input;
  const bundle = bundleForLocale(parseAppLanguage(locale));
  const copy = passwordResetEmailCopy(bundle);
  const props: PasswordResetEmailProps = { ...content, copy };
  const html = await renderHtml(PasswordResetEmail(props));
  return {
    subject: copy.subject,
    text: passwordResetText(props, copy),
    html,
  };
}

/* ---------- New-device login alert ---------- */

export async function renderLoginAlertEmail(input: LoginAlertEmailInput): Promise<RenderedEmail> {
  const { locale, ...content } = input;
  const bundle = bundleForLocale(parseAppLanguage(locale));
  const copy = loginAlertEmailCopy(bundle);
  const props: LoginAlertEmailProps = { ...content, copy };
  const html = await renderHtml(LoginAlertEmail(props));
  return {
    subject: copy.subject,
    text: loginAlertText(props, copy),
    html,
  };
}

/* ---------- Senders (queue-aware) ---------- */

async function dispatch(to: string, message: RenderedEmail): Promise<void> {
  const queued = await enqueueEmailJob({ to, ...message });
  if (queued) return;
  await sendTransactionalEmail({ to, ...message });
}

export async function sendWelcomeEmail(to: string, input: WelcomeEmailInput): Promise<void> {
  await dispatch(to, await renderWelcomeEmail(input));
}

export async function sendVerificationEmail(to: string, input: VerificationEmailInput): Promise<void> {
  await dispatch(to, await renderVerificationEmail(input));
}

export async function sendPasswordResetEmail(to: string, input: PasswordResetEmailInput): Promise<void> {
  await dispatch(to, await renderPasswordResetEmail(input));
}

export async function sendLoginAlertEmail(to: string, input: LoginAlertEmailInput): Promise<void> {
  await dispatch(to, await renderLoginAlertEmail(input));
}

/* ---------- Billing receipt ---------- */

export type BillingReceiptEmailInput = Omit<BillingReceiptEmailProps, "copy"> & {
  locale?: AppLanguage | string | null;
};

export async function renderBillingReceiptEmail(
  input: BillingReceiptEmailInput,
): Promise<RenderedEmail> {
  const { locale, ...content } = input;
  const bundle = bundleForLocale(parseAppLanguage(locale));
  const copy = billingReceiptEmailCopy(bundle);
  const props: BillingReceiptEmailProps = { ...content, copy };
  const html = await renderHtml(BillingReceiptEmail(props));
  return {
    subject: copy.subject,
    text: billingReceiptText(props),
    html,
  };
}

export async function sendBillingReceiptEmail(
  to: string,
  input: BillingReceiptEmailInput,
): Promise<void> {
  await dispatch(to, await renderBillingReceiptEmail(input));
}

/* ---------- New-device detection ---------- */

/**
 * Send a login alert if this is the first time we see this userAgent for this
 * user. "New device" = no prior Session row (other than the one just created)
 * shares the same userAgent string. Best-effort; never throws.
 */
export async function notifyOnNewDeviceLogin(input: {
  userId: string;
  email: string;
  recipientDisplay: string;
  appOrigin: string;
  newSessionId: string;
  userAgent: string | null;
  ipAddress: string | null;
  loggedInAt?: Date;
}): Promise<{ alerted: boolean }> {
  if (!input.userAgent) return { alerted: false };
  try {
    const prior = await prisma.session.count({
      where: {
        userId: input.userId,
        userAgent: input.userAgent,
        id: { not: input.newSessionId },
      },
    });
    if (prior > 0) return { alerted: false };

    const row = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { preferredLanguage: true },
    });

    await sendLoginAlertEmail(input.email, {
      appOrigin: input.appOrigin,
      recipientDisplay: input.recipientDisplay,
      loggedInAt: input.loggedInAt ?? new Date(),
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      locale: row?.preferredLanguage,
    });
    return { alerted: true };
  } catch {
    return { alerted: false };
  }
}
