-- CreateTable
CREATE TABLE "RopReport" (
    "id" SERIAL NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "makets" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "workSpaceId" INTEGER NOT NULL,

    CONSTRAINT "RopReport_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RopReport" ADD CONSTRAINT "RopReport_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
