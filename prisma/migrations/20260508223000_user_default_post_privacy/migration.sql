-- Default privacy for newly created posts (Settings → Privacy → Account).
ALTER TABLE "User" ADD COLUMN "defaultAllowComments" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "defaultHideLikes" BOOLEAN NOT NULL DEFAULT false;
