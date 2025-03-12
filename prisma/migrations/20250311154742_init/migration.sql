/*
  Warnings:

  - Added the required column `workSpaceId` to the `AdExpense` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AdExpense" ADD COLUMN     "workSpaceId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "AdExpense" ADD CONSTRAINT "AdExpense_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
