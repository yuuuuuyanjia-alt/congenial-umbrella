-- FOB 等买方安排运输：国内段到达口岸/港口时间（到达即完成国内交付）

ALTER TABLE "Contract" ADD COLUMN "domesticPortArrivalAt" DATETIME;
