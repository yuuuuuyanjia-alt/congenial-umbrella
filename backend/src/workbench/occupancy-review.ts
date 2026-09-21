/**
 * 中信保占用高风险：真实工作台审核（领取 / 放行 / 驳回），不是硬拦截也不是软提示。
 * 超高风险仍硬拦截；中风险仍软提示可推进。
 */

import {
  SINOSURE_EXPOSURE_HIGH_REJECTED_REASON,
  SINOSURE_EXPOSURE_HIGH_REVIEW_REASON,
} from '../common/constants';

export { SINOSURE_EXPOSURE_HIGH_REJECTED_REASON, SINOSURE_EXPOSURE_HIGH_REVIEW_REASON };

export const OccupancyReviewStatus = {
  OPEN: 'OPEN',
  CLAIMED: 'CLAIMED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export type OccupancyReviewStatusCode =
  (typeof OccupancyReviewStatus)[keyof typeof OccupancyReviewStatus];

export const OccupancyReviewStatusLabel: Record<string, string> = {
  OPEN: '待领取',
  CLAIMED: '已领取',
  APPROVED: '已放行',
  REJECTED: '已驳回',
  SUPERSEDED: '已失效',
};

export const OccupancyWorkbenchAction = {
  CLAIM: 'CLAIM',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
} as const;

export const OccupancyWorkbenchActionLabel: Record<string, string> = {
  CLAIM: '领取',
  APPROVE: '放行',
  REJECT: '驳回',
};

export const WorkbenchItemKind = {
  SCREENING_HIT: 'SCREENING_HIT',
  OCCUPANCY_HIGH: 'OCCUPANCY_HIGH',
  TAX_FINANCE: 'TAX_FINANCE',
} as const;

export const OCCUPANCY_QUEUE_STATUSES = [
  OccupancyReviewStatus.OPEN,
  OccupancyReviewStatus.CLAIMED,
  OccupancyReviewStatus.REJECTED,
] as const;

export const SINOSURE_EXPOSURE_HIGH_APPROVED_ALERT = '工作台已放行该高风险占用，允许推进';

export interface OccupancyReviewSnap {
  id?: string;
  nodeCode: string;
  status: string;
  band?: string | null;
  occupancyFen: number;
  excessFen: number;
  insuredLimitFen: number;
  fingerprint?: string | null;
  claimedById?: string | null;
  comment?: string | null;
}

export function occupancyFingerprint(input: {
  occupancyFen?: number | null;
  excessFen?: number | null;
  insuredLimitFen?: number | null;
}): string {
  return `${Number(input.occupancyFen) || 0}|${Number(input.excessFen) || 0}|${Number(input.insuredLimitFen) || 0}`;
}

export function matchingOccupancyReview(
  reviews: OccupancyReviewSnap[] | null | undefined,
  nodeCode: string,
  exp: { occupancyFen?: number | null; excessFen?: number | null; insuredLimitFen?: number | null },
): OccupancyReviewSnap | undefined {
  const fp = occupancyFingerprint(exp);
  const list = reviews || [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const row = list[i];
    if (row.nodeCode !== nodeCode) continue;
    if (row.status === OccupancyReviewStatus.SUPERSEDED) continue;
    const rowFp = row.fingerprint || occupancyFingerprint(row);
    if (rowFp === fp) return row;
  }
  return undefined;
}

export function isOccupancyHighApproved(
  reviews: OccupancyReviewSnap[] | null | undefined,
  nodeCode: string,
  exp: { occupancyFen?: number | null; excessFen?: number | null; insuredLimitFen?: number | null },
): boolean {
  return matchingOccupancyReview(reviews, nodeCode, exp)?.status === OccupancyReviewStatus.APPROVED;
}

export function isOccupancyWorkbenchAction(action?: string | null): boolean {
  return (
    action === OccupancyWorkbenchAction.CLAIM ||
    action === OccupancyWorkbenchAction.APPROVE ||
    action === OccupancyWorkbenchAction.REJECT
  );
}

export function occupancyActionNextStatus(
  status: string,
  action: string,
): { ok: true; status: OccupancyReviewStatusCode } | { ok: false; error: string } {
  if (status === OccupancyReviewStatus.APPROVED || status === OccupancyReviewStatus.SUPERSEDED) {
    return { ok: false, error: '该占用审核已结束，不能再处置' };
  }
  if (action === OccupancyWorkbenchAction.CLAIM) {
    if (
      status === OccupancyReviewStatus.OPEN ||
      status === OccupancyReviewStatus.CLAIMED ||
      status === OccupancyReviewStatus.REJECTED
    ) {
      return { ok: true, status: OccupancyReviewStatus.CLAIMED };
    }
    return { ok: false, error: '当前状态不可领取' };
  }
  if (action === OccupancyWorkbenchAction.APPROVE) {
    if (
      status === OccupancyReviewStatus.OPEN ||
      status === OccupancyReviewStatus.CLAIMED ||
      status === OccupancyReviewStatus.REJECTED
    ) {
      return { ok: true, status: OccupancyReviewStatus.APPROVED };
    }
    return { ok: false, error: '当前状态不可放行' };
  }
  if (action === OccupancyWorkbenchAction.REJECT) {
    if (status === OccupancyReviewStatus.OPEN || status === OccupancyReviewStatus.CLAIMED) {
      return { ok: true, status: OccupancyReviewStatus.REJECTED };
    }
    if (status === OccupancyReviewStatus.REJECTED) {
      return { ok: true, status: OccupancyReviewStatus.REJECTED };
    }
    return { ok: false, error: '当前状态不可驳回' };
  }
  return { ok: false, error: '未知工作台动作' };
}

export function planOccupancyReviewSync(
  reviews: OccupancyReviewSnap[] | null | undefined,
  nodeCode: string,
  exp: {
    band?: string | null;
    occupancyFen?: number | null;
    excessFen?: number | null;
    insuredLimitFen?: number | null;
    currency?: string | null;
  },
): {
  keepId?: string;
  supersedeIds: string[];
  create?: {
    nodeCode: string;
    status: string;
    band: string;
    occupancyFen: number;
    excessFen: number;
    insuredLimitFen: number;
    currency: string;
    fingerprint: string;
  };
} {
  const current = (reviews || []).filter(
    (row) => row.nodeCode === nodeCode && row.status !== OccupancyReviewStatus.SUPERSEDED,
  );
  const stale = (statuses: string[]) =>
    current.filter((row) => statuses.includes(row.status) && row.id).map((row) => row.id!) ;

  if (exp.band !== 'HIGH') {
    return {
      supersedeIds: stale([
        OccupancyReviewStatus.OPEN,
        OccupancyReviewStatus.CLAIMED,
        OccupancyReviewStatus.REJECTED,
      ]),
    };
  }

  const match = matchingOccupancyReview(current, nodeCode, exp);
  if (match) return { keepId: match.id, supersedeIds: [] };

  return {
    supersedeIds: stale([
      OccupancyReviewStatus.OPEN,
      OccupancyReviewStatus.CLAIMED,
      OccupancyReviewStatus.REJECTED,
    ]),
    create: {
      nodeCode,
      status: OccupancyReviewStatus.OPEN,
      band: 'HIGH',
      occupancyFen: Number(exp.occupancyFen) || 0,
      excessFen: Number(exp.excessFen) || 0,
      insuredLimitFen: Number(exp.insuredLimitFen) || 0,
      currency: exp.currency || 'USD',
      fingerprint: occupancyFingerprint(exp),
    },
  };
}
