"use client";

import { MessageSquare } from "lucide-react";
import type { MessagesScreenStrings } from "@/lib/i18n/messages-screen-copy";

export function Empty({ ms }: { ms: MessagesScreenStrings }) {
  return (
    <div className="ms-empty">
      <div className="ms-empty-ring">
        <MessageSquare width={40} height={40} strokeWidth={1.5} aria-hidden />
      </div>
      <p className="ms-empty-title">{ms.emptyTitle}</p>
      <p className="ms-empty-sub">{ms.emptySub}</p>
    </div>
  );
}
