-- 销售合同费用：按案件一条，不挂出运批次。
-- 四项固定金额与自定义行全部可空。不回写节点，也不改种子数据。

CREATE TABLE "ContractFee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "oceanFreightFen" INTEGER,
    "inlandFreightFen" INTEGER,
    "portChargesFen" INTEGER,
    "insuranceFen" INTEGER,
    "customJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractFee_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ContractFee_caseId_key" ON "ContractFee"("caseId");
