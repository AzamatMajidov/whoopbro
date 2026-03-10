-- AlterTable
ALTER TABLE "DailySnapshot" ADD COLUMN "latestWorkoutTime" TIMESTAMP(3),
ADD COLUMN "workoutStrain" DOUBLE PRECISION,
ADD COLUMN "latestWorkoutSport" TEXT;

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "traceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "whoopUserId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("traceId")
);
