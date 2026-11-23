-- Water-test readings recorded by workers at each visit. A new table, so
-- nothing existing changes. RLS is enabled here because the all-tables RLS
-- migration only covered tables that existed then (same reasoning, no
-- policies: the app connects as the table owner, which is exempt).
CREATE TABLE "WaterTest" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "freeChlorine" DECIMAL(5,2),
    "ph" DECIMAL(4,2),
    "alkalinity" INTEGER,
    "cyanuricAcid" INTEGER,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaterTest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WaterTest_taskId_key" ON "WaterTest"("taskId");

CREATE INDEX "WaterTest_poolId_takenAt_idx" ON "WaterTest"("poolId", "takenAt");

ALTER TABLE "WaterTest" ADD CONSTRAINT "WaterTest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WaterTest" ADD CONSTRAINT "WaterTest_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WaterTest" ADD CONSTRAINT "WaterTest_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WaterTest" ENABLE ROW LEVEL SECURITY;
