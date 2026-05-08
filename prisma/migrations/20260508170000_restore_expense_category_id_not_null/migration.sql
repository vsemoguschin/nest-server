-- Restore NOT NULL on expenseCategoryId (project is a supplemental field, category is required)
-- Safety: update any rows that ended up with NULL (shouldn't exist, but guard against test data)
UPDATE "AutoCategoryRule" SET "expenseCategoryId" = 0 WHERE "expenseCategoryId" IS NULL;
ALTER TABLE "AutoCategoryRule" ALTER COLUMN "expenseCategoryId" SET NOT NULL;
