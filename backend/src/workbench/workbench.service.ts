import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Disposition } from '../common/constants';
import {
  OCCUPANCY_QUEUE_STATUSES,
  OccupancyReviewStatusLabel,
  OccupancyWorkbenchActionLabel,
  WorkbenchItemKind,
} from './occupancy-review';

@Injectable()
export class WorkbenchService {
  constructor(private readonly prisma: PrismaService) {}

  async queue() {
    const [reviews, hits] = await Promise.all([
      this.prisma.occupancyReview.findMany({
        where: { status: { in: [...OCCUPANCY_QUEUE_STATUSES] } },
        include: {
          case: { select: { id: true, caseNo: true, title: true, currentNode: true, status: true } },
          claimedBy: { select: { id: true, name: true, role: true } },
          decidedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.screeningHit.findMany({
        where: {
          disposition: { in: [Disposition.OPEN, Disposition.SUPPLEMENTED, Disposition.MONITORING] },
        },
        include: { case: true, party: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const occupancyItems = reviews.map((row) => ({
      kind: WorkbenchItemKind.OCCUPANCY_HIGH,
      id: row.id,
      reviewId: row.id,
      caseId: row.caseId,
      nodeCode: row.nodeCode,
      status: row.status,
      statusLabel: OccupancyReviewStatusLabel[row.status] || row.status,
      band: row.band,
      occupancyFen: row.occupancyFen,
      excessFen: row.excessFen,
      insuredLimitFen: row.insuredLimitFen,
      currency: row.currency,
      fingerprint: row.fingerprint,
      comment: row.comment,
      claimedBy: row.claimedBy,
      decidedBy: row.decidedBy,
      claimedAt: row.claimedAt,
      decidedAt: row.decidedAt,
      createdAt: row.createdAt,
      case: row.case,
      title: '中信保占用高风险',
      actions: OccupancyWorkbenchActionLabel,
    }));

    const hitItems = hits.map((hit) => ({
      kind: WorkbenchItemKind.SCREENING_HIT,
      ...hit,
    }));

    return [...occupancyItems, ...hitItems];
  }
}
