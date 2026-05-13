CREATE TABLE "UploadLinkAction" (
  "id" SERIAL NOT NULL,
  "filePlatformUploadLinkId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "publicUrl" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" INTEGER NOT NULL,
  CONSTRAINT "UploadLinkAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UploadLinkAction_createdByUserId_createdAt_idx" ON "UploadLinkAction"("createdByUserId", "createdAt");
CREATE INDEX "UploadLinkAction_source_createdAt_idx" ON "UploadLinkAction"("source", "createdAt");

ALTER TABLE "UploadLinkAction"
  ADD CONSTRAINT "UploadLinkAction_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
