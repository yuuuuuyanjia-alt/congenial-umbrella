-- 销售合同（N3）：CIF 装运节点 + 付款/收汇字段

ALTER TABLE "Contract" ADD COLUMN "shipmentPort" TEXT;
ALTER TABLE "Contract" ADD COLUMN "shipmentDate" DATETIME;
ALTER TABLE "Contract" ADD COLUMN "etaDate" DATETIME;
ALTER TABLE "Contract" ADD COLUMN "arrivalPort" TEXT;
ALTER TABLE "Contract" ADD COLUMN "customerPickedUp" BOOLEAN;
ALTER TABLE "Contract" ADD COLUMN "hasRemittance" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "Contract" ADD COLUMN "remittedFen" INTEGER NOT NULL DEFAULT 0;
