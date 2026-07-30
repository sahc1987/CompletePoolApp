-- CreateTable
CREATE TABLE "PaymentReversal" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amountReversed" DECIMAL(65,30) NOT NULL,
    "paymentCount" INTEGER NOT NULL,
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReversal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentReversal_billId_idx" ON "PaymentReversal"("billId");

-- AddForeignKey
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
