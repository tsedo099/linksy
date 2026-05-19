import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

const ACCENT = "#7c3aed";
const ACCENT_DARK = "#6d28d9";
const BG = "#f3f4f6";
const TEXT = "#111827";
const MUTED = "#6b7280";

const main = {
  backgroundColor: BG,
  fontFamily: "Helvetica, Arial, sans-serif",
  color: TEXT,
  margin: 0,
  padding: "24px 0",
};

const container = {
  width: "100%",
  maxWidth: "560px",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  overflow: "hidden" as const,
  margin: "0 auto",
};

const header = {
  padding: "24px 28px",
  background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`,
  color: "#ffffff",
};

const headerHeading = {
  margin: 0,
  fontSize: "18px",
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "#ffffff",
};

const headerLabel = {
  margin: "4px 0 0",
  fontSize: "12px",
  opacity: 0.85,
  color: "#ffffff",
};

const contentSection = {
  padding: "24px 28px",
};

const footer = {
  padding: "16px 28px",
  background: "#fafafa",
  borderTop: "1px solid #e5e7eb",
  fontSize: "11px",
  color: MUTED,
  textAlign: "center" as const,
};

export const palette = {
  ACCENT,
  ACCENT_DARK,
  TEXT,
  MUTED,
};

export function EmailShell({
  preview,
  heading,
  children,
}: {
  preview: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading as="h1" style={headerHeading}>
              {heading}
            </Heading>
            <Text style={headerLabel}>Linksy</Text>
          </Section>
          <Section style={contentSection}>{children}</Section>
          <Section style={footer}>
            <Text style={{ margin: 0, color: MUTED, fontSize: "11px" }}>
              Linksy · You are receiving this email because you have an account with us.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
