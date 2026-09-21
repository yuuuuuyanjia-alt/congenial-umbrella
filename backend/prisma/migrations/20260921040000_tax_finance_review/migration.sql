-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "deliveryMode" TEXT;
ALTER TABLE "Contract" ADD COLUMN "directPortJson" TEXT;

-- AlterTable
ALTER TABLE "WorkbenchAction" ADD COLUMN "taxFinanceReviewId" TEXT;

-- CreateTable
CREATE TABLE "TaxFinanceReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "nodeCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "claimedById" TEXT,
    "claimedAt" DATETIME,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxFinanceReview_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxFinanceReview_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaxFinanceReview_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxRebateChecklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "inputInvoiceNo" TEXT,
    "flowGoods" BOOLEAN NOT NULL DEFAULT false,
    "flowCustoms" BOOLEAN NOT NULL DEFAULT false,
    "flowInvoice" BOOLEAN NOT NULL DEFAULT false,
    "flowRemittance" BOOLEAN NOT NULL DEFAULT false,
    "declaredAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxRebateChecklist_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaxFinanceReview_caseId_nodeCode_idx" ON "TaxFinanceReview"("caseId", "nodeCode");
CREATE INDEX "TaxFinanceReview_status_idx" ON "TaxFinanceReview"("status");
CREATE INDEX "TaxFinanceReview_fingerprint_idx" ON "TaxFinanceReview"("fingerprint");
CREATE UNIQUE INDEX "TaxRebateChecklist_caseId_key" ON "TaxRebateChecklist"("caseId");
CREATE INDEX "WorkbenchAction_taxFinanceReviewId_idx" ON "WorkbenchAction"("taxFinanceReviewId");
