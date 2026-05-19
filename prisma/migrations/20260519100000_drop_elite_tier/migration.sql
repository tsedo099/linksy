-- Drop ELITE from SubscriptionTier enum: collapse the pricing model to Free + Pro.
-- Any existing ELITE subscriptions are folded into PRO so users keep their paid
-- status; Stripe-side cleanup (cancelling the legacy ELITE prices) is manual.

UPDATE "User" SET "subscriptionTier" = 'PRO' WHERE "subscriptionTier" = 'ELITE';
UPDATE "Subscription" SET "tier" = 'PRO' WHERE "tier" = 'ELITE';

ALTER TYPE "SubscriptionTier" RENAME TO "SubscriptionTier_old";
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO');

ALTER TABLE "User"
  ALTER COLUMN "subscriptionTier" DROP DEFAULT,
  ALTER COLUMN "subscriptionTier" TYPE "SubscriptionTier"
    USING ("subscriptionTier"::text::"SubscriptionTier"),
  ALTER COLUMN "subscriptionTier" SET DEFAULT 'FREE';

ALTER TABLE "Subscription"
  ALTER COLUMN "tier" TYPE "SubscriptionTier"
    USING ("tier"::text::"SubscriptionTier");

DROP TYPE "SubscriptionTier_old";
