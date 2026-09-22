-- 销售合同条款：装运港、装运期限。与 CIF/N6 shipmentPort、shipmentDate 分开。
ALTER TABLE "Contract" ADD COLUMN "loadingPort" TEXT;
ALTER TABLE "Contract" ADD COLUMN "shipmentDeadline" TEXT;
