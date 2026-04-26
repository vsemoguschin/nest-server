-- CreateTable
CREATE TABLE "PrinterShift" (
    "id" SERIAL NOT NULL,
    "shift_date" TEXT NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "PrinterShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrinterShift_userId_shift_date_idx" ON "PrinterShift"("userId", "shift_date");

-- AddForeignKey
ALTER TABLE "PrinterShift" ADD CONSTRAINT "PrinterShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
