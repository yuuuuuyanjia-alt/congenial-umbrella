-- 风险雷达第一版：四张新表，以及案件/客户/供应商/制裁名单/中信保保单的示例标记。
-- 只增量加列和建表。isSample 默认 false，已有行不受影响。

ALTER TABLE "Customer" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Supplier" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TradeCase" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BlacklistEntry" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SinosurePolicy" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "RiskItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "ruleColor" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "caseId" TEXT,
    "batchId" TEXT,
    "customerId" TEXT,
    "supplierId" TEXT,
    "title" TEXT NOT NULL,
    "subjectLabel" TEXT NOT NULL,
    "linesJson" TEXT NOT NULL DEFAULT '[]',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHitAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "escalatedAt" DATETIME,
    "processingById" TEXT,
    "processingStartedAt" DATETIME,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "preserveOnRecalc" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RiskItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RiskItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ShipmentBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RiskItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RiskItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RiskItem_processingById_fkey" FOREIGN KEY ("processingById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RiskItem_fingerprint_key" ON "RiskItem"("fingerprint");
CREATE INDEX "RiskItem_status_color_idx" ON "RiskItem"("status", "color");
CREATE INDEX "RiskItem_caseId_idx" ON "RiskItem"("caseId");
CREATE INDEX "RiskItem_customerId_idx" ON "RiskItem"("customerId");
CREATE INDEX "RiskItem_supplierId_idx" ON "RiskItem"("supplierId");
CREATE INDEX "RiskItem_isSample_idx" ON "RiskItem"("isSample");

CREATE TABLE "RiskView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "riskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskView_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RiskView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RiskView_riskId_userId_key" ON "RiskView"("riskId", "userId");

CREATE TABLE "RiskAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "riskId" TEXT NOT NULL,
    "actorId" TEXT,
    "conclusion" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskAction_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RiskAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "RiskAction_riskId_createdAt_idx" ON "RiskAction"("riskId", "createdAt");

CREATE TABLE "SupplementTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "riskId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "fileName" TEXT,
    "fileJson" TEXT,
    "uploadedById" TEXT,
    "uploadedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplementTask_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplementTask_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SupplementTask_riskId_idx" ON "SupplementTask"("riskId");
CREATE INDEX "SupplementTask_dueAt_status_idx" ON "SupplementTask"("dueAt", "status");
