import { sanitizePlainText } from "@/lib/sanitize-html";

type PollVoteRow = {
  userId: string;
  optionIndex: number;
};

type PollRecord = {
  id: string;
  question: string;
  options: string[];
  expiresAt: Date | null;
  votes: PollVoteRow[];
};

type PollOptionView = {
  index: number;
  text: string;
  votes: number;
  percentage: number;
};

export type PollView = {
  id: string;
  question: string;
  options: PollOptionView[];
  totalVotes: number;
  votedOptionIndex: number | null;
  expiresAt: string | null;
  expired: boolean;
};

export function formatPollForViewer(poll: PollRecord | null | undefined, viewerUserId: string): PollView | null {
  if (!poll) return null;

  const totals = new Array(poll.options.length).fill(0) as number[];
  let votedOptionIndex: number | null = null;
  for (const vote of poll.votes) {
    if (vote.optionIndex >= 0 && vote.optionIndex < totals.length) {
      totals[vote.optionIndex] = (totals[vote.optionIndex] ?? 0) + 1;
    }
    if (vote.userId === viewerUserId) {
      votedOptionIndex = vote.optionIndex;
    }
  }
  const totalVotes = totals.reduce((sum, value) => sum + value, 0);
  const options = poll.options.map((text, index) => ({
    index,
    text,
    votes: totals[index] ?? 0,
    percentage: totalVotes > 0 ? Math.round(((totals[index] ?? 0) / totalVotes) * 100) : 0,
  }));

  const expired = poll.expiresAt ? poll.expiresAt.getTime() <= Date.now() : false;
  return {
    id: poll.id,
    question: poll.question,
    options,
    totalVotes,
    votedOptionIndex,
    expiresAt: poll.expiresAt ? poll.expiresAt.toISOString() : null,
    expired,
  };
}

export type PollInput = {
  question: string;
  options: string[];
  durationHours?: number | null;
};

export function parsePollInput(value: unknown): PollInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as { question?: unknown; options?: unknown; durationHours?: unknown };
  const question = sanitizePlainText(typeof input.question === "string" ? input.question.trim() : "").trim();
  if (!question || question.length > 240) return null;

  if (!Array.isArray(input.options)) return null;
  const options = input.options
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizePlainText(item.trim()).trim())
    .filter(Boolean);

  if (options.length < 2 || options.length > 4) return null;
  if (options.some((option) => option.length > 80)) return null;

  const unique = new Set(options.map((option) => option.toLowerCase()));
  if (unique.size !== options.length) return null;

  let durationHours: number | null = null;
  if (input.durationHours !== undefined && input.durationHours !== null) {
    if (typeof input.durationHours !== "number" || !Number.isFinite(input.durationHours)) return null;
    const rounded = Math.floor(input.durationHours);
    if (rounded < 1 || rounded > 168) return null;
    durationHours = rounded;
  }

  return { question, options, durationHours };
}
