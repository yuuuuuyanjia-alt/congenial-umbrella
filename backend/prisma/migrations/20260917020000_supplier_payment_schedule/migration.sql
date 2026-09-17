-- 采购货款分期：一次性付清或按期次登记比例/金额、条件与付款

ALTER TABLE "ProcurementPlan" ADD COLUMN "paymentMode" TEXT NOT NULL DEFAULT 'FULL';

CREATE TABLE "ProcurementPaymentInstallment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "label" TEXT,
    "percentBps" INTEGER,
    "amountFen" INTEGER,
    "conditionText" TEXT,
    "dueAt" DATETIME,
    "paidFen" INTEGER NOT NULL DEFAULT 0,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcurementPaymentInstallment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProcurementPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProcurementPaymentInstallment_planId_seq_key" ON "ProcurementPaymentInstallment"("planId", "seq");
CREATE INDEX "ProcurementPaymentInstallment_planId_idx" ON "ProcurementPaymentInstallment"("planId");
