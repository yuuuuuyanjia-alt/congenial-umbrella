-- 分批出运：一份销售合同多笔 ShipmentBatch。
-- 已有案件各生成默认批次 "1"，并把 N6/N7/N9 的装运、单证、收汇、证据挂到该批次。
-- 不删除、不改写案件、合同、采购或演示路径本身。

CREATE TABLE "ShipmentBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "quantity" INTEGER,
    "unit" TEXT,
    "amountFen" INTEGER,
    "currency" TEXT,
    "currentNode" TEXT NOT NULL DEFAULT 'N6',
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "shipmentPort" TEXT,
    "shipmentDate" DATETIME,
    "etaDate" DATETIME,
    "arrivalPort" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShipmentBatch_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ShipmentBatchNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decision" TEXT,
    "summary" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "ShipmentBatchNode_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ShipmentBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ShipmentBatch_caseId_batchNo_key" ON "ShipmentBatch"("caseId", "batchNo");
CREATE UNIQUE INDEX "ShipmentBatch_caseId_seq_key" ON "ShipmentBatch"("caseId", "seq");
CREATE INDEX "ShipmentBatch_caseId_idx" ON "ShipmentBatch"("caseId");
CREATE UNIQUE INDEX "ShipmentBatchNode_batchId_code_key" ON "ShipmentBatchNode"("batchId", "code");

INSERT INTO "ShipmentBatch" (
    "id", "caseId", "batchNo", "seq", "quantity", "unit", "amountFen", "currency",
    "currentNode", "status", "shipmentPort", "shipmentDate", "etaDate", "arrivalPort",
    "createdAt", "updatedAt"
)
SELECT
    'sb1_' || c."id",
    c."id",
    '1',
    1,
    ct."quantity",
    ct."unit",
    COALESCE(ct."amountFen", c."amountFen"),
    COALESCE(ct."currency", c."currency"),
    CASE
        WHEN c."status" = 'COMPLETED' OR (
            c."currentNode" = 'N9' AND EXISTS (
                SELECT 1 FROM "CaseNode" n
                WHERE n."caseId" = c."id" AND n."code" = 'N9' AND n."status" = 'PASSED'
            )
        ) THEN 'DONE'
        WHEN c."currentNode" = 'N8' THEN 'N9'
        WHEN c."currentNode" IN ('N6', 'N7', 'N9') THEN c."currentNode"
        ELSE 'N6'
    END,
    CASE
        WHEN c."status" = 'COMPLETED' THEN 'COMPLETED'
        WHEN c."currentNode" IN ('N6', 'N7', 'N8', 'N9') THEN 'IN_PROGRESS'
        ELSE 'NOT_STARTED'
    END,
    ct."shipmentPort",
    ct."shipmentDate",
    ct."etaDate",
    ct."arrivalPort",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "TradeCase" c
LEFT JOIN "Contract" ct ON ct."caseId" = c."id";

INSERT INTO "ShipmentBatchNode" ("id", "batchId", "code", "status", "decision", "summary", "startedAt", "completedAt")
SELECT
    'sbn_' || b."id" || '_' || n."code",
    b."id",
    n."code",
    n."status",
    n."decision",
    n."summary",
    n."startedAt",
    n."completedAt"
FROM "ShipmentBatch" b
JOIN "CaseNode" n ON n."caseId" = b."caseId" AND n."code" IN ('N6', 'N7', 'N9');

INSERT INTO "ShipmentBatchNode" ("id", "batchId", "code", "status")
SELECT 'sbn_' || b."id" || '_N6', b."id", 'N6', 'NOT_STARTED'
FROM "ShipmentBatch" b
WHERE NOT EXISTS (SELECT 1 FROM "ShipmentBatchNode" n WHERE n."batchId" = b."id" AND n."code" = 'N6');

INSERT INTO "ShipmentBatchNode" ("id", "batchId", "code", "status")
SELECT 'sbn_' || b."id" || '_N7', b."id", 'N7', 'NOT_STARTED'
FROM "ShipmentBatch" b
WHERE NOT EXISTS (SELECT 1 FROM "ShipmentBatchNode" n WHERE n."batchId" = b."id" AND n."code" = 'N7');

INSERT INTO "ShipmentBatchNode" ("id", "batchId", "code", "status")
SELECT 'sbn_' || b."id" || '_N9', b."id", 'N9', 'NOT_STARTED'
FROM "ShipmentBatch" b
WHERE NOT EXISTS (SELECT 1 FROM "ShipmentBatchNode" n WHERE n."batchId" = b."id" AND n."code" = 'N9');

