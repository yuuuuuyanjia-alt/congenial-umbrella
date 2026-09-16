-- CreateTable
CREATE TABLE "SinosurePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "nodeCode" TEXT NOT NULL,
    "changeOrderId" TEXT,
    "evidenceId" TEXT,
    "evidenceRef" TEXT,
    "fileName" TEXT,
    "insuredLimitFen" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "confirmedExisting" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SinosurePolicy_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SinosurePolicy_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SinosurePolicy_caseId_nodeCode_idx" ON "SinosurePolicy"("caseId", "nodeCode");
