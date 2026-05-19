-- Signup form expansion: collect `birthDate` + `gender` at registration, and
-- add the adult-content gate on direct messages. There is **no** account-
-- creation age restriction — `birthDate` is purely a per-user preference that
-- controls how adult content is *displayed* to the user, not whether they
-- can sign up.
--
-- Semantics:
--   * `User.birthDate` NULL  → user treated as an adult who hasn't opted out
--     of the confirm dialog. Adult content is delivered but gated by a
--     reveal prompt client-side. (Only legacy users — new accounts must
--     supply a date.)
--   * `User.birthDate` set and resolved age < 18 → adult-content messages
--     are redacted by the API; the recipient never receives the body.
--   * `User.birthDate` set and >= 18 → same as NULL (confirm-then-reveal).
--   * `User.autoRevealAdultContent` true (and user is adult) → skip the
--     confirm dialog, render inline.
--
-- `Message.containsAdultContent` is set by the sender's composer toggle OR
-- the server-side keyword scorer in `lib/adult-content.ts`. NULL on legacy
-- rows is treated as `false`.
--
-- `User.gender` is collected at signup but never used for access control —
-- only product personalisation + analytics. `UNDISCLOSED` is the safe
-- default and is what legacy users land on after this migration.

CREATE TYPE "UserGender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'UNDISCLOSED');

ALTER TABLE "User"
  ADD COLUMN "birthDate" TIMESTAMP(3),
  ADD COLUMN "autoRevealAdultContent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gender" "UserGender" NOT NULL DEFAULT 'UNDISCLOSED';

ALTER TABLE "Message"
  ADD COLUMN "containsAdultContent" BOOLEAN DEFAULT false;

-- Most queries that filter by adult content first restrict to a conversation
-- + time window (already covered by Message_conversationId_createdAt_idx),
-- so we don't need a dedicated index. Add one only if a future analytics
-- query needs `WHERE containsAdultContent = true` over the whole table.
