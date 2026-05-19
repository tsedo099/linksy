import { Resend } from "resend";

import { logger } from "./logger";

type EmailProvider = "resend" | "sendgrid";

type SendEmailInput = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

function chooseProvider(): EmailProvider | null {
  const preferred = process.env.EMAIL_PROVIDER?.trim().toLowerCase();

  if (preferred === "resend" || preferred === "sendgrid") {
    return preferred;
  }

  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SENDGRID_API_KEY) return "sendgrid";

  return null;
}

function getFromAddress(provider: EmailProvider): string | null {
  if (process.env.EMAIL_FROM?.trim()) return process.env.EMAIL_FROM.trim();
  if (provider === "resend" && process.env.RESEND_FROM_EMAIL?.trim()) return process.env.RESEND_FROM_EMAIL.trim();
  if (provider === "sendgrid" && process.env.SENDGRID_FROM_EMAIL?.trim()) return process.env.SENDGRID_FROM_EMAIL.trim();
  return null;
}

let resendClient: Resend | null = null;

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

async function sendViaResend(payload: SendEmailInput, from: string) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });

  if (error) {
    throw new Error(
      `Resend API failed (${error.statusCode ?? "?"}): ${error.message}`,
    );
  }
}

async function sendViaSendGrid(payload: SendEmailInput, from: string) {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY is not set.");
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: payload.to }] }],
      from: { email: from },
      subject: payload.subject,
      content: [
        { type: "text/plain", value: payload.text },
        { type: "text/html", value: payload.html },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`SendGrid API failed (${response.status}): ${details || "Unknown error"}`);
  }
}

export async function sendTransactionalEmail(payload: SendEmailInput) {
  const provider = chooseProvider();

  if (!provider) {
    if (process.env.NODE_ENV !== "production") {
      logger.info({ to: payload.to, subject: payload.subject }, "email skipped (no provider, dev fallback)");
      return;
    }

    throw new Error("Email provider is not configured. Set EMAIL_PROVIDER + API key env vars.");
  }

  const from = getFromAddress(provider);
  if (!from) {
    throw new Error("Sender email is not configured. Set EMAIL_FROM (or provider-specific FROM env var).");
  }

  if (provider === "resend") {
    await sendViaResend(payload, from);
    return;
  }

  await sendViaSendGrid(payload, from);
}
