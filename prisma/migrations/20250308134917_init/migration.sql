/*
  Warnings:

  - Added the required column `date` to the `ManagerReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ManagerReport" ADD COLUMN     "date" TEXT NOT NULL,
ADD COLUMN     "period" TEXT NOT NULL DEFAULT '';
