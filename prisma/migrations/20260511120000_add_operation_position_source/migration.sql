-- Add source field to OperationPosition.
-- Existing rows get 'MANUAL' as the default because we cannot know retrospectively
-- whether they were created by auto-sync or by hand.
-- The cleanup script (planfact-cleanup-duplicate-positions.ts) will back-fill
-- AUTO_SYNC on rows that look like auto-created singletons.

ALTER TABLE "OperationPosition"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- Partial unique index: at most one AUTO_SYNC position per originalOperationId.
-- Prisma does not support partial unique indexes via @@unique, so we add it here.
CREATE UNIQUE INDEX "OperationPosition_auto_sync_unique"
ON "OperationPosition" ("originalOperationId")
WHERE "source" = 'AUTO_SYNC';
