-- CreateTable
CREATE TABLE "WasherShift" (
    "id" SERIAL NOT NULL,
    "shift_date" TEXT NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "WasherShift_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WasherShift" ADD CONSTRAINT "WasherShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
