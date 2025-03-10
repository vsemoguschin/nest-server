/*
  Warnings:

  - Added the required column `workSpaceId` to the `Dop` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Dop" ADD COLUMN     "workSpaceId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Dop" ADD CONSTRAINT "Dop_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
