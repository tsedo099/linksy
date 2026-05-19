import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/email";
import {
  digestEmailTranslation,
  digestGreeting,
  digestPlainPeriodLine,
  digestSomeoneDisplay,
  digestSnippetLabel,
  digestTotalsLines,
  formatDigestSubject,
} from "@/lib/i18n/digest-email";
import type { AppLanguage } from "@/lib/language";
import { parseAppLanguage } from "@/lib/language";
import { cadenceFromDb, type EmailDigestCadence } from "@/lib/notifications";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { notificationFeedWhere } from "@/lib/notification-rules";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type DigestSummary = {
  hasContent: boolean;
  totals: {
    notifications: number;
    likes: number;
    comments: number;
    follows: number;
    mentions: number;
    messages: number;
    stories: number;
  };
  topActors: Array<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    interactions: number;
  }>;
  recentSnippets: Array<{
    actorDisplay: string;
    actorUsername: string;
    label: string;
    createdAt: Date;
  }>;
};

export type DigestRenderInput = {
  appOrigin: string;
  cadence: EmailDigestCadence;
  recipientDisplay: string;
  since: Date;
  summary: DigestSummary;
  locale: AppLanguage;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pickAvatarLetter(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first || "?";
}

export async function buildDigestSummary(userId: string, since: Date, lang: AppLanguage): Promise<DigestSummary> {
  const totals = {
    notifications: 0,
    likes: 0,
    comments: 0,
    follows: 0,
    mentions: 0,
    messages: 0,
    stories: 0,
  };

  const blockedIds = await getBlockedUserIds(userId);
  const feedWhere = await notificationFeedWhere(userId, blockedIds);

  const [notifications, messageCount] = await Promise.all([
    prisma.notification.findMany({
      where: { AND: [feedWhere, { createdAt: { gte: since } }] },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        from: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    }),
    prisma.message.count({
      where: {
        createdAt: { gte: since },
        senderId: { not: userId },
        conversation: { members: { some: { userId } } },
      },
    }),
  ]);

  totals.notifications = notifications.length;
  totals.messages = messageCount;

  for (const item of notifications) {
    switch (item.type) {
      case "like":
        totals.likes += 1;
        break;
      case "comment":
        totals.comments += 1;
        break;
      case "follow":
        totals.follows += 1;
        break;
      case "mention":
      case "post_mention":
      case "story_mention":
        totals.mentions += 1;
        break;
      case "story":
      case "story_reaction":
      case "story_collab":
      case "story_expiring":
        totals.stories += 1;
        break;
      case "message_request":
        totals.messages += 1;
        break;
      case "friend_joined":
        totals.follows += 1;
        break;
      default:
        break;
    }
  }

  const interactionsByActor = new Map<string, { count: number; from: typeof notifications[number]["from"] }>();
  for (const item of notifications) {
    if (!item.from?.id) continue;
    if (item.type === "story_expiring" && item.from.id === userId) continue;
    const entry = interactionsByActor.get(item.from.id);
    if (entry) {
      entry.count += 1;
    } else {
      interactionsByActor.set(item.from.id, { count: 1, from: item.from });
    }
  }

  const topActors = Array.from(interactionsByActor.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((entry) => ({
      id: entry.from.id,
      username: entry.from.username,
      displayName: entry.from.displayName,
      avatarUrl: entry.from.avatarUrl,
      interactions: entry.count,
    }));

  const recentSnippets = notifications.slice(0, 8).map((item) => ({
    actorDisplay: item.from?.displayName ?? digestSomeoneDisplay(lang),
    actorUsername: item.from?.username ?? "",
    label: digestSnippetLabel(item.type, lang),
    createdAt: item.createdAt,
  }));

  const hasContent = totals.notifications > 0 || totals.messages > 0;

  return { hasContent, totals, topActors, recentSnippets };
}

export function renderDigestEmail({
  appOrigin,
  cadence,
  recipientDisplay,
  since,
  summary,
  locale,
}: DigestRenderInput): {
  subject: string;
  text: string;
  html: string;
} {
  const t = digestEmailTranslation(locale);
  const isWeekly = cadence === "weekly";
  const cadenceKey = isWeekly ? "weekly" : "daily";
  const subject = formatDigestSubject(
    locale,
    cadenceKey,
    summary.hasContent,
    summary.totals.notifications + summary.totals.messages,
  );
  const periodLabel = isWeekly ? t.periodWeekly : t.periodDaily;
  const sinceFormatted = since.toUTCString();
  const digestTitleHtml = isWeekly ? t.htmlDigestTitleWeekly : t.htmlDigestTitleDaily;
  const ctaUrl = `${appOrigin.replace(/\/$/, "")}/notifications`;
  const settingsUrl = `${appOrigin.replace(/\/$/, "")}/settings`;
  const totalsList = digestTotalsLines(summary.totals, locale);
  const periodPlain = digestPlainPeriodLine(locale, cadenceKey, sinceFormatted);

  const textLines = summary.recentSnippets.length
    ? `${t.recentActivity}:\n${summary.recentSnippets
        .map((snippet) => `- ${snippet.actorDisplay} (@${snippet.actorUsername}) ${snippet.label}`)
        .join("\n")}`
    : "";

  const text = [
    digestGreeting(locale, recipientDisplay),
    "",
    periodPlain,
    "",
    summary.hasContent
      ? `${t.newActivityPrefix} ${totalsList.join(", ") || t.textNoBreakdown}`
      : t.totalsFallback,
    "",
    textLines,
    "",
    `${t.openBtn}: ${ctaUrl}`,
    `${t.adjustDigestPrefs}: ${settingsUrl}`,
    "",
    t.prefsHint,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const totalsHtml = totalsList.length
    ? `<ul style="padding:0 0 0 18px;margin:0 0 16px;color:#1f2937;line-height:1.6;">${totalsList
        .map((entry) => `<li>${escapeHtml(entry)}</li>`)
        .join("")}</ul>`
    : `<p style="margin:0 0 16px;color:#6b7280;">${escapeHtml(t.totalsFallback)}</p>`;

  const actorsHtml = summary.topActors.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 20px;">
        ${summary.topActors
          .map((actor) => {
            const interactionWord =
              actor.interactions === 1 ? t.interactionOne : t.interactionMany;
            return `<tr>
              <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;padding-right:12px;">
                      ${
                        actor.avatarUrl
                          ? `<img src="${escapeHtml(actor.avatarUrl)}" width="36" height="36" alt="" style="display:block;border-radius:50%;border:1px solid #e5e7eb;" />`
                          : `<div style="width:36px;height:36px;border-radius:50%;background:#7c3aed;color:#fff;text-align:center;line-height:36px;font-weight:700;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(pickAvatarLetter(actor.displayName))}</div>`
                      }
                    </td>
                    <td style="vertical-align:middle;font-family:Helvetica,Arial,sans-serif;color:#111827;">
                      <strong style="display:block;font-size:14px;">${escapeHtml(actor.displayName)}</strong>
                      <span style="display:block;font-size:12px;color:#6b7280;">@${escapeHtml(actor.username)} · ${actor.interactions} ${interactionWord}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;
          })
          .join("")}
      </table>`
    : "";

  const snippetsHtml = summary.recentSnippets.length
    ? `<h3 style="font-family:Helvetica,Arial,sans-serif;font-size:14px;margin:0 0 8px;color:#111827;">${escapeHtml(t.recentActivity)}</h3>
        <ul style="padding:0 0 0 18px;margin:0 0 20px;color:#374151;line-height:1.6;font-family:Helvetica,Arial,sans-serif;font-size:13px;">${summary.recentSnippets
          .map(
            (snippet) =>
              `<li><strong>${escapeHtml(snippet.actorDisplay)}</strong> <span style="color:#6b7280;">@${escapeHtml(snippet.actorUsername)}</span> ${escapeHtml(snippet.label)}</li>`,
          )
          .join("")}</ul>`
    : "";

  const introParagraph = summary.hasContent
    ? isWeekly
      ? t.introHasContentWeekly
      : t.introHasContentDaily
    : t.introIdle;

  const html = `<!doctype html>
  <html><body style="margin:0;background:#f3f4f6;padding:24px 0;font-family:Helvetica,Arial,sans-serif;color:#111827;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:24px 28px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;">
          <h1 style="margin:0;font-size:18px;font-weight:800;letter-spacing:-0.01em;">${escapeHtml(digestTitleHtml)}</h1>
          <p style="margin:4px 0 0;font-size:12px;opacity:0.85;">${escapeHtml(periodLabel)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px;">
          <p style="margin:0 0 12px;font-size:15px;">${escapeHtml(digestGreeting(locale, recipientDisplay))}</p>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;">${escapeHtml(introParagraph)}</p>
          ${totalsHtml}
          ${actorsHtml}
          ${snippetsHtml}
          <p style="margin:24px 0 12px;text-align:center;">
            <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:10px 22px;border-radius:999px;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">${escapeHtml(t.openBtn)}</a>
          </p>
          <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
            ${escapeHtml(t.footerDontWant)} <a href="${escapeHtml(settingsUrl)}" style="color:#6d28d9;">${escapeHtml(t.footerPrefs)}</a>.
          </p>
        </td>
      </tr>
    </table>
  </body></html>`;

  return { subject, text, html };
}

export type SendDigestResult = {
  delivered: boolean;
  reason?: "no-content" | "no-email" | "send-failed";
};

export async function sendDigestForUser(
  userId: string,
  appOrigin: string,
  options: { force?: boolean } = {},
): Promise<SendDigestResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      preferredLanguage: true,
      emailDigest: true,
      digestLastSentAt: true,
      deactivatedAt: true,
    },
  });

  if (!user || user.deactivatedAt || !user.email) {
    return { delivered: false, reason: "no-email" };
  }

  const cadence = cadenceFromDb(user.emailDigest as unknown as string | null);
  if (!options.force && cadence === "off") {
    return { delivered: false, reason: "no-content" };
  }

  const window = (options.force ? cadence : cadence) === "weekly" ? WEEK_MS : DAY_MS;
  const since = user.digestLastSentAt && !options.force
    ? user.digestLastSentAt
    : new Date(Date.now() - window);

  const locale = parseAppLanguage(user.preferredLanguage);
  const summary = await buildDigestSummary(user.id, since, locale);

  if (!summary.hasContent && !options.force) {
    return { delivered: false, reason: "no-content" };
  }

  const effectiveCadence: EmailDigestCadence = cadence === "off" ? "daily" : cadence;
  const message = renderDigestEmail({
    appOrigin,
    cadence: effectiveCadence,
    recipientDisplay: user.displayName,
    since,
    summary,
    locale,
  });

  try {
    await sendTransactionalEmail({
      to: user.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch {
    return { delivered: false, reason: "send-failed" };
  }

  await prisma.user
    .update({ where: { id: user.id }, data: { digestLastSentAt: new Date() } })
    .catch(() => undefined);

  return { delivered: true };
}

export async function listUsersDueForDigest(now: Date): Promise<string[]> {
  const dailyThreshold = new Date(now.getTime() - DAY_MS);
  const weeklyThreshold = new Date(now.getTime() - WEEK_MS);

  const dueDaily = await prisma.user.findMany({
    where: {
      emailDigest: "DAILY" as never,
      OR: [{ digestLastSentAt: null }, { digestLastSentAt: { lt: dailyThreshold } }],
      deactivatedAt: null,
      accountDeletionRequestedAt: null,
    },
    select: { id: true },
  });

  const dueWeekly = await prisma.user.findMany({
    where: {
      emailDigest: "WEEKLY" as never,
      OR: [{ digestLastSentAt: null }, { digestLastSentAt: { lt: weeklyThreshold } }],
      deactivatedAt: null,
      accountDeletionRequestedAt: null,
    },
    select: { id: true },
  });

  return [...dueDaily.map((u) => u.id), ...dueWeekly.map((u) => u.id)];
}
