-- 贸易条件 T/T（与 FOB/CIF 并列）及前/后 T/T 节点字段

ALTER TABLE "Contract" ADD COLUMN "ttTiming" TEXT;
ALTER TABLE "Contract" ADD COLUMN "ttPercentBps" INTEGER;
ALTER TABLE "Contract" ADD COLUMN "ttAdvanceFen" INTEGER;
ALTER TABLE "Contract" ADD COLUMN "ttDaysAfterShipment" INTEGER;
