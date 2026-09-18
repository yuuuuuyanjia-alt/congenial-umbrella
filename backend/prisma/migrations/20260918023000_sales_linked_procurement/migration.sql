-- N5 采购合同关联已签销售合同（先销售后采购）

ALTER TABLE "ProcurementPlan" ADD COLUMN "salesCaseId" TEXT;

CREATE INDEX "ProcurementPlan_salesCaseId_idx" ON "ProcurementPlan"("salesCaseId");
