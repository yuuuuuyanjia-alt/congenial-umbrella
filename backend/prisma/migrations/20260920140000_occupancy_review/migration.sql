-- 中信保占用高风险：工作台真实审核（领取 / 放行 / 驳回）

CREATE TABLE "OccupancyReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "nodeCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "band" TEXT NOT NULL DEFAULT 'HIGH',
    "occupancyFen" INTEGER NOT NULL,
    "excessFen" INTEGER NOT NULL,
    "insuredLimitFen" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fingerprint" TEXT NOT NULL,
    "claimedById" TEXT,
    "claimedAt" DATETIME,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OccupancyReview_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OccupancyReview_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OccupancyReview_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "OccupancyReview_caseId_nodeCode_idx" ON "OccupancyReview"("caseId", "nodeCode");
CREATE INDEX "OccupancyReview_status_idx" ON "OccupancyReview"("status");
CREATE INDEX "OccupancyReview_fingerprint_idx" ON "OccupancyReview"("fingerprint");

ALTER TABLE "WorkbenchAction" ADD COLUMN "occupancyReviewId" TEXT;

CREATE INDEX "WorkbenchAction_occupancyReviewId_idx" ON "WorkbenchAction"("occupancyReviewId");
