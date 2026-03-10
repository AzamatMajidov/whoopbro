/*
  Warnings:

  - You are about to drop the column `chargeId` on the `Subscription` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Subscription_chargeId_key";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "chargeId",
ADD COLUMN     "paymentRef" TEXT;
