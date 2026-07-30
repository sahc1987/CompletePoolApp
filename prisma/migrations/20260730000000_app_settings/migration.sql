-- Single-row app configuration (business hours). Defaults match the previous
-- hard-coded 08:00-19:00 workday.
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'app',
    "workdayStartMin" INTEGER NOT NULL DEFAULT 480,
    "workdayEndMin" INTEGER NOT NULL DEFAULT 1140,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
