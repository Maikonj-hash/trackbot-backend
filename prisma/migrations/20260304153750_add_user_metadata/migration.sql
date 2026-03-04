-- AlterTable
ALTER TABLE "Flow" ADD COLUMN     "publishedContent" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "metadata" JSONB DEFAULT '{}';
