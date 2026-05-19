import { Button, Link, Section, Text } from "@react-email/components";
import type { VerificationEmailCopy } from "@/lib/i18n/email-translations";
import { EmailShell, palette } from "./shell";

const greeting = { margin: "0 0 12px", fontSize: "15px", color: palette.TEXT };
const para = { margin: "0 0 16px", fontSize: "14px", color: "#374151" };
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
const fineprint = { margin: "0 0 6px", fontSize: "12px", color: palette.MUTED };
const link = {
  fontSize: "12px",
  color: palette.ACCENT_DARK,
  wordBreak: "break-all" as const,
  display: "block",
  margin: "0 0 16px",
};

export type VerificationEmailProps = {
  recipientDisplay?: string;
  verifyUrl: string;
  ttlHours?: number;
  copy: VerificationEmailCopy;
};

export function VerificationEmail({ recipientDisplay, verifyUrl, ttlHours = 24, copy }: VerificationEmailProps) {
  const greet = recipientDisplay ? `${copy.greetingHi} ${recipientDisplay},` : `${copy.greetingGeneric},`;
  return (
    <EmailShell preview={copy.preview} heading={copy.heading}>
      <Text style={greeting}>{greet}</Text>
      <Text style={para}>{copy.body}</Text>
      <Section style={ctaWrap}>
        <Button href={verifyUrl} style={cta}>
          {copy.cta}
        </Button>
      </Section>
      <Text style={fineprint}>{copy.copyUrlLabel}</Text>
      <Link href={verifyUrl} style={link}>
        {verifyUrl}
      </Link>
      <Text style={{ margin: 0, fontSize: "12px", color: palette.MUTED }}>
        {copy.expiry(ttlHours)}
      </Text>
    </EmailShell>
  );
}

export function verificationText(
  { recipientDisplay, verifyUrl, ttlHours = 24 }: Omit<VerificationEmailProps, "copy">,
  copy: VerificationEmailCopy,
): string {
  const greet = recipientDisplay ? `${copy.greetingHi} ${recipientDisplay},` : `${copy.greetingGeneric},`;
  return [
    greet,
    "",
    copy.body,
    verifyUrl,
    "",
    copy.expiry(ttlHours),
  ].join("\n");
}
