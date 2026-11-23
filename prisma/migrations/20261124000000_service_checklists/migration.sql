-- Per-service checklists. A new table and one nullable column, so nothing
-- existing changes: a job with no saved checklist behaves exactly as before.
-- RLS on for the new table, as in the all-tables RLS migration (no policies;
-- the app connects as the table owner, which is exempt).
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChecklistItem_serviceId_position_idx" ON "ChecklistItem"("serviceId", "position");

ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChecklistItem" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Task" ADD COLUMN     "checklist" JSONB;
