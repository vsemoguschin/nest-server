-- AlterTable: add projectId and make expenseCategoryId optional
ALTER TABLE "AutoCategoryRule" ADD COLUMN "projectId" INTEGER;
ALTER TABLE "AutoCategoryRule" ALTER COLUMN "expenseCategoryId" DROP NOT NULL;
