"use client";

import { useState } from "react";

export type PollOption = { label: string; pct: number; voted?: boolean };
export type PollData = { question: string; options: PollOption[]; total: string; ends: string };

export function PollBlock({ poll }: { poll: PollData }) {
  const [voted, setVoted] = useState<number | null>(
    poll.options.findIndex(o => o.voted) ?? null,
  );
  return (
    <div className="post-poll">
      <p className="post-poll-q">{poll.question}</p>
      <div className="post-poll-options">
        {poll.options.map((o, i) => (
          <button
            key={i}
            className={`post-poll-opt${voted === i ? " post-poll-opt--voted" : ""}${voted !== null ? " post-poll-opt--revealed" : ""}`}
            onClick={() => voted === null && setVoted(i)}
            disabled={voted !== null}
          >
            <span className="post-poll-bar" style={{ width: voted !== null ? `${o.pct}%` : "0%" }} />
            <span className="post-poll-label">{o.label}</span>
            {voted !== null && <span className="post-poll-pct">{o.pct}%</span>}
          </button>
        ))}
      </div>
      <p className="post-poll-meta">{poll.total} votes · {poll.ends}</p>
    </div>
  );
}
