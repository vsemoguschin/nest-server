-- Add income/outcome project relations to CounterParty
ALTER TABLE "CounterParty" ADD COLUMN "incomeProjectId" INTEGER;
ALTER TABLE "CounterParty" ADD COLUMN "outcomeProjectId" INTEGER;

CREATE INDEX "CounterParty_incomeProjectId_idx" ON "CounterParty"("incomeProjectId");
CREATE INDEX "CounterParty_outcomeProjectId_idx" ON "CounterParty"("outcomeProjectId");

ALTER TABLE "CounterParty"
ADD CONSTRAINT "CounterParty_incomeProjectId_fkey"
FOREIGN KEY ("incomeProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CounterParty"
ADD CONSTRAINT "CounterParty_outcomeProjectId_fkey"
FOREIGN KEY ("outcomeProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
