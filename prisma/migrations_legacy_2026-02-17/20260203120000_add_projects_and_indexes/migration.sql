-- Create Project table
CREATE TABLE "Project" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- Add projectId to OperationPosition
ALTER TABLE "OperationPosition" ADD COLUMN "projectId" INTEGER;

ALTER TABLE "OperationPosition"
ADD CONSTRAINT "OperationPosition_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for OperationPosition
CREATE INDEX "OperationPosition_originalOperationId_idx"
ON "OperationPosition"("originalOperationId");

CREATE INDEX "OperationPosition_operationId_idx"
ON "OperationPosition"("operationId");

CREATE INDEX "OperationPosition_counterPartyId_idx"
ON "OperationPosition"("counterPartyId");

CREATE INDEX "OperationPosition_expenseCategoryId_idx"
ON "OperationPosition"("expenseCategoryId");

CREATE INDEX "OperationPosition_projectId_idx"
ON "OperationPosition"("projectId");

-- Index for OriginalOperationFromTbank
CREATE INDEX "OriginalOperationFromTbank_accountId_operationDate_idx"
ON "OriginalOperationFromTbank"("accountId", "operationDate");
