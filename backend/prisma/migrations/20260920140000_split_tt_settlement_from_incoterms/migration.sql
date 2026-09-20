-- 拆开运输术语与结算方式：incoterms 只存 FOB/CIF 等；T/T 迁到 ttTiming / paymentTerms。
-- 无运输术语的 T/T 合同回退为 FOB（买方安排运输），避免 T/T 被切成 T 后误走卖方提单。

UPDATE "Contract"
SET
  "ttTiming" = CASE
    WHEN COALESCE("ttTiming", '') IN ('ADVANCE', 'AFTER') THEN "ttTiming"
    WHEN "paymentTerms" LIKE '%前%' OR "paymentTerms" LIKE '%预付%' OR "paymentTerms" LIKE '%advance%' THEN 'ADVANCE'
    WHEN "paymentTerms" LIKE '%后%' OR "paymentTerms" LIKE '%装运后%' OR "paymentTerms" LIKE '%after%' THEN 'AFTER'
    ELSE 'ADVANCE'
  END,
  "paymentTerms" = CASE
    WHEN "paymentTerms" IS NULL
      OR TRIM("paymentTerms") = ''
      OR REPLACE(REPLACE(UPPER("paymentTerms"), ' ', ''), '/', '') IN ('TT')
      THEN CASE
        WHEN COALESCE("ttTiming", '') = 'AFTER' OR "paymentTerms" LIKE '%后%' THEN '后 T/T'
        ELSE '前 T/T'
      END
    ELSE "paymentTerms"
  END,
  "incoterms" = 'FOB'
WHERE
  "incoterms" IS NOT NULL
  AND (
    REPLACE(UPPER("incoterms"), ' ', '') LIKE '%T/T%'
    OR REPLACE(REPLACE(UPPER("incoterms"), ' ', ''), '/', '') IN ('TT', 'T')
  );

UPDATE "Shipment"
SET "incotermsOverride" = 'FOB'
WHERE
  "incotermsOverride" IS NOT NULL
  AND (
    REPLACE(UPPER("incotermsOverride"), ' ', '') LIKE '%T/T%'
    OR REPLACE(REPLACE(UPPER("incotermsOverride"), ' ', ''), '/', '') IN ('TT', 'T')
  );
