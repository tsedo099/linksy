-- Conversation was originally created without group fields; schema expects them before the backfill.
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "isGroup" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "ConversationRole" AS ENUM ('MEMBER', 'ADMIN');

ALTER TABLE "ConversationMember"
  ADD COLUMN "role" "ConversationRole" NOT NULL DEFAULT 'MEMBER';

CREATE INDEX "ConversationMember_conversationId_role_idx" ON "ConversationMember"("conversationId", "role");

-- Backfill: in each existing group conversation, promote the earliest-joined member to ADMIN.
WITH first_members AS (
  SELECT DISTINCT ON ("conversationId")
    "conversationId",
    "userId"
  FROM "ConversationMember" cm
  JOIN "Conversation" c ON c."id" = cm."conversationId"
  WHERE c."isGroup" = true
  ORDER BY "conversationId", cm.ctid
)
UPDATE "ConversationMember" cm
SET "role" = 'ADMIN'
FROM first_members fm
WHERE cm."conversationId" = fm."conversationId"
  AND cm."userId" = fm."userId";
