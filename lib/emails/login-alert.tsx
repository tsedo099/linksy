import { Button, Link, Row, Section, Text } from "@react-email/components";
import type { LoginAlertEmailCopy } from "@/lib/i18n/email-translations";
import { EmailShell, palette } from "./shell";

const greeting = { margin: "0 0 12px", fontSize: "15px", color: palette.TEXT };
const para = { margin: "0 0 16px", fontSize: "14px", color: "#374151" };
const infoBox = {
  padding: "12px 14px",
  background: "#fafafa",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  fontSize: "13px",
  color: "#374151",
  margin: "0 0 16px",
};
const ctaWrap = { margin: "24px 0 12px", textAlign: "center" as const };
const cta = {
  display: "inline-block",
  padding: "11px 24px",
  borderRadius: "999px",
  background: palette.ACCENT,
  color: "#ffffff",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: "14px",
};
const footerLine = { margin: "0 0 4px", fontSize: "12px", color: palette.MUTED, textAlign: "center" as const };

export type LoginAlertEmailProps = {
  appOrigin: string;
  recipientDisplay: string;
  loggedInAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
  copy: LoginAlertEmailCopy;
};

function formatDate(date: Date): string {
  return date.toUTCString();
}

export function LoginAlertEmail({
  appOrigin,
  recipientDisplay,
  loggedInAt,
  userAgent,
  ipAddress,
  copy,
}: LoginAlertEmailProps) {
  const origin = appOrigin.replace(/\/$/, "");
  const settingsUrl = `${origin}/settings`;
  const resetUrl = `${origin}/auth/forgot`;
  const when = formatDate(loggedInAt);
  const ua = userAgent || copy.unknownBrowser;
  const ip = ipAddress || copy.unknownIp;
  return (
    <EmailShell preview={copy.preview} heading={copy.heading}>
      <Text style={greeting}>
        {copy.hi} {recipientDisplay},
      </Text>
      <Text style={para}>{copy.intro}</Text>
      <Section style={infoBox}>
        <Row>
          <Text style={{ margin: "0 0 6px" }}>
            <strong>{copy.whenLabel}</strong> {when}
          </Text>
        </Row>
        <Row>
          <Text style={{ margin: "0 0 6px" }}>
            <strong>{copy.deviceLabel}</strong> {ua}
          </Text>
        </Row>
        <Row>
          <Text style={{ margin: 0 }}>
            <strong>{copy.ipLabel}</strong> {ip}
          </Text>
        </Row>
      </Section>
      <Text style={para}>{copy.actionPrompt}</Text>
      <Section style={ctaWrap}>
        <Button href={resetUrl} style={cta}>
          {copy.changePasswordCta}
        </Button>
      </Section>
      <Text style={footerLine}>
        {copy.reviewSessionsPrefix}{" "}
        <Link href={settingsUrl} style={{ color: palette.ACCENT_DARK }}>
          {copy.reviewSessionsLink}
        </Link>{" "}
        {copy.reviewSessionsSuffix}
      </Text>
    </EmailShell>
  );
}

export function loginAlertText(
  { appOrigin, recipientDisplay, loggedInAt, userAgent, ipAddress }: Omit<LoginAlertEmailProps, "copy">,
  copy: LoginAlertEmailCopy,
): string {
  const origin = appOrigin.replace(/\/$/, "");
  const settingsUrl = `${origin}/settings`;
  const resetUrl = `${origin}/auth/forgot`;
  const when = formatDate(loggedInAt);
  const ua = userAgent || copy.unknownBrowser;
  const ip = ipAddress || copy.unknownIp;
  return [
    `${copy.hi} ${recipientDisplay},`,
    "",
    copy.textBody,
    "",
    `${copy.whenLabel} ${when}`,
    `${copy.deviceLabel} ${ua}`,
    `${copy.ipLabel} ${ip}`,
    "",
    copy.actionPrompt,
    `${copy.changePasswordCta}: ${resetUrl}`,
    `${copy.reviewSessionsLink}: ${settingsUrl}`,
  ].join("\n");
}
