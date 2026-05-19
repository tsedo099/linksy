export const REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "HATE",
  "NUDITY",
  "VIOLENCE",
  "MISINFORMATION",
  "OTHER",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
