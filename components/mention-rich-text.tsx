"use client";

import Link from "next/link";

const MENTION_PART_REGEX = /(?<![\w])@([a-zA-Z0-9._]{1,32})/g;

export function MentionRichText({ text }: { text: string }) {
  const parts: Array<string | { username: string; text: string }> = [];
  const re = new RegExp(MENTION_PART_REGEX.source, MENTION_PART_REGEX.flags);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push({ username: match[1] ?? "", text: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  if (parts.length === 0) return <>{text}</>;

  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : (
          <Link
            key={`${part.username}-${index}`}
            href={`/${encodeURIComponent(part.username)}`}
            className="mention-link"
            onClick={(event) => event.stopPropagation()}
          >
            {part.text}
          </Link>
        ),
      )}
    </>
  );
}
