-- App UI + email/push locale for the user (see User.preferredLanguage in schema).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredLanguage" TEXT NOT NULL DEFAULT 'en';
