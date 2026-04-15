ALTER TABLE "VkAdsTest"
ADD COLUMN "vkCampaignId" INTEGER;

ALTER TABLE "VkAdsTestAudience"
ADD COLUMN "vkAdGroupId" INTEGER;

CREATE INDEX "VkAdsTest_vkCampaignId_idx" ON "VkAdsTest"("vkCampaignId");
CREATE INDEX "VkAdsTestAudience_vkAdGroupId_idx" ON "VkAdsTestAudience"("vkAdGroupId");
