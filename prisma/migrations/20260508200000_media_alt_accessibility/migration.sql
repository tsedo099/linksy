-- AlterTable
ALTER TABLE "Post" ADD COLUMN "mediaAltTexts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Story" ADD COLUMN "mediaAlt" TEXT;

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN "mediaAltTexts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
