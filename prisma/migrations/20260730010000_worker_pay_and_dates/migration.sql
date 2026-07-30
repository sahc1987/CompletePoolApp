-- Employment details on the user. All nullable: existing accounts predate them.
ALTER TABLE "User" ADD COLUMN "hourlyRate" DECIMAL(10,2);
ALTER TABLE "User" ADD COLUMN "hiredOn" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "birthday" TIMESTAMP(3);

-- Append-only audit trail of hourly pay changes.
CREATE TABLE "PayRateChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "oldRate" DECIMAL(10,2),
    "newRate" DECIMAL(10,2) NOT NULL,
    "changedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayRateChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayRateChange_userId_createdAt_idx" ON "PayRateChange"("userId", "createdAt");

ALTER TABLE "PayRateChange" ADD CONSTRAINT "PayRateChange_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayRateChange" ADD CONSTRAINT "PayRateChange_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
