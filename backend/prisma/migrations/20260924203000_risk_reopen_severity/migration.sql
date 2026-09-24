-- 记下处置当时的颜色。规则后来给出更严重的颜色时，重算可以重新打开。
-- 只增量加列，已有行这两个字段为空。

ALTER TABLE "RiskItem" ADD COLUMN "dispositionSeverity" TEXT;
ALTER TABLE "RiskItem" ADD COLUMN "reopenedAt" DATETIME;
