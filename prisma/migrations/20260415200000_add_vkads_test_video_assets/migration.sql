ALTER TABLE "VkAdsTestCreative"
ADD COLUMN "videoAssetId" INTEGER;

CREATE TABLE "VkAdsTestVideoAsset" (
    "id" SERIAL NOT NULL,
    "testId" INTEGER NOT NULL,
    "accountIntegrationId" INTEGER NOT NULL,
    "vkContentId" INTEGER NOT NULL,
    "name" TEXT,
    "rawContentJson" JSONB NOT NULL,
    "previewUrl" TEXT,
    "videoUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VkAdsTestVideoAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VkAdsTestCreative_videoAssetId_idx" ON "VkAdsTestCreative"("videoAssetId");
CREATE INDEX "VkAdsTestVideoAsset_testId_idx" ON "VkAdsTestVideoAsset"("testId");
CREATE INDEX "VkAdsTestVideoAsset_accountIntegrationId_idx" ON "VkAdsTestVideoAsset"("accountIntegrationId");
CREATE INDEX "VkAdsTestVideoAsset_vkContentId_idx" ON "VkAdsTestVideoAsset"("vkContentId");
CREATE INDEX "VkAdsTestVideoAsset_status_idx" ON "VkAdsTestVideoAsset"("status");

ALTER TABLE "VkAdsTestCreative"
ADD CONSTRAINT "VkAdsTestCreative_videoAssetId_fkey"
FOREIGN KEY ("videoAssetId") REFERENCES "VkAdsTestVideoAsset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VkAdsTestVideoAsset"
ADD CONSTRAINT "VkAdsTestVideoAsset_testId_fkey"
FOREIGN KEY ("testId") REFERENCES "VkAdsTest"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VkAdsTestVideoAsset"
ADD CONSTRAINT "VkAdsTestVideoAsset_accountIntegrationId_fkey"
FOREIGN KEY ("accountIntegrationId") REFERENCES "VkAdsAccountIntegration"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
