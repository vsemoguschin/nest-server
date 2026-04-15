ALTER TABLE "VkAdsTestAudience"
ADD COLUMN "vkSegmentId" INTEGER;

CREATE INDEX "VkAdsTestAudience_vkSegmentId_idx"
ON "VkAdsTestAudience"("vkSegmentId");
