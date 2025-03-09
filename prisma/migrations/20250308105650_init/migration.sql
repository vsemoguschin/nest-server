-- CreateTable
CREATE TABLE "ManagerReport" (
    "id" SERIAL NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "makets" INTEGER NOT NULL DEFAULT 0,
    "maketsDayToDay" INTEGER NOT NULL DEFAULT 0,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "ManagerReport_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ManagerReport" ADD CONSTRAINT "ManagerReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
