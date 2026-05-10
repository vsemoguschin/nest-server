-- Add nullable relation from VK Ads account integrations to Project
ALTER TABLE "VkAdsAccountIntegration"
ADD COLUMN "projectId" INTEGER;

ALTER TABLE "VkAdsAccountIntegration"
ADD CONSTRAINT "VkAdsAccountIntegration_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "VkAdsAccountIntegration_projectId_idx"
ON "VkAdsAccountIntegration"("projectId");
