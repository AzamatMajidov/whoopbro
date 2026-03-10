-- CreateTable
CREATE TABLE "UserPattern" (
    "id" SERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "patternType" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 0,
    "notifiedAt" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPattern_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPattern_userId_patternType_key" ON "UserPattern"("userId", "patternType");

-- AddForeignKey
ALTER TABLE "UserPattern" ADD CONSTRAINT "UserPattern_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
