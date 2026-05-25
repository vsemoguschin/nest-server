ALTER TABLE "Board"
  ADD COLUMN "projectId" INTEGER;

ALTER TABLE "TaskOrder"
  ADD COLUMN "cloudLink" TEXT,
  ADD COLUMN "size" TEXT,
  ADD COLUMN "spreadsCount" INTEGER;

CREATE INDEX "Board_projectId_idx" ON "Board"("projectId");

ALTER TABLE "Board"
  ADD CONSTRAINT "Board_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
