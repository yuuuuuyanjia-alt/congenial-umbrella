-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "deliveryDate" DATETIME;
ALTER TABLE "Contract" ADD COLUMN "quantity" INTEGER;
ALTER TABLE "Contract" ADD COLUMN "unit" TEXT;

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "priceBasis" TEXT NOT NULL,
    "includedItems" TEXT,
    "excludedItems" TEXT,
    "validityUntil" DATETIME,
    "freightBearer" TEXT,
    "taxBearer" TEXT,
    "unitPriceFen" INTEGER,
    "quantity" INTEGER,
    "amountFen" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "abnormalPriceNote" TEXT,
    "snapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostFloor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goodsKey" TEXT NOT NULL,
    "goodsDesc" TEXT NOT NULL,
    "floorFen" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD'
);

-- CreateTable
CREATE TABLE "HistoricalPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goodsKey" TEXT NOT NULL,
    "counterparty" TEXT,
    "unitPriceFen" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "quotedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "changeNo" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "customerAck" BOOLEAN NOT NULL DEFAULT false,
    "customerAckRef" TEXT,
    "customerAckEvidenceId" TEXT,
    "customerAckedAt" DATETIME,
    "internalAck" BOOLEAN NOT NULL DEFAULT false,
    "internalAckEvidenceId" TEXT,
    "internalAckedAt" DATETIME,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvalEvidenceId" TEXT,
    "approvedAt" DATETIME,
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangeOrder_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChangeDiff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "changeOrderId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValue" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    CONSTRAINT "ChangeDiff_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "changeOrderId" TEXT,
    "snapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractVersion_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "plannedDelivery" DATETIME,
    "contractDelivery" DATETIME,
    "delayRegistered" BOOLEAN NOT NULL DEFAULT false,
    "delayTriggerCode" TEXT,
    "delayTriggerRef" TEXT,
    "delayReason" TEXT,
    "customerConsent" BOOLEAN NOT NULL DEFAULT false,
    "customerConsentEvidenceId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionPlan_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HsTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hsCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "requiredElementsJson" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "exportTaxName" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CustomsDeclaration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "hsCode" TEXT,
    "productName" TEXT,
    "declareElementsJson" TEXT NOT NULL DEFAULT '{}',
    "originCountry" TEXT,
    "originEvidenceType" TEXT,
    "originEvidenceRef" TEXT,
    "originEvidenceId" TEXT,
    "unit" TEXT,
    "exportTaxName" TEXT,
    "eportStatus" TEXT NOT NULL DEFAULT 'NOT_SYNCED',
    "eportSyncRef" TEXT,
    "eportSyncedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomsDeclaration_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "nodeCode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT,
    "note" TEXT,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_caseId_version_key" ON "Quote"("caseId", "version");

-- CreateIndex
CREATE INDEX "Quote_caseId_status_idx" ON "Quote"("caseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CostFloor_goodsKey_key" ON "CostFloor"("goodsKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrder_caseId_changeNo_key" ON "ChangeOrder"("caseId", "changeNo");

-- CreateIndex
CREATE INDEX "ChangeOrder_caseId_status_idx" ON "ChangeOrder"("caseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractVersion_caseId_version_key" ON "ContractVersion"("caseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionPlan_caseId_key" ON "ProductionPlan"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "HsTemplate_hsCode_key" ON "HsTemplate"("hsCode");

-- CreateIndex
CREATE UNIQUE INDEX "CustomsDeclaration_caseId_key" ON "CustomsDeclaration"("caseId");

-- CreateIndex
CREATE INDEX "Evidence_caseId_nodeCode_idx" ON "Evidence"("caseId", "nodeCode");
