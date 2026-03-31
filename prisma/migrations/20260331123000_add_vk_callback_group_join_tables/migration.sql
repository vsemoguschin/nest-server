-- CreateTable
CREATE TABLE "CrmVkIntegration" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "groupName" TEXT NOT NULL,
    "callbackSecret" TEXT NOT NULL,
    "confirmationCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "initialCrmStatusId" INTEGER,
    "defaultSourceId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmVkIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VkCallbackEvent" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "vkIntegrationId" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "vkUserId" INTEGER,
    "apiVersion" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "crmCustomerId" INTEGER,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VkCallbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmVkIntegration_groupId_key" ON "CrmVkIntegration"("groupId");

-- CreateIndex
CREATE INDEX "CrmVkIntegration_accountId_idx" ON "CrmVkIntegration"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "VkCallbackEvent_vkIntegrationId_eventId_key" ON "VkCallbackEvent"("vkIntegrationId", "eventId");

-- CreateIndex
CREATE INDEX "VkCallbackEvent_accountId_idx" ON "VkCallbackEvent"("accountId");

-- CreateIndex
CREATE INDEX "VkCallbackEvent_vkIntegrationId_idx" ON "VkCallbackEvent"("vkIntegrationId");

-- CreateIndex
CREATE INDEX "VkCallbackEvent_groupId_idx" ON "VkCallbackEvent"("groupId");

-- AddForeignKey
ALTER TABLE "VkCallbackEvent" ADD CONSTRAINT "VkCallbackEvent_vkIntegrationId_fkey" FOREIGN KEY ("vkIntegrationId") REFERENCES "CrmVkIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
