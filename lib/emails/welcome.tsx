import { Button, Section, Text } from "@react-email/components";
import type { WelcomeEmailCopy } from "@/lib/i18n/email-translations";
import { EmailShell, palette } from "./shell";

const greeting = { margin: "0 0 12px", fontSize: "15px", color: palette.TEXT };
const para = { margin: "0 0 16px", fontSize: "14px", color: "#374151" };
const list = {
  padding: "0 0 0 18px",
  margin: "0 0 16px",
  color: "#1f2937",
  lineHeight: "1.7",
  fontSize: "14px",
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
const muted = { margin: "8px 0 0", fontSize: "12px", color: palette.MUTED, textAlign: "center" as const };

export type WelcomeEmailProps = {
  appOrigin: string;
  recipientDisplay: string;
  verifyUrl?: string;
  copy: WelcomeEmailCopy;
};

export function WelcomeEmail({ appOrigin, recipientDisplay, verifyUrl, copy }: WelcomeEmailProps) {
  const homeUrl = `${appOrigin.replace(/\/$/, "")}/home`;
  const greetLine = `${copy.greetingHi} ${recipientDisplay},`;
  return (
    <EmailShell preview={copy.preview} heading={copy.heading}>
      <Text style={greeting}>{greetLine}</Text>
      <Text style={para}>{copy.intro}</Text>
      <ul style={list}>
        <li>{copy.bullet1}</li>
        <li>{copy.bullet2}</li>
        <li>{copy.bullet3}</li>
      </ul>
      {verifyUrl ? (
        <>
          <Text style={para}>{copy.verifyPrompt}</Text>
          <Section style={ctaWrap}>
            <Button href={verifyUrl} style={cta}>
              {copy.verifyCta}
            </Button>
          </Section>
        </>
      ) : null}
      <Section style={ctaWrap}>
        <Button href={homeUrl} style={cta}>
          {copy.openCta}
        </Button>
      </Section>
      <Text style={muted}>{copy.footer}</Text>
    </EmailShell>
  );
}

export function welcomeText(
  { appOrigin, recipientDisplay, verifyUrl }: Omit<WelcomeEmailProps, "copy">,
  copy: WelcomeEmailCopy,
): string {
  const homeUrl = `${appOrigin.replace(/\/$/, "")}/home`;
  return [
    `${copy.greetingHi} ${recipientDisplay},`,
    "",
    `${copy.intro}`,
    `  • ${copy.bullet1}`,
    `  • ${copy.bullet2}`,
    `  • ${copy.bullet3}`,
    verifyUrl ? "" : null,
    verifyUrl ? `${copy.verifyPrompt} ${verifyUrl}` : null,
    `${copy.openCta}: ${homeUrl}`,
    "",
    copy.footer,
  ]
    .filter((line): line is string => line !== null)
    .filter((line, idx, arr) => !(line === "" && (idx === 0 || arr[idx - 1] === "")))
    .join("\n");
}
