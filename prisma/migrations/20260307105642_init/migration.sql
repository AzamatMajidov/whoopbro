-- CreateTable
CREATE TABLE "User" (
    "id" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "language" TEXT NOT NULL DEFAULT 'uz',
    "briefTime" TEXT NOT NULL DEFAULT '07:00',
    "whoopConnected" BOOLEAN NOT NULL DEFAULT false,
    "whoopUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhoopToken" (
    "userId" BIGINT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhoopToken_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "state" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("state")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "userId" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "trialStart" TIMESTAMP(3) NOT NULL,
    "trialEnd" TIMESTAMP(3) NOT NULL,
    "paidUntil" TIMESTAMP(3),
    "chargeId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DailySnapshot" (
    "userId" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "recoveryScore" INTEGER,
    "hrv" DOUBLE PRECISION,
    "rhr" DOUBLE PRECISION,
    "spo2" DOUBLE PRECISION,
    "sleepDuration" INTEGER,
    "sleepPerf" DOUBLE PRECISION,
    "sleepEfficiency" DOUBLE PRECISION,
    "remMinutes" INTEGER,
    "deepMinutes" INTEGER,
    "lightMinutes" INTEGER,
    "respiratoryRate" DOUBLE PRECISION,
    "strainScore" DOUBLE PRECISION,
    "calories" INTEGER,
    "onDemandCount" INTEGER NOT NULL DEFAULT 0,
    "fetchStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "fetchAttempts" INTEGER NOT NULL DEFAULT 0,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "woreDevice" BOOLEAN NOT NULL DEFAULT true,
    "rawJson" JSONB,
    "fetchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "DailySnapshot_pkey" PRIMARY KEY ("userId","date")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_chargeId_key" ON "Subscription"("chargeId");

-- AddForeignKey
ALTER TABLE "WhoopToken" ADD CONSTRAINT "WhoopToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySnapshot" ADD CONSTRAINT "DailySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