PRAGMA foreign_keys=OFF;

CREATE TABLE "Shipment_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "batchId" TEXT,
    "hasCustomerWrittenInstruction" BOOLEAN NOT NULL DEFAULT false,
    "instructionRef" TEXT,
    "hasInternalApproval" BOOLEAN NOT NULL DEFAULT false,
    "approverId" TEXT,
    "blControl" TEXT,
    "blNo" TEXT,
    "vessel" TEXT,
    "consigneeOnBl" TEXT,
    "noBlReason" TEXT,
    "noBlRef" TEXT,
    "noBlEvidenceStub" TEXT,
    "incotermsOverride" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shipment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Shipment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ShipmentBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Shipment_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "Shipment_new" (
    "id", "caseId", "batchId", "hasCustomerWrittenInstruction", "instructionRef", "hasInternalApproval",
    "approverId", "blControl", "blNo", "vessel", "consigneeOnBl", "noBlReason", "noBlRef", "noBlEvidenceStub",
    "incotermsOverride", "updatedAt"
)
SELECT
    s."id",
    s."caseId",
    'sb1_' || s."caseId",
    s."hasCustomerWrittenInstruction",
    s."instructionRef",
    s."hasInternalApproval",
    s."approverId",
    s."blControl",
    s."blNo",
    s."vessel",
    s."consigneeOnBl",
    s."noBlReason",
    s."noBlRef",
    s."noBlEvidenceStub",
    s."incotermsOverride",
    s."updatedAt"
FROM "Shipment" s;

DROP TABLE "Shipment";
ALTER TABLE "Shipment_new" RENAME TO "Shipment";
CREATE INDEX "Shipment_caseId_idx" ON "Shipment"("caseId");
CREATE UNIQUE INDEX "Shipment_batchId_key" ON "Shipment"("batchId");

CREATE TABLE "Settlement_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "batchId" TEXT,
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
    "receivedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Settlement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Settlement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ShipmentBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "Settlement_new" (
    "id", "caseId", "batchId", "payerName", "buyerName", "isThirdParty", "hasThirdPartyProof",
    "thirdPartyProofRef", "hasRemittanceMemo", "remittanceMemoRef", "hasDocConsistencyProof",
    "hasReleaseApproval", "amountFen", "receivedAt", "updatedAt"
)
SELECT
    s."id",
    s."caseId",
    'sb1_' || s."caseId",
    s."payerName",
    s."buyerName",
    s."isThirdParty",
    s."hasThirdPartyProof",
    s."thirdPartyProofRef",
    s."hasRemittanceMemo",
    s."remittanceMemoRef",
    s."hasDocConsistencyProof",
    s."hasReleaseApproval",
    s."amountFen",
    s."receivedAt",
    s."updatedAt"
FROM "Settlement" s;

DROP TABLE "Settlement";
ALTER TABLE "Settlement_new" RENAME TO "Settlement";
CREATE INDEX "Settlement_caseId_idx" ON "Settlement"("caseId");
CREATE UNIQUE INDEX "Settlement_batchId_key" ON "Settlement"("batchId");

PRAGMA foreign_keys=ON;

ALTER TABLE "TradeDocument" ADD COLUMN "batchId" TEXT;
UPDATE "TradeDocument" SET "batchId" = 'sb1_' || "caseId";
CREATE INDEX "TradeDocument_batchId_type_idx" ON "TradeDocument"("batchId", "type");

ALTER TABLE "DocMismatchFix" ADD COLUMN "batchId" TEXT;
UPDATE "DocMismatchFix" SET "batchId" = 'sb1_' || "caseId";
CREATE INDEX "DocMismatchFix_batchId_idx" ON "DocMismatchFix"("batchId");

ALTER TABLE "Evidence" ADD COLUMN "batchId" TEXT;
UPDATE "Evidence" SET "batchId" = 'sb1_' || "caseId" WHERE "nodeCode" IN ('N6', 'N7', 'N9');
CREATE INDEX "Evidence_batchId_nodeCode_idx" ON "Evidence"("batchId", "nodeCode");

ALTER TABLE "GateCheck" ADD COLUMN "batchId" TEXT;
UPDATE "GateCheck" SET "batchId" = 'sb1_' || "caseId" WHERE "nodeCode" IN ('N6', 'N7', 'N9');
CREATE INDEX "GateCheck_batchId_idx" ON "GateCheck"("batchId");
