-- 费用金额固定人民币。不跟随销售合同币种，也不改已有案件或种子。
ALTER TABLE "ContractFee" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CNY';
