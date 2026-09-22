-- 采购合同货物名称/规格与销售合同分列，避免 N3 与 N5 互相覆盖。
ALTER TABLE "ProcurementPlan" ADD COLUMN "goodsDesc" TEXT;
ALTER TABLE "ProcurementPlan" ADD COLUMN "goodsSpec" TEXT;
