-- N5 生产/备货排期 → 国内采购/备货；筛查命中与 KYC 报告挂节点

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- ScreeningHit.nodeCode（N1 客户筛查 / N5 供应商筛查）
ALTER TABLE "ScreeningHit" ADD COLUMN "nodeCode" TEXT NOT NULL DEFAULT 'N1';
CREATE INDEX "ScreeningHit_caseId_nodeCode_idx" ON "ScreeningHit"("caseId", "nodeCode");

-- KycReport.nodeCode
ALTER TABLE "KycReport" ADD COLUMN "nodeCode" TEXT NOT NULL DEFAULT 'N1';
CREATE INDEX "KycReport_caseId_nodeCode_idx" ON "KycReport"("caseId", "nodeCode");

-- ProductionPlan → ProcurementPlan（计划交期改为采购到货）
CREATE TABLE "new_ProcurementPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "poNo" TEXT,
    "plannedArrival" DATETIME,
    "contractDelivery" DATETIME,
    "poEvidenceStub" TEXT,
    "poEvidenceId" TEXT,
    "delayRegistered" BOOLEAN NOT NULL DEFAULT false,
    "delayTriggerCode" TEXT,
    "delayTriggerRef" TEXT,
    "delayReason" TEXT,
    "customerConsent" BOOLEAN NOT NULL DEFAULT false,
    "customerConsentEvidenceId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProcurementPlan_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProcurementPlan" (
    "id",
    "caseId",
    "plannedArrival",
    "contractDelivery",
    "delayRegistered",
    "delayTriggerCode",
    "delayTriggerRef",
    "delayReason",
    "customerConsent",
    "customerConsentEvidenceId",
    "updatedAt"
)
SELECT
    "id",
    "caseId",
    "plannedDelivery",
    "contractDelivery",
    "delayRegistered",
    "delayTriggerCode",
    "delayTriggerRef",
    "delayReason",
    "customerConsent",
    "customerConsentEvidenceId",
    "updatedAt"
FROM "ProductionPlan";
DROP TABLE "ProductionPlan";
ALTER TABLE "new_ProcurementPlan" RENAME TO "ProcurementPlan";
CREATE UNIQUE INDEX "ProcurementPlan_caseId_key" ON "ProcurementPlan"("caseId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
