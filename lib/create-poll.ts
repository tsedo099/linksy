export const POLL_DURATION_HOURS = [24, 48, 72, 168] as const;

export function normalizePollOptions(options: readonly string[]): string[] {
  return options.map((item) => item.trim()).filter(Boolean);
}

/** Returns a machine key; map to UX copy via pollValidationMessage */
export type PollValidationCode = "POLL_QUESTION_REQUIRED" | "POLL_OPTIONS_MIN" | "POLL_OPTIONS_DUPLICATE";

export function validatePollForSubmit(withPoll: boolean, question: string, options: readonly string[]): PollValidationCode | null {
  if (!withPoll) return null;
  const q = question.trim();
  const opts = normalizePollOptions(options);
  if (!q) return "POLL_QUESTION_REQUIRED";
  if (opts.length < 2) return "POLL_OPTIONS_MIN";
  if (new Set(opts.map((option) => option.toLowerCase())).size !== opts.length) return "POLL_OPTIONS_DUPLICATE";
  return null;
}

export function pollValidationMessage(code: PollValidationCode, scope: "story" | "post"): string {
  if (code === "POLL_QUESTION_REQUIRED") {
    return "Poll question is required.";
  }
  if (code === "POLL_OPTIONS_DUPLICATE") {
    return "Poll options must be different.";
  }
  return scope === "story" ? "Story poll needs at least 2 options." : "Add at least 2 poll options.";
}
