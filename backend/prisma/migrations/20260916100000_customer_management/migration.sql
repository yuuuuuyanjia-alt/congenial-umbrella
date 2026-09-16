-- 客户主数据 + 收汇到期/到账日期（按期回款判断）

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "country" TEXT,
    "address" TEXT,
    "registrationNo" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_name_key" ON "Customer"("name");

-- Party.customerId（买方/付款人/收货人挂到客户）
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Party" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "customerId" TEXT,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "country" TEXT,
    "address" TEXT,
    "registrationNo" TEXT,
    "isSameAsBuyer" BOOLEAN NOT NULL DEFAULT true,
    "relationNote" TEXT,
    CONSTRAINT "Party_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Party_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Party" ("id", "caseId", "role", "name", "nameEn", "country", "address", "registrationNo", "isSameAsBuyer", "relationNote")
SELECT "id", "caseId", "role", "name", "nameEn", "country", "address", "registrationNo", "isSameAsBuyer", "relationNote" FROM "Party";
DROP TABLE "Party";
ALTER TABLE "new_Party" RENAME TO "Party";
CREATE INDEX "Party_caseId_role_idx" ON "Party"("caseId", "role");
CREATE INDEX "Party_customerId_idx" ON "Party"("customerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- 合同约定收汇到期日
ALTER TABLE "Contract" ADD COLUMN "paymentDueAt" DATETIME;

-- 收汇实际到账日
ALTER TABLE "Settlement" ADD COLUMN "receivedAt" DATETIME;
