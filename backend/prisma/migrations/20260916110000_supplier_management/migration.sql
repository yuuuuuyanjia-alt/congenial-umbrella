-- 国内供应商主数据 + 采购货款/到货字段

CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "country" TEXT,
    "address" TEXT,
    "registrationNo" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Party" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "country" TEXT,
    "address" TEXT,
    "registrationNo" TEXT,
    "isSameAsBuyer" BOOLEAN NOT NULL DEFAULT true,
    "relationNote" TEXT,
    CONSTRAINT "Party_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Party_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Party_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Party" ("id", "caseId", "customerId", "role", "name", "nameEn", "country", "address", "registrationNo", "isSameAsBuyer", "relationNote")
SELECT "id", "caseId", "customerId", "role", "name", "nameEn", "country", "address", "registrationNo", "isSameAsBuyer", "relationNote" FROM "Party";
DROP TABLE "Party";
ALTER TABLE "new_Party" RENAME TO "Party";
CREATE INDEX "Party_caseId_role_idx" ON "Party"("caseId", "role");
CREATE INDEX "Party_customerId_idx" ON "Party"("customerId");
CREATE INDEX "Party_supplierId_idx" ON "Party"("supplierId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

ALTER TABLE "ProcurementPlan" ADD COLUMN "actualArrival" DATETIME;
ALTER TABLE "ProcurementPlan" ADD COLUMN "amountFen" INTEGER;
ALTER TABLE "ProcurementPlan" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CNY';
ALTER TABLE "ProcurementPlan" ADD COLUMN "paidFen" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementPlan" ADD COLUMN "paymentDueAt" DATETIME;
ALTER TABLE "ProcurementPlan" ADD COLUMN "paidAt" DATETIME;
