import { Button, Section, Text } from "@react-email/components";
import { EmailShell, palette } from "./shell";
import type { BillingReceiptEmailCopy } from "@/lib/i18n/email-translations";

const greeting = { margin: "0 0 12px", fontSize: "15px", color: palette.TEXT };
const para = { margin: "0 0 16px", fontSize: "14px", color: "#374151" };

const summaryCard = {
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  padding: "14px 16px",
  margin: "12px 0 18px",
  background: "#fafafa",
};
const summaryRow = {
  display: "flex" as const,
  justifyContent: "space-between" as const,
  fontSize: "14px",
  color: palette.TEXT,
  lineHeight: "1.8",
};
const summaryDivider = {
  borderTop: "1px solid #e5e7eb",
  margin: "8px 0",
};
const summaryTotal = {
  ...summaryRow,
  fontWeight: 700 as const,
  fontSize: "15px",
};

const ctaWrap = { margin: "20px 0 0", textAlign: "center" as const };
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
const muted = { margin: "12px 0 0", fontSize: "12px", color: palette.MUTED, textAlign: "center" as const };

export type BillingReceiptEmailProps = {
  appOrigin: string;
  recipientDisplay: string;
  /** "Pro plan (monthly)" or "Tip to @username" — UI copy, not used for tax. */
  itemLabel: string;
  /** Already-formatted total — e.g. "$9.00", "₮ 5,000". The webhook passes Stripe's already-localised string. */
  amountFormatted: string;
  /** Stripe receipt URL (`paymentIntent.charges.data[0].receipt_url` or invoice.hosted_invoice_url). Optional. */
  receiptUrl?: string;
  /** ISO date of the charge. */
  paidAt: string;
  /** Stripe payment / invoice id for support reference. */
  referenceId: string;
  copy: BillingReceiptEmailCopy;
};

export function BillingReceiptEmail({
  appOrigin,
  recipientDisplay,
  itemLabel,
  amountFormatted,
  receiptUrl,
  paidAt,
  referenceId,
  copy,
}: BillingReceiptEmailProps) {
  const billingUrl = `${appOrigin.replace(/\/$/, "")}/settings/billing`;
  return (
    <EmailShell preview={copy.preview} heading={copy.heading}>
      <Text style={greeting}>{`${copy.greetingHi} ${recipientDisplay},`}</Text>
      <Text style={para}>{copy.intro}</Text>

      <Section style={summaryCard}>
        <div style={summaryRow}>
          <span>{copy.itemLabel}</span>
          <span>{itemLabel}</span>
        </div>
        <div style={summaryRow}>
          <span>{copy.paidAtLabel}</span>
          <span>{paidAt}</span>
        </div>
        <div style={summaryRow}>
          <span>{copy.referenceLabel}</span>
          <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px" }}>{referenceId}</span>
        </div>
        <div style={summaryDivider} />
        <div style={summaryTotal}>
          <span>{copy.totalLabel}</span>
          <span>{amountFormatted}</span>
        </div>
      </Section>

      {receiptUrl ? (
        <Section style={ctaWrap}>
          <Button href={receiptUrl} style={cta}>
            {copy.viewReceiptCta}
          </Button>
        </Section>
      ) : null}

      <Section style={ctaWrap}>
        <Button href={billingUrl} style={{ ...cta, background: "#ffffff", color: palette.ACCENT, border: `1px solid ${palette.ACCENT}` }}>
          {copy.manageCta}
        </Button>
      </Section>

      <Text style={muted}>{copy.support}</Text>
    </EmailShell>
  );
}

export function billingReceiptText(props: BillingReceiptEmailProps): string {
  const { recipientDisplay, itemLabel, amountFormatted, paidAt, referenceId, receiptUrl, copy } = props;
  const lines = [
    `${copy.greetingHi} ${recipientDisplay},`,
    "",
    copy.intro,
    "",
    `${copy.itemLabel}: ${itemLabel}`,
    `${copy.paidAtLabel}: ${paidAt}`,
    `${copy.referenceLabel}: ${referenceId}`,
    `${copy.totalLabel}: ${amountFormatted}`,
    "",
  ];
  if (receiptUrl) {
    lines.push(`${copy.viewReceiptCta}: ${receiptUrl}`);
    lines.push("");
  }
  lines.push(copy.support);
  return lines.join("\n");
}
