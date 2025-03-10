/*
  Warnings:

  - You are about to drop the `AdExpenses` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AdExpenses" DROP CONSTRAINT "AdExpenses_dealSourceId_fkey";

-- DropTable
DROP TABLE "AdExpenses";

-- CreateTable
CREATE TABLE "AdExpense" (
    "id" SERIAL NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "dealSourceId" INTEGER NOT NULL,

    CONSTRAINT "AdExpense_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AdExpense" ADD CONSTRAINT "AdExpense_dealSourceId_fkey" FOREIGN KEY ("dealSourceId") REFERENCES "DealSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
