-- AlterTable
ALTER TABLE "TradeCase" ADD COLUMN "goodsSpec" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "goodsDesc" TEXT;
ALTER TABLE "Quote" ADD COLUMN "goodsSpec" TEXT;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "goodsSpec" TEXT;
ALTER TABLE "Contract" ADD COLUMN "ttVoucherJson" TEXT;
