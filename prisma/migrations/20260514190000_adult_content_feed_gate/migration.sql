-- Extend the adult-content gate from messages (added in
-- 20260514180000_age_aware_adult_content) to the feed surfaces: Posts and
-- Stories. Rules:
--   * Under-18 viewers never see flagged Post / Story rows in the feed.
--   * Under-18 authors are blocked from posting flagged content at the API
--     boundary; this column is set either by an explicit composer toggle or
--     the keyword scorer in `lib/adult-content.ts`.
--   * 18+ viewers see flagged posts/stories in the feed *without* a gate
--     (matching the product spec). Only direct messages gate behind the
--     "are you sure you want to view?" reveal dialog.

ALTER TABLE "Post"
  ADD COLUMN "containsAdultContent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Story"
  ADD COLUMN "containsAdultContent" BOOLEAN NOT NULL DEFAULT false;

-- No dedicated index: existing feed queries already filter by `audience` and
-- `createdAt`, and the adult flag is read as a refinement on top of that
-- bound set. Re-evaluate if a future analytics query needs `WHERE
-- containsAdultContent = true` over the whole table.
