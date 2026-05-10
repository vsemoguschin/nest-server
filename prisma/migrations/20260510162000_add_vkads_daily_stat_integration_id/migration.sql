ALTER TABLE "VkAdsDailyStat"
ADD COLUMN "integrationId" INTEGER;

ALTER TABLE "VkAdsDailyStat"
ADD CONSTRAINT "VkAdsDailyStat_integrationId_fkey"
FOREIGN KEY ("integrationId") REFERENCES "VkAdsAccountIntegration"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "vkads_unique_entity_per_day";

CREATE INDEX "VkAdsDailyStat_integrationId_idx"
ON "VkAdsDailyStat"("integrationId");

CREATE INDEX "VkAdsDailyStat_integration_entity_date_idx"
ON "VkAdsDailyStat"("integrationId", "entity", "date");

CREATE UNIQUE INDEX "VkAdsDailyStat_legacy_unique_entity_per_day"
ON "VkAdsDailyStat"("project", "entity", "entityId", "date")
WHERE "integrationId" IS NULL;

CREATE UNIQUE INDEX "VkAdsDailyStat_integration_unique_entity_per_day"
ON "VkAdsDailyStat"("integrationId", "entity", "entityId", "date")
WHERE "integrationId" IS NOT NULL;
