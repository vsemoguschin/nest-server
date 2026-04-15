-- Add persisted shared URL ownership to VK Ads test root
ALTER TABLE "VkAdsTest"
ADD COLUMN "vkPrimaryUrlId" INTEGER;

CREATE INDEX "VkAdsTest_vkPrimaryUrlId_idx"
ON "VkAdsTest" ("vkPrimaryUrlId");
