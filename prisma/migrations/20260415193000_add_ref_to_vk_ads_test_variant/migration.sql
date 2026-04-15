ALTER TABLE "VkAdsTestVariant"
ADD COLUMN "ref" TEXT;

CREATE INDEX "VkAdsTestVariant_ref_idx" ON "VkAdsTestVariant"("ref");
