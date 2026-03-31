DROP INDEX IF EXISTS "CrmVk_externalId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "CrmVk_accountId_externalId_key"
ON "CrmVk"("accountId", "externalId");

CREATE INDEX IF NOT EXISTS "CrmVk_accountId_idx"
ON "CrmVk"("accountId");
