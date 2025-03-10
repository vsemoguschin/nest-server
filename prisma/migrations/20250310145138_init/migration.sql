-- CreateTable
CREATE TABLE "AdExpenses" (
    "id" SERIAL NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "dealSourceId" INTEGER NOT NULL,

    CONSTRAINT "AdExpenses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AdExpenses" ADD CONSTRAINT "AdExpenses_dealSourceId_fkey" FOREIGN KEY ("dealSourceId") REFERENCES "DealSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
