-- 客户匹配键：规范化名称+国家唯一；税号索引。取消仅按展示名称去重。

ALTER TABLE "Customer" ADD COLUMN "nameKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Customer" ADD COLUMN "countryKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Customer" ADD COLUMN "registrationKey" TEXT;

UPDATE "Customer"
SET
  "nameKey" = upper(trim("name")),
  "countryKey" = upper(trim(coalesce("country", ''))),
  "registrationKey" = CASE
    WHEN "registrationNo" IS NULL OR trim("registrationNo") = '' THEN NULL
    ELSE upper(replace(replace(replace("registrationNo", ' ', ''), '-', ''), '.', ''))
  END;

DROP INDEX "Customer_name_key";
CREATE UNIQUE INDEX "Customer_nameKey_countryKey_key" ON "Customer"("nameKey", "countryKey");
CREATE INDEX "Customer_registrationKey_idx" ON "Customer"("registrationKey");
