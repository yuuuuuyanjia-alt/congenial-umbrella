-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TradeCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentNode" TEXT NOT NULL,
    "overallRisk" TEXT NOT NULL,
    "goodsDesc" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "country" TEXT,
    "address" TEXT,
    "registrationNo" TEXT,
    "isSameAsBuyer" BOOLEAN NOT NULL DEFAULT true,
    "relationNote" TEXT,
    CONSTRAINT "Party_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaseNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decision" TEXT,
    "isStub" BOOLEAN NOT NULL DEFAULT false,
    "isHardGate" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "CaseNode_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BlacklistEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "aliases" TEXT NOT NULL,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "ScreeningHit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "listCode" TEXT NOT NULL,
    "listedName" TEXT NOT NULL,
    "matchedName" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "disposition" TEXT NOT NULL DEFAULT 'OPEN',
    "score" INTEGER NOT NULL,
    "rawJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScreeningHit_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScreeningHit_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KycReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KycReport_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "incoterms" TEXT,
    "paymentTerms" TEXT,
    "hasRetentionOfTitle" BOOLEAN NOT NULL DEFAULT false,
    "hasDisputeClause" BOOLEAN NOT NULL DEFAULT false,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "goodsDesc" TEXT,
    "amountFen" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "destination" TEXT,
    "buyerName" TEXT,
    "consigneeName" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "hasCustomerWrittenInstruction" BOOLEAN NOT NULL DEFAULT false,
    "instructionRef" TEXT,
    "hasInternalApproval" BOOLEAN NOT NULL DEFAULT false,
    "approverId" TEXT,
    "blControl" TEXT,
    "blNo" TEXT,
    "vessel" TEXT,
    "consigneeOnBl" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shipment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Shipment_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "fieldsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeDocument_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocMismatchFix" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT NOT NULL,
    "toValue" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocMismatchFix_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "isThirdParty" BOOLEAN NOT NULL DEFAULT false,
    "hasThirdPartyProof" BOOLEAN NOT NULL DEFAULT false,
    "thirdPartyProofRef" TEXT,
    "hasRemittanceMemo" BOOLEAN NOT NULL DEFAULT false,
    "remittanceMemoRef" TEXT,
    "hasDocConsistencyProof" BOOLEAN NOT NULL DEFAULT false,
    "hasReleaseApproval" BOOLEAN NOT NULL DEFAULT false,
    "amountFen" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Settlement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkbenchAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "hitId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkbenchAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkbenchAction_hitId_fkey" FOREIGN KEY ("hitId") REFERENCES "ScreeningHit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkbenchAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "nodeCode" TEXT,
    "detail" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GateCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "nodeCode" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "canProceed" BOOLEAN NOT NULL,
    "missingJson" TEXT NOT NULL,
    "reasonsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GateCheck_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeCase_caseNo_key" ON "TradeCase"("caseNo");

-- CreateIndex
CREATE INDEX "Party_caseId_role_idx" ON "Party"("caseId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CaseNode_caseId_code_key" ON "CaseNode"("caseId", "code");

-- CreateIndex
CREATE INDEX "ScreeningHit_caseId_disposition_idx" ON "ScreeningHit"("caseId", "disposition");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_caseId_key" ON "Contract"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_caseId_key" ON "Shipment"("caseId");

-- CreateIndex
CREATE INDEX "TradeDocument_caseId_type_idx" ON "TradeDocument"("caseId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_caseId_key" ON "Settlement"("caseId");

-- CreateIndex
CREATE INDEX "AuditLog_caseId_createdAt_idx" ON "AuditLog"("caseId", "createdAt");
